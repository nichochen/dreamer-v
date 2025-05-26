import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css'; // Keep App.css for any custom styles not covered by Bootstrap

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
  const [isExtending, setIsExtending] = useState(false); // New state for extend button loading
  const [completedUriPollRetries, setCompletedUriPollRetries] = useState(0); // For retrying URI fetch on completion

  // State for backend readiness
  const [isBackendReady, setIsBackendReady] = useState(false);
  // backendError state is removed as per feedback to always show loading and keep polling.

  const videoRef = useRef(null); // Ref for the video element
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
      setErrorMessage('No image found on clipboard. Please ensure you have copied an image.');
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
      setErrorMessage('Please enter a prompt.');
      return;
    }
    setIsLoading(true);
    setErrorMessage('');
    setVideoGcsUri('');
    setTaskStatus('Initializing...');
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
      setTaskStatus('pending'); // Initial status after task creation
      fetchHistoryTasks(); // Refresh history after new task
    } catch (error) {
      console.error('Error starting video generation:', error);
      setErrorMessage(error.message || 'Failed to start video generation.');
      setTaskStatus('error');
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
      if (newStatusFromBackend !== taskStatus || ['processing', 'completed', 'failed'].includes(newStatusFromBackend)) {
        fetchHistoryTasks();
      }

      if (newStatusFromBackend === 'completed') {
        if (currentVideoUri) {
          // Backend says completed AND URI is available
          setVideoGcsUri(currentVideoUri);
          finalTaskStatusToSet = 'completed';
          setErrorMessage(''); // Clear any previous error/waiting message
          if (pollingIntervalId) clearInterval(pollingIntervalId);
          setPollingIntervalId(null);
          setCompletedUriPollRetries(0);
        } else {
          // Backend says completed, but NO URI yet.
          setVideoGcsUri(''); // Ensure URI is cleared
          if (completedUriPollRetries < 3) {
            setCompletedUriPollRetries(prev => prev + 1);
            finalTaskStatusToSet = 'completed_waiting_uri'; // Explicit status for this state
            setErrorMessage(''); // Clear other errors, specific message will be in UI for this status
          } else {
            // Retries exhausted for URI
            finalTaskStatusToSet = 'failed';
            setErrorMessage("Task completed by backend but no video URI or local path returned after retries.");
            if (pollingIntervalId) clearInterval(pollingIntervalId);
            setPollingIntervalId(null);
            setCompletedUriPollRetries(0); // Reset retries as task is now failed
          }
        }
      } else if (newStatusFromBackend === 'failed' || newStatusFromBackend === 'error') {
        setVideoGcsUri(currentVideoUri); // Update URI if any
        finalTaskStatusToSet = newStatusFromBackend;
        setErrorMessage(data.error_message || `Task ${newStatusFromBackend}.`);
        if (pollingIntervalId) clearInterval(pollingIntervalId);
        setPollingIntervalId(null);
        setCompletedUriPollRetries(0);
      } else { // 'pending' or 'processing' from backend
        setVideoGcsUri(currentVideoUri); // Update URI if any
        finalTaskStatusToSet = newStatusFromBackend;
        setErrorMessage(data.error_message || ''); 
        setCompletedUriPollRetries(0); // Reset retries as task is not 'completed_missing_uri'
      }
      
      // Set the determined status
      setTaskStatus(finalTaskStatusToSet);

      // Update form fields if task is now in a final state (completed or failed)
      // This uses finalTaskStatusToSet to ensure consistency with what was just set in UI state.
      if (finalTaskStatusToSet === 'completed' || finalTaskStatusToSet === 'failed') {
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
        const newErrorMsg = error.message || 'Failed to poll task status.';
        // Avoid overwriting a more specific error with a generic poll failure message
        // if prev exists and is not the generic one.
        if (prev && prev !== 'Failed to poll task status.') return prev;
        return newErrorMsg;
      });
      if (pollingIntervalId) clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
      setCompletedUriPollRetries(0);
      // Consider setting taskStatus to 'error' here if not already a final state
      if (taskStatus !== 'completed' && taskStatus !== 'failed') {
        setTaskStatus('error');
      }
      fetchHistoryTasks();
    }
  }, [
    taskId, taskStatus, pollingIntervalId, completedUriPollRetries, // Core dependencies for logic
    fetchHistoryTasks, BACKEND_URL, // Stable functions/configs
    // Setters are stable
    setTaskStatus, setVideoGcsUri, setErrorMessage, setPollingIntervalId, setCompletedUriPollRetries,
    setPrompt, setModel, setRatio, setCameraControl, setDuration, setGcsOutputBucket
  ]);

  useEffect(() => {
    // Condition to START or CONTINUE polling
    if (taskId && 
        (taskStatus === 'pending' || taskStatus === 'processing' || taskStatus === 'Initializing...' || 
         (taskStatus === 'completed' && !videoGcsUri && completedUriPollRetries < 3)
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
      if ((taskStatus === 'completed' && (videoGcsUri || completedUriPollRetries >=3)) || taskStatus === 'failed' || taskStatus === 'error') {
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
  }, [taskId, taskStatus, videoGcsUri, completedUriPollRetries, pollTaskStatus, pollingIntervalId]);

  useEffect(() => {
    // Autoplay video when a completed task's video becomes available
    // This is triggered when a history item is clicked and states are updated
    if (videoRef.current && videoGcsUri && taskStatus === 'completed') {
      videoRef.current.load(); // Ensure the new source is loaded
      videoRef.current.play().catch(error => {
        console.warn("Video autoplay failed:", error);
        // Autoplay might be blocked by browser policies.
        // The 'controls' attribute allows manual play.
      });
    }
  }, [videoGcsUri, taskStatus]); // videoRef is stable, not needed in deps

  // Effect to reconcile taskStatus with historyTasks
  useEffect(() => {
    if (taskId && historyTasks.length > 0) {
      const taskFromHistory = historyTasks.find(t => t.task_id === taskId);
      if (taskFromHistory) {
        const historyStatus = taskFromHistory.status;
        const historyVideoUri = taskFromHistory.local_video_path ? `${BACKEND_URL}${taskFromHistory.local_video_path}` : '';
        const historyErrorMessage = taskFromHistory.error_message || '';

        // Case 1: History has a definitive completed state with URI.
        // Update UI if it's not already reflecting this state.
        if (historyStatus === 'completed' && historyVideoUri) {
          if (taskStatus !== 'completed' || videoGcsUri !== historyVideoUri || errorMessage) {
            console.log(`Reconciling to 'completed' with URI from history for task ${taskId}.`);
            setTaskStatus('completed');
            setVideoGcsUri(historyVideoUri);
            setErrorMessage(''); 
            if (pollingIntervalId) { clearInterval(pollingIntervalId); setPollingIntervalId(null); setCompletedUriPollRetries(0); }
          }
        }
        // Case 2: History has a definitive failed state.
        // Update UI if it's not already reflecting this state.
        else if (historyStatus === 'failed') {
          const newErrorMessage = historyErrorMessage || 'Task failed.';
          if (taskStatus !== 'failed' || videoGcsUri !== historyVideoUri || errorMessage !== newErrorMessage) {
            console.log(`Reconciling to 'failed' from history for task ${taskId}.`);
            setTaskStatus('failed');
            setVideoGcsUri(historyVideoUri); 
            setErrorMessage(newErrorMessage);
            if (pollingIntervalId) { clearInterval(pollingIntervalId); setPollingIntervalId(null); setCompletedUriPollRetries(0); }
          }
        }
        // Case 3: History has a definitive error state.
        // Update UI if it's not already reflecting this state.
        else if (historyStatus === 'error') {
            const newErrorMessage = historyErrorMessage || 'Task encountered an error.';
            if (taskStatus !== 'error' || videoGcsUri !== historyVideoUri || errorMessage !== newErrorMessage) {
              console.log(`Reconciling to 'error' from history for task ${taskId}.`);
              setTaskStatus('error');
              setVideoGcsUri(historyVideoUri); 
              setErrorMessage(newErrorMessage);
              if (pollingIntervalId) { clearInterval(pollingIntervalId); setPollingIntervalId(null); setCompletedUriPollRetries(0); }
            }
        }
        // Case 4: History says 'processing' and UI is 'pending' or 'initializing'.
        // Advance UI state to 'processing'.
        else if (historyStatus === 'processing' && (taskStatus === 'pending' || taskStatus === 'Initializing...')) {
            if (taskStatus !== 'processing') { // Avoid redundant sets if already 'processing'
                console.log(`Reconciling from '${taskStatus}' to 'processing' from history for task ${taskId}.`);
                setTaskStatus('processing');
                if (historyVideoUri && videoGcsUri !== historyVideoUri) setVideoGcsUri(historyVideoUri);
                if (historyErrorMessage && errorMessage !== historyErrorMessage) setErrorMessage(historyErrorMessage);
            }
        }
        // Case 5 (REMOVED / MODIFIED): History says 'completed' but NO URI.
        // Previously, this might clear a UI-held URI. Now, we are more cautious.
        // If UI is 'completed' with a URI, we trust that unless polling explicitly fails later or user re-selects from history.
        // If UI is NOT 'completed', and history says 'completed' without URI, we let polling logic handle it,
        // as it has retries for "completed but no URI yet".
        // The only action here is if history says 'completed' (no URI), and UI *also* says 'completed' but *has* a URI.
        // This could indicate the video was deleted and history is reflecting that.
        // This specific sub-case of "video deletion" might need more robust handling if it becomes an issue.
        // For the current bug (URI disappearing), we avoid clearing a URI that pollTaskStatus might have just set.
        // So, no explicit 'else if' for (historyStatus === 'completed' && !historyVideoUri && ...) that clears videoGcsUri if present.
      }
    }
  }, [historyTasks, taskId, taskStatus, videoGcsUri, errorMessage, BACKEND_URL, pollingIntervalId, setTaskStatus, setVideoGcsUri, setErrorMessage, setPollingIntervalId, setCompletedUriPollRetries]);

  // Effect for periodic refresh of the entire history if there are ongoing tasks
  useEffect(() => {
    const hasNonFinalTasks = historyTasks.some(task => task.status === 'pending' || task.status === 'processing');
    let historyRefreshIntervalId = null;

    if (hasNonFinalTasks) {
      // console.log("Setting up periodic history refresh interval.");
      historyRefreshIntervalId = setInterval(() => {
        // console.log("Periodic history refresh triggered.");
        fetchHistoryTasks();
      }, 10000); // Refresh history every 10 seconds
    } else {
      // console.log("No non-final tasks, periodic history refresh not needed or will be cleared.");
    }

    return () => {
      if (historyRefreshIntervalId) {
        // console.log("Clearing periodic history refresh interval.");
        clearInterval(historyRefreshIntervalId);
      }
    };
  }, [historyTasks, fetchHistoryTasks]); // Rerun when historyTasks changes

  const handleHistoryItemClick = async (task) => { // Made async
    // Stop any ongoing polling for the current task
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
    }
    setCompletedUriPollRetries(0); // Reset retries when selecting from history

    // Set the main view to this historical task
    setPrompt(task.prompt);
    setModel(task.model || 'veo-2.0-generate-001'); // Set model from history or default
    setRatio(task.aspect_ratio || '16:9'); // Set ratio from history or default
    setCameraControl(task.camera_control || 'FIXED'); // Set camera control from history or default
    setDuration(task.duration_seconds || 5); // Set duration from history or default, changed to 5
    setGcsOutputBucket(task.gcs_output_bucket || ''); // Set GCS bucket from history or empty
    setTaskId(task.task_id);
    setVideoGcsUri(task.local_video_path ? `${BACKEND_URL}${task.local_video_path}` : '');
    setTaskStatus(task.status);
    setErrorMessage(task.error_message || '');
    setIsLoading(false); // Ensure loading is false when selecting from history

    // Clear previous selections and previews first
    setSelectedImage(null);
    setImagePreview('');
    setSelectedLastImage(null);
    setLastImagePreview('');

    if (task.original_image_path) {
      const imageUrl = `${BACKEND_URL}${task.original_image_path}`;
      setImagePreview(imageUrl); // Set preview immediately
      // Attempt to fetch the image and set it as a File object for re-submission
      const imageFile = await urlToImageFile(imageUrl, task.original_image_path.split('/').pop());
      if (imageFile) {
        setSelectedImage(imageFile);
      } else {
        console.warn("Could not load original image as file for re-submission.");
        // Optionally, inform the user they might need to re-upload if they want to use this image
      }
    }

    if (task.original_last_frame_path) { // Corrected property name
      const lastImageUrl = `${BACKEND_URL}${task.original_last_frame_path}`;
      setLastImagePreview(lastImageUrl); // Set preview immediately
      // Attempt to fetch the last image and set it as a File object
      const lastImageFile = await urlToImageFile(lastImageUrl, task.original_last_frame_path.split('/').pop()); // Corrected property name
      if (lastImageFile) {
        setSelectedLastImage(lastImageFile);
      } else {
        console.warn("Could not load original last image as file for re-submission.");
      }
    }

    // If the selected historical task is still processing, restart polling for it
    // This is handled by the main useEffect for [taskId, taskStatus]
  };

  const handleDeleteTask = async (idToDelete) => {
    if (!idToDelete) return;
    if (!window.confirm(`Are you sure you want to delete task ${idToDelete}? This will also delete associated video and thumbnail files.`)) {
      return;
    }

    setIsLoading(true); // Use isLoading to disable UI elements during deletion
    try {
      const response = await fetch(`${BACKEND_URL}/task/${idToDelete}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to delete task: ${response.statusText}`);
      }
      // If the deleted task is the currently viewed task, clear the view
      if (taskId === idToDelete) {
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
        setSelectedImage(null); // Clear selected image
        setImagePreview('');   // Clear image preview
        setSelectedLastImage(null); // Clear selected last image
        setLastImagePreview(''); // Clear last image preview
      }
      fetchHistoryTasks(); // Refresh history
      alert('Task deleted successfully.'); // Or use a more sophisticated notification
    } catch (error) {
      console.error('Error deleting task:', error);
      setErrorMessage(error.message || 'Failed to delete task.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefinePrompt = async (promptToRefine) => {
    const currentPromptValue = promptToRefine || prompt; // Use passed prompt or state

    if (!currentPromptValue.trim() || isRefining) {
      if (!currentPromptValue.trim() && !promptToRefine) { // Only set error if not called with a specific prompt that might be empty
        setErrorMessage('Prompt is empty, cannot refine.');
      }
      return;
    }
    setIsRefining(true);
    setErrorMessage(''); // Clear previous errors

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
        setPrompt(data.refined_prompt); // Update the main prompt state with the refined one
      } else {
        // If the backend didn't return a refined_prompt but was successful,
        // it might mean the original prompt (currentPromptValue) was considered good enough
        // or an empty string was returned. In this case, we ensure the UI reflects currentPromptValue if it was passed.
        if (promptToRefine && promptToRefine !== prompt) {
            setPrompt(promptToRefine);
        } else if (!data.refined_prompt) {
          // If no refined prompt and no promptToRefine, it implies an issue or empty refinement
          console.warn("Refined prompt not found in response, and no override prompt provided.");
        }
      }
    } catch (error) {
      console.error('Error refining prompt:', error);
      setErrorMessage(error.message || 'Failed to refine prompt.');
    } finally {
      setIsRefining(false);
    }
  };

  const currentTask = historyTasks.find(task => task.task_id === taskId);

  const processingTaskCount = historyTasks.filter(task => task.status === 'processing').length;

  const handleKeywordButtonClick = async (keywordToAdd) => {
    const basePrompt = prompt.trim();
    // Add a space only if basePrompt is not empty
    const newPrompt = basePrompt ? `${basePrompt} ${keywordToAdd}` : keywordToAdd;
    setPrompt(newPrompt); // Update UI prompt immediately
    await handleRefinePrompt(newPrompt); // Pass the new prompt for refining
  };

  const handleExtendVideoClick = async (taskIdToExtend) => {
    if (!taskIdToExtend || isExtending) {
      return;
    }
    setIsExtending(true);
    setErrorMessage('');
    // Optionally, clear current task view or set a specific status for extension
    // setTaskStatus('Extending...'); // Or similar

    // Stop any ongoing polling for the current task if it's different
    if (pollingIntervalId && taskId !== taskIdToExtend) {
      clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
    }

    try {
      const payload = new FormData();
      // We can allow overriding prompt/duration for extension if needed
      // For now, the backend uses original prompt and a default duration
      // payload.append('prompt', prompt); // If we want to use current UI prompt
      // payload.append('duration', parseInt(duration, 10)); // If we want to use current UI duration

      const response = await fetch(`${BACKEND_URL}/extend-video/${taskIdToExtend}`, {
        method: 'POST',
        body: payload, // FormData for consistency, even if empty for now
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Failed to start video extension: ${response.statusText}`);
      }
      // Set the new task ID and status to start polling for the extended video
      setTaskId(data.task_id);
      setTaskStatus('pending'); // Start polling for the new extension task
      fetchHistoryTasks(); // Refresh history to show the new task
    } catch (error) {
      console.error('Error starting video extension:', error);
      setErrorMessage(error.message || 'Failed to start video extension.');
      setTaskStatus('error'); // Or some other appropriate error status
    } finally {
      setIsExtending(false);
    }
  };

  const promptActionButtons = [
    { label: "Refine Prompt", onClick: () => handleRefinePrompt(), icon: "bi-stars", keywordEffect: false, disabled: !prompt.trim() },
    { label: "Night Time", keyword: "night time", icon: "bi-moon-stars-fill", keywordEffect: true },
    { label: "Day Time", keyword: "day time", icon: "bi-sun-fill", keywordEffect: true },
    { label: "360° Rotation", keyword: "rotation the object 360 degree", icon: "bi-arrow-repeat", keywordEffect: true },
    { label: "Realistic", keyword: "realistic", icon: "bi-camera-fill", keywordEffect: true },
    { label: "Creative", keyword: "creative", icon: "bi-lightbulb-fill", keywordEffect: true },
  ];

  return (
    <>
      {!isBackendReady ? (
        <div className={`vh-100 d-flex flex-column justify-content-center align-items-center ${theme === 'dark' ? 'bg-dark text-light' : 'bg-light text-dark'}`}>
          {/* Always show loading spinner and message while backend is not ready */}
          <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
            <span className="visually-hidden">Loading...</span>
          </div>
          <h2>Connecting to Backend...</h2>
          <p className={`${theme === 'dark' ? 'text-light' : 'text-muted'}`}>Please wait while we establish a connection. Retrying automatically.</p>
        </div>
      ) : (
        <div className={`App d-flex flex-column vh-100 ${theme === 'dark' ? 'bg-dark text-light' : ''}`}> {/* vh-100 for 100% viewport height, apply theme class */}
          <div className="app-body d-flex flex-grow-1"> {/* Added app-body class, removed inline overflow:hidden */}
            {/* Sidebar (Inputs) */}
        <div className={`sidebar p-3 border-end ${theme === 'dark' ? 'bg-dark text-light' : 'bg-light text-dark'}`}> {/* Removed inline styles, relying on .sidebar class from App.css */}
          <header className="mb-3" style={{ background: 'linear-gradient(to right, black, #b8485f)', borderRadius: '0.375rem', padding: '1rem', color: 'white' }}> {/* Added padding and border-radius manually, set text color to white */}
            <div className="container-fluid p-0"> {/* Removed container-fluid padding */}
              <h1 className="h3 mb-0" style={{ color: 'white' }}><i className="bi bi-film me-2"></i>Dreamer-V</h1>
              <p className="mb-0" style={{ fontSize: '0.8rem', opacity: 0.7, color: 'white' }}>Powered by Google Veo</p>
            </div>
          </header>
          <div className="d-flex justify-content-between align-items-center my-3">
            {userEmail && (
              <div className="dropdown" ref={userDropdownRef}>
                <button
                  className={`btn btn-link ${theme === 'dark' ? 'text-light' : 'text-dark'} p-0`}
                  type="button"
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  aria-expanded={showUserDropdown}
                  title="User Info"
                >
                  <i className="bi bi-person-circle" style={{ fontSize: '1.5rem' }}></i>
                </button>
                {showUserDropdown && (
                  <ul className={`dropdown-menu show ${theme === 'dark' ? 'dropdown-menu-dark' : ''}`} style={{position: 'absolute', inset: '0px auto auto 0px', margin: '0px', transform: 'translate(0px, 40px)', minWidth: '250px'}}>
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
                id="themeSwitch"
                checked={theme === 'dark'}
                onChange={toggleTheme}
              />
              <label className="form-check-label" htmlFor="themeSwitch">
                {theme === 'dark' ? <i className="bi bi-moon-stars-fill"></i> : <i className="bi bi-sun-fill"></i>}
              </label>
            </div>
          </div>
          {/* Content from original "Input Column" */}
          <div className="card"> {/* Rely on data-bs-theme for dark mode card styling */}
            <div className="card-body">
              {/* Prompt Section */}
              <h3 className={`card-title h6 mb-2 ${theme === 'dark' ? 'text-light' : 'text-muted'}`}><i className="bi bi-chat-dots me-2"></i>Prompt</h3>
              <div className="mb-3">
                <textarea
                  className="form-control"
                  rows="4"
                  placeholder="Enter your prompt here..."
                  value={prompt}
                  onChange={handlePromptChange}
                  disabled={isLoading || isRefining}
                ></textarea>
                {/* Action Buttons: Refine and Keywords */}
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
                      {isRefining && btn.label === "Refine Prompt" ? (
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                      ) : (
                        <i className={`bi ${btn.icon}`} style={{ fontSize: '1.1rem' }}></i>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Image Upload Tabs Section */}
              <div className="mt-3">
                <ul className="nav nav-tabs nav-fill mb-3">
                  <li className="nav-item">
                    <button
                      className={`nav-link ${activeImageTab === 'first' ? 'active' : ''} ${theme === 'dark' && activeImageTab !== 'first' ? 'text-light' : ''}`}
                      onClick={() => setActiveImageTab('first')}
                      type="button"
                    >
                      <i className="bi bi-image me-1"></i> First Frame
                    </button>
                  </li>
                  <li className="nav-item">
                    <button
                      className={`nav-link ${activeImageTab === 'last' ? 'active' : ''} ${theme === 'dark' && activeImageTab !== 'last' ? 'text-light' : ''}`}
                      onClick={() => setActiveImageTab('last')}
                      type="button"
                      disabled={model === 'veo-3.0-generate-preview'}
                      title={model === 'veo-3.0-generate-preview' ? "Last frame not supported by this model" : "Select last frame image"}
                    >
                      <i className="bi bi-image-alt me-1"></i> Last Frame
                    </button>
                  </li>
                </ul>

                <div className="tab-content">
                  {/* First Frame Image Tab Pane */}
                  <div className={`tab-pane fade ${activeImageTab === 'first' ? 'show active' : ''}`} id="firstFrameTab">
                    {/* <h3 className={`card-title h6 mb-2 ${theme === 'dark' ? 'text-light' : 'text-muted'}`}><i className="bi bi-image me-2"></i>First Frame Image (Optional)</h3> */}
                    <div
                      ref={imagePreviewRef}
                      className="mb-3 text-center border rounded p-3"
                      style={{ minHeight: '170px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }}
                      tabIndex={0} // Make it focusable to receive paste events
                      title="Click to focus, then paste image from clipboard"
                    >
                      {imagePreview ? (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <img src={imagePreview} alt="First Frame Preview" className="img-thumbnail" style={{ maxHeight: '150px', maxWidth: '100%', cursor: 'pointer' }} onClick={() => handleImagePreviewClick(imagePreview)} />
                          <button
                            type="button"
                            className="btn btn-secondary position-absolute top-0 end-0 m-1 rounded-circle"
                            style={{ width: '28px', height: '28px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, opacity: 0.6 }}
                            onClick={clearImagePreview}
                            title="Clear first frame image"
                            aria-label="Clear first frame image"
                          >
                            <i className="bi bi-x-lg" style={{ fontSize: '1rem' }}></i>
                          </button>
                        </div>
                      ) : (
                        <div className="d-flex justify-content-center align-items-center">
                          <button 
                            className={`btn btn-link ${theme === 'dark' ? 'text-light' : 'text-primary'} p-2 me-2`} 
                            onClick={() => fileInputRef.current && fileInputRef.current.click()}
                            title="Upload Image"
                            style={{ fontSize: '1.5rem' }} 
                          >
                            <i className="bi bi-upload"></i>
                          </button>
                          <span className={`${theme === 'dark' ? 'text-light' : 'text-muted'} me-2`}>or</span>
                          <button 
                            className={`btn btn-link ${theme === 'dark' ? 'text-light' : 'text-primary'} p-2`} 
                            onClick={() => handlePasteFromClipboard('first')}
                            title="Paste Image from Clipboard"
                            style={{ fontSize: '1.5rem' }} 
                          >
                            <i className="bi bi-clipboard-plus"></i>
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Hidden file input, triggered by the upload icon */}
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

                  {/* Last Frame Image Tab Pane */}
                  <div className={`tab-pane fade ${activeImageTab === 'last' ? 'show active' : ''}`} id="lastFrameTab">
                    <div
                      ref={lastImagePreviewRef}
                      className="mb-3 text-center border rounded p-3"
                      style={{ minHeight: '170px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }}
                      tabIndex={0} // Make it focusable to receive paste events
                      title="Click to focus, then paste image from clipboard"
                    >
                      {lastImagePreview ? (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <img src={lastImagePreview} alt="Last Frame Preview" className="img-thumbnail" style={{ maxHeight: '150px', maxWidth: '100%', cursor: 'pointer' }} onClick={() => handleImagePreviewClick(lastImagePreview)} />
                          <button
                            type="button"
                            className="btn btn-secondary position-absolute top-0 end-0 m-1 rounded-circle"
                            style={{ width: '28px', height: '28px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, opacity: 0.6 }}
                            onClick={clearLastImagePreview}
                            title="Clear last frame image"
                            aria-label="Clear last frame image"
                          >
                            <i className="bi bi-x-lg" style={{ fontSize: '1rem' }}></i>
                          </button>
                        </div>
                      ) : (
                        <div className="d-flex justify-content-center align-items-center">
                          <button 
                            className={`btn btn-link ${theme === 'dark' ? 'text-light' : 'text-primary'} p-2 me-2`} 
                            onClick={() => lastFileInputRef.current && lastFileInputRef.current.click()}
                            title="Upload Last Frame Image"
                            style={{ fontSize: '1.5rem' }} 
                            disabled={model === 'veo-3.0-generate-preview'}
                          >
                            <i className="bi bi-upload"></i>
                          </button>
                           <span className={`${theme === 'dark' ? 'text-light' : 'text-muted'} me-2`}>or</span>
                          <button 
                            className={`btn btn-link ${theme === 'dark' ? 'text-light' : 'text-primary'} p-2`} 
                            onClick={() => handlePasteFromClipboard('last')}
                            title="Paste Last Frame Image from Clipboard"
                            style={{ fontSize: '1.5rem' }} 
                            disabled={model === 'veo-3.0-generate-preview'}
                          >
                            <i className="bi bi-clipboard-plus"></i>
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Hidden file input, triggered by the upload icon */}
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
                        Last frame images are not supported by the 'veo-3.0-generate-preview' model.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Settings Section */}
              {/* <h3 className={`card-title h6 mb-2 mt-4 ${theme === 'dark' ? 'text-light' : 'text-muted'}`}><i className="bi bi-gear me-2"></i></h3> */}
              {/* Model Dropdown */}
              <div className="mb-3">
                <label htmlFor="modelSelect" className={`form-label ${theme === 'dark' ? 'text-light' : ''}`}><i className="bi bi-box me-2"></i>Model</label>
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

              {/* Ratio Dropdown */}
              <div className="mb-3">
                <label htmlFor="ratioSelect" className={`form-label ${theme === 'dark' ? 'text-light' : ''}`}><i className="bi bi-aspect-ratio me-2"></i>Aspect Ratio</label>
                <select
                  id="ratioSelect"
                  className="form-select"
                  value={ratio}
                  onChange={(e) => setRatio(e.target.value)}
                  disabled={isLoading}
                >
                  <option value="16:9">16:9 (Widescreen)</option>
                  <option value="9:16" disabled={model === 'veo-3.0-generate-preview'}>9:16 (Portrait){model === 'veo-3.0-generate-preview' ? ' (Not Supported)' : ''}</option>
                </select>
                {model === 'veo-3.0-generate-preview' && ratio === '9:16' && (
                   <p className="form-text text-warning small">
                     9:16 ratio is not supported by this model and has been reset to 16:9.
                   </p>
                )}
              </div>

              {/* Camera Control Dropdown */}
              <div className="mb-3">
                <label htmlFor="cameraControlSelect" className={`form-label ${theme === 'dark' ? 'text-light' : ''}`}><i className="bi bi-camera-video me-2"></i>Camera Control</label>
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

              {/* Video Duration Dropdown */}
              <div className="mb-3">
                <label htmlFor="durationSelect" className={`form-label ${theme === 'dark' ? 'text-light' : ''}`}><i className="bi bi-clock me-2"></i>Video Duration (seconds)</label>
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

              {/* GCS Output Bucket Input - Temporarily hidden */}
              <div className="mb-3" style={{ display: 'none' }}>
                <label htmlFor="gcsOutputBucket" className={`form-label ${theme === 'dark' ? 'text-light' : ''}`}><i className="bi bi-bucket me-2"></i>GCS Output Bucket (Optional)</label>
                <input
                  type="text"
                  className="form-control"
                  id="gcsOutputBucket"
                  placeholder="gs://your-bucket-name/path"
                  value={gcsOutputBucket}
                  onChange={(e) => setGcsOutputBucket(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              {/* The Video Height Slider has been moved to the main content area, under the video player. */}
              <button
                className="btn btn-primary w-100 mt-4"
                onClick={handleGenerateClick}
                disabled={isLoading || isRefining || !prompt.trim() || processingTaskCount >= 4}
              >
                {isLoading ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Generating...</> : (processingTaskCount >= 4 ? <><i className="bi bi-exclamation-triangle-fill me-2"></i>Max Processing Tasks</> : <><i className="bi bi-magic me-2"></i>Generate</>)}
              </button>
            </div>
          </div>
        </div>

        {/* Main Content (Video) */}
        <main className={`main-content-area flex-grow-1 p-4 ${theme === 'dark' ? 'bg-dark text-light' : ''}`}>
          {/* Video Column - No longer needs Bootstrap row/col for simple single column */}
          <div>
            <div ref={videoContainerRef} className="card video-display-card"> {/* Added ref and a class for potential styling */}
              <div className="card-body" style={{ height: `${videoHeight}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                {
                  (taskStatus === 'processing' || taskStatus === 'Initializing...' || taskStatus === 'pending') ? (
                    <div className="flashlight-loader w-100 h-100"> {/* Ensure loader fills the card-body */}
                      <p>Processing, please wait...</p>
                    </div>
                  ) : (taskStatus === 'failed' || taskStatus === 'error') ? (
                    <div className="d-flex flex-column justify-content-center align-items-center w-100 h-100">
                      <img src="/fail.png" alt="Failed" style={{ width: '100px', height: '100px', marginBottom: '10px' }} />
                      <p >Something is wrong! Please check your prompt and settings.</p>
                    </div>
                  ) : taskStatus === 'completed' ? ( // Group completed tasks
                    videoGcsUri ? ( // Completed and URI exists
                      <video key={videoGcsUri} ref={videoRef} controls autoPlay loop src={videoGcsUri} className="w-100" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', backgroundColor: theme === 'dark' ? '#343a40' : '#000000' }}>
                        Your browser does not support the video tag.
                      </video>
                    ) : ( // Completed but NO URI
                      <div className={`${theme === 'dark' ? 'bg-secondary' : 'bg-light'} border rounded d-flex align-items-center justify-content-center w-100 h-100`}>
                        <p className="text-danger">{errorMessage || "Video data is unavailable for this completed task."}</p>
                      </div>
                    )
                  ) : isLoading || isRefining ? ( // Generic spinner if still loading but not yet processing/failed/completed
                    <div className="d-flex justify-content-center align-items-center w-100 h-100">
                      <div className={`spinner-border ${theme === 'dark' ? 'text-light' : 'text-primary'}`} role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  ) : ( // Default placeholder
                    <div className={`${theme === 'dark' ? 'bg-secondary' : 'bg-light'} border rounded d-flex flex-column align-items-center justify-content-center w-100 h-100`}>
                      <img src="/dream.png" alt="Start dreaming!" style={{ width: '150px', height: '150px', opacity: 0.7 }} />
                    </div>
                  )
                }
              </div>
              {/* Drag Handle for Resizing Video Area Height */}
              <div
                className="video-resize-handle"
                onMouseDown={handleMouseDownResize}
                title={`Drag to resize video area (Current: ${videoHeight}px)`}
              >
                <i className="bi bi-grip-horizontal"></i> {/* Example icon, can be styled */}
              </div>
            </div>

            {/* Task Information Box - Remains below the video card */}
            {taskId && (
              <div className="card mt-3"> {/* Rely on data-bs-theme for dark mode card styling */}
                <div className="card-body">
                  <h5 className="card-title"><i className="bi bi-info-circle me-2"></i>Task Detail</h5>
                  <p className="card-text mb-1"><strong><i className="bi bi-fingerprint me-2"></i>Task ID:</strong> <small>{taskId}</small></p>
                  {currentTask && currentTask.prompt && (
                    <p className="card-text mb-1" style={{ wordBreak: 'break-all' }}><strong><i className="bi bi-blockquote-left me-2"></i>Prompt:</strong> {currentTask.prompt}</p>
                  )}
                  {currentTask && typeof currentTask.created_at !== 'undefined' && (
                    <p className="card-text mb-1">
                      <strong><i className="bi bi-clock me-2"></i>Time:</strong>{' '}
                      {new Date(currentTask.created_at * 1000).toLocaleDateString()}{' '}
                      {new Date(currentTask.created_at * 1000).toLocaleTimeString()}
                    </p>
                  )}
                  <p className="card-text"><strong><i className="bi bi-activity me-2"></i>Status:</strong> {taskStatus}</p>
                  {taskStatus === 'completed' && videoGcsUri && (
                    <>
                      <p className="card-text mb-1">
                        <strong><i className="bi bi-link-45deg me-2"></i>Download URL:</strong> <a href={videoGcsUri} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all' }}>{videoGcsUri}</a>
                      </p>
                      {currentTask && currentTask.video_gcs_uri && ( // Check if currentTask and its video_gcs_uri exist
                        <p className="card-text mb-1" style={{ wordBreak: 'break-all' }}>
                          <strong><i className="bi bi-cloud-arrow-down me-2"></i>GCS Video URI:</strong> {currentTask.video_gcs_uri}
                        </p>
                      )}
                    </>
                  )}
                  {errorMessage && taskStatus !== 'completed' && <p className="card-text text-danger mb-2"><strong><i className="bi bi-exclamation-triangle me-2"></i>Error:</strong> {errorMessage}</p>}
                  {(taskStatus === 'completed' || taskStatus === 'failed' || taskStatus === 'error') && (
                    <div>
                      <button
                        className="btn btn-danger btn-sm mt-2 me-2"
                        onClick={() => handleDeleteTask(taskId)}
                        disabled={isLoading} // Disable if another operation is in progress
                        title="Delete Task" // Add title for accessibility
                      >
                        <i className="bi bi-trash3"></i>
                      </button>
                      {taskStatus === 'completed' && videoGcsUri && ( // Only show extend if task is complete and has a video
                        <button
                          className="btn btn-info btn-sm mt-2"
                          onClick={() => handleExtendVideoClick(taskId)}
                          disabled={isLoading || isExtending || !currentTask || !currentTask.video_gcs_uri}
                          title="Extend Video"
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
        </main>

        {/* Right Sidebar (History) */}
        <div className={`right-sidebar p-3 border-start ${theme === 'dark' ? 'bg-dark text-light' : 'bg-light text-dark'}`} style={{ display: 'flex', flexDirection: 'column' }}> {/* Ensure right-sidebar is also a flex column */}
          <div className="card border-0 flex-grow-1"> {/* Allow card to grow and fill available space */}
            <div className="card-body d-flex flex-column h-100"> {/* Make card-body a flex container and take full height */}
              <h2 className="card-title h5 mb-3" onClick={fetchHistoryTasks} style={{ cursor: 'pointer' }} title="Refresh history"><i className="bi bi-clock-history me-2"></i>History</h2> {/* Added mb-3 for spacing */}
              <div className="mb-3">
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Filter by prompt..."
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                />
              </div>
              {historyTasks.filter(task => task.prompt && task.prompt.toLowerCase().includes(historyFilter.toLowerCase())).length === 0 && <p className={`${theme === 'dark' ? 'text-light' : 'text-muted'}`}>No matching tasks.</p>}
              <ul className="list-group list-group-flush flex-grow-1" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 10px)' }}> {/* Adjusted maxHeight for filter input */}
                {historyTasks
                  .filter(task => task.prompt && task.prompt.toLowerCase().includes(historyFilter.toLowerCase()))
                  .map((task) => (
                  <li
                    key={task.task_id}
                    className={`list-group-item-action d-flex flex-column align-items-center p-2 ${theme === 'dark' ? 'list-group-item-dark-no-border' : 'list-group-item-light-no-border'} ${task.task_id === taskId ? 'has-selected-thumbnail' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleHistoryItemClick(task)}
                  >
                    {(task.status === 'completed' && task.local_thumbnail_path) ? (
                      <div className={`thumbnail-container position-relative mb-2 ${task.task_id === taskId ? 'selected-thumbnail-custom-border' : ''}`}>
                        <img
                          src={`${BACKEND_URL}${task.local_thumbnail_path}`}
                          alt={`Thumbnail for ${task.prompt}`}
                          className="img-thumbnail"
                        />
                        <div className="play-icon-overlay position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center">
                          <i className="bi bi-play-circle-fill text-white" style={{ fontSize: '2rem' }}></i>
                        </div>
                      </div>
                    ) : (task.status === 'processing' || task.status === 'pending') ? (
                      <img
                        src="/gears.gif"
                        alt="Processing task"
                        className="img-thumbnail mb-2"
                        style={{ width: '80px', height: '80px' }}
                      />
                    ) : task.status === 'failed' ? (
                      <img
                        src="/fail.png"
                        alt="Failed task"
                        className="img-thumbnail mb-2"
                        style={{ width: '80px', height: '80px' }}
                      />
                    ) : null}

                    {/* Display status badge for processing and other non-final states, excluding pending as it's covered by the gear icon */}
                    {task.status !== 'completed' && task.status !== 'failed' && task.status !== 'pending' && (
                      <div>
                          <small className={`badge bg-${task.status === 'processing' ? 'info' : 'secondary'}`}>
                            {task.status}
                          </small>
                      </div>
                    )}
                    {/* Specifically display pending status text if needed, or rely on the gear icon */}
                    {task.status === 'pending' && (
                       <div>
                           <small className="badge bg-warning text-dark">
                               {task.status}
                           </small>
                       </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <footer className={`${theme === 'dark' ? 'bg-dark text-light' : 'bg-light text-dark'} text-center text-lg-start mt-auto`}>
        <div className="text-center p-3" style={{ backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }}>
          © 2025 Dreamer-V
            </div>
          </footer>

          {/* Image Preview Modal */}
          {showImageModal && (
            <div
              className="modal fade show"
              tabIndex="-1"
              style={{
                display: 'flex', // Use flex to center
                alignItems: 'center', // Vertical center
                justifyContent: 'center', // Horizontal center
                position: 'fixed', // Ensure it covers the whole screen
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0,0,0,0.5)',
                zIndex: 1050 // Ensure it's above other content
              }}
              onClick={(e) => {
                // Close modal only if backdrop is clicked, not content
                if (e.target === e.currentTarget) {
                  setShowImageModal(false);
                }
              }}
            >
              <div className="modal-dialog modal-xl" style={{ margin: 0, display: 'flex', alignItems: 'center', minHeight: 'calc(100% - (1.75rem * 2))' }}> {/* Changed to modal-xl, Ensure dialog takes height for centering content */}
                <div className="modal-content" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column', width: '100%' }}> {/* Increased maxHeight to 90vh, enable flex for body growth */}
                  <div className="modal-body text-center" style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}> {/* Body grows and centers image */}
                    {/* Ensure image itself doesn't prevent modal click-outside-to-close */}
                    <img
                      src={modalImageUrl}
                      alt="Preview"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                      onClick={(e) => e.stopPropagation()} // Prevent click on image from closing modal
                    />
                    <button
                      type="button"
                      className="btn-close btn-close-white position-absolute top-0 end-0 m-3"
                      aria-label="Close"
                      style={{filter: 'invert(1) grayscale(100%) brightness(200%)', zIndex: 1051}} // Ensure close button is clickable
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent click on button from closing modal via backdrop click
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
