#!/bin/bash

set -e

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <PROJECT_ID>"
    exit 1
fi

PROJECT_ID=$1

echo "Enabling required services for project: $PROJECT_ID"
gcloud services enable aiplatform.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable iap.googleapis.com
gcloud services enable compute.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable cloudresourcemanager.googleapis.com

gcloud beta services identity create --service=aiplatform.googleapis.com \
    --project=$PROJECT_ID

PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
AI_PLATFORM_SA="service-${PROJECT_NUMBER}@gcp-sa-aiplatform.iam.gserviceaccount.com"
IAP_SA="service-${PROJECT_NUMBER}@gcp-sa-iap.iam.gserviceaccount.com"

echo "Granting Cloud SQL Client role to the default compute service account..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/cloudsql.client"

echo "Granting Vertex AI User role to the default compute service account..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/aiplatform.user"

echo "Granting Storage Object User role to the Vertex AI service agent..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$AI_PLATFORM_SA" \
    --role="roles/storage.objectUser"

echo "Granting Storage Object Admin role to the default compute service account..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/storage.objectAdmin"



echo "All roles assigned successfully."
