import sys
import os
import argparse

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import create_engine, inspect, text, Table, MetaData
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
from backend.config import DATABASE_URI, data_dir
from backend.models import VideoGenerationTask

# --- Database Agnostic Migration Script ---

def column_exists(engine, table_name, column_name):
    """Checks if a column exists in a table in a database-agnostic way."""
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns

def initialize_schema(engine):
    """Creates tables based on the model definitions if they don't exist."""
    print("Executing initial schema setup (CREATE TABLE IF NOT EXISTS)...")
    try:
        # Use the model's metadata to create the table, which is db-agnostic
        VideoGenerationTask.metadata.create_all(engine, checkfirst=True)
        print("'video_generation_task' table schema check/creation complete.")
    except SQLAlchemyError as e:
        print(f"Error during initial schema setup: {e}")

def migrate_schema_add_column(engine, table_name, column_name, column_type):
    """Adds a column to a table if it doesn't exist."""
    if not column_exists(engine, table_name, column_name):
        print(f"Adding '{column_name}' column to '{table_name}' table...")
        try:
            with engine.connect() as connection:
                # Use text() for cross-compatibility of the SQL statement
                connection.execute(text(f'ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}'))
                connection.commit()
            print(f"'{column_name}' column added successfully.")
        except SQLAlchemyError as e:
            print(f"Error adding '{column_name}' column: {e}")
    else:
        print(f"'{column_name}' column already exists in '{table_name}'.")

def migrate_data_backfill_user_column(engine):
    """Backfills the 'user' column with 'public@dreamer-v' for existing tasks where user is NULL."""
    print("Backfilling 'user' column for existing tasks with 'public@dreamer-v'...")
    try:
        with engine.connect() as connection:
            # Use text() for cross-compatibility
            result = connection.execute(text("UPDATE video_generation_task SET \"user\" = 'public@dreamer-v' WHERE \"user\" IS NULL"))
            connection.commit()
            print(f"Successfully backfilled 'user' column for {result.rowcount} tasks.")
    except SQLAlchemyError as e:
        # Note: Using "user" in quotes for PostgreSQL compatibility, as USER is a reserved keyword.
        print(f"Error backfilling 'user' column: {e}")

def copy_sqlite_to_postgres(sqlite_uri, postgres_uri, force=False):
    """Copies data from a SQLite database to a PostgreSQL database."""
    print(f"Starting data copy from SQLite ({sqlite_uri}) to PostgreSQL ({postgres_uri})...")
    
    # Create engines for both databases
    sqlite_engine = create_engine(sqlite_uri)
    postgres_engine = create_engine(postgres_uri)
    
    # Create sessions
    SessionSqlite = sessionmaker(bind=sqlite_engine)
    SessionPostgres = sessionmaker(bind=postgres_engine)
    sqlite_session = SessionSqlite()
    postgres_session = SessionPostgres()
    
    try:
        # Check if the destination table is empty
        if postgres_session.query(VideoGenerationTask).count() > 0:
            if not force:
                print("PostgreSQL database is not empty. Use --force to overwrite. Aborting copy.")
                return
            else:
                print("PostgreSQL database is not empty. --force is used, deleting existing data...")
                postgres_session.query(VideoGenerationTask).delete()
                postgres_session.commit()
                print("Existing data deleted.")

        # Fetch all data from the source table
        print("Fetching all tasks from SQLite database...")
        tasks = sqlite_session.query(VideoGenerationTask).all()
        print(f"Found {len(tasks)} tasks to copy.")

        # Insert data into the destination table
        print("Inserting tasks into PostgreSQL database...")
        for old_task in tasks:
            new_task = VideoGenerationTask(
                id=old_task.id,
                prompt=old_task.prompt,
                model=old_task.model,
                aspect_ratio=old_task.aspect_ratio,
                camera_control=old_task.camera_control,
                duration_seconds=old_task.duration_seconds,
                gcs_output_bucket=old_task.gcs_output_bucket,
                status=old_task.status,
                video_gcs_uri=old_task.video_gcs_uri,
                local_video_path=old_task.local_video_path,
                local_thumbnail_path=old_task.local_thumbnail_path,
                image_filename=old_task.image_filename,
                image_gcs_uri=old_task.image_gcs_uri,
                last_frame_filename=old_task.last_frame_filename,
                last_frame_gcs_uri=old_task.last_frame_gcs_uri,
                video_uri=old_task.video_uri,
                error_message=old_task.error_message,
                user=old_task.user,
                generate_audio=old_task.generate_audio,
                created_at=old_task.created_at,
                updated_at=old_task.updated_at,
                music_file_path=old_task.music_file_path,
                resolution=old_task.resolution
            )
            postgres_session.add(new_task)
        
        postgres_session.commit()
        print("Data copy successful!")

    except SQLAlchemyError as e:
        print(f"An error occurred during data copy: {e}")
        postgres_session.rollback()
    finally:
        sqlite_session.close()
        postgres_session.close()

def setup_database():
    """Sets up the database by creating tables and running migrations."""
    print(f"Connecting to database using URI: {DATABASE_URI}")
    engine = None
    try:
        # Ensure data directory exists for SQLite
        if "sqlite" in DATABASE_URI and not os.path.exists(data_dir):
            os.makedirs(data_dir)
            print(f"Created data directory at {data_dir} as it was missing.")

        engine = create_engine(DATABASE_URI)

        # Initialize schema (creates table if it doesn't exist)
        initialize_schema(engine)

        # Run migrations for each required column
        # Note: For PostgreSQL, BOOLEAN is a native type. For SQLite, it's often INTEGER.
        # SQLAlchemy handles this abstraction well, but for raw SQL, we need to be careful.
        # Using VARCHAR for user as it's defined in the model.
        migrate_schema_add_column(engine, 'video_generation_task', 'user', 'VARCHAR(255)')
        migrate_schema_add_column(engine, 'video_generation_task', 'music_file_path', 'VARCHAR(1024)')
        migrate_schema_add_column(engine, 'video_generation_task', 'resolution', 'VARCHAR(10)')
        
        # For boolean, the type can be tricky. BOOLEAN is standard SQL.
        # SQLite will use INTEGER 0/1, PostgreSQL will use true/false.
        # The model uses db.Boolean, so SQLAlchemy handles the abstraction.
        # When adding manually, 'BOOLEAN' should be acceptable for both via SQLAlchemy's engine.
        migrate_schema_add_column(engine, 'video_generation_task', 'generate_audio', 'BOOLEAN')

        # Backfill data
        migrate_data_backfill_user_column(engine)

        print("Database setup and migration successful!")

    except SQLAlchemyError as e:
        print(f"An error occurred during database setup: {e}")
        print("Database setup failed.")
    finally:
        if engine:
            engine.dispose()
        print("Database connection closed.")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Database migration and setup script.")
    parser.add_argument(
        '--copy-sqlite-to-postgres',
        action='store_true',
        help="Copy data from the default SQLite DB to the configured PostgreSQL DB."
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help="Force the copy operation even if the destination database is not empty."
    )
    
    args = parser.parse_args()

    if args.copy_sqlite_to_postgres:
        # Default source is the local tasks.db
        default_sqlite_path = os.path.join(data_dir, 'tasks.db')
        sqlite_uri = f'sqlite:///{default_sqlite_path}'
        
        # Destination is the configured DATABASE_URI
        postgres_uri = DATABASE_URI

        if 'postgres' not in postgres_uri:
            print("Error: The configured DATABASE_URI is not a PostgreSQL database.")
        elif not os.path.exists(default_sqlite_path):
            print(f"Error: Default SQLite database not found at {default_sqlite_path}")
        else:
            copy_sqlite_to_postgres(sqlite_uri, postgres_uri, force=args.force)
    else:
        print("Starting database setup process...")
        setup_database()
