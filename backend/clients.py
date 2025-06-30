from google import genai
from google_lyria import GoogleLyria
from google_imagen import GoogleImagen
from config import PROJECT_ID, LOCATION, DEFAULT_IMAGEN_MODEL

lyria_client = None
if PROJECT_ID:
    try:
        lyria_client = GoogleLyria(project_id=PROJECT_ID)
        print(f"GoogleLyria client initialized. Default output dir: {lyria_client.output_dir}")
    except Exception as e:
        print(f"Error initializing GoogleLyria client: {e}. Music generation will be unavailable.")
        lyria_client = None
else:
    print("Warning: GCP_PROJECT_ID not set. GoogleLyria client will not be initialized.")

imagen_client = None
if PROJECT_ID and LOCATION:
    try:
        imagen_client = GoogleImagen(project_id=PROJECT_ID, location=LOCATION, model_id=DEFAULT_IMAGEN_MODEL)
        print(f"GoogleImagen client initialized with model: {DEFAULT_IMAGEN_MODEL}.")
    except Exception as e:
        print(f"Error initializing GoogleImagen client: {e}. Image generation will be unavailable.")
        imagen_client = None
else:
    print("Warning: GCP_PROJECT_ID or GCP_REGION not set. GoogleImagen client will not be initialized.")

def get_genai_client():
    return genai.Client(
        vertexai=True,
        project=PROJECT_ID,
        location="global",
    )
