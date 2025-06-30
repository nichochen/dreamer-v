import os
import time
from flask import Blueprint, request, jsonify
from database import db
from models import VideoGenerationTask
from config import ADMIN_EMAIL, videos_dir, thumbnails_dir, uploads_dir
from utils import get_processed_user_email_from_header

task_management_bp = Blueprint('task_management_bp', __name__)

@task_management_bp.route('/api/task-status/<task_id>', methods=['GET', 'POST'])
def task_status_route(task_id):
    task = VideoGenerationTask.query.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if request.method == 'POST':
        data = request.get_json()
        if 'status' in data:
            task.status = data['status']
        if 'error_message' in data:
            task.error_message = data['error_message']
        task.updated_at = time.time()
        db.session.commit()
        return jsonify({"message": "Task status updated successfully"}), 200

    return jsonify(task.to_dict()), 200

@task_management_bp.route('/api/tasks', methods=['GET'])
def get_tasks_route():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 100, type=int)
    current_user_email = get_processed_user_email_from_header()

    if current_user_email == ADMIN_EMAIL:
        print(f"Admin user {ADMIN_EMAIL} requesting all tasks.")
        query = VideoGenerationTask.query.order_by(VideoGenerationTask.created_at.desc())
    else:
        print(f"User {current_user_email} requesting their tasks.")
        query = VideoGenerationTask.query.filter_by(user=current_user_email).order_by(VideoGenerationTask.created_at.desc())
    
    paginated_tasks = query.paginate(page=page, per_page=per_page, error_out=False)
    tasks = paginated_tasks.items
    total_pages = paginated_tasks.pages

    return jsonify({
        "tasks": [task.to_dict() for task in tasks],
        "total_pages": total_pages,
        "current_page": page
    }), 200

@task_management_bp.route('/api/task/<task_id>', methods=['DELETE'])
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
