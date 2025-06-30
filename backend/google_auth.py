import datetime
from typing import Optional

import google.auth
import google.auth.transport.requests

_access_token: Optional[str] = None
_token_created_at: Optional[datetime.datetime] = None
_TOKEN_EXPIRATION_MINUTES = 30

def get_access_token() -> str:
    """
    Retrieves a valid access token, refreshing it if necessary using google.auth.
    """
    global _access_token, _token_created_at
    now = datetime.datetime.now(datetime.timezone.utc)
    if (
        _access_token is None or
        _token_created_at is None or
        (now - _token_created_at) > datetime.timedelta(minutes=_TOKEN_EXPIRATION_MINUTES)
    ):
        try:
            creds, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/cloud-platform'])
            auth_req = google.auth.transport.requests.Request()
            creds.refresh(auth_req)
            _access_token = creds.token
            _token_created_at = now
            print("Generated new access token.")
        except google.auth.exceptions.DefaultCredentialsError as e:
            raise RuntimeError(
                "Failed to get default Google Cloud credentials. "
                "Ensure you are authenticated (e.g., `gcloud auth application-default login`)."
            ) from e
        except Exception as e:
            raise RuntimeError(f"An unexpected error occurred while refreshing token: {e}") from e
    
    if _access_token is None:
         raise RuntimeError("Access token could not be obtained.")
    return _access_token
