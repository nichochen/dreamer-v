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

Before you begin, you need to set up your Google Cloud Project. You can do this by running the `init_project_setup.sh` script, which will enable the required services and grant the necessary IAM permissions.

```bash
./init_project_setup.sh <YOUR_PROJECT_ID>
```
<details>
<summary>1. Enable Required Services</summary>

Execute the following commands to enable the necessary Google Cloud services. Alternatively, you can run the `init_project_setup.sh` script which will also perform this step.
```bash
gcloud services enable aiplatform.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable iap.googleapis.com
gcloud services enable compute.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable cloudresourcemanager.googleapis.com
```
</details>

<details>
<summary>2. Grant IAM Permissions</summary>

Grant the required IAM roles to the respective service accounts and users. You can use the `init_project_setup.sh` script to automate this process.

*   **Default Compute Service Account (`PROJECT_NUMBER-compute@developer.gserviceaccount.com`):**
    *   `roles/cloudsql.client` (Cloud SQL Client)
    *   `roles/aiplatform.user` (Vertex AI User)
    *   `roles/storage.objectAdmin` (Storage Object Admin)

*   **Vertex AI Service Agent (`service-PROJECT_NUMBER@gcp-sa-aiplatform.iam.gserviceaccount.com`):**
    *   `roles/storage.objectUser` (Storage Object User)

*   **IAP Service Agent (`service-PROJECT_NUMBER@gcp-sa-iap.iam.gserviceaccount.com`):**
    *   `roles/run.invoker` (Cloud Run Invoker)

*   **Users accessing the application:**
    *   `roles/iap.httpsResourceAccessor` (IAP-secured Web App User)
</details>

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

7. Grant the `IAP-secured Web App User` role to users who need to access the application.
   ```bash
   gcloud projects add-iam-policy-binding <YOUR_PROJECT_ID> \
     --member="user:<USER_EMAIL>" \
     --role="roles/iap.httpsResourceAccessor"
   ```
   Replace `<YOUR_PROJECT_ID>` with your Google Cloud project ID and `<USER_EMAIL>` with the user's email address.

   > **Notice:** The Terraform script enables IAP for Cloud Run, which has a limitation. IAP uses a Google-managed OAuth client to authenticate users, and only users within the same organization can access the IAP-enabled application. If you need to allow access for users outside of your organization, please see [Enable IAP for external users](https://cloud.google.com/iap/docs/custom-oauth-configuration).


**Important:** Make sure to enforce access control when deploying on Cloud Run, for example, by using IAP.

## Changelog

*   **1080p Support**: Added support for 1080p resolution for Veo 3.0 models (2025-07-18).
*   **Veo 3.0 Support**: Added support for `veo-3.0-fast-generate-preview` (2025-07-12).
*   **Cloud SQL Backend**: Integrated a Cloud SQL for PostgreSQL database (2025-07-03).
*   **Automated DB Migrations**: Implemented SQLAlchemy-based automated database migrations (2025-07-02).
*   **Generate Audio**: Added a "Generate audio" checkbox for the Veo 3.0 model, allowing users to disable audio generation to save costs (2025-07-02).
*   **Internationalization**: Added Korean language support (2025-06-28).
*   **Improved UX**: Enhanced the video player and task history UX (2025-06-26).
*   **Error Handling**: Improved error handling and UI for video generation (2025-06-26).
*   **Video Playback**: Implemented video track playback and resizing (2025-06-19).
*   **Cloud Run Deployment**: Added Terraform support for deploying to Cloud Run (2025-06-15).

## Feedback and Suggestions

Share your thoughts and suggestions.
