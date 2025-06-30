import os
from dotenv import load_dotenv

# --- Load Environment Variables ---
# Construct the path to local.env in the parent directory
dotenv_path = os.path.join(os.path.dirname(__file__), '..', 'local.env')
load_dotenv(dotenv_path=dotenv_path)

# --- Application Configuration from Environment Variables ---
PROJECT_ID = os.getenv("GCP_PROJECT_ID")
LOCATION = os.getenv("GCP_REGION") # Assuming GCP_REGION is used for LOCATION
DEFAULT_OUTPUT_GCS_BUCKET = os.getenv("VIDEO_GCS_BUCKET")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "iamsuperuser-2282@dreamer-v.io")
DEFAULT_IMAGEN_MODEL_ID = os.getenv("DEFAULT_IMAGEN_MODEL_ID", "imagen-4.0-generate-preview-06-06")
DEFAULT_VIDEO_MODEL_ID = os.getenv("DEFAULT_VIDEO_MODEL_ID", "veo-2.0-generate-001")
DATABASE_URI = os.getenv("DATABASE_URI", f'sqlite:///{os.path.join(os.path.dirname(__file__), "data", "tasks.db")}')

# --- Directory Configuration ---
backend_dir = os.path.abspath(os.path.dirname(__file__))
data_dir = os.path.join(backend_dir, 'data')
videos_dir = os.path.join(data_dir, 'videos') # Local videos folder, now in data_dir
thumbnails_dir = os.path.join(data_dir, 'thumbnails') # Local thumbnails folder, now in data_dir
generated_music_dir = os.path.join(data_dir, 'music') # Local folder for Lyria generated music
user_uploaded_music_dir = os.path.join(data_dir, 'user_uploaded_music') # Local folder for user uploaded music
uploads_dir = os.path.join(data_dir, 'uploads') # Local uploads folder for images, now in data_dir


# Ensure directories exist
if not os.path.exists(data_dir):
    os.makedirs(data_dir, exist_ok=True)
if not os.path.exists(videos_dir): # This will now create backend/data/videos
    os.makedirs(videos_dir, exist_ok=True) # exist_ok=True to avoid error if it already exists
if not os.path.exists(thumbnails_dir): # This will now create backend/data/thumbnails
    os.makedirs(thumbnails_dir, exist_ok=True)
if not os.path.exists(generated_music_dir):
    os.makedirs(generated_music_dir, exist_ok=True)
if not os.path.exists(user_uploaded_music_dir):
    os.makedirs(user_uploaded_music_dir, exist_ok=True)
if not os.path.exists(uploads_dir): # This will now create backend/data/uploads
    os.makedirs(uploads_dir, exist_ok=True)


# --- Video Generation Configuration ---
DEFAULT_VIDEO_MODEL = DEFAULT_VIDEO_MODEL_ID # Use the loaded env var or its default
DEFAULT_IMAGEN_MODEL = DEFAULT_IMAGEN_MODEL_ID # Use the loaded env var or its default

# --- File Upload Configuration ---
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
ALLOWED_MUSIC_EXTENSIONS = {'mp3', 'wav'}
MAX_MUSIC_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

SQLALCHEMY_DATABASE_URI = DATABASE_URI
SQLALCHEMY_TRACK_MODIFICATIONS = False
