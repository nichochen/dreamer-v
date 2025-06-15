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
  provider = google-beta
  name     = local.cloud_run_service_name
  location = var.region
  project  = var.project_id
  launch_stage = "BETA"
  iap_enabled = true
  #invoker_iam_disabled = true
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
      volume_mounts {
        name       = "gcs-data-volume"
        mount_path = "/app/backend/data"
      }
    }

    volumes {
      name = "gcs-data-volume"
      gcs {
        bucket    = google_storage_bucket.dreamer_v_data.name
        read_only = false
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
