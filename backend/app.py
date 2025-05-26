import time
import urllib
import os
import uuid
import threading
import base64 # Added for image encoding
# import requests # No longer needed for video download
import cv2 # For thumbnail generation
from dotenv import load_dotenv # For loading .env files
from google.cloud import storage # For GCS download
from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS # Import CORS
from google import genai
from google.genai import types
from google_veo import GoogleVeo # Import GoogleVeo

# --- Load Environment Variables ---
# Construct the path to local.env in the parent directory
dotenv_path = os.path.join(os.path.dirname(__file__), '..', 'local.env')
load_dotenv(dotenv_path=dotenv_path)

# --- Application Configuration from Environment Variables ---
PROJECT_ID = os.getenv("GCP_PROJECT_ID")
LOCATION = os.getenv("GCP_REGION") # Assuming GCP_REGION is used for LOCATION
DEFAULT_OUTPUT_GCS_BUCKET = os.getenv("VIDEO_GCS_BUCKET")

# --- Flask App Initialization ---
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000", "http://localhost"]}}) # Enable CORS for frontend dev server and local Nginx, restricted to /api paths

# --- Directory Configuration ---
backend_dir = os.path.abspath(os.path.dirname(__file__))
data_dir = os.path.join(backend_dir, 'data')
videos_dir = os.path.join(data_dir, 'videos') # Local videos folder, now in data_dir
thumbnails_dir = os.path.join(data_dir, 'thumbnails') # Local thumbnails folder, now in data_dir

# Ensure directories exist
if not os.path.exists(data_dir):
    os.makedirs(data_dir)
if not os.path.exists(videos_dir): # This will now create backend/data/videos
    os.makedirs(videos_dir)
if not os.path.exists(thumbnails_dir): # This will now create backend/data/thumbnails
    os.makedirs(thumbnails_dir)

uploads_dir = os.path.join(data_dir, 'uploads') # Local uploads folder for images, now in data_dir
if not os.path.exists(uploads_dir): # This will now create backend/data/uploads
    os.makedirs(uploads_dir)


app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(data_dir, "tasks.db")}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# --- Video Generation Configuration ---
DEFAULT_VIDEO_MODEL = "veo-2.0-generate-001"


# --- SQLAlchemy Model for VideoGenerationTask ---
class VideoGenerationTask(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    prompt = db.Column(db.String(1024), nullable=False)
    model = db.Column(db.String(100), default=DEFAULT_VIDEO_MODEL) # New field for model
    aspect_ratio = db.Column(db.String(10), default="16:9")
    camera_control = db.Column(db.String(50), default="FIXED") # New field for camera control
    duration_seconds = db.Column(db.Integer, default=5)
    gcs_output_bucket = db.Column(db.String(1024), nullable=True) # New field for GCS bucket (optional)
    status = db.Column(db.String(50), default="pending")  # pending, processing, completed, failed
    video_gcs_uri = db.Column(db.String(1024), nullable=True) # GCS URI or HTTPS URL
    local_video_path = db.Column(db.String(1024), nullable=True) # Path to locally saved video
    local_thumbnail_path = db.Column(db.String(1024), nullable=True) # Path to locally saved thumbnail
    image_filename = db.Column(db.String(255), nullable=True) # Filename of the uploaded image
    image_gcs_uri = db.Column(db.String(1024), nullable=True) # GCS URI of the uploaded image
    last_frame_filename = db.Column(db.String(255), nullable=True) # Filename of the uploaded last frame image
    last_frame_gcs_uri = db.Column(db.String(1024), nullable=True) # GCS URI of the uploaded last frame image
    video_uri = db.Column(db.String(1024), nullable=True) # User-added: new video_uri attribute
    error_message = db.Column(db.String(1024), nullable=True)
    created_at = db.Column(db.Float, default=time.time)
    updated_at = db.Column(db.Float, default=time.time, onupdate=time.time)

    def __repr__(self):
        return (f"<VideoGenerationTask(id='{self.id}', prompt='{self.prompt[:30]}...', "
                f"model='{self.model}', aspect_ratio='{self.aspect_ratio}', "
                f"camera_control='{self.camera_control}', duration_seconds={self.duration_seconds}, "
                f"status='{self.status}', image_filename='{self.image_filename}', "
                f"video_uri='{self.video_uri}', "
                f"last_frame_filename='{self.last_frame_filename}')>")

    def to_dict(self):
        video_url_http = None
        if self.video_gcs_uri and self.video_gcs_uri.startswith("gs://"):
            video_url_http = self.video_gcs_uri.replace("gs://", "https://storage.cloud.google.com/", 1)
        elif self.video_gcs_uri: # If it's already an HTTP URL or some other format
            video_url_http = self.video_gcs_uri

        return {
            "task_id": self.id,
            "prompt": self.prompt,
            "model": self.model,
            "status": self.status,
            "camera_control": self.camera_control,
            "video_gcs_uri": self.video_gcs_uri, # Raw GCS URI
            "video_uri": self.video_uri, # User-added: new video_uri attribute
            "video_url_http": video_url_http, # HTTP accessible URL
            "local_video_path": self.local_video_path,
            "local_thumbnail_path": self.local_thumbnail_path,
            "image_filename": self.image_filename, # Keep for potential direct use or debugging
            "original_image_path": f"/uploads/{self.image_filename}" if self.image_filename else None,
            "image_gcs_uri": self.image_gcs_uri,
            "original_last_frame_path": f"/uploads/{self.last_frame_filename}" if self.last_frame_filename else None,
            "last_frame_gcs_uri": self.last_frame_gcs_uri,
            "error_message": self.error_message,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "aspect_ratio": self.aspect_ratio,
            "duration_seconds": self.duration_seconds,
            "gcs_output_bucket": self.gcs_output_bucket
        }

def _run_video_generation(task_id):
    with app.app_context(): # Needed for db operations in thread
        task = VideoGenerationTask.query.get(task_id)
        if not task:
            print(f"Task {task_id} not found for processing.")
            return

        task.status = "processing"
        task.updated_at = time.time()
        db.session.commit()
        print(f"Starting video generation for task {task_id}, prompt: '{task.prompt}', model: '{task.model}'")

        try:
            # Model specific checks based on user feedback
            # User feedback: "veo-3.0-generate-preview dosen't support lart frame image and 9:16 ratio"
            # Assuming "lart frame" means "last frame"
            TARGET_MODEL_FOR_CHECKS = "veo-3.0-generate-preview" # Or the correct model name if this is a typo

            if task.model == TARGET_MODEL_FOR_CHECKS:
                if task.last_frame_filename:
                    task.status = "failed"
                    task.error_message = f"Model {TARGET_MODEL_FOR_CHECKS} does not support last frame images."
                    db.session.commit()
                    print(f"Task {task_id} failed: {task.error_message}")
                    return
                if task.aspect_ratio == "9:16":
                    task.status = "failed"
                    task.error_message = f"Model {TARGET_MODEL_FOR_CHECKS} does not support 9:16 aspect ratio."
                    db.session.commit()
                    print(f"Task {task_id} failed: {task.error_message}")
                    return
            print("@@", task)
            veo_client = GoogleVeo(project_id=PROJECT_ID, model_name=task.model) # Instantiate GoogleVeo with task's model

            current_image_gcs_uri = None # Initialize
            current_last_frame_gcs_uri = None # Initialize

            # Determine GCS output URI: use task-specific if provided, else default
            bucket_to_use = task.gcs_output_bucket if task.gcs_output_bucket else DEFAULT_OUTPUT_GCS_BUCKET
            # GoogleVeo expects the GCS URI for the API to store the video.
            # The API itself will create subdirectories if needed, or use the direct path.
            # Let's ensure it's a clean GCS path for the output video file.
            # The original notebook examples often point to a directory, and the API names the file.
            # GoogleVeo's `storageUri` parameter is for this.
            output_gcs_uri_for_task_api = f"{bucket_to_use.rstrip('/')}/{task.id}/video.mp4" # Example: API might save to this specific file or use the prefix

            # Prepare parameters for GoogleVeo.generate_video
            veo_parameters = {
                "aspectRatio": task.aspect_ratio,
                "storageUri": output_gcs_uri_for_task_api, # GCS path for API output
                "numberOfVideos": 1,
                "durationSeconds": task.duration_seconds,
                # "cameraControl": task.camera_control, # Removed from here
                "personGeneration": "ALLOW_ALL", # Assuming this is passed through
                "enhancePrompt": True,
            }

            current_image_mime_type = "image/jpeg" # Default
            if task.image_filename:
                image_full_path = os.path.join(uploads_dir, task.image_filename)
                if os.path.exists(image_full_path):
                    try:
                        # Determine MIME type from filename extension
                        filename_lower = task.image_filename.lower()
                        if filename_lower.endswith((".jpg", ".jpeg")):
                            current_image_mime_type = "image/jpeg"
                        elif filename_lower.endswith(".png"):
                            current_image_mime_type = "image/png"
                        elif filename_lower.endswith(".gif"):
                            current_image_mime_type = "image/gif"
                        # Add other types if needed

                        # Image must be uploaded to GCS for GoogleVeo class as it expects gcsUri
                        if DEFAULT_OUTPUT_GCS_BUCKET:
                            storage_client_img = storage.Client()
                            image_bucket_name = DEFAULT_OUTPUT_GCS_BUCKET.replace("gs://", "")
                            bucket_img = storage_client_img.bucket(image_bucket_name)
                            base_image_filename = os.path.basename(task.image_filename)
                            image_blob_name = f"image_uploads/{task.id}/{base_image_filename}"
                            blob_img = bucket_img.blob(image_blob_name)
                            
                            blob_img.upload_from_filename(image_full_path, content_type=current_image_mime_type)
                            current_image_gcs_uri = f"gs://{image_bucket_name}/{image_blob_name}"
                            task.image_gcs_uri = current_image_gcs_uri # Save to task model
                            db.session.commit()
                            print(f"Successfully uploaded image {task.image_filename} to {current_image_gcs_uri}")
                        else:
                            # If no GCS bucket for uploads, this path cannot proceed with GoogleVeo
                            raise ValueError("DEFAULT_OUTPUT_GCS_BUCKET is not configured. Image upload to GCS is required for GoogleVeo.")

                    except Exception as e_img_gcs:
                        print(f"Error processing/uploading image file {task.image_filename} for task {task_id}: {e_img_gcs}")
                        task.status = "failed"
                        task.error_message = f"Error processing/uploading image: {e_img_gcs}"
                        db.session.commit()
                        return
                else:
                    print(f"Image file {task.image_filename} not found for task {task_id}")
            # current_last_frame_gcs_uri is initialized above
            current_last_frame_mime_type = "image/jpeg" # Default
            if task.last_frame_filename:
                last_frame_full_path = os.path.join(uploads_dir, task.last_frame_filename)
                if os.path.exists(last_frame_full_path):
                    try:
                        filename_lower_last = task.last_frame_filename.lower()
                        if filename_lower_last.endswith((".jpg", ".jpeg")):
                            current_last_frame_mime_type = "image/jpeg"
                        elif filename_lower_last.endswith(".png"):
                            current_last_frame_mime_type = "image/png"
                        elif filename_lower_last.endswith(".gif"):
                            current_last_frame_mime_type = "image/gif"
                        # Add other types if needed
                        
                        if DEFAULT_OUTPUT_GCS_BUCKET:
                            storage_client_last_img = storage.Client()
                            last_image_bucket_name = DEFAULT_OUTPUT_GCS_BUCKET.replace("gs://", "")
                            bucket_last_img = storage_client_last_img.bucket(last_image_bucket_name)
                            base_last_image_filename = os.path.basename(task.last_frame_filename)
                            last_image_blob_name = f"last_frame_uploads/{task.id}/{base_last_image_filename}"
                            blob_last_img = bucket_last_img.blob(last_image_blob_name)
                            
                            blob_last_img.upload_from_filename(last_frame_full_path, content_type=current_last_frame_mime_type)
                            current_last_frame_gcs_uri = f"gs://{last_image_bucket_name}/{last_image_blob_name}"
                            task.last_frame_gcs_uri = current_last_frame_gcs_uri # Save to task model
                            db.session.commit()
                            print(f"Successfully uploaded last frame image {task.last_frame_filename} to {current_last_frame_gcs_uri}")
                        else:
                            raise ValueError("DEFAULT_OUTPUT_GCS_BUCKET is not configured. Last frame image upload to GCS is required.")
                    except Exception as e_last_img_gcs:
                        print(f"Error processing/uploading last frame image {task.last_frame_filename} for task {task_id}: {e_last_img_gcs}")
                        task.status = "failed"
                        task.error_message = f"Error processing/uploading last frame image: {e_last_img_gcs}"
                        db.session.commit()
                        return
                else:
                    print(f"Last frame image file {task.last_frame_filename} not found for task {task_id}")

            # Call GoogleVeo to generate video
            # Note: model_to_use (task.model or DEFAULT_VIDEO_MODEL) is not used here as GoogleVeo class has a hardcoded model.
            # This might be a point of future enhancement if model selection is needed with GoogleVeo.
            op_result = veo_client.generate_video(
                prompt=task.prompt,
                parameters=veo_parameters,
                image_uri=current_image_gcs_uri if current_image_gcs_uri else "",
                image_mime_type=current_image_mime_type,
                video_uri=task.video_uri if task.video_uri else "", # Pass video_uri if present
                last_frame_uri=current_last_frame_gcs_uri if current_last_frame_gcs_uri else "",
                last_frame_mime_type=current_last_frame_mime_type,
                camera_control=task.camera_control # Pass camera_control directly
            )

            # Process the result from GoogleVeo
            if "error" in op_result and op_result["error"]:
                task.status = "failed"
                task.error_message = op_result["error"].get("message", "Unknown error during Veo generation")
                print(f"Video generation failed for task {task_id}: {task.error_message}")
            elif "response" in op_result:
                gcs_raw_uri = None
                response_data = op_result["response"]
                if "videos" in response_data and response_data["videos"]:
                    gcs_raw_uri = response_data["videos"][0].get("gcsUri")
                elif "generatedSamples" in response_data and response_data["generatedSamples"]:
                    gcs_raw_uri = response_data["generatedSamples"][0].get("video", {}).get("uri")

                if gcs_raw_uri:
                    # Ensure gcs_raw_uri is stored with gs:// prefix if it's a GCS path
                    if "storage.cloud.google.com" in gcs_raw_uri:
                        # Convert https to gs:// before saving if it came from an older process or manual entry
                        task.video_gcs_uri = gcs_raw_uri.replace("https://storage.cloud.google.com/", "gs://", 1)
                    else:
                        task.video_gcs_uri = gcs_raw_uri # Assume it's already gs:// or a non-GCS URI
                    
                    task.status = "completed" # Set status after video_gcs_uri is set
                    print(f"Video generation completed for task {task_id}. GCS URI: {task.video_gcs_uri}")

                    # Download video using google-cloud-storage
                    video_filename = f"{task.id}.mp4"
                    local_video_full_path = os.path.join(videos_dir, video_filename)
                    try:
                        # gcs_raw_uri is like "gs://bucket-name/path/to/blob"
                        bucket_name = gcs_raw_uri.split('/')[2]
                        source_blob_name = "/".join(gcs_raw_uri.split('/')[3:])
                        
                        print(f"Downloading video for task {task_id} from GCS bucket '{bucket_name}', blob '{source_blob_name}' to '{local_video_full_path}'...")
                        storage_client = storage.Client()
                        bucket = storage_client.bucket(bucket_name)
                        blob = bucket.blob(source_blob_name)
                        blob.download_to_filename(local_video_full_path)
                        
                        task.local_video_path = f"/videos/{video_filename}" # Relative path for serving
                        print(f"Video for task {task_id} downloaded successfully via GCS client.")

                        # time.sleep(1) # May not be needed with GCS client download, but can be re-added if moov atom issue persists

                        # Generate thumbnail
                        thumbnail_filename = f"{task.id}.jpg"
                        local_thumbnail_full_path = os.path.join(thumbnails_dir, thumbnail_filename)
                        print(f"Generating thumbnail for task {task_id} at {local_thumbnail_full_path}...")
                        vid_cap = cv2.VideoCapture(local_video_full_path)
                        success, image = vid_cap.read()
                        if success:
                            cv2.imwrite(local_thumbnail_full_path, image)
                            task.local_thumbnail_path = f"/thumbnails/{thumbnail_filename}" # Relative path for serving
                            print(f"Thumbnail for task {task_id} generated successfully.")
                        else:
                            print(f"Failed to extract frame for thumbnail for task {task_id}.")
                        vid_cap.release()
                    except Exception as e_dl_thumb: # Catching broader exception for GCS download or thumbnailing
                        print(f"Error during video download or thumbnail generation for task {task_id}: {e_dl_thumb}")
                        task.error_message = (task.error_message or "") + f"; Download/Thumbnail failed: {e_dl_thumb}"
                else:
                    task.video_gcs_uri = gcs_raw_uri # Fallback if not a GCS URI, no download possible
                    print(f"Video generation completed for task {task_id}. Non-GCS URI: {task.video_gcs_uri}")
            else:
                task.status = "failed"
                task.error_message = "Generation finished but no video URI found or unexpected result."
                print(f"Task {task_id}: {task.error_message}")

        except Exception as e:
            task.status = "failed"
            task.error_message = str(e)
            print(f"Exception during video generation for task {task_id}: {e}")
        finally:
            task.updated_at = time.time()
            db.session.commit()

@app.route('/')
def hello_world():
    return 'Hello!'

from werkzeug.utils import secure_filename

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/api/generate-video', methods=['POST'])
def generate_video_route():
    if 'prompt' not in request.form:
        return jsonify({"error": "Prompt is required"}), 400

    prompt_text = request.form['prompt']
    model = request.form.get('model', DEFAULT_VIDEO_MODEL)
    aspect_ratio = request.form.get('ratio', '16:9')
    camera_control = request.form.get('camera_control', 'FIXED') # Get camera_control
    duration_seconds = int(request.form.get('duration', 5))
    gcs_output_bucket = request.form.get('gcs_output_bucket', None)

    image_file = request.files.get('image_file')
    image_filename_to_save = None
    if image_file and allowed_file(image_file.filename):
        original_extension = os.path.splitext(image_file.filename)[1]
        img_filename = secure_filename(f"{uuid.uuid4()}_image{original_extension}")
        image_path = os.path.join(uploads_dir, img_filename)
        image_file.save(image_path)
        image_filename_to_save = img_filename
        print(f"Saved uploaded image to: {image_path}")

    last_frame_file = request.files.get('last_frame_file')
    last_frame_filename_to_save = None
    if last_frame_file and allowed_file(last_frame_file.filename):
        original_extension_last = os.path.splitext(last_frame_file.filename)[1]
        last_frame_img_filename = secure_filename(f"{uuid.uuid4()}_last_frame{original_extension_last}")
        last_frame_image_path = os.path.join(uploads_dir, last_frame_img_filename)
        last_frame_file.save(last_frame_image_path)
        last_frame_filename_to_save = last_frame_img_filename
        print(f"Saved uploaded last frame image to: {last_frame_image_path}")

    new_task = VideoGenerationTask(
        prompt=prompt_text,
        model=model,
        aspect_ratio=aspect_ratio,
        camera_control=camera_control, # Save camera_control
        duration_seconds=duration_seconds,
        gcs_output_bucket=gcs_output_bucket,
        image_filename=image_filename_to_save,
        last_frame_filename=last_frame_filename_to_save
    )
    db.session.add(new_task)
    db.session.commit()
    
    thread = threading.Thread(target=_run_video_generation, args=(new_task.id,))
    thread.start()
    
    return jsonify({"message": "Video generation started", "task_id": new_task.id}), 202

@app.route('/api/extend-video/<original_task_id>', methods=['POST'])
def extend_video_route(original_task_id):
    original_task = VideoGenerationTask.query.get(original_task_id)
    if not original_task:
        return jsonify({"error": "Original task not found"}), 404

    if not original_task.video_gcs_uri:
        return jsonify({"error": "Original task does not have a video GCS URI to extend"}), 400

    # Use a default prompt or allow a new one via request.form
    # For simplicity, let's use the original prompt for now
    prompt_text = request.form.get('prompt', original_task.prompt)
    model = "veo-2.0-generate-exp" # Always use veo-2.0-generate-exp for extension
    # Duration for extension might be different, e.g., always 5 seconds more, or configurable
    # For veo-2.0-generate-exp, duration is typically 8s.
    duration_seconds = int(request.form.get('duration', 8)) # Default extension duration for exp model
    gcs_output_bucket = request.form.get('gcs_output_bucket', original_task.gcs_output_bucket or DEFAULT_OUTPUT_GCS_BUCKET)

    new_task = VideoGenerationTask(
        prompt=prompt_text,
        model=model, # This will be "veo-2.0-generate-exp"
        aspect_ratio=original_task.aspect_ratio, # Crucial: use original aspect ratio
        camera_control=original_task.camera_control, # Carry over camera control
        duration_seconds=6,#duration_seconds,
        gcs_output_bucket=gcs_output_bucket,
        video_uri=original_task.video_gcs_uri, # Crucial: set video_uri to original video
        # image_filename and last_frame_filename are typically not used when extending a video,
        # but could be added if the VEO API supports it for video-to-video.
        # For now, we assume extension primarily uses the video_uri.
        status="pending" # Initial status
    )
    db.session.add(new_task)
    db.session.commit()

    thread = threading.Thread(target=_run_video_generation, args=(new_task.id,))
    thread.start()

    return jsonify({"message": "Video extension started", "task_id": new_task.id}), 202

@app.route('/api/refine-prompt', methods=['POST'])
def refine_prompt_route():
    data = request.get_json()
    if not data or 'prompt' not in data:
        return jsonify({"error": "Prompt is required in JSON body"}), 400

    original_prompt = data['prompt']
    
    try:
        client = genai.Client(
            vertexai=True,
            project=PROJECT_ID, # Use existing PROJECT_ID from environment
            location="global",  # As per sample for Vertex AI text models
        )

        si_text1 = """Help user to improve the prompt for Veo 2 video generation. Follow the rules below:
Translate the prompt into English
Refine the prompt for generate better video, be creative
Output the prompt only
Do only prompt refine not anything else"""

        # Use the model name from the user's sample code
        model_name = "gemini-2.0-flash-001" 
        
        contents = [
            types.Content(
                role="user",
                parts=[
                    # Use the actual prompt from the request
                    types.Part.from_text(text=original_prompt) 
                ]
            ),
        ]

        # Use GenerateContentConfig from the user's sample code
        generate_content_config = types.GenerateContentConfig(
            temperature=1, # From sample
            top_p=1,       # From sample
            max_output_tokens=8192, # From sample
            safety_settings=[ # From sample, using "OFF"
                types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="OFF"),
                types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="OFF"),
                types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="OFF"),
                types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="OFF")
            ],
            # system_instruction expects a list of Parts or a single Part.
            # The sample code uses a list: system_instruction=[types.Part.from_text(text=si_text1)]
            # However, the SDK for GenerateContentConfig might expect a single Part for system_instruction.
            # Let's use types.Part.from_text directly as it's safer.
            system_instruction=types.Part.from_text(text=si_text1),
        )
        
        # Use generate_content_stream as in the sample and accumulate the text
        full_refined_text = ""
        # Construct the full model path for Vertex AI
        full_model_name = f"projects/{PROJECT_ID}/locations/global/endpoints/{model_name}"

        for chunk in client.models.generate_content_stream( # Corrected method name
            model=model_name,
            contents=contents,
            config=generate_content_config, # Corrected parameter name
        ):
            if chunk.text: # Ensure text exists before appending
                full_refined_text += chunk.text
        
        refined_prompt = full_refined_text.strip()

        if refined_prompt:
            return jsonify({"refined_prompt": refined_prompt}), 200
        else:
            # Log if the stream resulted in an empty string after stripping
            print(f"Gemini stream resulted in empty refined prompt for original: {original_prompt}")
            return jsonify({"error": "Failed to refine prompt, Gemini returned empty content."}), 500

    except Exception as e:
        print(f"Error during prompt refinement: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500

@app.route('/api/task-status/<task_id>', methods=['GET'])
def task_status_route(task_id):
    task = VideoGenerationTask.query.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    return jsonify(task.to_dict()), 200

@app.route('/api/tasks', methods=['GET'])
def get_tasks_route():
    # Query tasks, order by creation date descending (newest first)
    # Limit to a certain number, e.g., 50, to avoid overly large responses if there are many tasks
    tasks = VideoGenerationTask.query.order_by(VideoGenerationTask.created_at.desc()).limit(50).all()
    return jsonify([task.to_dict() for task in tasks]), 200

@app.route('/api/task/<task_id>', methods=['DELETE'])
def delete_task_route(task_id):
    task = VideoGenerationTask.query.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    try:
        # Attempt to delete local files if paths exist
        if task.local_video_path:
            # local_video_path is stored as "/videos/filename.mp4"
            # videos_dir now points to backend/data/videos
            video_file_to_delete = os.path.join(videos_dir, os.path.basename(task.local_video_path))
            if os.path.exists(video_file_to_delete):
                os.remove(video_file_to_delete)
                print(f"Deleted local video file: {video_file_to_delete}")
            else:
                print(f"Local video file not found for deletion: {video_file_to_delete}")
        
        if task.local_thumbnail_path:
            # local_thumbnail_path is stored as "/thumbnails/filename.jpg"
            # thumbnails_dir now points to backend/data/thumbnails
            thumbnail_file_to_delete = os.path.join(thumbnails_dir, os.path.basename(task.local_thumbnail_path))
            if os.path.exists(thumbnail_file_to_delete):
                os.remove(thumbnail_file_to_delete)
                print(f"Deleted local thumbnail file: {thumbnail_file_to_delete}")
            else:
                print(f"Local thumbnail file not found for deletion: {thumbnail_file_to_delete}")
        
        if task.image_filename:
            image_file_to_delete = os.path.join(uploads_dir, task.image_filename)
            if os.path.exists(image_file_to_delete):
                os.remove(image_file_to_delete)
                print(f"Deleted uploaded image file: {image_file_to_delete}")
            else:
                print(f"Uploaded image file not found for deletion: {image_file_to_delete}")

        if task.last_frame_filename:
            last_frame_file_to_delete = os.path.join(uploads_dir, task.last_frame_filename)
            if os.path.exists(last_frame_file_to_delete):
                os.remove(last_frame_file_to_delete)
                print(f"Deleted uploaded last frame image file: {last_frame_file_to_delete}")
            else:
                print(f"Uploaded last frame image file not found for deletion: {last_frame_file_to_delete}")

        db.session.delete(task)
        db.session.commit()
        return jsonify({"message": "Task and associated files deleted successfully"}), 200
    except Exception as e:
        db.session.rollback() # Rollback in case of error during file deletion or db operation
        print(f"Error deleting task {task_id}: {e}")
        return jsonify({"error": f"Failed to delete task: {str(e)}"}), 500

# --- Static file serving for videos and thumbnails ---
@app.route('/api/videos/<filename>')
def serve_video(filename):
    return send_from_directory(videos_dir, filename)

@app.route('/api/thumbnails/<filename>')
def serve_thumbnail(filename):
    return send_from_directory(thumbnails_dir, filename)

@app.route('/api/uploads/<filename>')
def serve_upload(filename):
    return send_from_directory(uploads_dir, filename)

@app.route('/api/health', methods=['GET'])
def health_check():
    # Basic health check: if the app is running, it's healthy.
    # More sophisticated checks could include DB connectivity, etc.
    return jsonify({"status": "ok", "message": "OK"}), 200

if __name__ == '__main__':
    with app.app_context():
        db.create_all() # Create database tables if they don't exist
    print(f"Starting Flask app for VEO generation with SQLite persistence.")
    print(f"Database will be stored at: {app.config['SQLALCHEMY_DATABASE_URI']}")
    print(f"Videos will be stored in: {videos_dir}")
    print(f"Thumbnails will be stored in: {thumbnails_dir}")
    print(f"Uploads will be stored in: {uploads_dir}")
    print(f"Using Project ID: {PROJECT_ID}, Location: {LOCATION}")
    print(f"Default Output GCS Bucket: {DEFAULT_OUTPUT_GCS_BUCKET}")
    print(f"Default Video Model: {DEFAULT_VIDEO_MODEL}")
    app.run(debug=True, host='0.0.0.0', port=5001)
