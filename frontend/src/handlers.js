import { urlToImageFile } from './utils';
// Ensure STATUS_COMPLETED is imported
import { BACKEND_URL, STATUS_PENDING, STATUS_ERROR, STATUS_COMPLETED } from './constants'; 
import { createCompositeVideo, uploadMusicFile as apiUploadMusicFile, generateImage } from './api'; // Import the new API function and alias uploadMusicFile

export const handleImagePreviewClick = (imageUrl, setModalImageUrl, setShowImageModal) => {
  setModalImageUrl(imageUrl);
  setShowImageModal(true);
};

export const handlePasteFromClipboard = async (target, setSelectedImage, setImagePreview, setSelectedLastImage, setLastImagePreview, setErrorMessage, t) => {
  try {
    const permission = await navigator.permissions.query({ name: 'clipboard-read' });
    if (permission.state === 'denied') {
      throw new Error(t('errorClipboardPermissionDenied'));
    }
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      for (const type of item.types) {
        if (type.startsWith('image/')) {
          const blob = await item.getType(type);
          const extension = type.split('/')[1] || 'png';
          const filename = `pasted_image.${extension}`;
          const file = new File([blob], filename, { type: blob.type });

          const reader = new FileReader();
          reader.onloadend = () => {
            if (target === 'first') {
              setSelectedImage(file);
              setImagePreview(reader.result);
            } else if (target === 'last') {
              setSelectedLastImage(file);
              setLastImagePreview(reader.result);
            }
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
    }
    setErrorMessage(t('errorNoImageOnClipboard'));
  } catch (err) {
    console.error('Failed to read image from clipboard:', err);
    // setErrorMessage(t('errorPasteImage', { message: err.message }));
  }
};

export const handleMusicFileUpload = async (event, setSelectedMusicFile, setUploadedMusicBackendUrl, setMusicErrorMessage, t) => {
  const file = event.target.files[0];
  
  // Clear previous states immediately
  setSelectedMusicFile(null);
  setUploadedMusicBackendUrl(null);
  setMusicErrorMessage('');

  if (!file) {
    event.target.value = null; // Reset file input if no file is chosen (e.g., user cancels dialog)
    return;
  }

  // Client-side validation (type and size)
  const allowedTypes = ["audio/mpeg", "audio/wav", "audio/mp3"]; // audio/mp3 for robustness
  const isAllowedType = allowedTypes.includes(file.type) || file.name.endsWith(".mp3") || file.name.endsWith(".wav");
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (!isAllowedType) {
    setMusicErrorMessage(t('errorInvalidMusicFileType', { allowedTypes: '.mp3, .wav' }));
    event.target.value = null; // Reset file input
    return;
  }

  if (file.size > maxSize) {
    setMusicErrorMessage(t('errorMusicFileTooLarge', { maxSize: `${maxSize / (1024 * 1024)}MB` }));
    event.target.value = null; // Reset file input
    return;
  }

  // If client-side validation passes, set the file for immediate UI feedback (e.g., filename display)
  setSelectedMusicFile(file); // Show filename while uploading

  try {
    // Call API to upload the file
    // Show some kind of "uploading..." message if desired, by setting musicErrorMessage or a new state
    setMusicErrorMessage(t('uploadingMusicMessage', 'Uploading music...')); // Placeholder for new translation key

    const backendFilePath = await apiUploadMusicFile(file, t); // api.js function

    if (backendFilePath) {
      setUploadedMusicBackendUrl(BACKEND_URL + backendFilePath); // Use the path directly
      setMusicErrorMessage(''); // Clear "uploading" message or any previous error
      // setSelectedMusicFile(file); // Already set
    } else {
      // This case should ideally be caught by apiUploadMusicFile throwing an error
      throw new Error(t('errorUploadMusicFileNoPath'));
    }
  } catch (error) {
    console.error('Failed to upload music file:', error);
    setMusicErrorMessage(error.message || t('errorUploadMusicFileGeneric')); // A more generic error key might be needed
    setSelectedMusicFile(null); // Clear the selected file on error
    setUploadedMusicBackendUrl(null); // Clear backend URL on error
    event.target.value = null; // Reset file input
  }
};


export const handleMouseDownResize = (e, setIsResizing, setStartY, setStartHeight, videoHeight) => {
  setIsResizing(true);
  setStartY(e.clientY);
  setStartHeight(videoHeight);
  e.preventDefault();
};

export const toggleTheme = (setTheme) => {
  setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
};

export const handlePromptChange = (event, setPrompt) => {
  setPrompt(event.target.value);
};

export const handleImageChange = (event, setSelectedImage, setImagePreview, fileInputRef) => {
  const file = event.target.files[0];
  if (file) {
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  } else {
    setSelectedImage(null);
    setImagePreview('');
    if (fileInputRef.current) {
      fileInputRef.current.value = null;
    }
  }
};

export const handleLastImageChange = (event, setSelectedLastImage, setLastImagePreview, lastFileInputRef) => {
  const file = event.target.files[0];
  if (file) {
    setSelectedLastImage(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setLastImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  } else {
    setSelectedLastImage(null);
    setLastImagePreview('');
    if (lastFileInputRef.current) {
      lastFileInputRef.current.value = null;
    }
  }
};

export const clearImagePreview = (setSelectedImage, setImagePreview, fileInputRef) => {
  setSelectedImage(null);
  setImagePreview('');
  if (fileInputRef.current) {
    fileInputRef.current.value = null;
  }
};

export const clearLastImagePreview = (setSelectedLastImage, setLastImagePreview, lastFileInputRef) => {
  setSelectedLastImage(null);
  setLastImagePreview('');
  if (lastFileInputRef.current) {
    lastFileInputRef.current.value = null;
  }
};

export const handleHistoryItemClick = async ({
  task,
  activeView,
  pollingIntervalId,
  setPollingIntervalId,
  setCompletedUriPollRetries,
  setCreateModeClips,
  setActiveCreateModeVideoSrc,
  setSelectedClipInTrack,
  setPrompt,
  setModel,
  setRatio,
  setCameraControl,
  setDuration,
  setGcsOutputBucket,
  setTaskId,
  setVideoGcsUri,
  setTaskStatus,
  setErrorMessage,
  setIsLoading,
  setSelectedImage,
  setImagePreview,
  setSelectedLastImage,
  setLastImagePreview,
  t,
}) => {
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
    setPollingIntervalId(null);
  }
  setCompletedUriPollRetries(0);

    if (activeView === 'create') {
      // Only add completed tasks to the create mode track
      if (task.status === STATUS_COMPLETED && task.local_video_path) {
        setCreateModeClips(prevClips => {
          // Max clips check
          const MAX_CLIPS_ALLOWED = 8; // Consistent with existing alert
          if (prevClips.length >= MAX_CLIPS_ALLOWED) {
            alert(t('errorMaxClipsReached', { maxClips: MAX_CLIPS_ALLOWED }));
            return prevClips;
          }

          // Max duration check
          const MAX_TOTAL_DURATION_SECONDS = 60;
          const currentTotalDuration = prevClips.reduce((sum, clip) => sum + (parseInt(clip.duration_seconds, 10) || 0), 0);
          const newClipDuration = parseInt(task.duration_seconds, 10) || 0;

          if (currentTotalDuration + newClipDuration > MAX_TOTAL_DURATION_SECONDS) {
            alert(t('errorMaxDurationReached', { maxDuration: MAX_TOTAL_DURATION_SECONDS }));
            return prevClips;
          }

          const newTrackInstanceId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
          const newClipInstance = { ...task, trackInstanceId: newTrackInstanceId };

          // Set the active video source to the newly added clip
          setActiveCreateModeVideoSrc(`${BACKEND_URL}${newClipInstance.local_video_path}`);
          setSelectedClipInTrack(newTrackInstanceId);
          return [...prevClips, newClipInstance];
        });
      } else {
        // Optionally, provide feedback to the user that the task cannot be added
        // For example, using setErrorMessage or an alert:
        // setErrorMessage(t('errorCannotAddNonCompletedTaskToTrack'));
        // alert(t('errorCannotAddNonCompletedTaskToTrack'));
        console.warn(`Task ${task.task_id} cannot be added to track because its status is '${task.status}' or it has no local video path.`);
        // Do not proceed to set it as active or add to clips
        return;
      }
    } else { // Dream view
    setPrompt(task.prompt);
    const newModel = task.model || 'veo-2.0-generate-001';
    setModel(newModel);
    setRatio(task.aspect_ratio || '16:9');
    if (newModel === 'veo-2.0-generate-exp') {
      setCameraControl(task.camera_control || '');
    } else {
      setCameraControl('');
    }
    setDuration(task.duration_seconds || 5);
    setGcsOutputBucket(task.gcs_output_bucket || '');
    setTaskId(task.task_id);
    setVideoGcsUri(task.local_video_path ? `${BACKEND_URL}${task.local_video_path}` : '');
    setTaskStatus(task.status);
    setErrorMessage(task.error_message || '');
    setIsLoading(false);

    setSelectedImage(null);
    setImagePreview('');
    setSelectedLastImage(null);
    setLastImagePreview('');

    if (task.original_image_path) {
      const imageUrl = `${BACKEND_URL}${task.original_image_path}`;
      setImagePreview(imageUrl);
      const imageFile = await urlToImageFile(imageUrl, task.original_image_path.split('/').pop());
      if (imageFile) {
        setSelectedImage(imageFile);
      } else {
        console.warn("Could not load original image as file for re-submission.");
      }
    }

    if (task.original_last_frame_path) {
      const lastImageUrl = `${BACKEND_URL}${task.original_last_frame_path}`;
      setLastImagePreview(lastImageUrl);
      const lastImageFile = await urlToImageFile(lastImageUrl, task.original_last_frame_path.split('/').pop());
      if (lastImageFile) {
        setSelectedLastImage(lastImageFile);
      } else {
        console.warn("Could not load original last image as file for re-submission.");
      }
    }
  }
};

export const handleCreateVideoClick = async ({
  createModeClips,
  uploadedMusicBackendUrl, // Added
  generatedMusicUrl,     // Added
  setErrorMessage,
  setIsCreatingVideo,
  setTaskId,
  setTaskStatus,
  fetchHistoryTasks,
  setActiveView,
  setCreateModeClips,
  setSelectedClipInTrack,
  setActiveCreateModeVideoSrc,
  t,
}) => {
  if (createModeClips.length < 2) {
    setErrorMessage(t('errorMinClipsToCreateVideo'));
    return;
  }
  setIsCreatingVideo(true);
  setErrorMessage('');

  let musicFilePath = null;
  if (uploadedMusicBackendUrl) {
    // uploadedMusicBackendUrl is a full URL like http://localhost:5001/api/user_uploaded_music/filename.mp3
    // We need to extract the relative path: /user_uploaded_music/filename.mp3
    try {
      const url = new URL(uploadedMusicBackendUrl);
      musicFilePath = url.pathname.replace('/api', ''); // Remove /api prefix if backend serves from /api/user_uploaded_music
    } catch (e) {
      console.error("Error parsing uploadedMusicBackendUrl:", e);
      // Fallback or error handling if URL is malformed
      musicFilePath = uploadedMusicBackendUrl; // Or set to null and show error
    }
  } else if (generatedMusicUrl) {
    // generatedMusicUrl is already a relative path like /music/filename.wav or /api/music/filename.wav
    // Ensure it's consistently relative to the domain root for the backend.
    // If it includes /api, remove it.
    if (generatedMusicUrl.startsWith('/api')) {
        musicFilePath = generatedMusicUrl.substring(4); // Remove /api
    } else {
        musicFilePath = generatedMusicUrl;
    }
  }
  
  console.log("Initiating video creation with clips:", createModeClips, "and music:", musicFilePath);

  try {
    await createCompositeVideo({
      clips: createModeClips,
      musicFilePath: musicFilePath, // Pass the determined music file path
      setTaskId,
      setTaskStatus,
      fetchHistoryTasks,
      setErrorMessage,
      t,
    });

    // If createCompositeVideo was successful (did not throw an error and set a new task ID)
    // The new task ID is set by createCompositeVideo via setTaskId.
    // We don't have direct access to it here unless createCompositeVideo returns it,
    // but the states (taskId, taskStatus) in App.js will be updated.
    // The polling mechanism will then take over for this new task.

    // Clear the track and reset create mode UI
    setCreateModeClips([]);
    setSelectedClipInTrack(null);
    setActiveCreateModeVideoSrc('');
    
    // Switch to dream view
    setActiveView('dream');
    
    // The new task (whose ID was set by createCompositeVideo) will become the active
    // task in the dream view due to the App.js useEffects that watch taskId.
    // No need to manually call doHandleHistoryItemClick for the new task.

  } catch (error) {
    // Error message is already set by createCompositeVideo if it throws
    // console.error('Error in handleCreateVideoClick after API call:', error);
    // setErrorMessage is already handled by createCompositeVideo
  } finally {
    setIsCreatingVideo(false);
  }
};

export const handleKeywordButtonClick = async (keywordToAdd, currentPrompt, setPrompt, refinePromptHandler) => {
  const basePrompt = currentPrompt.trim();
  const newPrompt = basePrompt ? `${basePrompt} ${keywordToAdd}` : keywordToAdd;
  setPrompt(newPrompt);
  // The refinePromptHandler is expected to be the handleRefinePrompt from api.js,
  // which needs its own set of parameters.
  // This assumes refinePromptHandler is already bound with its necessary state setters.
  await refinePromptHandler({ promptToRefine: newPrompt, buttonKey: keywordToAdd });
};

export const handleGenerateImageClick = async ({
  prompt,
  ratio, // This is the 'aspect_ratio' for the backend
  setIsGeneratingImage, // New state for image generation loading
  setGeneratedImageUrl, // New state to store the URL of the generated image
  setImageGenerationError, // New state for image generation specific errors
  t,
}) => {
  if (!prompt || !prompt.trim()) {
    setImageGenerationError(t('errorPromptRequired'));
    return;
  }
  if (!ratio) {
    setImageGenerationError(t('errorAspectRatioRequired')); // Or handle default
    return;
  }

  setIsGeneratingImage(true);
  setGeneratedImageUrl('');
  setImageGenerationError('');

  try {
    const result = await generateImage({ // Using the imported function
      prompt,
      aspectRatio: ratio, // Pass 'ratio' from UI as 'aspectRatio'
      t,
    });
    // result contains { image_url: "...", filename: "..." }
    // The image_url from backend is relative like /api/uploads/filename.png
    // Prepend BACKEND_URL to make it absolute for direct use if needed,
    // or ensure the <img> src can handle relative paths correctly.
    // For now, let's assume the UI component will handle prepending BACKEND_URL if necessary.
    // The image_url from backend is relative like /api/uploads/filename.png
    // We need to construct the full URL using the origin of BACKEND_URL and this path.
    const backendOrigin = new URL(BACKEND_URL).origin;
    setGeneratedImageUrl(backendOrigin + result.image_url);
    // Example: setGeneratedImageUrl(result.image_url); // This would be if the <img> src is relative to domain
    
  } catch (error) {
    console.error('Handler error generating image:', error);
    setImageGenerationError(error.message || t('errorGenerateImageGeneric'));
  } finally {
    setIsGeneratingImage(false);
  }
};
