import threading
import uuid
import os
from flask import Blueprint, request, jsonify, send_from_directory, current_app
from werkzeug.utils import secure_filename
from database import db
from models import MusicGenerationTask
from tasks import _run_music_generation
from config import (
    user_uploaded_music_dir,
    generated_music_dir,
    MAX_MUSIC_FILE_SIZE,
)
from utils import allowed_music_file
from clients import lyria_client

music_bp = Blueprint('music_bp', __name__)

@music_bp.route('/api/upload_music', methods=['POST'])
def upload_music_route():
    if 'music_file' not in request.files:
        return jsonify({"error": "No music_file part in the request"}), 400
    
    file = request.files['music_file']
    
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    if file and allowed_music_file(file.filename):
        # Check file size
        file.seek(0, os.SEEK_END) # Go to the end of the file
        file_length = file.tell() # Get the current position, which is the size
        file.seek(0, 0) # Go back to the start of the file for saving
        
        if file_length > MAX_MUSIC_FILE_SIZE:
            return jsonify({"error": f"File exceeds maximum size of {MAX_MUSIC_FILE_SIZE // (1024*1024)}MB"}), 413 # Payload Too Large

        original_extension = os.path.splitext(file.filename)[1]
        # Use a UUID for the filename to ensure uniqueness and add original extension
        filename = secure_filename(f"{uuid.uuid4()}{original_extension}")
        save_path = os.path.join(user_uploaded_music_dir, filename)
        
        try:
            file.save(save_path)
            # Return a relative path that the frontend can use with the new serving endpoint
            file_serve_path = f"/user_uploaded_music/{filename}"
            return jsonify({"message": "Music uploaded successfully", "filePath": file_serve_path}), 201
        except Exception as e:
            print(f"Error saving uploaded music file: {e}")
            return jsonify({"error": "Failed to save music file on server"}), 500
    else:
        return jsonify({"error": "File type not allowed. Allowed types: mp3, wav"}), 400

@music_bp.route('/api/generate-music', methods=['POST'])
def generate_music_route():
    if not lyria_client:
        return jsonify({"error": "Music generation service is not available. Check server configuration."}), 503

    data = request.get_json()
    if not data or 'prompt' not in data:
        return jsonify({"error": "Prompt is required in JSON body"}), 400

    prompt_text = data['prompt']
    negative_prompt = data.get('negative_prompt')
    seed_str = data.get('seed')
    seed = None
    if seed_str is not None:
        try:
            seed = int(seed_str)
        except ValueError:
            return jsonify({"error": "Seed must be an integer"}), 400

    new_task = MusicGenerationTask(
        prompt=prompt_text,
        negative_prompt=negative_prompt,
        seed=seed,
        status="pending"
    )
    db.session.add(new_task)
    db.session.commit()
    
    thread = threading.Thread(target=_run_music_generation, args=(current_app._get_current_object(), new_task.id))
    thread.start()
    
    return jsonify({"message": "Music generation started", "task_id": new_task.id}), 202

@music_bp.route('/api/music-task-status/<task_id>', methods=['GET'])
def music_task_status_route(task_id):
    task = MusicGenerationTask.query.get(task_id)
    if not task:
        return jsonify({"error": "Music task not found"}), 404
    return jsonify(task.to_dict()), 200

@music_bp.route('/api/music-tasks', methods=['GET'])
def get_music_tasks_route():
    tasks = MusicGenerationTask.query.order_by(MusicGenerationTask.created_at.desc()).limit(50).all()
    return jsonify([task.to_dict() for task in tasks]), 200

@music_bp.route('/api/music/<filename>')
def serve_music(filename):
    # Ensure filename is safe and does not allow directory traversal
    safe_filename = secure_filename(filename)
    if not safe_filename: # secure_filename returns empty string for invalid names
        return jsonify({"error": "Invalid filename"}), 400
    response = send_from_directory(generated_music_dir, safe_filename)
    response.headers['Cache-Control'] = 'public, max-age=3600'
    return response

@music_bp.route('/api/music-task/<task_id>', methods=['DELETE'])
def delete_music_task_route(task_id):
    task = MusicGenerationTask.query.get(task_id)
    if not task:
        return jsonify({"error": "Music task not found"}), 404

    try:
        if task.local_music_path:
            # local_music_path is stored like "/music/filename.wav"
            music_file_to_delete = os.path.join(generated_music_dir, os.path.basename(task.local_music_path))
            if os.path.exists(music_file_to_delete):
                os.remove(music_file_to_delete)
                print(f"Deleted local music file: {music_file_to_delete}")
            else:
                print(f"Local music file not found for deletion: {music_file_to_delete}")
        
        db.session.delete(task)
        db.session.commit()
        return jsonify({"message": "Music task and associated file deleted successfully"}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting music task {task_id}: {e}")
        return jsonify({"error": f"Failed to delete music task: {str(e)}"}), 500
