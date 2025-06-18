# -*- coding: utf-8 -*-
# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import datetime
import json
import os
from typing import Optional, Dict, Any, List

import google.auth
import google.auth.transport.requests
import requests

class GoogleImagen:
    """
    A client for interacting with the Google Cloud Vertex AI Imagen API for image generation.
    """
    _access_token: Optional[str] = None
    _token_created_at: Optional[datetime.datetime] = None
    _TOKEN_EXPIRATION_MINUTES = 30 # Cache token for 30 minutes

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

    def _get_access_token(self) -> str:
        """
        Retrieves a valid access token, refreshing it if necessary using google.auth.
        """
        now = datetime.datetime.now(datetime.timezone.utc)
        if (
            GoogleImagen._access_token is None or
            GoogleImagen._token_created_at is None or
            (now - GoogleImagen._token_created_at) > datetime.timedelta(minutes=GoogleImagen._TOKEN_EXPIRATION_MINUTES)
        ):
            try:
                creds, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/cloud-platform'])
                auth_req = google.auth.transport.requests.Request()
                creds.refresh(auth_req)
                GoogleImagen._access_token = creds.token
                GoogleImagen._token_created_at = now
                print("Generated new access token for Imagen.")
            except google.auth.exceptions.DefaultCredentialsError as e:
                raise RuntimeError(
                    "Failed to get default Google Cloud credentials. "
                    "Ensure you are authenticated (e.g., `gcloud auth application-default login`)."
                ) from e
            except Exception as e:
                raise RuntimeError(f"An unexpected error occurred while refreshing token: {e}") from e
        
        if GoogleImagen._access_token is None:
             raise RuntimeError("Access token could not be obtained.")
        return GoogleImagen._access_token

    def _send_request_to_google_api(self, data: dict) -> Dict[str, Any]:
        """
        Sends an HTTP POST request to the configured Google API endpoint.
        """
        access_token = self._get_access_token()
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

if __name__ == '__main__':
    # Ensure GOOGLE_APPLICATION_CREDENTIALS is set or gcloud auth application-default login has been run.
    project_id_env = os.environ.get("GOOGLE_CLOUD_PROJECT")
    location_env = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
    
    # Recommended: Use a generally available model like "imagegeneration@005" or "imagen-3.0-generate-002"
    # Or a preview model if you have access: "imagen-4.0-generate-preview-06-06"
    model_id_env = os.environ.get("GOOGLE_IMAGEN_MODEL_ID", "imagegeneration@005") 

    if not project_id_env:
        print("Error: The GOOGLE_CLOUD_PROJECT environment variable is not set.")
        print("Please set it to your Google Cloud Project ID.")
        print("Example: export GOOGLE_CLOUD_PROJECT='your-project-id'")
    else:
        print(f"Using Project ID: {project_id_env}, Location: {location_env}, Model ID: {model_id_env}")
        
        try:
            imagen_client = GoogleImagen(
                project_id=project_id_env, 
                location=location_env, 
                model_id=model_id_env
            )
            
            prompt_text = "A stunning professional photograph of a majestic snow leopard on a rocky mountain peak, golden hour lighting."
            print(f"\nGenerating image for prompt: '{prompt_text}'...")
            
            # Example 1: Basic generation with base64 output
            image_response = imagen_client.generate_image(
                prompt=prompt_text,
                sample_count=1,
                aspect_ratio="16:9",
                add_watermark=False, # Often set to False if using seed for reproducibility
                seed=12345,
                output_mime_type="image/png"
            )

            if image_response and "predictions" in image_response:
                print("Image generation successful (base64).")
                for i, prediction in enumerate(image_response["predictions"]):
                    print(f"\nPrediction {i+1}:")
                    if "bytesBase64Encoded" in prediction and prediction["bytesBase64Encoded"]:
                        print(f"  MIME Type: {prediction.get('mimeType')}")
                        print(f"  Image bytes (first 64 chars): {prediction['bytesBase64Encoded'][:64]}...")
                        # To save the image:
                        # import base64
                        # file_extension = prediction.get('mimeType', 'image/png').split('/')[-1]
                        # image_bytes = base64.b64decode(prediction["bytesBase64Encoded"])
                        # filename = f"generated_image_{i+1}.{file_extension}"
                        # with open(filename, "wb") as f:
                        #     f.write(image_bytes)
                        # print(f"  Image {i+1} saved as {filename} (example code, currently commented out)")
                    elif prediction.get("raiFilteredReason"):
                        print(f"  Image filtered by Responsible AI. Reason: {prediction['raiFilteredReason']}")
                    else:
                        print(f"  Unexpected prediction format: {prediction}")
            elif image_response:
                print(f"Image generation returned a response, but no 'predictions' field found or it's empty.")
                print(f"Full response: {json.dumps(image_response, indent=2)}")
            else:
                print("Image generation failed or no response received.")

            # Example 2: Store image in GCS (Uncomment and set your GCS_BUCKET_URI_PREFIX)
            # your_gcs_bucket_uri_prefix = f"gs://your-gcs-bucket-name/imagen_outputs/" # IMPORTANT: Replace
            # if "your-gcs-bucket-name" in your_gcs_bucket_uri_prefix:
            #    print("\nSkipping GCS storage example: GCS_BUCKET_URI_PREFIX not configured.")
            # else:
            #    print(f"\nGenerating image and storing in GCS prefix: {your_gcs_bucket_uri_prefix}")
            #    gcs_image_response = imagen_client.generate_image(
            #        prompt="A whimsical watercolor painting of a red panda playing a tiny flute in a bamboo forest.",
            #        sample_count=1,
            #        storage_uri=your_gcs_bucket_uri_prefix, # API will append filenames
            #        aspect_ratio="1:1"
            #    )
            #    if gcs_image_response and "predictions" in gcs_image_response:
            #        print("Image generation for GCS storage successful.")
            #        for i, prediction in enumerate(gcs_image_response["predictions"]):
            #             if "storageUri" in prediction:
            #                 print(f"  Image {i+1} stored at GCS URI: {prediction['storageUri']}")
            #             elif prediction.get("raiFilteredReason"):
            #                 print(f"  Image {i+1} filtered by Responsible AI. Reason: {prediction['raiFilteredReason']}")
            #             else:
            #                 print(f"  Prediction {i+1} (GCS): {prediction}")
            #    else:
            #        print("Image generation for GCS storage failed or no predictions returned.")
            #        if gcs_image_response:
            #            print(f"Full response for GCS attempt: {json.dumps(gcs_image_response, indent=2)}")

        except RuntimeError as e:
            print(f"An error occurred during Imagen client initialization or usage: {e}")
        except Exception as e:
            print(f"An unexpected error occurred in the main execution block: {e}")
