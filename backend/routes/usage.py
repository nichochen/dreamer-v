from flask import Blueprint, jsonify, Response
from sqlalchemy import func
import io
import csv
import datetime
from database import db
from models import VideoGenerationTask
from utils import get_processed_user_email_from_header
from config import ADMIN_EMAIL

usage_bp = Blueprint('usage_bp', __name__)

@usage_bp.route('/api/usage', methods=['GET'])
def get_usage_data():
    current_user_email = get_processed_user_email_from_header()
    is_admin = current_user_email == ADMIN_EMAIL

    query_base = VideoGenerationTask.query
    if not is_admin:
        query_base = query_base.filter(VideoGenerationTask.user == current_user_email)

    total_videos = query_base.count()
    total_seconds = query_base.with_entities(func.sum(VideoGenerationTask.duration_seconds)).scalar()

    videos_by_model = query_base.with_entities(
        VideoGenerationTask.model,
        func.count(VideoGenerationTask.id)
    ).group_by(VideoGenerationTask.model).all()

    videos_by_length = query_base.with_entities(
        VideoGenerationTask.duration_seconds,
        func.count(VideoGenerationTask.id)
    ).group_by(VideoGenerationTask.duration_seconds).all()

    response = {
        "total_videos": total_videos or 0,
        "total_seconds": total_seconds or 0,
        "videos_by_model": [{"model": model, "count": count} for model, count in videos_by_model],
        "videos_by_length": [{"length": length, "count": count} for length, count in videos_by_length],
        "is_admin": is_admin
    }

    if is_admin:
        videos_by_user = db.session.query(
            VideoGenerationTask.user,
            func.count(VideoGenerationTask.id)
        ).group_by(VideoGenerationTask.user).all()
        response["videos_by_user"] = [{"user": user, "count": count} for user, count in videos_by_user]

    return jsonify(response)

@usage_bp.route('/api/usage/download', methods=['GET'])
def download_usage_data():
    current_user_email = get_processed_user_email_from_header()
    is_admin = current_user_email == ADMIN_EMAIL

    query_base = VideoGenerationTask.query
    if not is_admin:
        query_base = query_base.filter(VideoGenerationTask.user == current_user_email)

    tasks = query_base.all()

    output = io.StringIO()
    writer = csv.writer(output)

    # Write header
    header = [
        'id', 'user', 'model', 'prompt', 'duration_seconds', 'status',
        'video_gcs_uri', 'created_at', 'updated_at'
    ]
    writer.writerow(header)

    # Write data
    for task in tasks:
        writer.writerow([
            task.id, task.user, task.model, task.prompt, task.duration_seconds,
            task.status, task.video_gcs_uri, task.created_at, task.updated_at
        ])

    output.seek(0)

    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d_%H%M%S')
    filename = f"dreamer_v_usage_data_{timestamp}.csv"

    return Response(
        output,
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename={filename}"}
    )
