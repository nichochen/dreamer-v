#!/bin/bash

# Check for required environment variables
if [ -z "$GCP_PROJECT_ID" ]; then
  echo "Error: GCP_PROJECT_ID environment variable is not set."
  exit 1
fi
echo "GCP_PROJECT_ID: $GCP_PROJECT_ID"

if [ -z "$GCP_REGION" ]; then
  echo "Error: GCP_REGION environment variable is not set."
  exit 1
fi
echo "GCP_REGION: $GCP_REGION"

if [ -z "$VIDEO_GCS_BUCKET" ]; then
  echo "Error: VIDEO_GCS_BUCKET environment variable is not set."
  exit 1
fi
echo "VIDEO_GCS_BUCKET: $VIDEO_GCS_BUCKET"

# --- Database Migration ---
# This script now supports both SQLite and PostgreSQL.
# It will create the tables if they don't exist and apply any necessary migrations.
echo "Running database migrations..."
python /app/backend/migrate_db.py
echo "Database migration check complete."

# Start the Flask backend in the background
echo "Starting Flask backend..."
cd /app/backend
# The app.py already runs on 0.0.0.0 and port 5001.
# We'll send its output to stdout/stderr for Docker logs.
# python app.py & # Replaced with gunicorn
gunicorn -w 3 -b 0.0.0.0:5001 --access-logfile=- app:app &

# Wait a few seconds for the backend to initialize (optional, but can be helpful)
sleep 5 

# Start Nginx in the foreground
echo "Starting Nginx..."
nginx -g "daemon off;"
