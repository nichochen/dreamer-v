# Database Setup and Migration

This document provides instructions on how to configure the database connection for the Dreamer-V application and how to migrate data from a SQLite database to a PostgreSQL database.

## Configuring the Database

The application uses the `DATABASE_URI` environment variable to connect to the database.

### SQLite (Default)

By default, the application is configured to use a SQLite database. The `DATABASE_URI` for SQLite looks like this:

```
DATABASE_URI="sqlite:///backend/data/tasks.db"
```

If the `DATABASE_URI` environment variable is not set, the application will default to this SQLite configuration.

### PostgreSQL

To use a PostgreSQL database, you need to set the `DATABASE_URI` environment variable to a valid PostgreSQL connection string.

The format for a standard PostgreSQL connection string is:

```
DATABASE_URI="postgresql://user:password@host:port/database"
```

**Example:**

```
DATABASE_URI="postgresql://postgres:mysecretpassword@localhost:5432/dreamer-v"
```

### Google Cloud SQL (PostgreSQL)

To connect to a Google Cloud SQL instance using a Unix socket, you need to use a special format for the `DATABASE_URI` and the `pg8000` driver.

The format is:

```
DATABASE_URI="postgresql+pg8000://user:password@/database?unix_sock=/cloudsql/project:region:instance/.s.PGSQL.5432"
```

**Example:**

```
DATABASE_URI="postgresql+pg8000://postgres:mysecretpassword@/dreamer-v?unix_sock=/cloudsql/my-gcp-project:us-central1:my-instance/.s.PGSQL.5432"
```

**Important:** 
*   Make sure the `pg8000` package is included in `backend/requirements.txt`.
*   Before starting the application, you must ensure that the Cloud SQL database has been created. The application's migration script can create tables, but it cannot create the database itself.
*   The Cloud SQL Auth Proxy must be running and configured to provide the Unix socket connection.

## Migrating Data from SQLite to PostgreSQL

If you have been using the default SQLite database and want to switch to PostgreSQL, you can use the provided migration script to copy your existing data.

The migration script `backend/migrate_db.py` has a feature to copy all data from the `video_generation_task` table in a SQLite database to a PostgreSQL database.

### How to Run the Migration

1.  **Ensure the `DATABASE_URI` environment variable is set to your PostgreSQL database.** The script uses this as the destination for the copy.

2.  **Run the following command from the root directory of the project:**

    ```bash
    python3 backend/migrate_db.py --copy-sqlite-to-postgres
    ```

    This command will:
    *   Connect to the default SQLite database at `backend/data/tasks.db`.
    *   Connect to the PostgreSQL database specified in your `DATABASE_URI`.
    *   Copy all tasks from the SQLite database to the PostgreSQL database.

### Forcing the Migration

By default, the migration script will not copy data if the destination PostgreSQL database already contains data. This is a safety measure to prevent accidental data loss.

If you want to overwrite the data in the PostgreSQL database, you can use the `--force` flag:

```bash
python3 backend/migrate_db.py --copy-sqlite-to-postgres --force
```

This command will delete all existing data in the `video_generation_task` table in the PostgreSQL database before copying the data from the SQLite database.
