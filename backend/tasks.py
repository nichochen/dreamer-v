import time
import os
import cv2
from google.cloud import storage
from moviepy import VideoFileClip, AudioFileClip, CompositeAudioClip, concatenate_videoclips
from database import db
from models import VideoGenerationTask, MusicGenerationTask
from config import (
    videos_dir,
    thumbnails_dir,
    uploads_dir,
    generated_music_dir,
    user_uploaded_music_dir,
    DEFAULT_OUTPUT_GCS_BUCKET,
    PROJECT_ID,
)
from google_veo import GoogleVeo
from clients import lyria_client

def _run_video_generation(app, task_id):
    with app.app_context():
        task = VideoGenerationTask.query.get(task_id)
        if not task:
            print(f"Task {task_id} not found for processing.")
            return

        task.status = "processing"
        task.updated_at = time.time()
        db.session.commit()
        print(f"Starting video generation for task {task_id}, prompt: '{task.prompt}', model: '{task.model}'")

        try:
            # Model specific checks based on user feedback
            # User feedback: "veo-3.0-generate-preview dosen't support lart frame image and 9:16 ratio"
            # Assuming "lart frame" means "last frame"
            TARGET_MODEL_FOR_CHECKS = "veo-3.0-generate-preview" # Or the correct model name if this is a typo

            if task.model == TARGET_MODEL_FOR_CHECKS:
                if task.last_frame_filename:
                    task.status = "failed"
                    task.error_message = f"Model {TARGET_MODEL_FOR_CHECKS} does not support last frame images."
                    db.session.commit()
                    print(f"Task {task_id} failed: {task.error_message}")
                    return
                if task.aspect_ratio == "9:16":
                    task.status = "failed"
                    task.error_message = f"Model {TARGET_MODEL_FOR_CHECKS} does not support 9:16 aspect ratio."
                    db.session.commit()
                    print(f"Task {task_id} failed: {task.error_message}")
                    return
            print("@@", task)
            veo_client = GoogleVeo(project_id=PROJECT_ID, model_name=task.model) # Instantiate GoogleVeo with task's model

            current_image_gcs_uri = None # Initialize
            current_last_frame_gcs_uri = None # Initialize

            # Determine GCS output URI: use task-specific if provided, else default
            bucket_to_use = task.gcs_output_bucket if task.gcs_output_bucket else DEFAULT_OUTPUT_GCS_BUCKET
            # GoogleVeo expects the GCS URI for the API to store the video.
            # The API itself will create subdirectories if needed, or use the direct path.
            # Let's ensure it's a clean GCS path for the output video file.
            # The original notebook examples often point to a directory, and the API names the file.
            # GoogleVeo's `storageUri` parameter is for this.
            output_gcs_uri_for_task_api = f"{bucket_to_use.rstrip('/')}/{task.id}/video.mp4" # Example: API might save to this specific file or use the prefix

            # Prepare parameters for GoogleVeo.generate_video
            veo_parameters = {
                "aspectRatio": task.aspect_ratio,
                "storageUri": output_gcs_uri_for_task_api, # GCS path for API output
                "numberOfVideos": 1,
                "durationSeconds": task.duration_seconds,
                # "cameraControl": task.camera_control, # Removed from here
                "personGeneration": "ALLOW_ALL", # Assuming this is passed through
                "enhancePrompt": True,
            }

            current_image_mime_type = "image/jpeg" # Default
            if task.image_filename:
                image_full_path = os.path.join(uploads_dir, task.image_filename)
                if os.path.exists(image_full_path):
                    try:
                        # Determine MIME type from filename extension
                        filename_lower = task.image_filename.lower()
                        if filename_lower.endswith((".jpg", ".jpeg")):
                            current_image_mime_type = "image/jpeg"
                        elif filename_lower.endswith(".png"):
                            current_image_mime_type = "image/png"
                        elif filename_lower.endswith(".gif"):
                            current_image_mime_type = "image/gif"
                        # Add other types if needed

                        # Image must be uploaded to GCS for GoogleVeo class as it expects gcsUri
                        if DEFAULT_OUTPUT_GCS_BUCKET:
                            storage_client_img = storage.Client()
                            image_bucket_name = DEFAULT_OUTPUT_GCS_BUCKET.replace("gs://", "")
                            bucket_img = storage_client_img.bucket(image_bucket_name)
                            base_image_filename = os.path.basename(task.image_filename)
                            image_blob_name = f"image_uploads/{task.id}/{base_image_filename}"
                            blob_img = bucket_img.blob(image_blob_name)
                            
                            blob_img.upload_from_filename(image_full_path, content_type=current_image_mime_type)
                            current_image_gcs_uri = f"gs://{image_bucket_name}/{image_blob_name}"
                            task.image_gcs_uri = current_image_gcs_uri # Save to task model
                            db.session.commit()
                            print(f"Successfully uploaded image {task.image_filename} to {current_image_gcs_uri}")
                        else:
                            # If no GCS bucket for uploads, this path cannot proceed with GoogleVeo
                            raise ValueError("DEFAULT_OUTPUT_GCS_BUCKET is not configured. Image upload to GCS is required for GoogleVeo.")

                    except Exception as e_img_gcs:
                        print(f"Error processing/uploading image file {task.image_filename} for task {task_id}: {e_img_gcs}")
                        task.status = "failed"
                        task.error_message = f"Error processing/uploading image: {e_img_gcs}"
                        db.session.commit()
                        return
                else:
                    print(f"Image file {task.image_filename} not found for task {task_id}")
            # current_last_frame_gcs_uri is initialized above
            current_last_frame_mime_type = "image/jpeg" # Default
            if task.last_frame_filename:
                last_frame_full_path = os.path.join(uploads_dir, task.last_frame_filename)
                if os.path.exists(last_frame_full_path):
                    try:
                        filename_lower_last = task.last_frame_filename.lower()
                        if filename_lower_last.endswith((".jpg", ".jpeg")):
                            current_last_frame_mime_type = "image/jpeg"
                        elif filename_lower_last.endswith(".png"):
                            current_last_frame_mime_type = "image/png"
                        elif filename_lower_last.endswith(".gif"):
                            current_last_frame_mime_type = "image/gif"
                        # Add other types if needed
                        
                        if DEFAULT_OUTPUT_GCS_BUCKET:
                            storage_client_last_img = storage.Client()
                            last_image_bucket_name = DEFAULT_OUTPUT_GCS_BUCKET.replace("gs://", "")
                            bucket_last_img = storage_client_last_img.bucket(last_image_bucket_name)
                            base_last_image_filename = os.path.basename(task.last_frame_filename)
                            last_image_blob_name = f"last_frame_uploads/{task.id}/{base_last_image_filename}"
                            blob_last_img = bucket_last_img.blob(last_image_blob_name)
                            
                            blob_last_img.upload_from_filename(last_frame_full_path, content_type=current_last_frame_mime_type)
                            current_last_frame_gcs_uri = f"gs://{last_image_bucket_name}/{last_image_blob_name}"
                            task.last_frame_gcs_uri = current_last_frame_gcs_uri # Save to task model
                            db.session.commit()
                            print(f"Successfully uploaded last frame image {task.last_frame_filename} to {current_last_frame_gcs_uri}")
                        else:
                            raise ValueError("DEFAULT_OUTPUT_GCS_BUCKET is not configured. Last frame image upload to GCS is required.")
                    except Exception as e_last_img_gcs:
                        print(f"Error processing/uploading last frame image {task.last_frame_filename} for task {task_id}: {e_last_img_gcs}")
                        task.status = "failed"
                        task.error_message = f"Error processing/uploading last frame image: {e_last_img_gcs}"
                        db.session.commit()
                        return
                else:
                    print(f"Last frame image file {task.last_frame_filename} not found for task {task_id}")

            # Call GoogleVeo to generate video
            # Note: model_to_use (task.model or DEFAULT_VIDEO_MODEL) is not used here as GoogleVeo class has a hardcoded model.
            # This might be a point of future enhancement if model selection is needed with GoogleVeo.
            op_result = veo_client.generate_video(
                prompt=task.prompt,
                parameters=veo_parameters,
                image_uri=current_image_gcs_uri if current_image_gcs_uri else "",
                image_mime_type=current_image_mime_type,
                video_uri=task.video_uri if task.video_uri else "", # Pass video_uri if present
                last_frame_uri=current_last_frame_gcs_uri if current_last_frame_gcs_uri else "",
                last_frame_mime_type=current_last_frame_mime_type,
                camera_control=task.camera_control # Pass camera_control directly
            )

            # Process the result from GoogleVeo
            if "error" in op_result and op_result["error"]:
                task.status = "failed"
                task.error_message = op_result["error"].get("message", "Unknown error during Veo generation")
                print(f"Video generation failed for task {task_id}: {task.error_message}")
            elif "response" in op_result:
                gcs_raw_uri = None
                response_data = op_result["response"]
                if "videos" in response_data and response_data["videos"]:
                    gcs_raw_uri = response_data["videos"][0].get("gcsUri")
                elif "generatedSamples" in response_data and response_data["generatedSamples"]:
                    gcs_raw_uri = response_data["generatedSamples"][0].get("video", {}).get("uri")

                if "raiMediaFilteredCount" in response_data and response_data["raiMediaFilteredCount"] > 0:
                    task.status = "failed"
                    # Try to get a descriptive reason
                    reasons = response_data.get("raiMediaFilteredReasons", ["RAI filtering."])
                    task.error_message = f"Video generation failed due to RAI policy: {reasons[0]}"
                    print(f"Task {task_id} failed due to RAI filtering: {reasons}")
                elif gcs_raw_uri:
                    # Ensure gcs_raw_uri is stored with gs:// prefix if it's a GCS path
                    if "storage.cloud.google.com" in gcs_raw_uri:
                        # Convert https to gs:// before saving if it came from an older process or manual entry
                        task.video_gcs_uri = gcs_raw_uri.replace("https://storage.cloud.google.com/", "gs://", 1)
                    else:
                        task.video_gcs_uri = gcs_raw_uri # Assume it's already gs:// or a non-GCS URI
                    
                    task.status = "completed" # Set status after video_gcs_uri is set
                    print(f"Video generation completed for task {task_id}. GCS URI: {task.video_gcs_uri}")

                    # Download video using google-cloud-storage
                    video_filename = f"{task.id}.mp4"
                    local_video_full_path = os.path.join(videos_dir, video_filename)
                    try:
                        # gcs_raw_uri is like "gs://bucket-name/path/to/blob"
                        bucket_name = gcs_raw_uri.split('/')[2]
                        source_blob_name = "/".join(gcs_raw_uri.split('/')[3:])
                        
                        print(f"Downloading video for task {task_id} from GCS bucket '{bucket_name}', blob '{source_blob_name}' to '{local_video_full_path}'...")
                        storage_client = storage.Client()
                        bucket = storage_client.bucket(bucket_name)
                        blob = bucket.blob(source_blob_name)
                        blob.download_to_filename(local_video_full_path)
                        
                        task.local_video_path = f"/videos/{video_filename}" # Relative path for serving
                        print(f"Video for task {task_id} downloaded successfully via GCS client.")

                        # time.sleep(1) # May not be needed with GCS client download, but can be re-added if moov atom issue persists

                        # Generate thumbnail
                        thumbnail_filename = f"{task.id}.jpg"
                        local_thumbnail_full_path = os.path.join(thumbnails_dir, thumbnail_filename)
                        print(f"Generating thumbnail for task {task_id} at {local_thumbnail_full_path}...")
                        vid_cap = cv2.VideoCapture(local_video_full_path)
                        success, image = vid_cap.read()
                        if success:
                            cv2.imwrite(local_thumbnail_full_path, image)
                            task.local_thumbnail_path = f"/thumbnails/{thumbnail_filename}" # Relative path for serving
                            print(f"Thumbnail for task {task_id} generated successfully.")
                        else:
                            print(f"Failed to extract frame for thumbnail for task {task_id}.")
                        vid_cap.release()
                    except Exception as e_dl_thumb: # Catching broader exception for GCS download or thumbnailing
                        print(f"Error during video download or thumbnail generation for task {task_id}: {e_dl_thumb}")
                        task.error_message = (task.error_message or "") + f"; Download/Thumbnail failed: {e_dl_thumb}"
                else:
                    task.status = "failed"
                    task.error_message = "Generation finished but no video URI or RAI failure reason found."
                    print(f"Task {task_id}: {task.error_message}")
            else:
                task.status = "failed"
                task.error_message = "Generation finished but no video URI found or unexpected result."
                print(f"Task {task_id}: {task.error_message}")

        except Exception as e:
            task.status = "failed"
            task.error_message = str(e)
            print(f"Exception during video generation for task {task_id}: {e}")
        finally:
            task.updated_at = time.time()
            db.session.commit()

def _run_composite_video_creation(app, task_id, source_clip_task_ids_and_prompts, music_file_path_param=None):
    with app.app_context():
        composite_task = VideoGenerationTask.query.get(task_id)
        if not composite_task:
            print(f"Composite task {task_id} not found for processing.")
            return

        composite_task.status = "processing"
        composite_task.updated_at = time.time()
        db.session.commit()
        print(f"Starting composite video creation for task {task_id}")

        video_clips_to_concatenate = []
        total_duration = 0
        first_clip_aspect_ratio = "16:9" # Default
        final_clip_moviepy = None # Initialize to ensure it's closable in finally
        audio_clip_moviepy = None # Initialize for audio clip

        try:
            print(f"Composite video creation: received music_file_path_param: {music_file_path_param}") # Log received param
            if music_file_path_param:
                # Determine absolute path for music file
                absolute_music_path = None
                if music_file_path_param.startswith("/user_uploaded_music/"):
                    base_music_filename = os.path.basename(music_file_path_param)
                    absolute_music_path = os.path.join(user_uploaded_music_dir, base_music_filename)
                elif music_file_path_param.startswith("/music/"):
                    base_music_filename = os.path.basename(music_file_path_param)
                    absolute_music_path = os.path.join(generated_music_dir, base_music_filename)
                else:
                    raise ValueError(f"Invalid music file path prefix: {music_file_path_param}")
                
                print(f"Determined absolute_music_path: {absolute_music_path}") # Log absolute path

                if not os.path.exists(absolute_music_path):
                    print(f"Music file NOT FOUND at {absolute_music_path}") # Log if not found
                    raise ValueError(f"Music file not found at {absolute_music_path}")
                
                audio_clip_moviepy = AudioFileClip(absolute_music_path)
                if audio_clip_moviepy:
                    print(f"Successfully loaded audio_clip_moviepy from {absolute_music_path}") # Log success
                else:
                    print(f"Failed to load audio_clip_moviepy from {absolute_music_path}") # Log failure
                composite_task.music_file_path = music_file_path_param
            else:
                print("No music_file_path_param provided for composite video.") # Log if no param

            for i, clip_info in enumerate(source_clip_task_ids_and_prompts):
                source_task_id = clip_info['task_id']
                source_task = VideoGenerationTask.query.get(source_task_id)
                if not source_task:
                    raise ValueError(f"Source clip task {source_task_id} not found.")
                if source_task.status != "completed" or not source_task.local_video_path:
                    raise ValueError(f"Source clip task {source_task_id} is not completed or has no local video path ({source_task.status}, {source_task.local_video_path}).")
                
                if not os.path.basename(source_task.local_video_path): 
                    raise ValueError(f"Source clip task {source_task_id} has an invalid local_video_path: {source_task.local_video_path}")

                clip_file_path = os.path.join(videos_dir, os.path.basename(source_task.local_video_path))
                if not os.path.exists(clip_file_path):
                    raise ValueError(f"Local video file for clip task {source_task_id} not found at {clip_file_path}.")
                
                # Get raw start offset and duration from clip_info
                raw_start_offset = clip_info.get('start_offset_seconds')
                raw_segment_duration = clip_info.get('duration_seconds')

                try:
                    # Default start_offset to 0.0 if None or missing, otherwise convert
                    start_offset = float(raw_start_offset) if raw_start_offset is not None else 0.0
                    
                    # If raw_segment_duration is None or missing, default to the full duration of the source_task's video.
                    # Otherwise, convert the provided segment duration.
                    if raw_segment_duration is None:
                        # Ensure source_task.duration_seconds is float for calculations
                        segment_duration = float(source_task.duration_seconds) 
                    else:
                        segment_duration = float(raw_segment_duration)
                        
                except (ValueError, TypeError) as e:
                    error_detail = (f"raw_start_offset='{raw_start_offset}', "
                                    f"raw_segment_duration='{raw_segment_duration}' from clip_info, "
                                    f"source_task_duration='{source_task.duration_seconds}'")
                    raise ValueError(
                        f"Invalid start_offset_seconds or duration_seconds for clip {source_task_id}. "
                        f"Details: {error_detail}. Error: {e}"
                    )

                current_full_clip = VideoFileClip(clip_file_path)
                original_clip_duration = current_full_clip.duration # True duration of the video file

                # Calculate the intended end point of the segment in the original clip's timeline
                intended_subclip_end = start_offset + segment_duration
                
                # Determine the actual segment duration and end point, respecting original clip boundaries
                actual_subclip_end = min(intended_subclip_end, original_clip_duration)
                actual_segment_duration = actual_subclip_end - start_offset
                
                if actual_segment_duration < 0: # Ensure duration is not negative (e.g. if start_offset is beyond original_clip_duration)
                    actual_segment_duration = 0

                if actual_segment_duration > 0:
                    processed_segment_clip = None
                    # Only apply subclip if the desired segment is different from the full original clip
                    if start_offset != 0.0 or actual_subclip_end != original_clip_duration:
                        processed_segment_clip = current_full_clip.subclipped(start_offset, actual_subclip_end)
                        # DO NOT close current_full_clip here. The subclip (processed_segment_clip)
                        # relies on the original clip's reader.
                        # The clips in video_clips_to_concatenate will be closed in the main finally block.
                    else:
                        # No subclip needed, the segment is the entire original clip.
                        # processed_segment_clip will be current_full_clip.
                        # current_full_clip will be added to video_clips_to_concatenate and closed by the main finally block.
                        processed_segment_clip = current_full_clip 
                    
                    video_clips_to_concatenate.append(processed_segment_clip)
                    total_duration += actual_segment_duration # Add the duration of the actual segment used
                else:
                    # Segment duration is <= 0, so we don't use this clip. Close the VideoFileClip object.
                    current_full_clip.close()

                if i == 0: 
                    first_clip_aspect_ratio = source_task.aspect_ratio

            if not video_clips_to_concatenate:
                raise ValueError("No valid video clips found to concatenate.")

            composite_task.duration_seconds = total_duration
            composite_task.aspect_ratio = first_clip_aspect_ratio
            db.session.commit()

            final_clip_moviepy = concatenate_videoclips(video_clips_to_concatenate, method="compose")

            if audio_clip_moviepy:
                video_duration = final_clip_moviepy.duration
                audio_duration = audio_clip_moviepy.duration

                if audio_duration < video_duration:
                    # Loop audio to match video duration
                    num_loops = int(video_duration / audio_duration) + 1
                    looped_clips = [audio_clip_moviepy] * num_loops
                    final_audio = CompositeAudioClip(looped_clips)
                    # Trim the looped audio to the exact video duration
                    final_audio = final_audio.subclipped(0, video_duration)
                else:
                    # Truncate audio to match video duration
                    final_audio = audio_clip_moviepy.subclipped(0, video_duration)
                
                final_clip_moviepy = final_clip_moviepy.with_audio(final_audio) # Use with_audio as suggested

            composite_video_filename = f"{composite_task.id}.mp4"
            local_composite_video_full_path = os.path.join(videos_dir, composite_video_filename)
            
            has_audio = final_clip_moviepy.audio is not None
            current_audio_codec = "aac" if has_audio else None
            
            final_clip_moviepy.write_videofile(
                local_composite_video_full_path, 
                codec="libx264", 
                audio_codec=current_audio_codec, 
                threads=4, 
                logger='bar'
            )

            composite_task.local_video_path = f"/videos/{composite_video_filename}"
            print(f"Composite video for task {task_id} saved locally to {local_composite_video_full_path}")

            bucket_to_use = composite_task.gcs_output_bucket if composite_task.gcs_output_bucket else DEFAULT_OUTPUT_GCS_BUCKET
            if bucket_to_use:
                storage_client_composite = storage.Client()
                composite_bucket_name = bucket_to_use.replace("gs://", "")
                bucket_composite = storage_client_composite.bucket(composite_bucket_name)
                composite_blob_name = f"composite_videos/{composite_task.id}/{composite_video_filename}"
                blob_composite = bucket_composite.blob(composite_blob_name)
                
                blob_composite.upload_from_filename(local_composite_video_full_path)
                composite_task.video_gcs_uri = f"gs://{composite_bucket_name}/{composite_blob_name}"
                print(f"Composite video for task {task_id} uploaded to GCS: {composite_task.video_gcs_uri}")
            else:
                print(f"No GCS bucket configured for composite task {task_id}. Skipping GCS upload.")
                composite_task.video_gcs_uri = None

            composite_thumbnail_filename = f"{composite_task.id}.jpg"
            local_composite_thumbnail_full_path = os.path.join(thumbnails_dir, composite_thumbnail_filename)
            vid_cap_composite = cv2.VideoCapture(local_composite_video_full_path)
            success_thumb, image_thumb = vid_cap_composite.read()
            if success_thumb:
                cv2.imwrite(local_composite_thumbnail_full_path, image_thumb)
                composite_task.local_thumbnail_path = f"/thumbnails/{composite_thumbnail_filename}"
                print(f"Thumbnail for composite task {task_id} generated successfully.")
            else:
                print(f"Failed to extract frame for composite thumbnail for task {task_id}.")
            vid_cap_composite.release()

            composite_task.status = "completed"

        except Exception as e:
            composite_task.status = "failed"
            composite_task.error_message = str(e)
            print(f"Exception during composite video creation for task {task_id}: {e}")
            import traceback
            traceback.print_exc()
        finally:
            for clip_obj in video_clips_to_concatenate:
                if hasattr(clip_obj, 'reader') and clip_obj.reader: 
                    clip_obj.close()
            if final_clip_moviepy and hasattr(final_clip_moviepy, 'reader') and final_clip_moviepy.reader: 
                 final_clip_moviepy.close()
            if audio_clip_moviepy and hasattr(audio_clip_moviepy, 'reader') and audio_clip_moviepy.reader: # Close original audio clip
                audio_clip_moviepy.close()
            # final_audio is a new object, ensure it's closed if it has a reader (though often not directly needed for CompositeAudioClip)
            if 'final_audio' in locals() and final_audio and hasattr(final_audio, 'reader') and final_audio.reader:
                final_audio.close()

            composite_task.updated_at = time.time()
            db.session.commit()

def _run_music_generation(app, task_id):
    with app.app_context():
        task = MusicGenerationTask.query.get(task_id)
        if not task:
            print(f"Music task {task_id} not found for processing.")
            return

        if not lyria_client:
            task.status = "failed"
            task.error_message = "Lyria client not initialized. Check GCP_PROJECT_ID or server logs."
            task.updated_at = time.time()
            db.session.commit()
            print(f"Music task {task_id} failed: Lyria client not initialized.")
            return

        task.status = "processing"
        task.updated_at = time.time()
        db.session.commit()
        print(f"Starting music generation for task {task_id}, prompt: '{task.prompt}'")

        try:
            # generate_music returns the full path to the file in its own output_dir (e.g., "generated_music/file.wav")
            absolute_music_file_path_from_lyria = lyria_client.generate_music(
                prompt=task.prompt,
                negative_prompt=task.negative_prompt,
                seed=task.seed
            )

            if absolute_music_file_path_from_lyria and os.path.exists(absolute_music_file_path_from_lyria):
                # We want to move this file to our managed `generated_music_dir` (backend/data/music)
                # and store a relative path for serving.
                source_filename = os.path.basename(absolute_music_file_path_from_lyria)
                # Ensure unique filename in destination, though UUID from Lyria should be unique
                destination_filename = f"{task.id}_{source_filename}" # Prepend task_id for clarity
                destination_full_path = os.path.join(generated_music_dir, destination_filename)
                
                # Move the file
                os.rename(absolute_music_file_path_from_lyria, destination_full_path)
                
                task.local_music_path = f"/music/{destination_filename}" # Relative path for serving
                task.status = "completed"
                print(f"Music generation completed for task {task_id}. File saved to {destination_full_path}")
                # Clean up the "generated_music" directory if it's empty (optional)
                # lyria_default_output_dir = os.path.join(backend_dir, "generated_music") # lyria_client.output_dir is relative to google_lyria.py
                # if os.path.exists(lyria_default_output_dir) and not os.listdir(lyria_default_output_dir):
                #     try:
                #         os.rmdir(lyria_default_output_dir)
                #     except OSError as e:
                #         print(f"Could not remove Lyria's default output directory {lyria_default_output_dir}: {e}")

            elif absolute_music_file_path_from_lyria is None: # Explicitly None means generation failed within Lyria class
                task.status = "failed"
                # Error message should have been printed by Lyria class, but we can add a generic one
                task.error_message = task.error_message or "Music generation failed. See server logs for details from Lyria client."
                print(f"Music generation failed for task {task_id} as reported by Lyria client.")
            else: # Path returned but file doesn't exist
                task.status = "failed"
                task.error_message = f"Music generation reported success but file not found at {absolute_music_file_path_from_lyria}."
                print(f"Music task {task_id} failed: {task.error_message}")


        except Exception as e:
            task.status = "failed"
            task.error_message = str(e)
            print(f"Exception during music generation for task {task_id}: {e}")
            import traceback
            traceback.print_exc()
        finally:
            task.updated_at = time.time()
            db.session.commit()
