#!/bin/bash

# ASCII Art
echo '
██████╗░██████╗░███████╗░█████╗░███╗░░░███╗███████╗██████╗░░░░░░░██╗░░░██╗
██╔══██╗██╔══██╗██╔════╝██╔══██╗████╗░████║██╔════╝██╔══██╗░░░░░░██║░░░██║
██║░░██║██████╔╝█████╗░░███████║██╔████╔██║█████╗░░██████╔╝█████╗╚██╗░██╔╝
██║░░██║██╔══██╗██╔══╝░░██╔══██║██║╚██╔╝██║██╔══╝░░██╔══██╗╚════╝░╚████╔╝░
██████╔╝██║░░██║███████╗██║░░██║██║░╚═╝░██║███████╗██║░░██║░░░░░░░░╚██╔╝░░
╚═════╝░╚═╝░░╚═╝╚══════╝╚═╝░░╚═╝╚═╝░░░░░╚═╝╚══════╝╚═╝░░╚═╝░░░░░░░░░╚═╝░░░
'

# Script to run the Dreamer-V Docker container with necessary configurations.

# --- Configuration ---
# !!! IMPORTANT: Replace these placeholder values with your actual GCP configuration !!!

# Initialize variables for arguments
ARG_GCP_PROJECT_ID=""
ARG_GCP_REGION=""
ARG_VIDEO_GCS_BUCKET=""

# Parse command-line options
while getopts ":p:r:b:" opt; do
  case ${opt} in
    p )
      ARG_GCP_PROJECT_ID=$OPTARG
      ;;
    r )
      ARG_GCP_REGION=$OPTARG
      ;;
    b )
      ARG_VIDEO_GCS_BUCKET=$OPTARG
      ;;
    \? )
      echo "Invalid option: $OPTARG" 1>&2
      exit 1
      ;;
    : )
      echo "Invalid option: $OPTARG requires an argument" 1>&2
      exit 1
      ;;
  esac
done
shift $((OPTIND -1))

# Use arguments if provided, otherwise use environment variables
FINAL_GCP_PROJECT_ID="${ARG_GCP_PROJECT_ID:-$GCP_PROJECT_ID}"
FINAL_GCP_REGION="${ARG_GCP_REGION:-$GCP_REGION}"
FINAL_VIDEO_GCS_BUCKET="${ARG_VIDEO_GCS_BUCKET:-$VIDEO_GCS_BUCKET}"

# Remove gs:// prefix from bucket name if present
FINAL_VIDEO_GCS_BUCKET=${FINAL_VIDEO_GCS_BUCKET#gs://}

# --- Environment Variable and Argument Checks ---
missing_vars_found=false
error_message="Error: The following required configurations are not set (either via environment variables or command-line arguments):"

if [ -z "$FINAL_GCP_PROJECT_ID" ]; then
  error_message="${error_message}\n  - GCP_PROJECT_ID (env: GCP_PROJECT_ID, arg: -p)"
  missing_vars_found=true
fi

if [ -z "$FINAL_GCP_REGION" ]; then
  error_message="${error_message}\n  - GCP_REGION (env: GCP_REGION, arg: -r)"
  missing_vars_found=true
fi

if [ -z "$FINAL_VIDEO_GCS_BUCKET" ]; then
  error_message="${error_message}\n  - VIDEO_GCS_BUCKET (env: VIDEO_GCS_BUCKET, arg: -b)"
  missing_vars_found=true
fi

if [ "$missing_vars_found" = true ]; then
  echo -e "$error_message"
  echo "Please set them before running this script."
  echo "Usage: $0 [-p project_id] [-r region] [-b bucket_name]"
  exit 1
fi

gcloud config set project ${FINAL_GCP_PROJECT_ID}

# --- GCS Bucket Check and Creation ---
# echo "Checking for GCS bucket: gs://$FINAL_VIDEO_GCS_BUCKET..."
# if ! gsutil ls -b "gs://$FINAL_VIDEO_GCS_BUCKET" &>/dev/null; then
#   echo "Bucket does not exist. Attempting to create it..."
#   if ! gsutil mb -p "$FINAL_GCP_PROJECT_ID" -l "$FINAL_GCP_REGION" "gs://$FINAL_VIDEO_GCS_BUCKET"; then
#     echo "Error: Failed to create GCS bucket. Please check your permissions and configuration."
#     exit 1
#   fi
#   echo "Bucket created successfully."
# else
#   echo "Bucket already exists."
# fi
# echo ""

# Optional: Set a custom container name
CONTAINER_NAME="dreamer-v-app"
IMAGE_NAME="nicosoft/dreamer-v:latest"

# --- Host Port Mappings ---
# Port for Nginx (frontend and API proxy)
HOST_PORT_NGINX=8080
CONTAINER_PORT_NGINX=80

# --- Host Volume Mounts ---
# These paths are relative to the location of this script (expected to be in ai-video-generator directory)
# Ensure these directories exist on your host machine if Docker doesn't create them automatically for bind mounts.
HOST_DATA_DIR="$(pwd)/dreamer-v-data/backend/data"

# Create host directories if they don't exist to prevent Docker from creating them as root-owned.
mkdir -p "$HOST_DATA_DIR"

echo "Attempting to stop and remove existing container named $CONTAINER_NAME..."
sudo docker stop "$CONTAINER_NAME" &>/dev/null
sudo docker rm "$CONTAINER_NAME" &>/dev/null
echo "Existing container (if any) stopped and removed."
echo ""

echo "Starting Docker container $CONTAINER_NAME from image $IMAGE_NAME..."
echo "  GCP Project ID: $FINAL_GCP_PROJECT_ID"
echo "  GCP Region: $FINAL_GCP_REGION"
echo "  Video GCS Bucket: $FINAL_VIDEO_GCS_BUCKET"
echo "  Nginx Port Mapping: $HOST_PORT_NGINX (host) -> $CONTAINER_PORT_NGINX (container)"
echo "  Backend Port Mapping: $HOST_PORT_BACKEND (host) -> $CONTAINER_PORT_BACKEND (container)"
echo "  Volume Mounts:"
echo "    Data: $HOST_DATA_DIR -> /app/backend/data"
echo ""

# if want to specify credentials mannually
# sudo docker run -d \
#     --name "$CONTAINER_NAME" \
#     -p "$HOST_PORT_NGINX:$CONTAINER_PORT_NGINX" \
#     -e "GCP_PROJECT_ID=$FINAL_GCP_PROJECT_ID" \
#     -e "GCP_REGION=$FINAL_GCP_REGION" \
#     -e "VIDEO_GCS_BUCKET=$FINAL_VIDEO_GCS_BUCKET" \
#     -e "GOOGLE_APPLICATION_CREDENTIALS=/app/secret/application_default_credentials.json" \
#     -v ${HOME}/.config/gcloud/:/app/secret/ \
#     -v "$HOST_DATA_DIR:/app/backend/data" \
#     --rm \
#     "$IMAGE_NAME"

sudo docker run -d \
    --name "$CONTAINER_NAME" \
    -p "$HOST_PORT_NGINX:$CONTAINER_PORT_NGINX" \
    -e "GCP_PROJECT_ID=$FINAL_GCP_PROJECT_ID" \
    -e "GCP_REGION=$FINAL_GCP_REGION" \
    -e "VIDEO_GCS_BUCKET=$FINAL_VIDEO_GCS_BUCKET" \
    -v ${HOME}/.config/gcloud/:/app/secret/ \
    -v "$HOST_DATA_DIR:/app/backend/data" \
    --rm \
    "$IMAGE_NAME"

echo ""
echo "Container $CONTAINER_NAME should be starting."
echo "You can check its logs with: docker logs $CONTAINER_NAME -f"
if [ "$HOST_PORT_NGINX" == "80" ]; then
    echo "Access the application at: http://localhost"
else
    echo "Access the application at: http://localhost:$HOST_PORT_NGINX"
fi
