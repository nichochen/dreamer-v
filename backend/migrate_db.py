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
    video_uri VARCHAR(1024),
    user VARCHAR(255)); -- Added user column
"""

def initialize_schema(cursor):
    """Creates the table with the full schema if it doesn't exist."""
    # Note: The CREATE_TABLE_SQL should ideally use "IF NOT EXISTS" for the table itself,
    # but executescript might handle this. For safety, let's assume it's fine or
    # the app's db.create_all() handles the initial creation more robustly.
    # This script is more for ensuring the schema matches or migrating it.
    # However, the original script uses executescript for CREATE_TABLE.
    # A more robust way for initial creation is "CREATE TABLE IF NOT EXISTS ..."
    # Let's modify CREATE_TABLE_SQL to include "IF NOT EXISTS" for the table.
    # The original script's CREATE_TABLE_SQL doesn't have "IF NOT EXISTS" for the table.
    # Let's adjust the CREATE_TABLE_SQL to be safer.
    # Re-evaluating: The original script's CREATE_TABLE_SQL is executed via executescript.
    # It's better to keep its core logic and add migrations.
    # The current CREATE_TABLE_SQL will fail if the table exists and schema differs.
    # This script seems more like a "ensure this exact schema" rather than "create if not exists".
    # For this task, I will focus on adding the migration steps for the 'user' column.
    # The original initialize_schema will be kept as is, and migration functions will be added.

    print("Executing initial schema setup (CREATE TABLE)...")
    # This will create the table if it doesn't exist, but might error if it exists with a different schema.
    # This is a limitation of the original script's approach.
    # For the purpose of this task, we assume this part is for initial setup or that db.create_all() handles it.
    # We will add specific migration logic for the 'user' column.
    try:
        cursor.executescript(CREATE_TABLE_SQL.replace("CREATE TABLE video_generation_task", "CREATE TABLE IF NOT EXISTS video_generation_task"))
        print("'video_generation_task' table schema execution complete (using IF NOT EXISTS).")
    except sqlite3.Error as e:
        print(f"Note: Error during initial schema execution (this might be okay if table already exists and migrations will handle it): {e}")


def migrate_schema_add_user_column(cursor):
    """Adds the 'user' column to 'video_generation_task' if it doesn't exist."""
    print("Checking for 'user' column in 'video_generation_task' table...")
    cursor.execute("PRAGMA table_info(video_generation_task);")
    columns = [info[1] for info in cursor.fetchall()]
    
    if 'user' not in columns:
        print("Adding 'user' column to 'video_generation_task' table...")
        try:
            cursor.execute("ALTER TABLE video_generation_task ADD COLUMN user VARCHAR(255);")
            print("'user' column added successfully.")
        except sqlite3.Error as e:
            print(f"Error adding 'user' column: {e}. This might happen if it was added concurrently or by another process.")
    else:
        print("'user' column already exists.")

def migrate_data_backfill_user_column(cursor):
    """Backfills the 'user' column with 'public@dreamer-v' for existing tasks where user is NULL."""
    print("Backfilling 'user' column for existing tasks with 'public@dreamer-v'...")
    try:
        cursor.execute("UPDATE video_generation_task SET user = 'public@dreamer-v' WHERE user IS NULL;")
        updated_rows = cursor.rowcount
        print(f"Successfully backfilled 'user' column for {updated_rows} tasks.")
    except sqlite3.Error as e:
        print(f"Error backfilling 'user' column: {e}")

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
            
        initialize_schema(cursor) # Ensures table structure based on CREATE_TABLE_SQL (now with user)
        migrate_schema_add_user_column(cursor) # Adds user column if missing from an older schema
        migrate_data_backfill_user_column(cursor) # Backfills user data
        
        conn.commit()
        print("Database setup and migration successful!")

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
