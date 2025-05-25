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

import time
import datetime # Added for token expiration
import google.auth
import google.auth.transport.requests
import requests
import os # For gsutil command

# mediapy and matplotlib are typically for notebooks, might need adjustment for a server environment
# For now, assuming mediapy can be used or replaced with equivalent for video handling
# import mediapy as media
from typing import Optional, Union, Dict # Added for Python 3.9 compatibility

class GoogleVeo:
    _access_token: Optional[str] = None
    _token_created_at: Optional[datetime.datetime] = None
    _TOKEN_EXPIRATION_MINUTES = 30

    def __init__(self, project_id: str, model_name: str = "veo-2.0-generate-001"): # Default if not provided
        self.project_id = project_id
        self.model_name = model_name
        # Construct endpoints dynamically based on the model_name
        self.video_model_base_url = f"https://us-central1-aiplatform.googleapis.com/v1beta1/projects/{self.project_id}/locations/us-central1/publishers/google/models/{self.model_name}"
        self.prediction_endpoint = f"{self.video_model_base_url}:predictLongRunning"
        self.fetch_endpoint = f"{self.video_model_base_url}:fetchPredictOperation" # Assumes fetch is on the model resource

    def _get_access_token(self) -> str:
        """
        Retrieves a valid access token, refreshing it if necessary.
        """
        now = datetime.datetime.now(datetime.timezone.utc)
        if (
            GoogleVeo._access_token is None or
            GoogleVeo._token_created_at is None or
            (now - GoogleVeo._token_created_at) > datetime.timedelta(minutes=GoogleVeo._TOKEN_EXPIRATION_MINUTES)
        ):
            creds, project = google.auth.default()
            auth_req = google.auth.transport.requests.Request()
            creds.refresh(auth_req)
            GoogleVeo._access_token = creds.token
            GoogleVeo._token_created_at = now
            print("Generated new access token.")
        return GoogleVeo._access_token

    def _send_request_to_google_api(self, api_endpoint: str, data: dict = None):
        """
        Sends an HTTP request to a Google API endpoint.
        """
        access_token = self._get_access_token()

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
        image_mime_type: str = "image/jpeg", # Default to jpeg
        video_uri: str = "",
        last_frame_uri: str = "",
        last_frame_mime_type: str = "image/jpeg", # Default to jpeg
        camera_control: str = "",
    ):
        if self.model_name == "veo-3.0-generate-preview":
            if "durationSeconds" in parameters and isinstance(parameters["durationSeconds"], (int, float)) and parameters["durationSeconds"] > 90:
                raise ValueError(
                    f"For model '{self.model_name}', 'durationSeconds' cannot exceed 90. "
                    f"Received: {parameters['durationSeconds']}"
                )

        instance = {"prompt": prompt}
        if image_uri:
            instance["image"] = {"gcsUri": image_uri, "mimeType": image_mime_type}
        if video_uri:
            instance["video"] = {"gcsUri": video_uri, "mimeType": "video/mp4"}
        if last_frame_uri:
            instance["lastFrame"] = {"gcsUri": last_frame_uri, "mimeType": last_frame_mime_type}
        # Only add cameraControl if the model supports it, it's provided, AND it's not a video extension task
        if self.model_name != "veo-2.0-generate-001" and camera_control and not video_uri:
            instance["cameraControl"] = camera_control
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
        )
        print(f"Sending video generation request: {req}")
        resp = self._send_request_to_google_api(self.prediction_endpoint, req)
        print(f"Received LRO name: {resp.get('name')}")
        return self._fetch_operation(resp["name"])

    # def show_video_from_gcs(self, op_result: dict, local_download_path: str = "./temp_video.mp4"):
    #     """
    #     Downloads a video from GCS and shows it.
    #     Note: `gsutil` command execution and `media.show_video` might need specific
    #     environment setup or alternatives in a non-Colab/server environment.
    #     """
    #     print(f"Operation result: {op_result}")
    #     if "error" in op_result:
    #         print(f"\nError in operation: {op_result['error']['message']}")
    #         return None
        
    #     video_gcs_uri = None
    #     if "response" in op_result:
    #         if "videos" in op_result["response"] and op_result["response"]["videos"]:
    #             video_gcs_uri = op_result["response"]["videos"][0]["gcsUri"]
    #         elif "generatedSamples" in op_result["response"] and op_result["response"]["generatedSamples"]:
    #             video_gcs_uri = op_result["response"]["generatedSamples"][0]["video"]["uri"]

    #     if video_gcs_uri:
    #         # Ensure the local download path directory exists
    #         os.makedirs(os.path.dirname(local_download_path) or '.', exist_ok=True)
            
    #         # Using os.system for gsutil, ensure gsutil is configured and in PATH
    #         # Consider using google-cloud-storage library for more robust GCS operations
    #         gsutil_command = f"gsutil cp {video_gcs_uri} {local_download_path}"
    #         print(f"Executing: {gsutil_command}")
    #         exit_code = os.system(gsutil_command)
    #         if exit_code == 0:
    #             print(f"Video downloaded to {local_download_path}")
    #             # media.show_video might not be suitable for all environments (e.g. headless server)
    #             # For now, we'll assume it's available or this part will be handled differently by the caller
    #             try:
    #                 media.show_video(media.read_video(local_download_path), height=500)
    #                 return local_download_path
    #             except Exception as e:
    #                 print(f"Could not show video with mediapy: {e}")
    #                 return local_download_path # Return path even if showing fails
    #         else:
    #             print(f"Failed to download video using gsutil. Exit code: {exit_code}")
    #             return None
    #     else:
    #         print("No video URI found in the operation result.")
    #         return None
