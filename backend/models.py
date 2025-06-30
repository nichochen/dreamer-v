import time
import uuid
import os
from database import db
from config import DEFAULT_VIDEO_MODEL

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
    user = db.Column(db.String(255), nullable=True) # New field for user email
    created_at = db.Column(db.Float, default=time.time)
    updated_at = db.Column(db.Float, default=time.time, onupdate=time.time)
    music_file_path = db.Column(db.String(1024), nullable=True, default=None) # Path to music file for composite video

    def __repr__(self):
        attributes = []
        for attr, value in self.__dict__.items():
            if not attr.startswith('_sa_'): # Exclude SQLAlchemy internal attributes
                if attr == 'prompt' and value is not None:
                    attributes.append(f"{attr}='{str(value)[:30]}...'")
                else:
                    attributes.append(f"{attr}='{value}'")
        return f"<VideoGenerationTask({', '.join(attributes)})>"

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
            "gcs_output_bucket": self.gcs_output_bucket,
            "user": self.user,
            "music_file_path": getattr(self, 'music_file_path', None) # Safely access music_file_path
        }

# --- SQLAlchemy Model for MusicGenerationTask ---
class MusicGenerationTask(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    prompt = db.Column(db.String(1024), nullable=False)
    negative_prompt = db.Column(db.String(1024), nullable=True)
    seed = db.Column(db.Integer, nullable=True)
    status = db.Column(db.String(50), default="pending")  # pending, processing, completed, failed
    local_music_path = db.Column(db.String(1024), nullable=True) # Path to locally saved music file
    error_message = db.Column(db.String(1024), nullable=True)
    created_at = db.Column(db.Float, default=time.time)
    updated_at = db.Column(db.Float, default=time.time, onupdate=time.time)

    def __repr__(self):
        return (f"<MusicGenerationTask(id='{self.id}', prompt='{self.prompt[:30]}...', "
                f"status='{self.status}')>")

    def to_dict(self):
        # Ensure local_music_path is not None before trying to create a URL
        music_url = None
        if self.local_music_path:
            # local_music_path is stored like "/music/filename.wav"
            # os.path.basename would correctly extract "filename.wav"
            music_url = f"/api/music/{os.path.basename(self.local_music_path)}"
        
        return {
            "task_id": self.id,
            "prompt": self.prompt,
            "negative_prompt": self.negative_prompt,
            "seed": self.seed,
            "status": self.status,
            "local_music_path": self.local_music_path, # Relative path like /music/filename.wav
            "music_url_http": music_url,
            "error_message": self.error_message,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
