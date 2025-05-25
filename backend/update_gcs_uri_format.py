import sqlite3
import os

# --- Configuration ---
backend_dir = os.path.abspath(os.path.dirname(__file__))
data_dir = os.path.join(backend_dir, 'data')
db_path = os.path.join(data_dir, 'tasks.db')

# SQL command to update the video_gcs_uri format
SQL_UPDATE_COMMAND = """
UPDATE video_generation_task
SET video_gcs_uri = REPLACE(video_gcs_uri, 'https://storage.cloud.google.com/', 'gs://')
WHERE video_gcs_uri LIKE 'https://storage.cloud.google.com/%';
"""

def update_uri_format_in_db():
    if not os.path.exists(db_path):
        print(f"Database file not found at {db_path}. Nothing to update.")
        return

    conn = None
    try:
        print(f"Connecting to database at {db_path}...")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("Executing SQL to update video_gcs_uri format...")
        cursor.execute(SQL_UPDATE_COMMAND)
        updated_rows = cursor.rowcount
        conn.commit()
        
        print(f"Database update successful! {updated_rows} row(s) were updated.")
        print("Any 'video_gcs_uri' fields that started with 'https://storage.cloud.google.com/' have been converted to 'gs://'.")
        
    except sqlite3.Error as e:
        print(f"An error occurred during database update: {e}")
        if conn:
            conn.rollback()
        print("Database update failed. Database has been rolled back to its previous state (if possible).")
    finally:
        if conn:
            conn.close()
        print("Database connection closed.")

if __name__ == '__main__':
    print("Starting database URI format update process...")
    if not os.path.exists(data_dir):
        os.makedirs(data_dir) # Should not happen if db_path exists, but good practice
        print(f"Created data directory at {data_dir} as it was missing.")
        
    update_uri_format_in_db()
