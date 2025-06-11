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

### In Cloud Shell

Get started with Dreamer-V instantly using Cloud Shell!

**Setup:**

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

### In Cloud Run

Dreamer-V can also be deployed on Cloud Run for a more scalable and managed solution.

**Architecture Overview:**
```

External App LB --> IAP (Identity-Aware Proxy) --> Cloud Run --> Vertex AI
                                                    |
                                                    --> GCS (Google Cloud Storage)
```

A Certificate Manager can be used with your Domain Name for SSL.

**Important:** Make sure to enforce access control when deploying on Cloud Run, for example, by using IAP.

## Feedback and Suggestions

Share your thoughts and suggestions.
