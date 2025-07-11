import base64
import json
import os
import uuid
import requests

from google_auth import get_access_token

class GoogleLyria:
    def __init__(self, project_id: str, location: str = "us-central1"):
        self.project_id = project_id
        self.location = location
        self.api_endpoint = f"https://{location}-aiplatform.googleapis.com/v1/projects/{project_id}/locations/{location}/publishers/google/models/lyria-002:predict"
        self.output_dir = "data/generated_music"
        os.makedirs(self.output_dir, exist_ok=True)

    def generate_music(self, prompt: str, negative_prompt: str = None, seed: int = None) -> str:
        """
        Generates music using the Google Lyria API and saves it as a WAV file.

        Args:
            prompt: The text prompt describing the music to generate.
            negative_prompt: Optional. A text prompt describing elements to avoid.
            seed: Optional. A seed for deterministic generation.

        Returns:
            The file path of the saved WAV file, or None if generation failed.
        """
        try:
            access_token = get_access_token()
        except Exception:
            return None

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        instance = {"prompt": prompt}
        if negative_prompt:
            instance["negative_prompt"] = negative_prompt
        if seed is not None:
            instance["seed"] = seed
        
        payload = {
            "instances": [instance],
            "parameters": {} # Parameters can be added here if needed in the future
        }

        try:
            response = requests.post(self.api_endpoint, headers=headers, json=payload, timeout=300) # Increased timeout for potentially long API calls
            response.raise_for_status()  # Raise an exception for bad status codes
            
            response_data = response.json()
            
            if "predictions" not in response_data or not response_data["predictions"]:
                print("Error: 'predictions' not found in API response or is empty.")
                #print(f"Full response: {response_data}")
                return None

            prediction = response_data["predictions"][0]
            
            # if "audioContent" not in prediction or "mimeType" not in prediction:
            #     print("Error: 'audioContent' or 'mimeType' not found in prediction.")
            #     print(f"Prediction content: {prediction.keys()}")
            #     return None

            # if prediction["mimeType"] != "audio/wav":
            #     print(f"Error: Expected audio/wav, but got {prediction['mimeType']}")
            #     return None
                
            audio_base64 = prediction["bytesBase64Encoded"]
            audio_data = base64.b64decode(audio_base64)
            
            file_name = f"lyria_output_{uuid.uuid4()}.wav"
            file_path = os.path.join(self.output_dir, file_name)
            
            with open(file_path, "wb") as wav_file:
                wav_file.write(audio_data)
            
            print(f"Music saved to {file_path}")
            return file_path

        except requests.exceptions.RequestException as e:
            print(f"API request failed: {e}")
            if e.response is not None:
                pass
                # print(f"Response content: {e.response.text}")
            return None
        except KeyError as e:
            print(f"KeyError accessing API response: {e}. Response: {response_data if 'response_data' in locals() else 'N/A'}")
            return None
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            return None