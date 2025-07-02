import threading
import uuid
import os
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
from database import db
from models import VideoGenerationTask
from tasks import _run_video_generation, _run_composite_video_creation
from config import (
    DEFAULT_VIDEO_MODEL,
    uploads_dir,
    ALLOWED_EXTENSIONS,
    DEFAULT_OUTPUT_GCS_BUCKET,
)
from utils import get_processed_user_email_from_header, allowed_file

video_bp = Blueprint('video_bp', __name__)

@video_bp.route('/api/generate-video', methods=['POST'])
def generate_video_route():
    if 'prompt' not in request.form:
        return jsonify({"error": "Prompt is required"}), 400

    prompt_text = request.form['prompt']
    model = request.form.get('model', DEFAULT_VIDEO_MODEL)
    aspect_ratio = request.form.get('ratio', '16:9')
    camera_control = request.form.get('camera_control', 'FIXED') # Get camera_control
    duration_seconds = int(request.form.get('duration', 5))
    gcs_output_bucket = request.form.get('gcs_output_bucket', None)
    generate_audio = request.form.get('generateAudio', 'false').lower() == 'true'

    user_email = get_processed_user_email_from_header()

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
        last_frame_filename=last_frame_filename_to_save,
        user=user_email,
        generate_audio=generate_audio
    )
    db.session.add(new_task)
    db.session.commit()
    
    thread = threading.Thread(target=_run_video_generation, args=(current_app._get_current_object(), new_task.id))
    thread.start()
    
    return jsonify({"message": "Video generation started", "task_id": new_task.id}), 202

@video_bp.route('/api/extend-video/<original_task_id>', methods=['POST'])
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

    # For extend, we want to try header, then original task's user, then the ultimate fallback.
    user_email_from_header = get_processed_user_email_from_header(default_fallback_email=None) # Get raw email or None
    user_email = user_email_from_header or original_task.user or "public@dreamer-v" # Apply custom fallback chain

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
        status="pending", # Initial status
        user=user_email
    )
    db.session.add(new_task)
    db.session.commit()

    thread = threading.Thread(target=_run_video_generation, args=(current_app._get_current_object(), new_task.id))
    thread.start()

    return jsonify({"message": "Video extension started", "task_id": new_task.id}), 202

@video_bp.route('/api/create_composite_video', methods=['POST'])
def create_composite_video_route():
    data = request.get_json()
    if not data or 'clips' not in data or not isinstance(data['clips'], list) or not data['clips']:
        return jsonify({"error": "A non-empty list of 'clips' (each with a 'task_id') is required"}), 400

    source_clips_info = data['clips']
    composite_prompt = data.get('prompt', "Composite video from selected clips")
    music_file_path = data.get('music_file_path') 

    user_email = get_processed_user_email_from_header()

    for clip_info in source_clips_info:
        if 'task_id' not in clip_info:
            return jsonify({"error": "Each clip in the 'clips' list must have a 'task_id'"}), 400
    
    new_composite_task = VideoGenerationTask(
        prompt=composite_prompt,
        model=DEFAULT_VIDEO_MODEL, 
        status="pending",
        gcs_output_bucket=data.get('gcs_output_bucket', DEFAULT_OUTPUT_GCS_BUCKET),
        user=user_email,
        music_file_path=music_file_path 
    )
    db.session.add(new_composite_task)
    db.session.commit()
    
    thread = threading.Thread(target=_run_composite_video_creation, args=(current_app._get_current_object(), new_composite_task.id, source_clips_info, music_file_path))
    thread.start()
    
    return jsonify({"message": "Composite video creation started", "task_id": new_composite_task.id}), 202
