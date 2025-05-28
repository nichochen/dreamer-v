import { urlToImageFile } from './utils';
// Ensure STATUS_COMPLETED is imported
import { BACKEND_URL, STATUS_PENDING, STATUS_ERROR, STATUS_COMPLETED } from './constants'; 
import { createCompositeVideo } from './api'; // Import the new API function

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
      const newTrackInstanceId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const newClipInstance = { ...task, trackInstanceId: newTrackInstanceId };
      setCreateModeClips(prevClips => [...prevClips, newClipInstance]);

      // Set the active video source to the newly added clip
      setActiveCreateModeVideoSrc(`${BACKEND_URL}${newClipInstance.local_video_path}`);
      setSelectedClipInTrack(newTrackInstanceId);
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
    setModel(task.model || 'veo-2.0-generate-001');
    setRatio(task.aspect_ratio || '16:9');
    setCameraControl(task.camera_control || 'FIXED');
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
  // The check for createModeClips.length < 2 is now handled by the button's disabled state in Sidebar.js
  // However, keeping a safeguard here is good practice.
  if (createModeClips.length < 2) { 
    setErrorMessage(t('errorMinClipsToCreateVideo')); // Assuming a new translation key
    return;
  }
  setIsCreatingVideo(true);
  setErrorMessage('');
  console.log("Initiating video creation with clips:", createModeClips);

  try {
    // Call the API function. It will set taskId and taskStatus on success.
    const newCompositeTask = await createCompositeVideo({ // Assume it returns the new task_id or relevant data
      clips: createModeClips,
      setTaskId, // This will be called by createCompositeVideo
      setTaskStatus, // This will be called by createCompositeVideo
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
