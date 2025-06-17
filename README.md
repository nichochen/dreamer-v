# Dreamer-V: A Handy Web UI for Veo

Dreamer-V is a user-friendly web interface designed to simplify the use of Google's Veo video generation models. It aims to provide an intuitive experience, especially for non-technical users.

![alt text](images/dreamer-v.png)

## Why Dreamer-V is Built

The concept for Dreamer-V is directly informed by real customer feedback. Veo models offer leading video generation capabilities, and we've collaborated with various groups of users. Through this engagement, we've identified a key difference in Veo users compared to other GCP services: they are artists, game designers, and game producers, not SRE engineers or developers. These non-technical users often find the GCP console overwhelming and require a simplified, user-friendly interface to quickly begin innovating with Veo.

### The Challenge

*   The default Vertex AI UI is not optimized for non-technical users (e.g., art designers, program managers).
*   Many new Veo features are API-only during preview, requiring users to wait for UI updates to access them.

### Our Goals

*   Provide an easy-to-access, intuitive, and feature-rich Veo user interface.
*   Enable users to leverage new Veo capabilities earlier.
*   Create a handy tool for demonstrating Veo's full potential.

## Features

*   **Veo 2 & Veo 3 Support:** Works with the latest Veo models.
*   **First/Last Frame Control:** Specify the starting and ending frames for your video.
*   **Camera Controls:** Adjust camera angles and movements.
*   **Extend Video:** Seamlessly extend existing video clips.
*   **Prompt Refine:** Tools to help you craft the perfect prompt.
*   **Scene Presets:** Quickly apply predefined scene settings.
*   **Intuitive History Browsing:** Easily access and manage your past generations.
*   **Cloud Shell & Cloud Run Ready:** Flexible deployment options.
*   **More are coming!** We are continuously working on new features.

## Running Dreamer-V

This section guides you through deploying and running Dreamer-V. You can choose to run it in Google Cloud Shell for a quick start or deploy it to Cloud Run for a more robust and scalable solution.

### Prerequisites

Before you begin, ensure the following prerequisites are met in your Google Cloud Project:

**1. Enable Required Services:**

Execute the following commands to enable the necessary Google Cloud services:
```bash
gcloud services enable aiplatform.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable iap.googleapis.com
gcloud services enable compute.googleapis.com
gcloud services enable storage.googleapis.com
```

**2. Grant IAM Permissions:**

Grant the required IAM roles to the respective service accounts and users:

*   **Default Compute Service Account (`PROJECT_NUMBER-compute@developer.gserviceaccount.com`):**
    *   `roles/storage.objectAdmin` (Storage Object Admin)
    *   `roles/aiplatform.user` (Vertex AI User)

*   **Vertex AI Service Agent (`service-PROJECT_NUMBER@gcp-sa-aiplatform.iam.gserviceaccount.com`):**
    *   `roles/storage.objectAdmin` (Storage Object Admin)

*   **Users accessing the application:**
    *   `roles/iap.httpsResourceAccessor` (IAP-secured Web App User)
    *   `roles/run.invoker` (Cloud Run Invoker) - *Needed if IAP is not used or for service-to-service invocation.*

Replace `PROJECT_NUMBER` with your actual Google Cloud project number.

### Option 1: Running in Cloud Shell

Get started with Dreamer-V instantly using Cloud Shell! This is ideal for quick testing and development.

**Setup Steps:**

1.  Navigate to your Google Cloud Project (Veo 3/Veo 2 exp access highly recommended!).
2.  Open Cloud Shell.
3.  Run the following commands:
    ```bash
    GCP_PROJECT_ID=veo-testing
    gcloud config set project ${GCP_PROJECT_ID}
    BUCKET=gs://dreamer-v-${GCP_PROJECT_ID}-${USER}-data
    gsutil mb ${BUCKET}
    mkdir -p dreamer-v-data
    docker run -d --name dreamer-v-app \
        -p 8080:80 \
        -e GCP_PROJECT_ID=${GCP_PROJECT_ID}\
        -e GCP_REGION=us-central1 \
        -e VIDEO_GCS_BUCKET=${BUCKET} \
        -v ~/dreamer-v-data:/app/backend/data \
        --rm \
        nicosoft/dreamer-v:latest
    ```

### Option 2: Deploying to Cloud Run

For a more permanent and scalable setup, deploy Dreamer-V to Cloud Run. This method uses Terraform for infrastructure provisioning.

**Deployment Steps:**

1. Clone the git repository:
   ```bash
   git clone https://github.com/nichochen/dreamer-v
   ```
2. Navigate to the deployment directory:
   ```bash
   cd dreamer-v/deployment/
   ```
3. Edit `terraform.tfvars` to update variables.
4. Initialize Terraform:
   ```bash
   terraform init
   ```
5. Plan the Terraform deployment:
   ```bash
   terraform plan
   ```
6. Apply the Terraform configuration:
   ```bash
   terraform apply
   ```
7. Update Cloud Run service security setting:
    * Disable IAM check. Use IAP for authentication.

**Important:** Make sure to enforce access control when deploying on Cloud Run, for example, by using IAP.

## Feedback and Suggestions

Share your thoughts and suggestions.
