# Stage 1: Build Frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm install --legacy-peer-deps

COPY frontend/ ./
RUN npm run build

# Stage 2: Setup Backend and Nginx
FROM python:3.9-slim

WORKDIR /app

# Install Nginx
RUN apt-get update && apt-get install -y nginx curl libgl1-mesa-glx ffmpeg libsm6 libxext6 sqlite3 && apt-get clean

# Copy backend files
COPY backend/ /app/backend/
WORKDIR /app/backend
RUN pip install --no-cache-dir -r requirements.txt

# Copy frontend build from builder stage
COPY --from=frontend-builder /app/frontend/build /app/frontend_build

# Copy Nginx configuration
COPY deployment/nginx.conf /etc/nginx/nginx.conf

# Expose port 80 for Nginx
EXPOSE 80

# Create a script to start both services
COPY deployment/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Set environment variables that might be needed by the backend
# These should ideally be passed during `docker run` but can have defaults
ENV GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
ENV GOOGLE_CLOUD_REGION="us-central1"
ENV VIDEO_OUTPUT_GCS_BUCKET="gs://your-gcs-bucket"
# Add any other necessary environment variables for your backend

# Ensure backend directories exist (though app.py creates them, good practice in Dockerfile too)
RUN mkdir -p /app/backend/data /app/backend/data/videos /app/backend/data/thumbnails /app/backend/data/uploads

# The Flask app in app.py uses relative paths for SQLite DB and media files.
# These will be created inside the /app/backend/data/ directory in the container.
# If you want to persist this data, you should mount volumes for these directories:
# - /app/backend/data (contains tasks.db and subdirectories for videos, thumbnails, uploads)
# For more granular control, or if host structure differs, you might mount:
# - /app/backend/data/videos
# - /app/backend/data/thumbnails
# - /app/backend/data/uploads

CMD ["/app/start.sh"]
