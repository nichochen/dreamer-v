import sqlite3
import os

# --- Configuration ---
backend_dir = os.path.abspath(os.path.dirname(__file__))
data_dir = os.path.join(backend_dir, 'data')
db_path = os.path.join(data_dir, 'tasks.db')

# SQL command to create the table if it doesn't exist
# This schema includes the 'video_uri' column directly.
CREATE_TABLE_SQL = """
 CREATE TABLE video_generation_task (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    prompt VARCHAR(1024) NOT NULL,
    model VARCHAR(100),
    aspect_ratio VARCHAR(10),
    camera_control VARCHAR(50),
    duration_seconds INTEGER,
    gcs_output_bucket VARCHAR(1024),
    status VARCHAR(50),
    video_gcs_uri VARCHAR(1024), -- This is the renamed column
    local_video_path VARCHAR(1024),
    local_thumbnail_path VARCHAR(1024),
    image_filename VARCHAR(255),
    image_gcs_uri VARCHAR(1024),
    last_frame_filename VARCHAR(255),
    last_frame_gcs_uri VARCHAR(1024),
    error_message VARCHAR(1024),
    created_at FLOAT,
    updated_at FLOAT,
    video_uri VARCHAR(1024));
"""

def initialize_schema(cursor):
    """Creates the table with the full schema if it doesn't exist."""
    print("Ensuring 'video_generation_task' table exists with the specified schema...")
    cursor.executescript(CREATE_TABLE_SQL)
    print("'video_generation_task' table creation/check complete.")


def setup_database():
    conn = None
    try:
        # Ensure data directory exists
        if not os.path.exists(data_dir):
            os.makedirs(data_dir)
            print(f"Created data directory at {data_dir} as it was missing.")

        # db_exists = os.path.exists(db_path) # This variable is not strictly needed anymore
        print(f"Connecting to database at {db_path}...")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # The initialize_schema function now handles "CREATE TABLE IF NOT EXISTS"
        # so it's safe to call whether the DB is new or existing.
        # If the DB is new, the table will be created.
        # If the DB exists, the table will be created only if it's missing.
        # If the DB and table exist, no changes will be made to the table.
        if not os.path.exists(db_path): # Check if DB file is actually new for logging
             print(f"Database file not found at {db_path}. Creating new database with schema.")
        else:
            print("Database file found. Ensuring 'video_generation_task' table exists.")
            
        initialize_schema(cursor)
        
        conn.commit()
        print("Database setup successful!")

    except sqlite3.Error as e:
        print(f"An error occurred during database setup: {e}")
        if conn:
            conn.rollback()
        print("Database setup failed.")
    finally:
        if conn:
            conn.close()
        print("Database connection closed.")

if __name__ == '__main__':
    print("Starting database setup process...")
    setup_database()
