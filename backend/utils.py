from flask import request
from config import ALLOWED_EXTENSIONS, ALLOWED_MUSIC_EXTENSIONS

def get_processed_user_email_from_header(default_fallback_email="public@dreamer-v"):
    user_email = request.headers.get('X-Goog-Authenticated-User-Email')
    if user_email:
        if user_email.startswith("accounts.google.com:"):
            return user_email[len("accounts.google.com:"):]
        return user_email
    return default_fallback_email

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def allowed_music_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_MUSIC_EXTENSIONS
