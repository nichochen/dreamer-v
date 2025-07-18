import {
  BACKEND_URL,
  HEALTH_CHECK_URL,
  STATUS_PENDING,
  STATUS_PROCESSING,
  STATUS_COMPLETED,
  STATUS_FAILED,
  STATUS_ERROR,
  STATUS_INITIALIZING,
  STATUS_COMPLETED_WAITING_URI,
} from './constants';

export const checkBackendHealth = async (setIsBackendReady, t) => {
  try {
    const response = await fetch(HEALTH_CHECK_URL);
    if (!response.ok) {
      console.error(`Backend health check failed: ${response.status} ${response.statusText}. Retrying...`);
      setTimeout(() => checkBackendHealth(setIsBackendReady, t), 5000);
      return;
    }
    const data = await response.json();
    if (data && (data.status === 'ok' || data.message === 'OK')) {
      setIsBackendReady(true);
    } else {
      console.error('Backend health check returned unexpected status. Retrying...');
      setTimeout(() => checkBackendHealth(setIsBackendReady, t), 5000);
    }
  } catch (error) {
    console.error('Backend health check failed with exception:', error, 'Retrying...');
    setIsBackendReady(false);
    setTimeout(() => checkBackendHealth(setIsBackendReady, t), 5000);
  }
};

export const handleGenerateMusicClick = async ({
  // musicPrompt, // Add if a specific prompt for music is needed
  setMusicErrorMessage,
  setMusicTaskStatus,
  // setMusicCompletedUriPollRetries, // Removed
  musicPollingIntervalId,
  setMusicPollingIntervalId,
  setMusicTaskId,
  setGeneratedMusicUrl,
  setSelectedMusicFile, // New parameter
  setUploadedMusicBackendUrl, // New parameter
  t,
}) => {
  setMusicErrorMessage('');
  setGeneratedMusicUrl(''); // Clear previous generated music URL
  setSelectedMusicFile(null); // Clear selected/uploaded file
  setUploadedMusicBackendUrl(null); // Clear its backend URL
  setMusicTaskStatus(STATUS_INITIALIZING); // Or STATUS_PENDING directly
  // setMusicCompletedUriPollRetries(0); // Removed

  if (musicPollingIntervalId) {
    clearInterval(musicPollingIntervalId);
    setMusicPollingIntervalId(null);
  }

  try {
    // For now, let's assume a simple prompt or the backend handles it.
    // If you add a music prompt input in Sidebar/App, pass it here.
    const bodyPayload = {
      prompt: "A beautiful and inspiring cinematic track with orchestral elements.", // Example prompt
      // negative_prompt: "drums", // Optional
      // seed: 12345 // Optional
    };

    const response = await fetch(`${BACKEND_URL}/generate-music`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || t('errorStartMusicGeneration', { statusText: response.statusText }));
    }

    setMusicTaskId(data.task_id);
    setMusicTaskStatus(STATUS_PENDING); // Start polling
    // No need to fetch history for music tasks separately unless you add a music history view

  } catch (error) {
    console.error('Error starting music generation:', error);
    setMusicErrorMessage(error.message || t('errorStartMusicGenerationGeneric'));
    setMusicTaskStatus(STATUS_FAILED); // Use STATUS_FAILED
  }
  // setIsGeneratingMusic(false); // Removed, as this is now derived from musicTaskStatus in App.js
};

export const pollMusicTaskStatus = async ({
  musicTaskId,
  musicTaskStatus, // Current status, useful for logic if needed
  musicPollingIntervalId, // To clear itself
  // musicCompletedUriPollRetries, // Removed
  setMusicTaskStatus,
  setGeneratedMusicUrl,
  setMusicErrorMessage,
  setMusicPollingIntervalId,
  // setMusicCompletedUriPollRetries, // Removed
  t,
  BACKEND_URL, // Passed from App.js
}) => {
  if (!musicTaskId) return;

  try {
    const response = await fetch(`${BACKEND_URL}/music-task-status/${musicTaskId}`);
    const data = await response.json();

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`Music task ${musicTaskId} not found during polling. Stopping polling.`);
        if (musicPollingIntervalId) clearInterval(musicPollingIntervalId);
        setMusicPollingIntervalId(null);
        // setMusicCompletedUriPollRetries(0); // Removed
        // No separate history for music tasks for now
        return;
      }
      throw new Error(data.error || t('errorFetchMusicTaskStatus', { statusText: response.statusText }));
    }

    const newStatusFromBackend = data.status;
    const currentMusicUrl = data.music_url_http; // Backend provides full URL or relative to /api/music/

    let finalTaskStatusToSet = musicTaskStatus; // Default to current

    if (newStatusFromBackend === STATUS_COMPLETED) {
      if (currentMusicUrl) {
        // Backend now provides music_url_http which should be relative like /api/music/filename.wav
        // So we prepend BACKEND_URL
        setGeneratedMusicUrl(currentMusicUrl); // Already includes BACKEND_URL if backend sends full path, or relative if not.
                                                 // The backend sends /api/music/..., so it's relative to BACKEND_URL.
                                                 // Let's assume it's relative and App.js constructs it, or backend sends full.
                                                 // Based on backend code, it's relative: f"/api/music/{os.path.basename(self.local_music_path)}"
                                                 // So, we should prepend BACKEND_URL.
                                                 // However, the <audio> src will be relative to the domain, so just the path is fine.
        setGeneratedMusicUrl(data.music_url_http); 
        finalTaskStatusToSet = STATUS_COMPLETED;
        setMusicErrorMessage('');
        if (musicPollingIntervalId) clearInterval(musicPollingIntervalId);
        setMusicPollingIntervalId(null);
      } else {
        // If status is completed but URL is missing, this is an unexpected state for music.
        console.error(`Music task ${musicTaskId} completed but music_url_http is missing.`);
        setGeneratedMusicUrl('');
        finalTaskStatusToSet = STATUS_FAILED; // Treat as failure
        setMusicErrorMessage(t('errorMusicTaskCompletedNoUri'));
        if (musicPollingIntervalId) clearInterval(musicPollingIntervalId);
        setMusicPollingIntervalId(null);
      }
    } else if (newStatusFromBackend === STATUS_FAILED || newStatusFromBackend === STATUS_ERROR) {
      setGeneratedMusicUrl(''); 
      finalTaskStatusToSet = newStatusFromBackend;
      setMusicErrorMessage(data.error_message || t('errorMusicTaskStatusGeneric', { status: t(newStatusFromBackend + 'Status') }));
      if (musicPollingIntervalId) clearInterval(musicPollingIntervalId);
      setMusicPollingIntervalId(null);
    } else { // Pending or Processing
      setGeneratedMusicUrl('');
      finalTaskStatusToSet = newStatusFromBackend;
      setMusicErrorMessage(data.error_message || ''); 
    }
    
    setMusicTaskStatus(finalTaskStatusToSet);

  } catch (error) {
    console.error('Error polling music task status:', error);
    setMusicErrorMessage(prev => {
      const newErrorMsg = error.message || t('errorPollMusicTaskStatusFailed');
      if (prev && prev !== t('errorPollMusicTaskStatusFailed')) return prev; 
      return newErrorMsg;
    });
    if (musicPollingIntervalId) clearInterval(musicPollingIntervalId);
    setMusicPollingIntervalId(null);
    if (musicTaskStatus !== STATUS_COMPLETED && musicTaskStatus !== STATUS_FAILED && musicTaskStatus !== STATUS_ERROR) {
      setMusicTaskStatus(STATUS_ERROR); 
    }
    // No separate history for music tasks for now
  }
};


export const getTasks = async (page = 1, setHistoryTasks, setTotalPages, t) => {
  try {
    const response = await fetch(`${BACKEND_URL}/tasks?page=${page}`);
    if (!response.ok) {
      throw new Error(t('errorFetchHistory', { statusText: response.statusText }));
    }
    const data = await response.json();
    setHistoryTasks(data.tasks);
    setTotalPages(data.total_pages);
  } catch (error) {
    console.error('Error fetching history tasks:', error);
    // Optionally set an error message for history fetching
  }
};

export const fetchUserEmail = async (setUserEmail, t) => {
  try {
    const response = await fetch(`${BACKEND_URL}/user-info`);
    if (!response.ok) {
      throw new Error(t('errorFetchUserInfo', { statusText: response.statusText }));
    }
    const data = await response.json();
    setUserEmail(data.email || '');
  } catch (error) {
    console.error('Error fetching user email:', error);
  }
};

export const handleGenerateClick = async ({
  prompt,
  model,
  ratio,
  cameraControl,
  duration,
  gcsOutputBucket,
  selectedImage,
  selectedLastImage,
  generateAudio,
  resolution,
  setIsLoading,
  setErrorMessage,
  setVideoGcsUri,
  setTaskStatus,
  setCompletedUriPollRetries,
  pollingIntervalId,
  setPollingIntervalId,
  setTaskId,
  getTasks,
  t,
}) => {
  if (!prompt.trim()) {
    setErrorMessage(t('errorPromptRequired'));
    return;
  }
  setIsLoading(true);
  setErrorMessage('');
  setVideoGcsUri('');
  setTaskStatus(STATUS_INITIALIZING);
  setCompletedUriPollRetries(0);
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
    setPollingIntervalId(null);
  }

  try {
    const payload = new FormData();
    payload.append('prompt', prompt);
    payload.append('model', model);
    payload.append('ratio', ratio);
    payload.append('camera_control', cameraControl);
    payload.append('duration', parseInt(duration, 10));
    if (gcsOutputBucket.trim()) {
      payload.append('gcs_output_bucket', gcsOutputBucket.trim());
    }
    if (selectedImage) {
      payload.append('image_file', selectedImage);
    }
    if (selectedLastImage) {
      payload.append('last_frame_file', selectedLastImage);
    }
    payload.append('generateAudio', generateAudio);
    if (resolution) {
      payload.append('resolution', resolution);
    }

    const response = await fetch(`${BACKEND_URL}/generate-video`, {
      method: 'POST',
      body: payload,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || t('errorStartGeneration', { statusText: response.statusText }));
    }
    setTaskId(data.task_id);
    setTaskStatus(STATUS_PENDING);
    getTasks();
  } catch (error) {
    console.error('Error starting video generation:', error);
    setErrorMessage(error.message || t('errorStartGenerationGeneric'));
    setTaskStatus(STATUS_ERROR);
  } finally {
    setIsLoading(false);
  }
};

export const pollTaskStatus = async ({
  taskId,
  taskStatus,
  pollingIntervalId,
  completedUriPollRetries,
  getTasks,
  setTaskStatus,
  setVideoGcsUri,
  setErrorMessage,
  setPollingIntervalId,
  setCompletedUriPollRetries,
  setPrompt,
  setModel,
  setRatio,
  setCameraControl,
  setDuration,
  setResolution,
  setGcsOutputBucket,
  t,
}) => {
  if (!taskId) return;

  try {
    const response = await fetch(`${BACKEND_URL}/task-status/${taskId}`);
    const data = await response.json();

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`Task ${taskId} not found during polling. Stopping polling.`);
        if (pollingIntervalId) clearInterval(pollingIntervalId);
        setPollingIntervalId(null);
        setCompletedUriPollRetries(0);
        getTasks();
        return;
      }
      throw new Error(data.error || t('errorFetchTaskStatus', { statusText: response.statusText }));
    }

    const newStatusFromBackend = data.status;
    const currentVideoUri = data.local_video_path ? `${BACKEND_URL}${data.local_video_path}` : '';
    let finalTaskStatusToSet = taskStatus;

    if (newStatusFromBackend !== taskStatus || [STATUS_PROCESSING, STATUS_COMPLETED, STATUS_FAILED].includes(newStatusFromBackend)) {
      getTasks();
    }

    if (newStatusFromBackend === STATUS_COMPLETED) {
      if (currentVideoUri) {
        setVideoGcsUri(currentVideoUri);
        finalTaskStatusToSet = STATUS_COMPLETED;
        setErrorMessage('');
        if (pollingIntervalId) clearInterval(pollingIntervalId);
        setPollingIntervalId(null);
        setCompletedUriPollRetries(0);
      } else {
        setVideoGcsUri('');
        if (completedUriPollRetries < 3) {
          setCompletedUriPollRetries(prev => prev + 1);
          finalTaskStatusToSet = STATUS_COMPLETED_WAITING_URI;
          setErrorMessage('');
        } else {
          finalTaskStatusToSet = STATUS_FAILED;
          setErrorMessage(t('errorTaskCompletedNoUri'));
          if (pollingIntervalId) clearInterval(pollingIntervalId);
          setPollingIntervalId(null);
          setCompletedUriPollRetries(0);
        }
      }
    } else if (newStatusFromBackend === STATUS_FAILED || newStatusFromBackend === STATUS_ERROR) {
      setVideoGcsUri(currentVideoUri);
      finalTaskStatusToSet = newStatusFromBackend;
      setErrorMessage(data.error_message || t('errorTaskStatusGeneric', { status: t(newStatusFromBackend + 'Status') }));
      if (pollingIntervalId) clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
      setCompletedUriPollRetries(0);
    } else {
      setVideoGcsUri(currentVideoUri);
      finalTaskStatusToSet = newStatusFromBackend;
      setErrorMessage(data.error_message || '');
      setCompletedUriPollRetries(0);
    }
    
    setTaskStatus(finalTaskStatusToSet);

    if (finalTaskStatusToSet === STATUS_COMPLETED || finalTaskStatusToSet === STATUS_FAILED) {
      setPrompt(data.prompt);
      setModel(data.model || 'veo-2.0-generate-001');
      setRatio(data.aspect_ratio || '16:9');
      setCameraControl(data.camera_control || 'FIXED');
      setDuration(data.duration_seconds || 5);
      setResolution(data.resolution || '');
      setGcsOutputBucket(data.gcs_output_bucket || '');
    }

  } catch (error) {
    console.error('Error polling task status:', error);
    setErrorMessage(prev => {
      const newErrorMsg = error.message || t('errorPollTaskStatusFailed');
      if (prev && prev !== t('errorPollTaskStatusFailed')) return prev;
      return newErrorMsg;
    });
    if (pollingIntervalId) clearInterval(pollingIntervalId);
    setPollingIntervalId(null);
    setCompletedUriPollRetries(0);
    if (taskStatus !== STATUS_COMPLETED && taskStatus !== STATUS_FAILED && taskStatus !== STATUS_ERROR) {
      setTaskStatus(STATUS_ERROR);
    }
    getTasks();
  }
};

export const handleDeleteTask = async ({
  idToDelete,
  taskId,
  activeView,
  createModeClips,
  selectedClipInTrack,
  setIsLoading,
  setPrompt,
  setModel,
  setRatio,
  setCameraControl,
  setDuration,
  setGcsOutputBucket,
  setTaskId,
  setTaskStatus,
  setVideoGcsUri,
  setErrorMessage,
  setSelectedImage,
  setImagePreview,
  setSelectedLastImage,
  setLastImagePreview,
  setCreateModeClips,
  setActiveCreateModeVideoSrc,
  setSelectedClipInTrack,
  getTasks,
  t,
}) => {
  if (!idToDelete) return;
  if (!window.confirm(t('confirmDeleteTaskMessage', { taskId: idToDelete }))) {
    return;
  }

  setIsLoading(true);
  try {
    const response = await fetch(`${BACKEND_URL}/task/${idToDelete}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || t('errorDeleteTask', { statusText: response.statusText }));
    }
    
    if (taskId === idToDelete && activeView === 'dream') {
      setPrompt('');
      setModel('veo-2.0-generate-001');
      setRatio('16:9');
      setCameraControl('FIXED');
      setDuration(5);
      setGcsOutputBucket('');
      setTaskId(null);
      setTaskStatus('');
      setVideoGcsUri('');
      setErrorMessage('');
      setSelectedImage(null);
      setImagePreview('');
      setSelectedLastImage(null);
      setLastImagePreview('');
    }
    
    const clipWasSelected = createModeClips.find(clip => clip.trackInstanceId === selectedClipInTrack && clip.task_id === idToDelete);
    setCreateModeClips(prevClips => prevClips.filter(clip => clip.task_id !== idToDelete));
    if (clipWasSelected) {
      setActiveCreateModeVideoSrc('');
      setSelectedClipInTrack(null);
    }

    getTasks();
    alert(t('taskDeletedSuccessMessage'));
  } catch (error) {
    console.error('Error deleting task:', error);
    setErrorMessage(error.message || t('errorDeleteTaskGeneric'));
  } finally {
    setIsLoading(false);
  }
};

export const handleRefinePrompt = async ({
  promptToRefine,
  currentPrompt,
  isRefining,
  setIsRefining,
  setActiveSpinnerButtonKey,
  setErrorMessage,
  setPrompt,
  buttonKey = null,
  t,
}) => {
  const currentPromptValue = promptToRefine || currentPrompt;

  if (!currentPromptValue.trim() || isRefining) {
    if (!currentPromptValue.trim() && !promptToRefine) {
      setErrorMessage(t('refinePromptEmptyError'));
    }
    return;
  }
  setIsRefining(true);
  if (buttonKey) setActiveSpinnerButtonKey(buttonKey);
  setErrorMessage('');

  try {
    const response = await fetch(`${BACKEND_URL}/refine-prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: currentPromptValue }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || t('errorRefinePrompt', { statusText: response.statusText }));
    }
    if (data.refined_prompt) {
      setPrompt(data.refined_prompt);
    } else {
      if (promptToRefine && promptToRefine !== currentPrompt) {
        setPrompt(promptToRefine);
      } else if (!data.refined_prompt) {
        console.warn("Refined prompt not found in response, and no override prompt provided.");
      }
    }
  } catch (error) {
    console.error('Error refining prompt:', error);
    setErrorMessage(error.message || t('errorRefinePromptGeneric'));
  } finally {
    setIsRefining(false);
    setActiveSpinnerButtonKey('');
  }
};

export const handleExtendVideoClick = async ({
  taskIdToExtend,
  isExtending,
  setIsExtending,
  setErrorMessage,
  pollingIntervalId,
  setPollingIntervalId,
  currentTaskId,
  setTaskId,
  setActiveView,
  setTaskStatus,
  getTasks,
  t,
}) => {
  if (!taskIdToExtend || isExtending) {
    return;
  }
  setIsExtending(true);
  setErrorMessage('');
  
  if (pollingIntervalId && currentTaskId !== taskIdToExtend) {
    clearInterval(pollingIntervalId);
    setPollingIntervalId(null);
  }

  try {
    const payload = new FormData(); // Empty payload as per original
    const response = await fetch(`${BACKEND_URL}/extend-video/${taskIdToExtend}`, {
      method: 'POST',
      body: payload,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || t('errorExtendVideo', { statusText: response.statusText }));
    }
    
    setTaskId(data.task_id);
    setActiveView('dream');
    setTaskStatus(STATUS_PENDING);
    getTasks();
  } catch (error) {
    console.error('Error starting video extension:', error);
    setErrorMessage(error.message || t('errorExtendVideoGeneric'));
    setTaskStatus(STATUS_ERROR);
  } finally {
    setIsExtending(false);
  }
};

export const uploadMusicFile = async (musicFile, t) => {
  const formData = new FormData();
  formData.append('music_file', musicFile);

  try {
    const response = await fetch(`${BACKEND_URL}/upload_music`, {
      method: 'POST',
      body: formData,
      // Note: 'Content-Type' header is not set manually for FormData with fetch.
      // The browser will set it correctly to 'multipart/form-data' with the boundary.
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle specific error for file too large (413)
      if (response.status === 413) {
        throw new Error(data.error || t('errorMusicFileTooLargeAPI', { message: `Maximum size: ${10}MB` })); // Assuming 10MB from backend
      }
      throw new Error(data.error || t('errorUploadMusicFile', { statusText: response.statusText }));
    }

    if (data.filePath) {
      return data.filePath; // This will be like "/api/user_uploaded_music/filename.mp3"
    } else {
      throw new Error(t('errorUploadMusicFileNoPath'));
    }
  } catch (error) {
    console.error('Error uploading music file:', error);
    // Re-throw the error so the calling handler can manage UI state (e.g., setErrorMessage)
    throw error;
  }
};

export const createCompositeVideo = async ({
  clips, 
  musicFilePath, // New parameter for the music file path
  setTaskId,
  setTaskStatus,
  getTasks,
  setErrorMessage,
  t,
}) => {
  try {
    const clipData = clips.map(clip => ({
      task_id: clip.task_id,
      start_offset_seconds: clip.start_offset_seconds,
      duration_seconds: clip.duration_seconds,
    }));

    const payload = {
      clips: clipData,
      prompt: 'Composite video from clips', // Default prompt or make it configurable
    };

    if (musicFilePath) {
      payload.music_file_path = musicFilePath.replace('/api', ''); // Remove '/api' prefix if needed
    }

    const response = await fetch(`${BACKEND_URL}/create_composite_video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || t('errorCreateCompositeVideo', { statusText: response.statusText }));
    }

    setTaskId(data.task_id); // The backend should return the new task_id for the composite video
    setTaskStatus(STATUS_PENDING); // Set status to pending for the new task
    getTasks(); // Refresh history to show the new task
    setErrorMessage(''); // Clear any previous errors
    // No need to alert here, the UI will update based on task status polling

  } catch (error) {
    console.error('Error creating composite video:', error);
    setErrorMessage(error.message || t('errorCreateCompositeVideoGeneric'));
    // Optionally set a specific error status if needed, or let polling handle it
    // setTaskStatus(STATUS_ERROR); 
    // Re-throw or handle as appropriate if the caller needs to know about the error beyond the message
    throw error; // Re-throwing so the caller (handleCreateVideoClick) can catch it for setIsCreatingVideo(false)
  }
};

export const generateImage = async ({
  prompt,
  aspectRatio, // Renamed from ratio to match backend expectation more clearly
  t,
}) => {
  if (!prompt || !prompt.trim()) {
    throw new Error(t('errorPromptRequired'));
  }
  if (!aspectRatio) {
    throw new Error(t('errorAspectRatioRequired')); // Or provide a default if appropriate
  }

  console.log(`Attempting to generate image with prompt: ${prompt} ratio: ${aspectRatio}`); // For debugging

  try {
    const payload = {
      prompt: prompt,
      aspect_ratio: aspectRatio,
    };

    const response = await fetch(`${BACKEND_URL}/generate_image`, { // Corrected endpoint
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || t('errorGenerateImage', { statusText: response.statusText }));
    }

    if (data.image_url) {
      return data; // Returns { image_url: "...", filename: "..." }
    } else {
      throw new Error(t('errorGenerateImageNoUrl'));
    }
  } catch (error) {
    console.error('Error generating image:', error);
    // Re-throw the error so the calling handler can manage UI state
    throw error;
  }
};

export const updateTaskStatus = async (taskId, status, errorMessage) => {
  try {
    const response = await fetch(`${BACKEND_URL}/task-status/${taskId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status, error_message: errorMessage }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to update task status: ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Error updating task ${taskId} status:`, error);
  }
};
