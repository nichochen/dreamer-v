import json
import os
from typing import Optional, Dict, Any, List

import requests

from google_auth import get_access_token


class GoogleImagen:
    """
    A client for interacting with the Google Cloud Vertex AI Imagen API for image generation.
    """

    def __init__(self, project_id: str, location: str, model_id: str = "imagegeneration@005"):
        """
        Initializes the GoogleImagen client.

        Args:
            project_id: Your Google Cloud project ID.
            location: The Google Cloud region for the API endpoint (e.g., "us-central1").
            model_id: The Imagen model ID to use.
                      Examples: "imagegeneration@005", "imagen-3.0-generate-002", 
                                "imagen-4.0-generate-preview-06-06".
                      Refer to Google Cloud documentation for available models and their capabilities.
        """
        if not project_id:
            raise ValueError("Google Cloud project_id is required.")
        if not location:
            raise ValueError("Google Cloud location is required.")
            
        self.project_id = project_id
        self.location = location
        self.model_id = model_id
        # The predict endpoint for synchronous image generation
        self.api_endpoint = (
            f"https://{self.location}-aiplatform.googleapis.com/v1/projects/"
            f"{self.project_id}/locations/{self.location}/publishers/google/models/{self.model_id}:predict"
        )

    def _send_request_to_google_api(self, data: dict) -> Dict[str, Any]:
        """
        Sends an HTTP POST request to the configured Google API endpoint.
        """
        access_token = get_access_token()
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=utf-8",
        }
        try:
            response = requests.post(self.api_endpoint, headers=headers, json=data)
            response.raise_for_status()  # Raise an exception for HTTP errors (4xx or 5xx)
            return response.json()
        except requests.exceptions.HTTPError as http_err:
            error_message = f"HTTP error occurred: {http_err}. Status: {http_err.response.status_code}."
            try:
                error_details = http_err.response.json()
                error_message += f" Details: {json.dumps(error_details)}"
            except json.JSONDecodeError:
                error_message += f" Raw response: {http_err.response.text}"
            print(error_message) # Log the error
            raise RuntimeError(error_message) from http_err # Re-raise for handling by caller
        except requests.exceptions.RequestException as req_err:
            error_message = f"API request failed: {req_err}"
            print(error_message)
            raise RuntimeError(error_message) from req_err
        except json.JSONDecodeError as json_err:
            error_message = f"Failed to decode JSON response from API: {json_err}"
            if 'response' in locals() and response is not None:
                 error_message += f" Raw response content: {response.text}"
            print(error_message)
            raise RuntimeError(error_message) from json_err


    def _compose_imagen_request_payload(
        self,
        prompt: str,
        sample_count: int = 1,
        seed: Optional[int] = None,
        enhance_prompt: bool = True,
        negative_prompt: Optional[str] = None,
        aspect_ratio: str = "1:1",
        add_watermark: bool = True,
        output_mime_type: str = "image/png",
        compression_quality: Optional[int] = 75, # Only for JPEG
        storage_uri: Optional[str] = None,
        person_generation: str = "allow_adult",
        language: Optional[str] = None, # e.g., "en", "es", "auto"
        safety_setting: Optional[str] = "block_medium_and_above",
        include_rai_reason: bool = False,
        include_safety_attributes: bool = False,
        sample_image_style: Optional[str] = None # Only for imagegeneration@002
    ) -> Dict[str, Any]:
        """
        Composes the JSON payload for the Imagen API request.
        """
        instances = [{"prompt": prompt}]
        
        parameters: Dict[str, Any] = {
            "sampleCount": sample_count,
            "enhancePrompt": enhance_prompt,
            "aspectRatio": aspect_ratio,
            "addWatermark": add_watermark,
            "personGeneration": person_generation,
            "includeRaiReason": include_rai_reason,
            "includeSafetyAttributes": include_safety_attributes
        }

        output_options = {"mimeType": output_mime_type}
        if output_mime_type.lower() == "image/jpeg":
            if compression_quality is not None and 0 <= compression_quality <= 100:
                output_options["compressionQuality"] = compression_quality
            else:
                # Use API default if invalid value provided
                print(f"Warning: Invalid compression_quality '{compression_quality}'. Using API default (75).")
        parameters["outputOptions"] = output_options

        if seed is not None:
            if add_watermark:
                print("Info: For 'seed' to be effective, 'addWatermark' should be 'false'. "
                      "Consider setting add_watermark=False when using a seed.")
            parameters["seed"] = seed
        
        # Handle model-specific or optional parameters
        if negative_prompt is not None:
            # Check model compatibility for negative_prompt (not supported by imagen-3.0-generate-002 and newer)
            if "imagen-3.0" in self.model_id or "imagen-4.0" in self.model_id:
                 print(f"Warning: 'negative_prompt' may not be supported by model '{self.model_id}'.")
            parameters["negativePrompt"] = negative_prompt
        
        if storage_uri:
            parameters["storageUri"] = storage_uri
        
        if language:
            parameters["language"] = language

        if safety_setting:
            parameters["safetySetting"] = safety_setting
        
        if sample_image_style and self.model_id == "imagegeneration@002":
            parameters["sampleImageStyle"] = sample_image_style
        elif sample_image_style:
            print(f"Warning: 'sampleImageStyle' is only supported by 'imagegeneration@002'. Ignoring for model '{self.model_id}'.")
            
        return {"instances": instances, "parameters": parameters}

    def generate_image(
        self,
        prompt: str,
        sample_count: int = 1,
        seed: Optional[int] = None,
        enhance_prompt: bool = True,
        negative_prompt: Optional[str] = None,
        aspect_ratio: str = "1:1",
        add_watermark: bool = True,
        output_mime_type: str = "image/png",
        compression_quality: Optional[int] = 75,
        storage_uri: Optional[str] = None,
        person_generation: str = "allow_adult",
        language: Optional[str] = None,
        safety_setting: Optional[str] = "block_medium_and_above",
        include_rai_reason: bool = False,
        include_safety_attributes: bool = False,
        sample_image_style: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Generates images based on a text prompt using the Imagen API.

        Args:
            prompt: The text prompt for image generation.
            sample_count: Number of images to generate.
            seed: Random seed for deterministic generation.
            enhance_prompt: Whether to use LLM-based prompt rewriting.
            negative_prompt: Description of what to discourage.
            aspect_ratio: Aspect ratio of the image (e.g., "1:1", "16:9").
            add_watermark: Whether to add an invisible watermark.
            output_mime_type: Output image format ("image/png", "image/jpeg").
            compression_quality: Compression quality for JPEG (0-100).
            storage_uri: GCS URI to store images. If None, images are base64-encoded.
            person_generation: Controls generation of people.
            language: Language code of the prompt.
            safety_setting: Safety filter level.
            include_rai_reason: Include reason if image is filtered by Responsible AI.
            include_safety_attributes: Include Responsible AI scores.
            sample_image_style: Style for generated images (only for imagegeneration@002).

        Returns:
            A dictionary containing the API response (usually with a "predictions" list),
            or None if the request fails.
        """
        try:
            payload = self._compose_imagen_request_payload(
                prompt=prompt,
                sample_count=sample_count,
                seed=seed,
                enhance_prompt=enhance_prompt,
                negative_prompt=negative_prompt,
                aspect_ratio=aspect_ratio,
                add_watermark=add_watermark,
                output_mime_type=output_mime_type,
                compression_quality=compression_quality,
                storage_uri=storage_uri,
                person_generation=person_generation,
                language=language,
                safety_setting=safety_setting,
                include_rai_reason=include_rai_reason,
                include_safety_attributes=include_safety_attributes,
                sample_image_style=sample_image_style
            )
            print(f"Sending Imagen request payload: {json.dumps(payload, indent=2)}")
            return self._send_request_to_google_api(data=payload)
        except RuntimeError as e:
            print(f"Error during image generation: {e}")
            return None
        except Exception as e:
            print(f"An unexpected error occurred in generate_image: {e}")
            return None