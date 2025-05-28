import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css'; // Keep App.css for any custom styles not covered by Bootstrap
import { useTranslation } from 'react-i18next';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '/api';
const HEALTH_CHECK_URL = `${BACKEND_URL}/health`;

// Helper function to fetch an image URL and convert it to a File object
async function urlToImageFile(url, filename, defaultMimeType = 'image/jpeg') {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch image from ${url}: ${response.statusText}`);
      return null;
    }
    const blob = await response.blob();
    // Ensure filename has an extension, otherwise File constructor might strip it or behave unexpectedly
    const finalFilename = filename || `image_from_url.${blob.type.split('/')[1] || defaultMimeType.split('/')[1]}`;
    return new File([blob], finalFilename, { type: blob.type || defaultMimeType });
  } catch (error) {
    console.error(`Error fetching or converting image from ${url}:`, error);
    return null;
  }
}

function App() {
  const { t, i18n } = useTranslation();

  // Canonical task statuses
  const STATUS_PENDING = 'pending';
  const STATUS_PROCESSING = 'processing';
  const STATUS_COMPLETED = 'completed';
  const STATUS_FAILED = 'failed';
  const STATUS_ERROR = 'error'; // Can come from backend or be set client-side
  const STATUS_INITIALIZING = 'initializing'; // Custom UI state before backend task creation
  const STATUS_COMPLETED_WAITING_URI = 'completed_waiting_uri'; // Custom UI state when backend says 'completed' but URI is missing

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  const [prompt, setPrompt] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [selectedLastImage, setSelectedLastImage] = useState(null); // New state for last frame image
  const [lastImagePreview, setLastImagePreview] = useState(''); // New state for last frame image preview
  const [showImageModal, setShowImageModal] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState('');
  const [model, setModel] = useState('veo-2.0-generate-001'); // Default model
  const [ratio, setRatio] = useState('16:9'); // Default ratio
  const [cameraControl, setCameraControl] = useState('FIXED'); // Default camera control
  const [duration, setDuration] = useState(5); // Default duration in seconds, changed to 5
  const [gcsOutputBucket, setGcsOutputBucket] = useState(''); // GCS output bucket
  const [theme, setTheme] = useState('dark'); // 'light' or 'dark' - Defaulted to dark
  const [videoHeight, setVideoHeight] = useState(750); // Default height in pixels
  const [isResizing, setIsResizing] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startHeight, setStartHeight] = useState(0);
  const [userEmail, setUserEmail] = useState(''); // New state for user email
  const [showUserDropdown, setShowUserDropdown] = useState(false); // New state for user dropdown visibility

  const [taskId, setTaskId] = useState(null);
  const [taskStatus, setTaskStatus] = useState('');
  const [videoGcsUri, setVideoGcsUri] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pollingIntervalId, setPollingIntervalId] = useState(null);
  const [historyTasks, setHistoryTasks] = useState([]);
  const [historyFilter, setHistoryFilter] = useState(''); // New state for history filter
  const [isRefining, setIsRefining] = useState(false); // New state for refine button loading
  const [activeSpinnerButtonKey, setActiveSpinnerButtonKey] = useState(''); // New state for specific spinning button
  const [isExtending, setIsExtending] = useState(false); // New state for extend button loading
  const [completedUriPollRetries, setCompletedUriPollRetries] = useState(0); // For retrying URI fetch on completion
  const [activeView, setActiveView] = useState('dream'); // 'dream' or 'create'
  const [createModeClips, setCreateModeClips] = useState([]); // For "Create" mode video track
  const [activeCreateModeVideoSrc, setActiveCreateModeVideoSrc] = useState(''); // For "Create" mode main player
  const [selectedClipInTrack, setSelectedClipInTrack] = useState(null); // To highlight selected clip in track (will store trackInstanceId)
  const [isCreatingVideo, setIsCreatingVideo] = useState(false); // New state for "Create Video" button loading
  const [hoveredHistoryTaskId, setHoveredHistoryTaskId] = useState(null); // For history item hover effect in Create mode


  // State for backend readiness
  const [isBackendReady, setIsBackendReady] = useState(false);
  // backendError state is removed as per feedback to always show loading and keep polling.

  const videoRef = useRef(null); // Ref for the video element
  const createModeVideoRef = useRef(null); // Ref for the create mode video player
  const videoContainerRef = useRef(null); // Ref for the video container div that will be resized
  const imagePreviewRef = useRef(null); // Ref for the image preview div
  const fileInputRef = useRef(null); // Ref for the file input element
  const lastImagePreviewRef = useRef(null); // New ref for last image preview
  const lastFileInputRef = useRef(null); // New ref for last image file input
  const userDropdownRef = useRef(null); // Ref for user dropdown

  const [activeImageTab, setActiveImageTab] = useState('first'); // 'first' or 'last'

  const handleImagePreviewClick = (imageUrl) => {
    setModalImageUrl(imageUrl);
    setShowImageModal(true);
  };

  const handlePasteFromClipboard = async (target) => {
    try {
      const permission = await navigator.permissions.query({ name: 'clipboard-read' });
      if (permission.state === 'denied') {
        throw new Error('Clipboard read permission denied.');
      }
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const extension = type.split('/')[1] || 'png'; // Default to png if subtype is missing
            const filename = `pasted_image.${extension}`;
            const file = new File([blob], filename, { type: blob.type });

            const reader = new FileReader();
            reader.onloadend = () => {
              if (target === 'first') {
                setSelectedImage(file); // Set as File object
                setImagePreview(reader.result);
              } else if (target === 'last') {
                setSelectedLastImage(file); // Set as File object
                setLastImagePreview(reader.result);
              }
            };
            reader.readAsDataURL(blob); // Still use blob for preview generation
            return; // Found and processed an image
          }
        }
      }
      // If no image is found after checking all items
      setErrorMessage(t('errorNoImageOnClipboard'));
    } catch (err) {
      console.error('Failed to read image from clipboard:', err);
      // setErrorMessage(`Failed to paste image: ${err.message}. Try Ctrl+V/Cmd+V directly, or use the upload button.`);
    }
  };

  const checkBackendHealth = useCallback(async () => {
    try {
      const response = await fetch(HEALTH_CHECK_URL);
      if (!response.ok) {
        // Don't throw, just log and schedule a retry
        console.error(`Backend health check failed: ${response.status} ${response.statusText}. Retrying...`);
        setTimeout(checkBackendHealth, 5000); // Retry after 5 seconds
        return;
      }
      const data = await response.json();
      if (data && (data.status === 'ok' || data.message === 'OK')) {
        setIsBackendReady(true);
        // No need to setBackendError('') as it's removed
      } else {
        // Backend responded but with unexpected status
        console.error('Backend health check returned unexpected status. Retrying...');
        setTimeout(checkBackendHealth, 5000); // Retry after 5 seconds
      }
    } catch (error) {
      console.error('Backend health check failed with exception:', error, 'Retrying...');
      // Ensure it's false on error and schedule a retry
      setIsBackendReady(false); 
      setTimeout(checkBackendHealth, 5000); // Retry after 5 seconds
    }
  }, []); // No dependencies that change, so useCallback is fine. setIsBackendReady is stable.

  useEffect(() => {
    if (!isBackendReady) { // Only start health check if backend is not ready
      checkBackendHealth();
    }
  }, [isBackendReady, checkBackendHealth]); // Rerun if isBackendReady changes (e.g. from false to true)

  const fetchHistoryTasks = useCallback(async () => {
    if (!isBackendReady) return; // Don't fetch if backend isn't ready
    try {
      const response = await fetch(`${BACKEND_URL}/tasks`);
      if (!response.ok) {
        throw new Error(`Failed to fetch history: ${response.statusText}`);
      }
      const data = await response.json();
      setHistoryTasks(data);
    } catch (error) {
      console.error('Error fetching history tasks:', error);
      // Optionally set an error message for history fetching
    }
  }, [isBackendReady, BACKEND_URL]); // Added isBackendReady and BACKEND_URL

  useEffect(() => {
    if (isBackendReady) { // Only fetch history if backend is ready
      fetchHistoryTasks();
    }
  }, [isBackendReady, fetchHistoryTasks]); // Re-run when isBackendReady or fetchHistoryTasks changes

  useEffect(() => {
    const fetchUserEmail = async () => {
      if (!isBackendReady) return;
      try {
        const response = await fetch(`${BACKEND_URL}/user-info`);
        if (!response.ok) {
          throw new Error(`Failed to fetch user info: ${response.statusText}`);
        }
        const data = await response.json();
        setUserEmail(data.email || '');
      } catch (error) {
        console.error('Error fetching user email:', error);
        // Optionally set an error message or leave email empty
      }
    };

    if (isBackendReady) {
      fetchUserEmail();
    }
  }, [isBackendReady, BACKEND_URL]); // Added isBackendReady and BACKEND_URL

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme);
  }, [theme]);

  useEffect(() => {
    // Existing logic for camera control and duration
    if (model === 'veo-2.0-generate-001') {
      setCameraControl('FIXED');
    }
    if (model === 'veo-3.0-generate-preview' || model === 'veo-2.0-generate-exp') {
      if (duration !== 8) {
        setDuration(8);
      }
    } else {
      if (![5, 6, 7, 8].includes(duration)) {
        setDuration(5);
      }
    }

    // New logic for veo-3.0-generate-preview limitations
    const VEO_3_PREVIEW_MODEL = 'veo-3.0-generate-preview';
    if (model === VEO_3_PREVIEW_MODEL) {
      // Limitation: No last frame image
      if (selectedLastImage) {
        // Assuming clearLastImagePreview is stable and correctly clears state
        clearLastImagePreview();
      }
      // If the "Last Frame" tab is active and this model is selected, switch to "First Frame"
      // This prevents being "stuck" on a disabled tab.
      if (activeImageTab === 'last') {
        setActiveImageTab('first');
      }

      // Limitation: No 9:16 aspect ratio
      if (ratio === '9:16') {
        setRatio('16:9'); // Default to 16:9
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, duration, selectedLastImage, ratio, activeImageTab, setCameraControl, setDuration, setRatio, setActiveImageTab]); // Added setters to dependency array as per exhaustive-deps, clearLastImagePreview is defined in scope

  const handleMouseDownResize = (e) => {
    setIsResizing(true);
    setStartY(e.clientY);
    setStartHeight(videoHeight);
    // Prevent text selection during drag
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMoveResize = (e) => {
      if (!isResizing) return;
      const deltaY = e.clientY - startY;
      let newHeight = startHeight + deltaY;
      // Clamp height between min and max values
      newHeight = Math.max(200, Math.min(newHeight, 800));
      setVideoHeight(newHeight);
    };

    const handleMouseUpResize = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMoveResize);
      document.addEventListener('mouseup', handleMouseUpResize);
    } else {
      document.removeEventListener('mousemove', handleMouseMoveResize);
      document.removeEventListener('mouseup', handleMouseUpResize);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMoveResize);
      document.removeEventListener('mouseup', handleMouseUpResize);
    };
  }, [isResizing, startY, startHeight]);


  useEffect(() => {
    const pasteHandler = (event) => {
      const items = (event.clipboardData || event.originalEvent.clipboardData)?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            event.preventDefault(); // Prevent default for any image type item
            const blob = items[i].getAsFile();
            if (blob) {
              setSelectedImage(blob);
              const reader = new FileReader();
              reader.onloadend = () => {
                setImagePreview(reader.result);
              };
              reader.readAsDataURL(blob);
              return; // Successfully processed
            } else {
              console.warn('Pasted image data (first frame) could not be processed. Try saving the image as a file and uploading it.', items[i]);
            }
          }
        }
      }
    };

    const previewElement = imagePreviewRef.current;
    if (previewElement) {
      previewElement.addEventListener('paste', pasteHandler);
    }

    return () => {
      if (previewElement) {
        previewElement.removeEventListener('paste', pasteHandler);
      }
    };
  }, []); // Empty dependency array means this effect runs once on mount and cleans up on unmount

  useEffect(() => {
    const pasteHandlerLast = (event) => {
      const items = (event.clipboardData || event.originalEvent.clipboardData)?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            event.preventDefault(); // Prevent default for any image type item
            const blob = items[i].getAsFile();
            if (blob) {
              setSelectedLastImage(blob);
              const reader = new FileReader();
              reader.onloadend = () => {
                setLastImagePreview(reader.result);
              };
              reader.readAsDataURL(blob);
              return; // Successfully processed
            } else {
              console.warn('Pasted image data (last frame) could not be processed. Try saving the image as a file and uploading it.', items[i]);
            }
          }
        }
      }
    };

    const previewElementLast = lastImagePreviewRef.current;
    if (previewElementLast) {
      previewElementLast.addEventListener('paste', pasteHandlerLast);
    }

    return () => {
      if (previewElementLast) {
        previewElementLast.removeEventListener('paste', pasteHandlerLast);
      }
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [userDropdownRef]);


  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const handlePromptChange = (event) => {
    setPrompt(event.target.value);
  };

  const handleImageChange = (event) => {
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
      fileInputRef.current.value = null; // Reset the file input
    }
  }
};

  const handleLastImageChange = (event) => {
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
        lastFileInputRef.current.value = null; // Reset the file input
      }
    }
  };

  const clearImagePreview = () => {
    setSelectedImage(null);
    setImagePreview('');
    if (fileInputRef.current) {
      fileInputRef.current.value = null; // Reset the file input so the same file can be re-selected
    }
  };

  const clearLastImagePreview = () => {
    setSelectedLastImage(null);
    setLastImagePreview('');
    if (lastFileInputRef.current) {
      lastFileInputRef.current.value = null; // Reset the file input so the same file can be re-selected
    }
  };

  const handleGenerateClick = async () => {
    if (!prompt.trim()) {
      setErrorMessage(t('errorPromptRequired'));
      return;
    }
    setIsLoading(true);
    setErrorMessage('');
    setVideoGcsUri('');
    setTaskStatus(STATUS_INITIALIZING);
    setCompletedUriPollRetries(0); // Reset retries for new task
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
    }

    try {
      const payload = new FormData();
      payload.append('prompt', prompt);
      payload.append('model', model);
      payload.append('ratio', ratio);
      payload.append('camera_control', cameraControl); // Add camera control to payload
      payload.append('duration', parseInt(duration, 10));
      if (gcsOutputBucket.trim()) {
        payload.append('gcs_output_bucket', gcsOutputBucket.trim());
      }
      if (selectedImage) {
        payload.append('image_file', selectedImage);
      }
      if (selectedLastImage) {
        payload.append('last_frame_file', selectedLastImage); // Corrected key
      }

      const response = await fetch(`${BACKEND_URL}/generate-video`, {
        method: 'POST',
        body: payload, // FormData sets Content-Type automatically
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Failed to start generation: ${response.statusText}`);
      }
      setTaskId(data.task_id);
      setTaskStatus(STATUS_PENDING); // Initial status after task creation
      fetchHistoryTasks(); // Refresh history after new task
    } catch (error) {
      console.error('Error starting video generation:', error);
      setErrorMessage(error.message || 'Failed to start video generation.');
      setTaskStatus(STATUS_ERROR);
    } finally {
      setIsLoading(false);
    }
  };

  const pollTaskStatus = useCallback(async () => {
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
        throw new Error(data.error || `Failed to fetch task status: ${response.statusText}`);
      }

      const newStatusFromBackend = data.status;
      const currentVideoUri = data.local_video_path ? `${BACKEND_URL}${data.local_video_path}` : '';
      let finalTaskStatusToSet = taskStatus; // Start with current status, will be updated

      // Always update history if backend status changed or it's a significant state
      if (newStatusFromBackend !== taskStatus || [STATUS_PROCESSING, STATUS_COMPLETED, STATUS_FAILED].includes(newStatusFromBackend)) {
        fetchHistoryTasks();
      }

      if (newStatusFromBackend === STATUS_COMPLETED) {
        if (currentVideoUri) {
          // Backend says completed AND URI is available
          setVideoGcsUri(currentVideoUri);
          finalTaskStatusToSet = STATUS_COMPLETED;
          setErrorMessage(''); // Clear any previous error/waiting message
          if (pollingIntervalId) clearInterval(pollingIntervalId);
          setPollingIntervalId(null);
          setCompletedUriPollRetries(0);
        } else {
          // Backend says completed, but NO URI yet.
          setVideoGcsUri(''); // Ensure URI is cleared
          if (completedUriPollRetries < 3) {
            setCompletedUriPollRetries(prev => prev + 1);
            finalTaskStatusToSet = STATUS_COMPLETED_WAITING_URI; // Explicit status for this state
            setErrorMessage(''); // Clear other errors, specific message will be in UI for this status
          } else {
            // Retries exhausted for URI
            finalTaskStatusToSet = STATUS_FAILED;
            setErrorMessage(t('errorTaskCompletedNoUri'));
            if (pollingIntervalId) clearInterval(pollingIntervalId);
            setPollingIntervalId(null);
            setCompletedUriPollRetries(0); // Reset retries as task is now failed
          }
        }
      } else if (newStatusFromBackend === STATUS_FAILED || newStatusFromBackend === STATUS_ERROR) {
        setVideoGcsUri(currentVideoUri); // Update URI if any
        finalTaskStatusToSet = newStatusFromBackend; // newStatusFromBackend is already canonical "failed" or "error"
        setErrorMessage(data.error_message || t('errorTaskStatusGeneric', { status: t(newStatusFromBackend + 'Status') }));
        if (pollingIntervalId) clearInterval(pollingIntervalId);
        setPollingIntervalId(null);
        setCompletedUriPollRetries(0);
      } else { // 'pending' or 'processing' from backend (already canonical)
        setVideoGcsUri(currentVideoUri); // Update URI if any
        finalTaskStatusToSet = newStatusFromBackend;
        setErrorMessage(data.error_message || ''); 
        setCompletedUriPollRetries(0); // Reset retries as task is not 'completed_missing_uri'
      }
      
      // Set the determined status
      setTaskStatus(finalTaskStatusToSet);

      // Update form fields if task is now in a final state (completed or failed)
      // This uses finalTaskStatusToSet to ensure consistency with what was just set in UI state.
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
      // Preserve existing error message if one is already shown, unless it's a new distinct error.
      setErrorMessage(prev => {
        const newErrorMsg = error.message || t('errorPollTaskStatusFailed');
        // Avoid overwriting a more specific error with a generic poll failure message
        // if prev exists and is not the generic one.
        if (prev && prev !== t('errorPollTaskStatusFailed')) return prev;
        return newErrorMsg;
      });
      if (pollingIntervalId) clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
      setCompletedUriPollRetries(0);
      // Consider setting taskStatus to 'error' here if not already a final state
      if (taskStatus !== STATUS_COMPLETED && taskStatus !== STATUS_FAILED && taskStatus !== STATUS_ERROR) { // ensure it's not already error
        setTaskStatus(STATUS_ERROR);
      }
      fetchHistoryTasks();
    }
  }, [
    taskId, taskStatus, pollingIntervalId, completedUriPollRetries, // Core dependencies for logic
    fetchHistoryTasks, BACKEND_URL, t, // Stable functions/configs
    // Setters are stable
    setTaskStatus, setVideoGcsUri, setErrorMessage, setPollingIntervalId, setCompletedUriPollRetries,
    setPrompt, setModel, setRatio, setCameraControl, setDuration, setGcsOutputBucket
  ]);

  useEffect(() => {
    // Condition to START or CONTINUE polling
    if (taskId &&
        (taskStatus === STATUS_PENDING || taskStatus === STATUS_PROCESSING || taskStatus === STATUS_INITIALIZING ||
         (taskStatus === STATUS_COMPLETED_WAITING_URI) || // Explicitly check for waiting URI status
         (taskStatus === STATUS_COMPLETED && !videoGcsUri && completedUriPollRetries < 3) // Original logic for completed but no URI
        )
       ) {
      if (!pollingIntervalId) { // Only start a new interval if one isn't already running
        const intervalId = setInterval(pollTaskStatus, 5000);
        setPollingIntervalId(intervalId);
      }
    } else if (pollingIntervalId) {
      // Conditions to STOP polling are implicitly handled by pollTaskStatus clearing its own intervalId
      // This else-if can be a safeguard or removed if pollTaskStatus is fully reliable.
      // For now, let pollTaskStatus manage clearing. If taskStatus is terminal and pollingId still exists, clear it.
      if ( (taskStatus === STATUS_COMPLETED && (videoGcsUri || completedUriPollRetries >=3)) ||
           taskStatus === STATUS_FAILED ||
           taskStatus === STATUS_ERROR
         ) {
         clearInterval(pollingIntervalId);
         setPollingIntervalId(null);
      }
    }

    // Cleanup function for when component unmounts or critical dependencies change,
    // ensuring no lingering intervals.
    return () => {
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        // setPollingIntervalId(null); // Avoid setting state in cleanup if component is unmounting
      }
    };
  }, [taskId, taskStatus, videoGcsUri, completedUriPollRetries, pollTaskStatus, pollingIntervalId, t]);

  useEffect(() => {
    // Autoplay video when a completed task's video becomes available
    // This is triggered when a history item is clicked and states are updated
    if (videoRef.current && videoGcsUri && taskStatus === STATUS_COMPLETED && activeView === 'dream') {
      videoRef.current.load(); // Ensure the new source is loaded
      videoRef.current.play().catch(error => {
        console.warn("Video autoplay failed:", error);
        // Autoplay might be blocked by browser policies.
        // The 'controls' attribute allows manual play.
      });
    }
    if (createModeVideoRef.current && activeCreateModeVideoSrc && activeView === 'create') {
      createModeVideoRef.current.load();
      createModeVideoRef.current.play().catch(error => console.warn("Create mode video autoplay failed:", error));
    }
  }, [videoGcsUri, taskStatus, activeCreateModeVideoSrc, activeView]); // videoRef is stable, not needed in deps

  // Effect to reconcile taskStatus with historyTasks
  useEffect(() => {
    if (taskId && historyTasks.length > 0 && activeView === 'dream') { // Only reconcile if in dream view
      const taskFromHistory = historyTasks.find(t => t.task_id === taskId);
      if (taskFromHistory) {
        const historyStatus = taskFromHistory.status;
        const historyVideoUri = taskFromHistory.local_video_path ? `${BACKEND_URL}${taskFromHistory.local_video_path}` : '';
        const historyErrorMessage = taskFromHistory.error_message || '';

        // Case 1: History has a definitive completed state with URI.
        // Update UI if it's not already reflecting this state.
        if (historyStatus === STATUS_COMPLETED && historyVideoUri) {
          if (taskStatus !== STATUS_COMPLETED || videoGcsUri !== historyVideoUri || errorMessage) {
            console.log(`Reconciling to '${STATUS_COMPLETED}' with URI from history for task ${taskId}.`);
            setTaskStatus(STATUS_COMPLETED);
            setVideoGcsUri(historyVideoUri);
            setErrorMessage(''); 
            if (pollingIntervalId) { clearInterval(pollingIntervalId); setPollingIntervalId(null); setCompletedUriPollRetries(0); }
          }
        }
        // Case 2: History has a definitive failed state.
        // Update UI if it's not already reflecting this state.
        else if (historyStatus === STATUS_FAILED) {
          const newErrorMessage = historyErrorMessage || t('errorTaskStatusGeneric', {status: t(historyStatus + 'Status')});
          if (taskStatus !== STATUS_FAILED || videoGcsUri !== historyVideoUri || errorMessage !== newErrorMessage) {
            console.log(`Reconciling to '${STATUS_FAILED}' from history for task ${taskId}.`);
            setTaskStatus(STATUS_FAILED);
            setVideoGcsUri(historyVideoUri); 
            setErrorMessage(newErrorMessage);
            if (pollingIntervalId) { clearInterval(pollingIntervalId); setPollingIntervalId(null); setCompletedUriPollRetries(0); }
          }
        }
        // Case 3: History has a definitive error state.
        // Update UI if it's not already reflecting this state.
        else if (historyStatus === STATUS_ERROR) {
            const newErrorMessage = historyErrorMessage || t('errorTaskStatusGeneric', {status: t(historyStatus + 'Status')});
            if (taskStatus !== STATUS_ERROR || videoGcsUri !== historyVideoUri || errorMessage !== newErrorMessage) {
              console.log(`Reconciling to '${STATUS_ERROR}' from history for task ${taskId}.`);
              setTaskStatus(STATUS_ERROR);
              setVideoGcsUri(historyVideoUri); 
              setErrorMessage(newErrorMessage);
              if (pollingIntervalId) { clearInterval(pollingIntervalId); setPollingIntervalId(null); setCompletedUriPollRetries(0); }
            }
        }
        // Case 4: History says 'processing' and UI is 'pending' or 'initializing'.
        // Advance UI state to 'processing'.
        else if (historyStatus === STATUS_PROCESSING && (taskStatus === STATUS_PENDING || taskStatus === STATUS_INITIALIZING)) {
            if (taskStatus !== STATUS_PROCESSING) { // Avoid redundant sets if already 'processing'
                console.log(`Reconciling from '${taskStatus}' to '${STATUS_PROCESSING}' from history for task ${taskId}.`);
                setTaskStatus(STATUS_PROCESSING);
                if (historyVideoUri && videoGcsUri !== historyVideoUri) setVideoGcsUri(historyVideoUri);
                if (historyErrorMessage && errorMessage !== historyErrorMessage) setErrorMessage(historyErrorMessage);
            }
        }
      }
    }
  }, [historyTasks, taskId, taskStatus, videoGcsUri, errorMessage, BACKEND_URL, pollingIntervalId, activeView, setTaskStatus, setVideoGcsUri, setErrorMessage, setPollingIntervalId, setCompletedUriPollRetries, t]);

  // Effect for periodic refresh of the entire history if there are ongoing tasks
  useEffect(() => {
    const hasNonFinalTasks = historyTasks.some(task => task.status === STATUS_PENDING || task.status === STATUS_PROCESSING);
    let historyRefreshIntervalId = null;

    if (hasNonFinalTasks) {
      historyRefreshIntervalId = setInterval(() => {
        fetchHistoryTasks();
      }, 10000); 
    }
    return () => {
      if (historyRefreshIntervalId) {
        clearInterval(historyRefreshIntervalId);
      }
    };
  }, [historyTasks, fetchHistoryTasks]); 

  const handleHistoryItemClick = async (task) => { 
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
    }
    setCompletedUriPollRetries(0); 

    if (activeView === 'create') {
      const newTrackInstanceId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const newClipInstance = { ...task, trackInstanceId: newTrackInstanceId };
      setCreateModeClips(prevClips => [...prevClips, newClipInstance]);

      if (newClipInstance.local_video_path) {
        setActiveCreateModeVideoSrc(`${BACKEND_URL}${newClipInstance.local_video_path}`);
        setSelectedClipInTrack(newTrackInstanceId);
      }
      // For create mode, we don't want to overwrite the main dream prompt/settings
      // We also don't want to set the global taskId, taskStatus etc. as those are for dream view.
      // We also don't want to clear image previews for dream mode.
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

  const handleDeleteTask = async (idToDelete) => {
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
        throw new Error(errorData.error || `Failed to delete task: ${response.statusText}`);
      }
      
      if (taskId === idToDelete && activeView === 'dream') { // If deleted task was the one in dream view
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
      // Remove from create mode clips if present
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
      setErrorMessage(error.message || 'Failed to delete task.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateVideoClick = async () => {
    if (createModeClips.length === 0) {
      setErrorMessage(t('errorNoClipsToCreateVideo')); // TODO: Add this translation key
      return;
    }
    setIsCreatingVideo(true);
    setErrorMessage('');
    console.log("Initiating video creation with clips:", createModeClips);
    // Placeholder for actual video creation logic
    // This would likely involve sending clip data to the backend
    // and then polling for the status of the combined video.
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      // Assume success for now, set up for a new task ID and status polling
      // setTaskId(newCombinedVideoTaskId);
      // setTaskStatus(STATUS_PENDING);
      // fetchHistoryTasks(); // Refresh history
      alert(t('createVideoInitiatedMessage')); // TODO: Add this translation key
    } catch (error) {
      console.error('Error creating video:', error);
      setErrorMessage(error.message || 'Failed to create video.');
      // setTaskStatus(STATUS_ERROR);
    } finally {
      setIsCreatingVideo(false);
    }
  };

  const handleRefinePrompt = async (promptToRefine, buttonKey = null) => {
    const currentPromptValue = promptToRefine || prompt;

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
        throw new Error(data.error || `Failed to refine prompt: ${response.statusText}`);
      }
      if (data.refined_prompt) {
        setPrompt(data.refined_prompt); 
      } else {
        if (promptToRefine && promptToRefine !== prompt) {
            setPrompt(promptToRefine);
        } else if (!data.refined_prompt) {
          console.warn("Refined prompt not found in response, and no override prompt provided.");
        }
      }
    } catch (error) {
      console.error('Error refining prompt:', error);
      setErrorMessage(error.message || 'Failed to refine prompt.');
    } finally {
      setIsRefining(false);
      setActiveSpinnerButtonKey('');
    }
  };

  const currentTask = historyTasks.find(task => task.task_id === taskId);

  const processingTaskCount = historyTasks.filter(task => task.status === 'processing').length;

  const handleKeywordButtonClick = async (keywordToAdd) => {
    const basePrompt = prompt.trim();
    const newPrompt = basePrompt ? `${basePrompt} ${keywordToAdd}` : keywordToAdd;
    setPrompt(newPrompt); 
    await handleRefinePrompt(newPrompt, keywordToAdd); 
  };

  const handleExtendVideoClick = async (taskIdToExtend) => {
    if (!taskIdToExtend || isExtending) {
      return;
    }
    setIsExtending(true);
    setErrorMessage('');
    
    if (pollingIntervalId && taskId !== taskIdToExtend) {
      clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
    }

    try {
      const payload = new FormData();
      const response = await fetch(`${BACKEND_URL}/extend-video/${taskIdToExtend}`, {
        method: 'POST',
        body: payload, 
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Failed to start video extension: ${response.statusText}`);
      }
      
      setTaskId(data.task_id); // Switch dream view to the new extension task
      setActiveView('dream'); // Ensure we are in dream view to see the new task
      setTaskStatus(STATUS_PENDING); 
      fetchHistoryTasks(); 
    } catch (error) {
      console.error('Error starting video extension:', error);
      setErrorMessage(error.message || 'Failed to start video extension.');
      setTaskStatus(STATUS_ERROR); 
    } finally {
      setIsExtending(false);
    }
  };

  const promptActionButtons = [
    { label: t("refinePromptButton"), onClick: () => handleRefinePrompt(prompt, t("refinePromptButton")), icon: "bi-stars", keywordEffect: false, disabled: !prompt.trim() },
    { label: t("nightTimeButton"), keyword: "night time", icon: "bi-moon-stars-fill", keywordEffect: true },
    { label: t("cinematicButton"), keyword: "cinematic, 8K", icon: "bi-film", keywordEffect: true },
    { label: t("animationButton"), keyword: "animation, pixar 3D style", icon: "bi-easel2", keywordEffect: true },
    { label: t("realisticButton"), keyword: "realistic", icon: "bi-camera-fill", keywordEffect: true },
    { label: t("creativeButton"), keyword: "creative", icon: "bi-lightbulb-fill", keywordEffect: true },
  ];

  return (
    <>
      {!isBackendReady ? (
        <div className={`vh-100 d-flex flex-column justify-content-center align-items-center ${theme === 'dark' ? 'bg-dark text-light' : 'bg-light text-dark'}`}>
          <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
            <span className="visually-hidden">{t('loading')}</span>
          </div>
          <h2>{t('connectingToBackend')}</h2>
          <p className={`${theme === 'dark' ? 'text-light' : 'text-muted'}`}>{t('connectingToBackendMessage')}</p>
        </div>
      ) : (
        <div className={`App d-flex flex-column vh-100 ${theme === 'dark' ? 'bg-dark text-light' : ''}`}>
          <div className={`top-toolbar ${theme === 'dark' ? 'bg-dark text-light' : 'bg-light text-dark'}`}>
            {userEmail && (
              <div className="dropdown" ref={userDropdownRef}>
                <button
                  className={`btn btn-link ${theme === 'dark' ? 'text-light' : 'text-dark'} p-0`}
                  type="button"
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  aria-expanded={showUserDropdown}
                  title={t('userInfoTitle')}
                >
                  <i className="bi bi-person-circle"></i>
                </button>
                {showUserDropdown && (
                  <ul className={`dropdown-menu dropdown-menu-end show ${theme === 'dark' ? 'dropdown-menu-dark' : ''}`} style={{position: 'absolute', inset: '0px 0px auto auto', margin: '0px', transform: 'translate(0px, 30px)', minWidth: '250px'}}>
                    <li><span className="dropdown-item-text">{userEmail}</span></li>
                  </ul>
                )}
              </div>
            )}
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                role="switch"
                id="themeSwitchToolbar"
                checked={theme === 'dark'}
                onChange={toggleTheme}
              />
              <label className="form-check-label" htmlFor="themeSwitchToolbar">
                {theme === 'dark' ? <i className="bi bi-moon-stars-fill"></i> : <i className="bi bi-sun-fill"></i>}
              </label>
            </div>
            <div className="dropdown">
              <button
                className={`btn btn-outline-secondary dropdown-toggle ${theme === 'dark' ? 'text-light border-secondary' : ''}`}
                type="button"
                id="languageDropdownButtonToolbar"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                {i18n.language === 'es' ? '🇪🇸' : (i18n.language === 'zh-CN' ? '🇨🇳' : (i18n.language === 'ja' ? '🇯🇵' : '🇺🇸'))}
              </button>
              <ul className={`dropdown-menu dropdown-menu-end ${theme === 'dark' ? 'dropdown-menu-dark' : ''}`} aria-labelledby="languageDropdownButtonToolbar">
                <li><button className="dropdown-item" type="button" onClick={() => changeLanguage('en')}>🇺🇸 English</button></li>
                <li><button className="dropdown-item" type="button" onClick={() => changeLanguage('es')}>🇪🇸 Español</button></li>
                <li><button className="dropdown-item" type="button" onClick={() => changeLanguage('zh-CN')}>🇨🇳 简体中文</button></li>
                <li><button className="dropdown-item" type="button" onClick={() => changeLanguage('ja')}>🇯🇵 日本語</button></li>
              </ul>
            </div>
          </div>

          <div className="app-body d-flex flex-grow-1"> 
            <div className={`sidebar p-3 border-end ${theme === 'dark' ? 'bg-dark text-light' : 'bg-light text-dark'}`}>
              <header className="mb-3" style={{ background: 'linear-gradient(to right, black, #b8485f)', borderRadius: '0.375rem', padding: '1rem', color: 'white' }}>
                <div className="container-fluid p-0">
                  <h1 className="h3 mb-0" style={{ color: 'white' }}><i className="bi bi-film me-2"></i>{t('appTitle')}</h1>
                  <p className="mb-0" style={{ fontSize: '0.8rem', opacity: 0.7, color: 'white' }}>{t('poweredBy')}</p>
                </div>
              </header>
              <div className="d-flex justify-content-center"> 
            <div className="custom-pill-toggle-group mb-3">
              <button
                className={`custom-pill-toggle-btn ${activeView === 'dream' ? 'active' : ''}`}
              onClick={() => setActiveView('dream')}
              type="button"
            >
              <i className="bi bi-cloud"></i>
              {t('dreamView')}
            </button>
            <button
              className={`custom-pill-toggle-btn ${activeView === 'create' ? 'active' : ''}`}
              onClick={() => setActiveView('create')}
              type="button"
            >
              <i className="bi bi-pencil-square"></i>
              {t('createView')}
            </button>
            </div>
          </div>

          {activeView === 'dream' && (
            <div className="card"> 
              <div className="card-body">
              <h3 className={`card-title h6 mb-2 ${theme === 'dark' ? 'text-light' : 'text-muted'}`}><i className="bi bi-chat-dots me-2"></i>{t('promptLabel')}</h3>
              <div className="mb-3">
                <textarea
                  className="form-control"
                  rows="4"
                  placeholder={t('promptPlaceholder')}
                  value={prompt}
                  onChange={handlePromptChange}
                  disabled={isLoading || isRefining}
                ></textarea>
                <div className="mt-2 d-flex flex-wrap">
                  {promptActionButtons.map((btn, index) => (
                    <button
                      key={index}
                      className={`btn ${theme === 'dark' ? 'btn-outline-light' : 'btn-outline-secondary'} me-1 mb-1`}
                      onClick={btn.keywordEffect ? () => handleKeywordButtonClick(btn.keyword) : btn.onClick}
                      title={btn.label}
                      style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0' }}
                      disabled={isLoading || isRefining || (btn.disabled !== undefined ? btn.disabled : false)}
                    >
                      {isRefining && activeSpinnerButtonKey === (btn.keywordEffect ? btn.keyword : btn.label) ? (
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                      ) : (
                        <i className={`bi ${btn.icon}`} style={{ fontSize: '1.1rem' }}></i>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3">
                <ul className="nav nav-tabs nav-fill mb-3">
                  <li className="nav-item">
                    <button
                      className={`nav-link ${activeImageTab === 'first' ? 'active' : ''} ${theme === 'dark' && activeImageTab !== 'first' ? 'text-light' : ''}`}
                      onClick={() => setActiveImageTab('first')}
                      type="button"
                    >
                      <i className="bi bi-image me-1"></i> {t('firstFrameTab')}
                    </button>
                  </li>
                  <li className="nav-item">
                    <button
                      className={`nav-link ${activeImageTab === 'last' ? 'active' : ''} ${theme === 'dark' && activeImageTab !== 'last' ? 'text-light' : ''}`}
                      onClick={() => setActiveImageTab('last')}
                      type="button"
                      disabled={model === 'veo-3.0-generate-preview'}
                      title={model === 'veo-3.0-generate-preview' ? t('lastFrameNotSupportedTooltip') : t('selectLastFrameImageTooltip')}
                    >
                      <i className="bi bi-image-alt me-1"></i> {t('lastFrameTab')}
                    </button>
                  </li>
                </ul>

                <div className="tab-content">
                  <div className={`tab-pane fade ${activeImageTab === 'first' ? 'show active' : ''}`} id="firstFrameTab">
                    <div
                      ref={imagePreviewRef}
                      className="mb-3 text-center border rounded p-3"
                      style={{ minHeight: '170px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }}
                      tabIndex={0} 
                      title={t('pasteImageTooltip')}
                    >
                      {imagePreview ? (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <img src={imagePreview} alt={t('firstFramePreviewAlt')} className="img-thumbnail" style={{ maxHeight: '150px', maxWidth: '100%', cursor: 'pointer' }} onClick={() => handleImagePreviewClick(imagePreview)} />
                          <button
                            type="button"
                            className="btn btn-secondary position-absolute top-0 end-0 m-1 rounded-circle"
                            style={{ width: '28px', height: '28px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, opacity: 0.6 }}
                            onClick={clearImagePreview}
                            title={t('clearFirstFrameButtonTitle')}
                            aria-label={t('clearFirstFrameButtonTitle')}
                          >
                            <i className="bi bi-x-lg" style={{ fontSize: '1rem' }}></i>
                          </button>
                        </div>
                      ) : (
                        <div className="d-flex justify-content-center align-items-center">
                          <button 
                            className={`btn btn-link ${theme === 'dark' ? 'text-light' : 'text-primary'} p-2 me-2`} 
                            onClick={() => fileInputRef.current && fileInputRef.current.click()}
                            title={t('uploadImageButtonTitle')}
                            style={{ fontSize: '1.5rem' }} 
                          >
                            <i className="bi bi-upload"></i>
                          </button>
                          <span className={`${theme === 'dark' ? 'text-light' : 'text-muted'} me-2`}>{t('orSeparator')}</span>
                          <button 
                            className={`btn btn-link ${theme === 'dark' ? 'text-light' : 'text-primary'} p-2`} 
                            onClick={() => handlePasteFromClipboard('first')}
                            title={t('pasteImageFromClipboardButtonTitle')}
                            style={{ fontSize: '1.5rem' }} 
                          >
                            <i className="bi bi-clipboard-plus"></i>
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="form-control"
                      id="imageUpload"
                      accept="image/*"
                      onChange={handleImageChange}
                      disabled={isLoading}
                      style={{ display: 'none' }} 
                    />
                  </div>

                  <div className={`tab-pane fade ${activeImageTab === 'last' ? 'show active' : ''}`} id="lastFrameTab">
                    <div
                      ref={lastImagePreviewRef}
                      className="mb-3 text-center border rounded p-3"
                      style={{ minHeight: '170px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }}
                      tabIndex={0} 
                      title={t('pasteImageTooltip')}
                    >
                      {lastImagePreview ? (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <img src={lastImagePreview} alt={t('lastFramePreviewAlt')} className="img-thumbnail" style={{ maxHeight: '150px', maxWidth: '100%', cursor: 'pointer' }} onClick={() => handleImagePreviewClick(lastImagePreview)} />
                          <button
                            type="button"
                            className="btn btn-secondary position-absolute top-0 end-0 m-1 rounded-circle"
                            style={{ width: '28px', height: '28px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, opacity: 0.6 }}
                            onClick={clearLastImagePreview}
                            title={t('clearLastFrameButtonTitle')}
                            aria-label={t('clearLastFrameButtonTitle')}
                          >
                            <i className="bi bi-x-lg" style={{ fontSize: '1rem' }}></i>
                          </button>
                        </div>
                      ) : (
                        <div className="d-flex justify-content-center align-items-center">
                          <button 
                            className={`btn btn-link ${theme === 'dark' ? 'text-light' : 'text-primary'} p-2 me-2`} 
                            onClick={() => lastFileInputRef.current && lastFileInputRef.current.click()}
                            title={t('uploadLastFrameImageButtonTitle')}
                            style={{ fontSize: '1.5rem' }} 
                            disabled={model === 'veo-3.0-generate-preview'}
                          >
                            <i className="bi bi-upload"></i>
                          </button>
                           <span className={`${theme === 'dark' ? 'text-light' : 'text-muted'} me-2`}>{t('orSeparator')}</span>
                          <button 
                            className={`btn btn-link ${theme === 'dark' ? 'text-light' : 'text-primary'} p-2`} 
                            onClick={() => handlePasteFromClipboard('last')}
                            title={t('pasteLastFrameImageFromClipboardButtonTitle')}
                            style={{ fontSize: '1.5rem' }} 
                            disabled={model === 'veo-3.0-generate-preview'}
                          >
                            <i className="bi bi-clipboard-plus"></i>
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      ref={lastFileInputRef}
                      type="file"
                      className="form-control"
                      id="lastImageUpload"
                      accept="image/*"
                      onChange={handleLastImageChange}
                      disabled={isLoading || model === 'veo-3.0-generate-preview'}
                      style={{ display: 'none' }} 
                    />
                    {model === 'veo-3.0-generate-preview' && (
                      <p className="form-text text-muted small">
                        {t('lastFrameNotSupportedMessage')}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mb-3">
                <label htmlFor="modelSelect" className={`form-label ${theme === 'dark' ? 'text-light' : ''}`}><i className="bi bi-box me-2"></i>{t('modelLabel')}</label>
                <select
                  id="modelSelect"
                  className="form-select"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={isLoading}
                >
                  <option value="veo-2.0-generate-001">veo-2.0-generate-001</option>
                  <option value="veo-2.0-generate-exp">veo-2.0-generate-exp</option>
                  <option value="veo-3.0-generate-preview">veo-3.0-generate-preview</option>
                </select>
              </div>

              <div className="mb-3">
                <label htmlFor="ratioSelect" className={`form-label ${theme === 'dark' ? 'text-light' : ''}`}><i className="bi bi-aspect-ratio me-2"></i>{t('aspectRatioLabel')}</label>
                <select
                  id="ratioSelect"
                  className="form-select"
                  value={ratio}
                  onChange={(e) => setRatio(e.target.value)}
                  disabled={isLoading}
                >
                  <option value="16:9">{t('aspectRatio16x9')}</option>
                  <option value="9:16" disabled={model === 'veo-3.0-generate-preview'}>{t('aspectRatio9x16')}{model === 'veo-3.0-generate-preview' ? t('notSupportedSuffix') : ''}</option>
                </select>
                {model === 'veo-3.0-generate-preview' && ratio === '9:16' && (
                   <p className="form-text text-warning small">
                     {t('aspectRatio9x16Warning')}
                   </p>
                )}
              </div>

              <div className="mb-3">
                <label htmlFor="cameraControlSelect" className={`form-label ${theme === 'dark' ? 'text-light' : ''}`}><i className="bi bi-camera-video me-2"></i>{t('cameraControlLabel')}</label>
                <select
                  id="cameraControlSelect"
                  className="form-select"
                  value={cameraControl}
                  onChange={(e) => setCameraControl(e.target.value)}
                  disabled={isLoading || model === 'veo-2.0-generate-001'}
                >
                  <option value="FIXED">FIXED</option>
                  <option value="PAN_LEFT">PAN_LEFT</option>
                  <option value="PAN_RIGHT">PAN_RIGHT</option>
                  <option value="PULL_OUT">PULL_OUT</option>
                  <option value="PEDESTAL_DOWN">PEDESTAL_DOWN</option>
                  <option value="PUSH_IN">PUSH_IN</option>
                  <option value="TRUCK_LEFT">TRUCK_LEFT</option>
                  <option value="TRUCK_RIGHT">TRUCK_RIGHT</option>
                  <option value="PEDESTAL_UP">PEDESTAL_UP</option>
                  <option value="TILT_DOWN">TILT_DOWN</option>
                  <option value="TILT_UP">TILT_UP</option>
                </select>
              </div>

              <div className="mb-3">
                <label htmlFor="durationSelect" className={`form-label ${theme === 'dark' ? 'text-light' : ''}`}><i className="bi bi-clock me-2"></i>{t('videoDurationLabel')}</label>
                <select
                  id="durationSelect"
                  className="form-select"
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value, 10))}
                  disabled={isLoading}
                >
                  {(model === 'veo-3.0-generate-preview' || model === 'veo-2.0-generate-exp')
                    ? <option value={8}>8s</option>
                    : [5, 6, 7, 8].map((d) => (
                        <option key={d} value={d}>{d}s</option>
                      ))
                  }
                </select>
              </div>

              <div className="mb-3" style={{ display: 'none' }}>
                <label htmlFor="gcsOutputBucket" className={`form-label ${theme === 'dark' ? 'text-light' : ''}`}><i className="bi bi-bucket me-2"></i>{t('gcsOutputBucketLabel')}</label>
                <input
                  type="text"
                  className="form-control"
                  id="gcsOutputBucket"
                  placeholder={t('gcsOutputBucketPlaceholder')}
                  value={gcsOutputBucket}
                  onChange={(e) => setGcsOutputBucket(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <button
                className="btn btn-primary w-100 mt-4"
                onClick={handleGenerateClick}
                disabled={isLoading || isRefining || !prompt.trim() || processingTaskCount >= 4}
              >
                {isLoading ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>{t('generatingButtonInProgress')}</> : (processingTaskCount >= 4 ? <><i className="bi bi-exclamation-triangle-fill me-2"></i>{t('maxProcessingTasksButton')}</> : <><i className="bi bi-magic me-2"></i>{t('generateButtonDefault')}</>)}
              </button>
            </div>
          </div>
          )}

          {activeView === 'create' && (
            <div className="card">
              <div className="card-body text-center">
                {/* <h3 className={`card-title h6 mb-2 ${theme === 'dark' ? 'text-light' : 'text-muted'}`}>
                  <i className="bi bi-pencil-square me-2"></i>{t('createContentTitle')}
                </h3> */}
                {createModeClips.length > 0 && (
                  <button
                    className={`btn btn-primary btn-lg mt-2`} // Changed class for primary action
                    onClick={handleCreateVideoClick}
                    disabled={isCreatingVideo || createModeClips.length === 0}
                  >
                    {isCreatingVideo ? (
                      <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>{t('creatingVideoButtonInProgress')}</> // TODO: Add this translation key
                    ) : (
                      <><i className="bi bi-film me-2"></i>{t('createVideoButton')}</> // New translation key
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <main className={`main-content-area flex-grow-1 p-4 ${theme === 'dark' ? 'bg-dark text-light' : ''}`}>
          {activeView === 'dream' && (
            <div> 
              <div ref={videoContainerRef} className="card video-display-card">
                <div className="card-body" style={{ height: `${videoHeight}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                  {
                    (taskStatus === STATUS_PROCESSING || taskStatus === STATUS_INITIALIZING || taskStatus === STATUS_PENDING || taskStatus === STATUS_COMPLETED_WAITING_URI) ? (
                      <div className="flashlight-loader w-100 h-100">
                        <p>{taskStatus === STATUS_COMPLETED_WAITING_URI ? t(STATUS_COMPLETED_WAITING_URI + 'Status') : t('processingMessage')}</p>
                      </div>
                    ) : (taskStatus === STATUS_FAILED || taskStatus === STATUS_ERROR) ? (
                      <div className="d-flex flex-column justify-content-center align-items-center w-100 h-100">
                        <img src="/fail.png" alt={t('failedAltText')} style={{ width: '100px', height: '100px', marginBottom: '10px' }} />
                        <p >{errorMessage || t('errorMessageGeneric')}</p>
                      </div>
                    ) : taskStatus === STATUS_COMPLETED ? (
                      videoGcsUri ? (
                        <video key={videoGcsUri} ref={videoRef} controls autoPlay loop src={videoGcsUri} className="w-100" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', backgroundColor: theme === 'dark' ? '#343a40' : '#000000' }}>
                          {t('videoTagNotSupported')}
                        </video>
                      ) : (
                        <div className={`${theme === 'dark' ? 'bg-secondary' : 'bg-light'} border rounded d-flex align-items-center justify-content-center w-100 h-100`}>
                          <p className="text-danger">{errorMessage || t('videoDataUnavailable')}</p>
                        </div>
                      )
                    ) : isLoading || isRefining ? (
                      <div className="d-flex justify-content-center align-items-center w-100 h-100">
                        <div className={`spinner-border ${theme === 'dark' ? 'text-light' : 'text-primary'}`} role="status">
                          <span className="visually-hidden">{t('loading')}</span>
                        </div>
                      </div>
                    ) : (
                      <div className={`${theme === 'dark' ? 'bg-secondary' : 'bg-light'} border rounded d-flex flex-column align-items-center justify-content-center w-100 h-100`}>
                        <img src="/dream.png" alt={t('startDreamingAltText')} style={{ width: '150px', height: '150px', opacity: 0.7 }} />
                      </div>
                    )
                  }
                </div>
                <div
                  className="video-resize-handle"
                  onMouseDown={handleMouseDownResize}
                  title={t('resizeVideoAreaTooltip', {height: videoHeight})}
                >
                  <i className="bi bi-grip-horizontal"></i>
                </div>
              </div>
              {taskId && activeView === 'dream' && ( 
                <div className="card mt-3">
                  <div className="card-body">
                    <h5 className="card-title"><i className="bi bi-info-circle me-2"></i>{t('taskDetailTitle')}</h5>
                    <p className="card-text mb-1"><strong><i className="bi bi-fingerprint me-2"></i>{t('taskIDLabel')}</strong> <small>{taskId}</small></p>
                    {currentTask && currentTask.prompt && (
                      <p className="card-text mb-1" style={{ wordBreak: 'break-all' }}><strong><i className="bi bi-blockquote-left me-2"></i>{t('taskPromptLabelFull')}</strong> {currentTask.prompt}</p>
                    )}
                    {currentTask && typeof currentTask.created_at !== 'undefined' && (
                      <p className="card-text mb-1">
                        <strong><i className="bi bi-clock me-2"></i>{t('taskTimeLabel')}</strong>{' '}
                        {new Date(currentTask.created_at * 1000).toLocaleDateString()}{' '}
                        {new Date(currentTask.created_at * 1000).toLocaleTimeString()}
                      </p>
                    )}
                    <p className="card-text"><strong><i className="bi bi-activity me-2"></i>{t('taskStatusLabel')}</strong> {taskStatus ? t(taskStatus + 'Status') : ''}</p>
                    {taskStatus === STATUS_COMPLETED && videoGcsUri && (
                      <>
                        <p className="card-text mb-1">
                          <strong><i className="bi bi-link-45deg me-2"></i>{t('taskDownloadUrlLabel')}</strong> <a href={videoGcsUri} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all' }}>{videoGcsUri}</a>
                        </p>
                        {currentTask && currentTask.video_gcs_uri && ( 
                          <p className="card-text mb-1" style={{ wordBreak: 'break-all' }}>
                            <strong><i className="bi bi-cloud-arrow-down me-2"></i>{t('taskGcsVideoUriLabel')}</strong> {currentTask.video_gcs_uri}
                          </p>
                        )}
                      </>
                    )}
                    {errorMessage && taskStatus !== STATUS_COMPLETED && <p className="card-text text-danger mb-2"><strong><i className="bi bi-exclamation-triangle me-2"></i>{t('taskErrorLabel')}</strong> {errorMessage}</p>}
                    {(taskStatus === STATUS_PROCESSING || taskStatus === STATUS_COMPLETED || taskStatus === STATUS_FAILED || taskStatus === STATUS_ERROR) && (
                      <div>
                        <button
                          className="btn btn-danger btn-sm mt-2 me-2"
                          onClick={() => handleDeleteTask(taskId)}
                          disabled={isLoading} 
                          title={t('deleteTaskButtonTitle')}
                        >
                          <i className="bi bi-trash3"></i>
                        </button>
                        {taskStatus === STATUS_COMPLETED && videoGcsUri && ( 
                          <button
                            className="btn btn-info btn-sm mt-2"
                            onClick={() => handleExtendVideoClick(taskId)}
                            disabled={isLoading || isExtending || !currentTask || !currentTask.video_gcs_uri}
                            title={t('extendVideoButtonTitle')}
                          >
                            {isExtending && taskId === currentTask?.task_id ? (
                              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                            ) : (
                              <i className="bi bi-clock-history"></i>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeView === 'create' && (
            <div className="d-flex flex-column h-100"> 
              <div className="card video-display-card flex-grow-1"> 
                <div className="card-body d-flex justify-content-center align-items-center" style={{ overflow: 'hidden',  height: `${videoHeight}px` }}>
                  {activeCreateModeVideoSrc ? (
                    <video key={activeCreateModeVideoSrc} ref={createModeVideoRef} controls autoPlay loop src={activeCreateModeVideoSrc} className="w-100" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', backgroundColor: theme === 'dark' ? '#212529' : '#f8f9fa' }}>
                      {t('videoTagNotSupported')}
                    </video>
                  ) : (
                    <div className={`${theme === 'dark' ? 'bg-secondary' : 'bg-light'} border rounded d-flex flex-column align-items-center justify-content-center w-100 h-100`}>
                      <i className="bi bi-film" style={{fontSize: '3rem', opacity: 0.5}}></i>
                      <p className="mt-2">{t('createVideoPlaceholder')}</p>
                    </div>
                  )}
                </div>
                 <div
                  className="video-resize-handle"
                  onMouseDown={handleMouseDownResize}
                  title={t('resizeVideoAreaTooltip', {height: videoHeight})}
                >
                  <i className="bi bi-grip-horizontal"></i>
                </div>
              </div>
              <div className={`video-clip-track card mt-2 ${theme === 'dark' ? 'bg-dark' : 'bg-light'}`}>
                <div className="card-body d-flex p-2" style={{overflowX: 'auto'}}>
                  {createModeClips.length === 0 && <p className={`m-0 ${theme === 'dark' ? 'text-light' : 'text-muted'}`}>{t('createClipTrackPlaceholder')}</p>}
                  {createModeClips.map(clip => (
                    <div 
                      key={clip.trackInstanceId}
                      className={`clip-thumbnail-item ${selectedClipInTrack === clip.trackInstanceId ? 'active' : ''}`}
                      onClick={() => {
                        if (clip.local_video_path) {
                           setActiveCreateModeVideoSrc(`${BACKEND_URL}${clip.local_video_path}`);
                           setSelectedClipInTrack(clip.trackInstanceId);
                           if(createModeVideoRef.current) {
                            createModeVideoRef.current.load();
                            createModeVideoRef.current.play().catch(e => console.warn("Clip track play failed", e));
                           }
                        } else {
                          // Attempt to find the original task data if needed, though newClipInstance should have it
                          console.warn("Clicked clip instance has no video path:", clip);
                        }
                      }}
                    >
                      <button
                        className="clip-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent triggering the thumbnail click
                          setCreateModeClips(prevClips => prevClips.filter(c => c.trackInstanceId !== clip.trackInstanceId));
                          if (selectedClipInTrack === clip.trackInstanceId) {
                            setActiveCreateModeVideoSrc('');
                            setSelectedClipInTrack(null);
                          }
                        }}
                        title={t('removeClipFromTrackTitle')}
                      >
                        <i className="bi bi-x-lg"></i>
                      </button>
                      {clip.local_thumbnail_path ? (
                        <img src={`${BACKEND_URL}${clip.local_thumbnail_path}`} alt={`Clip ${clip.task_id}`} />
                      ) : (
                        <div className="clip-thumbnail-placeholder">
                          <i className="bi bi-film"></i>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>

        <div className={`right-sidebar p-3 border-start ${theme === 'dark' ? 'bg-dark text-light' : 'bg-light text-dark'}`} style={{ display: 'flex', flexDirection: 'column' }}> 
          <div className="card border-0 flex-grow-1"> 
            <div className="card-body d-flex flex-column h-100"> 
              <h2 className="card-title h5 mb-3" onClick={fetchHistoryTasks} style={{ cursor: 'pointer' }} title={t('refreshHistoryTooltip')}><i className="bi bi-clock-history me-2"></i>{t('historyTitle')}</h2> 
              <div className="mb-3">
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder={t('historyFilterPlaceholder')}
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                />
              </div>
              {historyTasks.filter(task => task.prompt && task.prompt.toLowerCase().includes(historyFilter.toLowerCase())).length === 0 && <p className={`${theme === 'dark' ? 'text-light' : 'text-muted'}`}>{t('historyNoMatchingTasks')}</p>}
              <ul className="list-group list-group-flush flex-grow-1" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 10px)' }}> 
                {historyTasks
                  .filter(task => task.prompt && task.prompt.toLowerCase().includes(historyFilter.toLowerCase()))
                  .map((task) => {
                    // Check if this history task corresponds to the selected clip in create mode
                    const isSelectedInCreateTrack = activeView === 'create' && 
                                                  selectedClipInTrack && // Ensure selectedClipInTrack is not null
                                                  createModeClips.some(clip => 
                                                    clip.trackInstanceId === selectedClipInTrack && 
                                                    clip.task_id === task.task_id
                                                  );
                    return (
                  <li
                    key={task.task_id} // History list still uses task_id as key for source tasks
                    className={`list-group-item-action d-flex flex-column align-items-center p-2 ${theme === 'dark' ? 'list-group-item-dark-no-border' : 'list-group-item-light-no-border'} ${task.task_id === taskId && activeView === 'dream' ? 'has-selected-thumbnail' : ''} ${isSelectedInCreateTrack ? 'has-selected-thumbnail' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleHistoryItemClick(task)}
                    onMouseEnter={() => activeView === 'create' && setHoveredHistoryTaskId(task.task_id)}
                    onMouseLeave={() => activeView === 'create' && setHoveredHistoryTaskId(null)}
                  >
                    {(task.status === STATUS_COMPLETED && task.local_thumbnail_path) ? (
                      <div className={`thumbnail-container position-relative mb-2 ${(task.task_id === taskId && activeView === 'dream') || isSelectedInCreateTrack ? 'selected-thumbnail-custom-border' : ''}`}>
                        <img
                          src={`${BACKEND_URL}${task.local_thumbnail_path}`}
                          alt={t('historyThumbnailAlt', {prompt: task.prompt})}
                          className="img-thumbnail"
                        />
                        <div className="play-icon-overlay position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center">
                          {activeView === 'create' ? (
                            <>
                              <i 
                                className="bi bi-play-circle-fill text-white" 
                                style={{ 
                                  fontSize: '2rem', 
                                  display: hoveredHistoryTaskId === task.task_id ? 'none' : 'inline-block' 
                                }}
                              ></i>
                              <i 
                                className="bi bi-plus-lg text-white" 
                                style={{ 
                                  fontSize: '2rem', 
                                  display: hoveredHistoryTaskId === task.task_id ? 'inline-block' : 'none' 
                                }}
                              ></i>
                            </>
                          ) : (
                            <i 
                              className="bi bi-play-circle-fill text-white" 
                              style={{ fontSize: '2rem' }}
                            ></i>
                          )}
                        </div>
                      </div>
                    ) : (task.status === STATUS_PROCESSING || task.status === STATUS_PENDING || task.status === STATUS_INITIALIZING || task.status === STATUS_COMPLETED_WAITING_URI) ? ( 
                      <img
                        src="/gears.gif" 
                        alt={t('historyProcessingAlt')}
                        className="img-thumbnail mb-2"
                        style={{ width: '80px', height: '80px' }}
                      />
                    ) : task.status === STATUS_FAILED || task.status === STATUS_ERROR ? ( 
                      <img
                        src="/fail.png"
                        alt={t('historyFailedAlt')}
                        className="img-thumbnail mb-2"
                        style={{ width: '80px', height: '80px' }}
                      />
                    ) : null}

                    {task.status === STATUS_PROCESSING && (
                      <div><small className="badge bg-info">{t(STATUS_PROCESSING + 'Status')}</small></div>
                    )}
                    {task.status === STATUS_PENDING && (
                      <div><small className="badge bg-warning text-dark">{t(STATUS_PENDING + 'Status')}</small></div>
                    )}
                    {task.status === STATUS_INITIALIZING && (
                      <div><small className="badge bg-secondary">{t(STATUS_INITIALIZING + 'Status')}</small></div>
                    )}
                    {task.status === STATUS_COMPLETED_WAITING_URI && (
                      <div><small className="badge bg-info">{t(STATUS_COMPLETED_WAITING_URI + 'Status')}</small></div>
                    )}
                  </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <footer className={`${theme === 'dark' ? 'bg-dark text-light' : 'bg-light text-dark'} text-center text-lg-start mt-auto`}>
        <div className="text-center p-3" style={{ backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }}>
          {t('footerCopyright')}
            </div>
          </footer>

          {showImageModal && (
            <div
              className="modal fade show"
              tabIndex="-1"
              style={{
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                position: 'fixed', 
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0,0,0,0.5)',
                zIndex: 1050 
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setShowImageModal(false);
                }
              }}
            >
              <div className="modal-dialog modal-xl" style={{ margin: 0, display: 'flex', alignItems: 'center', minHeight: 'calc(100% - (1.75rem * 2))' }}> 
                <div className="modal-content" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column', width: '100%' }}> 
                  <div className="modal-body text-center" style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}> 
                    <img
                      src={modalImageUrl}
                      alt={t('imagePreviewModalAlt')}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                      onClick={(e) => e.stopPropagation()} 
                    />
                    <button
                      type="button"
                      className="btn-close btn-close-white position-absolute top-0 end-0 m-3"
                      aria-label={t('closeButtonLabel')}
                      style={{filter: 'invert(1) grayscale(100%) brightness(200%)', zIndex: 1051}} 
                      onClick={(e) => {
                        e.stopPropagation(); 
                        setShowImageModal(false);
                      }}
                    ></button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default App;
