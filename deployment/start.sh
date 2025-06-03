#!/bin/bash

# Define the database path
DB_PATH="/app/backend/data/tasks.db"
DB_DIR=$(dirname "$DB_PATH")

# Check if the database directory exists, create if not
if [ ! -d "$DB_DIR" ]; then
  echo "Database directory not found. Creating $DB_DIR..."
  mkdir -p "$DB_DIR"
fi

# Check if the database file exists, create if not
if [ ! -f "$DB_PATH" ]; then
  echo "Database file not found. Creating $DB_PATH..."
  sqlite3 "$DB_PATH" ".databases"
  echo "Database file created. Initializing schema..."
  python /app/backend/migrate_db.py
else
  # Even if the DB file exists, it's good practice to ensure migrations are up to date.
  # Depending on how migrate_db.py is written, it might handle this.
  # For now, we'll assume it's safe to run or it handles existing schemas gracefully.
  echo "Database file found. Ensuring schema is up to date..."
  python /app/backend/migrate_db.py
fi

# Start the Flask backend in the background
echo "Starting Flask backend..."
cd /app/backend
# The app.py already runs on 0.0.0.0 and port 5001.
# We'll send its output to stdout/stderr for Docker logs.
# python app.py & # Replaced with gunicorn
gunicorn -w 3 -b 0.0.0.0:5001 app:app &

# Wait a few seconds for the backend to initialize (optional, but can be helpful)
sleep 5 

# Start Nginx in the foreground
echo "Starting Nginx..."
nginx -g "daemon off;"
