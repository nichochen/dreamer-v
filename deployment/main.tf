provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {
  description = "The GCP project ID."
  type        = string
}

variable "user_id" {
  description = "The user ID for resource naming."
  type        = string
}

variable "region" {
  description = "The GCP region for resources."
  type        = string
}

variable "gcs_bucket_name_suffix" {
  description = "Suffix for the GCS bucket name."
  type        = string
  default     = "data"
}

variable "cloud_run_service_name_prefix" {
  description = "Prefix for the Cloud Run service name."
  type        = string
  default     = "dreamer-v"
}

variable "admin_email" {
  description = "Admin email for application configuration."
  type        = string
}

variable "container_image" {
  description = "The container image to deploy for the Cloud Run service."
  type        = string
}

variable "db_password" {
  description = "The password for the Cloud SQL database user."
  type        = string
  sensitive   = true
}

variable "db_name" {
  description = "The name of the database."
  type        = string
  default     = "dreamer-v"
}

locals {
  gcs_bucket_name        = "${var.cloud_run_service_name_prefix}-${var.gcs_bucket_name_suffix}-${var.project_id}-${var.user_id}"
  cloud_run_service_name = "${var.cloud_run_service_name_prefix}-${var.project_id}-${var.user_id}"
}

resource "google_storage_bucket" "dreamer_v_data" {
  name                        = local.gcs_bucket_name
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy               = true

  lifecycle {
    prevent_destroy = false
  }
}

resource "google_cloud_run_v2_service" "dreamer_v_service" {
  depends_on = [google_project_service.cloudrun, google_project_service.iap, google_project_service.sqladmin]
  provider = google-beta
  name     = local.cloud_run_service_name
  location = var.region
  project  = var.project_id
  launch_stage = "BETA"
  iap_enabled = true
  invoker_iam_disabled = true
  deletion_protection=false
  lifecycle {
    prevent_destroy = false
  }
  template {
    containers {
      image = var.container_image
      ports {
        container_port = 80
      }
      resources {
        limits = {
          cpu    = "4"
          memory = "8Gi"
        }
      }
      env {
        name  = "GCP_REGION"
        value = var.region
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "VIDEO_GCS_BUCKET"
        value = "gs://${local.gcs_bucket_name}"
      }
      env {
        name  = "ADMIN_EMAIL"
        value = var.admin_email
      }
      env {
        name  = "DATABASE_URI"
        value = "postgresql+pg8000://postgres:${var.db_password}@/${var.db_name}?unix_sock=/cloudsql/${module.postgresql-db.instance_connection_name}/.s.PGSQL.5432"
      }
      volume_mounts {
        name       = "gcs-data-volume"
        mount_path = "/app/backend/data"
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }

    volumes {
      name = "gcs-data-volume"
      gcs {
        bucket    = google_storage_bucket.dreamer_v_data.name
        read_only = false
      }
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [module.postgresql-db.instance_connection_name]
      }
    }

    scaling {
      max_instance_count = 1
    }
  }

  ingress = "INGRESS_TRAFFIC_ALL"

  # IAP is enabled directly on this service.
  # You will still need to:
  # 1. Configure an OAuth consent screen for the project.
  # 2. Grant users/groups the "IAP-secured Web App User" (roles/iap.httpsResourceAccessor)
  #    role on this Cloud Run service via IAM policies for them to access the service.
  # Example IAM binding for the admin user:
  # resource "google_cloud_run_service_iam_member" "iap_admin_user" {
  #   provider = google-beta
  #   location = var.region
  #   project  = var.project_id
  #   service  = google_cloud_run_v2_service.dreamer_v_service.name
  #   role     = "roles/iap.httpsResourceAccessor"
  #   member   = "user:${var.admin_email}"
  # }
}

data "google_project" "project" {}

resource "google_project_iam_member" "sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

resource "google_project_iam_member" "vertex_ai_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

resource "google_project_iam_member" "vertex_ai_storage_object_user" {
  project = var.project_id
  role    = "roles/storage.objectUser"
  member  = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-aiplatform.iam.gserviceaccount.com"
}

resource "google_project_iam_member" "compute_storage_object_admin" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

resource "google_cloud_run_v2_service_iam_member" "iap_invoker" {
  provider = google-beta
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.dreamer_v_service.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-iap.iam.gserviceaccount.com"
}

output "gcs_bucket_name" {
  description = "Name of the GCS bucket created."
  value       = google_storage_bucket.dreamer_v_data.name
}

output "cloud_run_service_name" {
  description = "Name of the Cloud Run service created."
  value       = google_cloud_run_v2_service.dreamer_v_service.name
}

output "cloud_run_service_url" {
  description = "URL of the deployed Cloud Run service."
  value       = google_cloud_run_v2_service.dreamer_v_service.uri
}

resource "google_project_service" "cloudresourcemanager" {
  service = "cloudresourcemanager.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudrun" {
  depends_on = [google_project_service.cloudresourcemanager]
  service = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "iap" {
  depends_on = [google_project_service.cloudresourcemanager]
  service = "iap.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "sqladmin" {
  depends_on = [google_project_service.cloudresourcemanager]
  service = "sqladmin.googleapis.com"
  disable_on_destroy = false
}

module "postgresql-db" {
  source  = "terraform-google-modules/sql-db/google//modules/postgresql"
  version = "~> 26.0"

  name                 = var.db_name
  random_instance_name = true
  database_version     = "POSTGRES_17"
  project_id           = var.project_id
  zone                 = "${var.region}-a"
  region               = var.region
  edition              = "ENTERPRISE"
  tier                 = "db-f1-micro"
  data_cache_enabled   = true

  deletion_protection = false

  ip_configuration = {
    ipv4_enabled        = true
    private_network     = null
    ssl_mode            = "ALLOW_UNENCRYPTED_AND_ENCRYPTED"
    allocated_ip_range  = null
  }
}

resource "google_sql_database" "database" {
  name     = var.db_name
  instance = module.postgresql-db.instance_name
  project  = var.project_id
}

resource "google_sql_user" "db_user" {
  name     = "postgres"
  instance = module.postgresql-db.instance_name
  password = var.db_password
  project  = var.project_id
}

output "cloud_sql_instance_name" {
  description = "Name of the Cloud SQL instance created."
  value       = module.postgresql-db.instance_name
}
