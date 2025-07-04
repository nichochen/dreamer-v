#!/bin/bash

set -e

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <PROJECT_ID>"
    exit 1
fi

PROJECT_ID=$1

echo "Enabling required services for project: $PROJECT_ID"
gcloud services enable \
    cloudresourcemanager.googleapis.com \
    run.googleapis.com \
    iap.googleapis.com \
    sqladmin.googleapis.com \
    aiplatform.googleapis.com \
    --project=$PROJECT_ID

SERVICE_INFO=$(gcloud run services list --project $PROJECT_ID --format='value(name,region)' --limit=1)
if [ -z "$SERVICE_INFO" ]; then
    echo "No Cloud Run service found in project $PROJECT_ID."
    exit 1
fi

SERVICE_NAME=$(echo $SERVICE_INFO | awk '{print $1}')
REGION=$(echo $SERVICE_INFO | awk '{print $2}')

PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
AI_PLATFORM_SA="service-${PROJECT_NUMBER}@gcp-sa-aiplatform.iam.gserviceaccount.com"
IAP_SA="service-${PROJECT_NUMBER}@gcp-sa-iap.iam.gserviceaccount.com"

echo "Assigning roles for project: $PROJECT_ID"
echo "Found Cloud Run service: $SERVICE_NAME in region: $REGION"

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

echo "Granting Cloud Run Invoker role to the IAP service agent..."
gcloud run services add-iam-policy-binding $SERVICE_NAME \
    --region=$REGION \
    --project=$PROJECT_ID \
    --member="serviceAccount:$IAP_SA" \
    --role="roles/run.invoker"

echo "All roles assigned successfully."
