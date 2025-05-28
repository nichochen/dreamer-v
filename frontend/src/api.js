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

export const fetchHistoryTasks = async (setHistoryTasks, t) => {
  try {
    const response = await fetch(`${BACKEND_URL}/tasks`);
    if (!response.ok) {
      throw new Error(t('errorFetchHistory', { statusText: response.statusText }));
    }
    const data = await response.json();
    setHistoryTasks(data);
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
  setIsLoading,
  setErrorMessage,
  setVideoGcsUri,
  setTaskStatus,
  setCompletedUriPollRetries,
  pollingIntervalId,
  setPollingIntervalId,
  setTaskId,
  fetchHistoryTasks,
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
    fetchHistoryTasks();
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
  fetchHistoryTasks,
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
        fetchHistoryTasks();
        return;
      }
      throw new Error(data.error || t('errorFetchTaskStatus', { statusText: response.statusText }));
    }

    const newStatusFromBackend = data.status;
    const currentVideoUri = data.local_video_path ? `${BACKEND_URL}${data.local_video_path}` : '';
    let finalTaskStatusToSet = taskStatus;

    if (newStatusFromBackend !== taskStatus || [STATUS_PROCESSING, STATUS_COMPLETED, STATUS_FAILED].includes(newStatusFromBackend)) {
      fetchHistoryTasks();
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
    fetchHistoryTasks();
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
  fetchHistoryTasks,
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

    fetchHistoryTasks();
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
  fetchHistoryTasks,
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
    fetchHistoryTasks();
  } catch (error) {
    console.error('Error starting video extension:', error);
    setErrorMessage(error.message || t('errorExtendVideoGeneric'));
    setTaskStatus(STATUS_ERROR);
  } finally {
    setIsExtending(false);
  }
};

export const createCompositeVideo = async ({
  clips, // Array of clip objects, e.g., { task_id: string, ... }
  setTaskId,
  setTaskStatus,
  fetchHistoryTasks,
  setErrorMessage,
  t,
}) => {
  try {
    const clipData = clips.map(clip => ({ 
      task_id: clip.task_id, 
      // Potentially include other relevant clip info if needed by backend
      // e.g., local_video_path: clip.local_video_path (though backend should derive this from task_id)
    }));

    const response = await fetch(`${BACKEND_URL}/create_composite_video`, { // Ensure this endpoint matches backend
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ clips: clipData, prompt: 'Create a short video from clips' }), // Sending task_ids and a default prompt
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || t('errorCreateCompositeVideo', { statusText: response.statusText }));
    }

    setTaskId(data.task_id); // The backend should return the new task_id for the composite video
    setTaskStatus(STATUS_PENDING); // Set status to pending for the new task
    fetchHistoryTasks(); // Refresh history to show the new task
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
