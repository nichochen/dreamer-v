import time
import requests
import os # For gsutil command

from typing import Optional, Union, Dict # Added for Python 3.9 compatibility

from google_auth import get_access_token

class GoogleVeo:
    def __init__(self, project_id: str, model_name: str = "veo-3.0-generate-001"): # Default if not provided
        self.project_id = project_id
        self.model_name = model_name
        # Construct endpoints dynamically based on the model_name
        self.video_model_base_url = f"https://us-central1-aiplatform.googleapis.com/v1beta1/projects/{self.project_id}/locations/us-central1/publishers/google/models/{self.model_name}"
        self.prediction_endpoint = f"{self.video_model_base_url}:predictLongRunning"
        self.fetch_endpoint = f"{self.video_model_base_url}:fetchPredictOperation" # Assumes fetch is on the model resource

    def _send_request_to_google_api(self, api_endpoint: str, data: dict = None):
        """
        Sends an HTTP request to a Google API endpoint.
        """
        access_token = get_access_token()

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        response = requests.post(api_endpoint, headers=headers, json=data)
        response.raise_for_status()
        return response.json()

    def _compose_videogen_request(
        self,
        prompt: str,
        parameters: Dict[str, Union[str, int, bool]],
        image_uri: str = "",
        image_mime_type: str = "image/jpeg",  # Default to jpeg
        video_uri: str = "",
        last_frame_uri: str = "",
        last_frame_mime_type: str = "image/jpeg",  # Default to jpeg
        camera_control: str = "",
        generate_audio: bool = False,
        resolution: Optional[str] = None,
    ):
        if self.model_name.startswith("veo-3.0"):
            if "durationSeconds" in parameters and isinstance(parameters["durationSeconds"], (int, float)) and parameters["durationSeconds"] > 90:
                raise ValueError(
                    f"For model '{self.model_name}', 'durationSeconds' cannot exceed 90. "
                    f"Received: {parameters['durationSeconds']}"
                )
            if resolution:
                if resolution not in ["720p", "1080p"]:
                    raise ValueError(
                        f"For model '{self.model_name}', 'resolution' must be '720p' or '1080p'. "
                        f"Received: {resolution}"
                    )
                parameters["resolution"] = resolution

        instance = {"prompt": prompt}
        if image_uri:
            instance["image"] = {"gcsUri": image_uri, "mimeType": image_mime_type}
        if video_uri:
            instance["video"] = {"gcsUri": video_uri, "mimeType": "video/mp4"}
        if last_frame_uri:
            instance["lastFrame"] = {"gcsUri": last_frame_uri, "mimeType": last_frame_mime_type}
        # Only add cameraControl if the model supports it, it's provided, AND it's not a video extension task
        if self.model_name != "veo-3.0-generate-001" and camera_control and not video_uri:
            instance["cameraControl"] = camera_control

        # Add generateAudio to parameters, respecting the default
        if self.model_name.startswith("veo-3.0"):
            parameters["generateAudio"] = generate_audio
        request_payload = {"instances": [instance], "parameters": parameters}
        return request_payload

    def _fetch_operation(self, lro_name: str, retries: int = 30, delay_seconds: int = 10):
        request_data = {"operationName": lro_name}
        for i in range(retries):
            resp = self._send_request_to_google_api(self.fetch_endpoint, request_data)
            print("@@@", resp)
            if "done" in resp and resp["done"]:
                return resp
            time.sleep(delay_seconds)
        # If loop finishes, operation timed out
        raise TimeoutError(f"Operation {lro_name} did not complete after {retries * delay_seconds} seconds.")


    def generate_video(
        self,
        prompt: str,
        parameters: Dict[str, Union[str, int, bool]],
        image_uri: str = "",
        image_mime_type: str = "image/jpeg",
        video_uri: str = "",
        last_frame_uri: str = "",
        last_frame_mime_type: str = "image/jpeg",
        camera_control: str = "",
        generate_audio: bool = False,
        resolution: Optional[str] = None,
    ):
        req = self._compose_videogen_request(
            prompt=prompt,
            parameters=parameters,
            image_uri=image_uri,
            image_mime_type=image_mime_type,
            video_uri=video_uri,
            last_frame_uri=last_frame_uri,
            last_frame_mime_type=last_frame_mime_type,
            camera_control=camera_control,
            generate_audio=generate_audio,
            resolution=resolution,
        )
        print(f"Sending video generation request: {req}")
        resp = self._send_request_to_google_api(self.prediction_endpoint, req)
        print(f"Received LRO name: {resp.get('name')}")
        return self._fetch_operation(resp["name"])
