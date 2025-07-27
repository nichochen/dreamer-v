import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css'; // Keep App.css for any custom styles not covered by Bootstrap
import { useTranslation } from 'react-i18next';
import {
  BACKEND_URL, // Keep BACKEND_URL for direct use in JSX if needed, or remove if only used by api.js
  HEALTH_CHECK_URL, // Keep for direct use or remove
  STATUS_PENDING,
  STATUS_PROCESSING,
  STATUS_COMPLETED,
  STATUS_FAILED,
  STATUS_ERROR,
  STATUS_INITIALIZING,
  STATUS_COMPLETED_WAITING_URI,
} from './constants';
import { urlToImageFile } from './utils'; // Keep if used directly, or it's only used by handlers.js
import * as Api from './api';
import * as Handlers from './handlers';
import TopToolbar from './components/TopToolbar';
import Footer from './components/Footer';
import ImageModal from './components/ImageModal';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import HistorySidebar from './components/HistorySidebar';
import UsageAnalysisModal from './components/UsageAnalysisModal';

function App() {
  const { t, i18n } = useTranslation();
  const pixelsPerSecond = 20; // Width in pixels for each second of video/timeline

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
  const [cameraControl, setCameraControl] = useState(''); // Default camera control
  const [duration, setDuration] = useState(5); // Default duration in seconds, changed to 5
  const [resolution, setResolution] = useState('720p'); // Default resolution
  const [gcsOutputBucket, setGcsOutputBucket] = useState(''); // GCS output bucket
  const [generateAudio, setGenerateAudio] = useState(false);
  const [theme, setTheme] = useState('dark'); // 'light' or 'dark' - Defaulted to dark
  const [videoHeight, setVideoHeight] = useState(600); // Default height in pixels (was 750)
  const [isResizing, setIsResizing] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startHeight, setStartHeight] = useState(0);
  const [userEmail, setUserEmail] = useState(''); // New state for user email
  const [showUserDropdown, setShowUserDropdown] = useState(false); // New state for user dropdown visibility
  const [showUsageAnalysisModal, setShowUsageAnalysisModal] = useState(false);

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
  const [selectedMusicFile, setSelectedMusicFile] = useState(null); // For storing the uploaded music file
  // const [isGeneratingMusic, setIsGeneratingMusic] = useState(false); // To be derived from musicTaskStatus
  // const [isMusicEnabled, setIsMusicEnabled] = useState(false); // REMOVED
  const [musicTaskId, setMusicTaskId] = useState(null);
  const [musicTaskStatus, setMusicTaskStatus] = useState(''); // e.g., 'pending', 'processing', 'completed', 'failed'
  const [generatedMusicUrl, setGeneratedMusicUrl] = useState('');
  const [musicErrorMessage, setMusicErrorMessage] = useState('');
  const [musicPollingIntervalId, setMusicPollingIntervalId] = useState(null);
  const [uploadedMusicBackendUrl, setUploadedMusicBackendUrl] = useState(null); // New state for backend URL of uploaded music
  // const [musicCompletedUriPollRetries, setMusicCompletedUriPollRetries] = useState(0); // Removed

  const [isPlayingTrack, setIsPlayingTrack] = useState(false); // Lifted from MainContent

  const [isGeneratingFirstFrame, setIsGeneratingFirstFrame] = useState(false); // New state for first frame generation
  const [generatedFirstFrameImageUrl, setGeneratedFirstFrameImageUrl] = useState(''); // To store the URL from backend
  const [firstFrameImageGenerationError, setFirstFrameImageGenerationError] = useState(''); // Error specific to first frame
  const [isGeneratingLastFrame, setIsGeneratingLastFrame] = useState(false); // New state for last frame generation
  const [generatedLastFrameImageUrl, setGeneratedLastFrameImageUrl] = useState(''); // To store the URL from backend for last frame
  const [lastFrameImageGenerationError, setLastFrameImageGenerationError] = useState(''); // Error specific to last frame

  const handleClearMusicSelection = () => {
    setSelectedMusicFile(null);
    setUploadedMusicBackendUrl(null);
    setMusicErrorMessage(''); // Clear any music-related errors
    // If there's a music file input ref, you might want to reset its value too
    // e.g., if (musicFileInputRef.current) musicFileInputRef.current.value = "";
    // This is handled in MainContent.js directly for now.
  };

  const handleGenerateFirstFrameImage = async () => {
    if (!prompt.trim()) {
      setFirstFrameImageGenerationError(t('promptRequiredForImageGeneration')); // Use specific error state
      return;
    }
    // Clear previous image and error before starting a new generation
    setImagePreview('');
    setSelectedImage(null);
    setGeneratedFirstFrameImageUrl('');
    setFirstFrameImageGenerationError('');
    // General error message can also be cleared if it's not intended to persist across different operations
    setErrorMessage(''); 

    // Call the actual handler
    await Handlers.handleGenerateImageClick({
      prompt,
      ratio, // This is the aspectRatio for the backend
      setIsGeneratingImage: setIsGeneratingFirstFrame,
      setGeneratedImageUrl: setGeneratedFirstFrameImageUrl, // Store the URL from backend
      setImageGenerationError: setFirstFrameImageGenerationError,
      t,
    });
  };

  // Effect to update imagePreview and selectedImage when generatedFirstFrameImageUrl changes
  useEffect(() => {
    const updatePreviewFromGeneratedUrl = async () => {
      if (generatedFirstFrameImageUrl && !firstFrameImageGenerationError) {
        setImagePreview(generatedFirstFrameImageUrl); // Display the image from the URL
        try {
          // Attempt to convert the URL to a File object to allow re-submission with video generation
          const filename = generatedFirstFrameImageUrl.substring(generatedFirstFrameImageUrl.lastIndexOf('/') + 1);
          const imageFile = await urlToImageFile(generatedFirstFrameImageUrl, filename);
          if (imageFile) {
            setSelectedImage(imageFile);
            console.log("Generated first frame image set as selectedImage:", imageFile.name);
          } else {
            console.warn("Could not convert generated first frame image URL to File object.");
            // setSelectedImage(null); // Or keep previous if any
          }
        } catch (e) {
          console.error("Error converting generated image URL to file:", e);
          // setSelectedImage(null);
        }
      }
    };
    updatePreviewFromGeneratedUrl();
  }, [generatedFirstFrameImageUrl, firstFrameImageGenerationError]);


  const handleGenerateLastFrameImage = async () => {
    if (!prompt.trim()) {
      setLastFrameImageGenerationError(t('promptRequiredForImageGeneration')); // Use specific error state
      return;
    }
    // Clear previous image and error
    setLastImagePreview('');
    setSelectedLastImage(null);
    setGeneratedLastFrameImageUrl('');
    setLastFrameImageGenerationError('');
    setErrorMessage('');

    await Handlers.handleGenerateImageClick({
      prompt,
      ratio,
      setIsGeneratingImage: setIsGeneratingLastFrame,
      setGeneratedImageUrl: setGeneratedLastFrameImageUrl,
      setImageGenerationError: setLastFrameImageGenerationError,
      t,
    });
  };

  // Effect to update lastImagePreview and selectedLastImage when generatedLastFrameImageUrl changes
  useEffect(() => {
    const updatePreviewFromGeneratedUrl = async () => {
      if (generatedLastFrameImageUrl && !lastFrameImageGenerationError) {
        setLastImagePreview(generatedLastFrameImageUrl); // Display the image
        try {
          const filename = generatedLastFrameImageUrl.substring(generatedLastFrameImageUrl.lastIndexOf('/') + 1);
          const imageFile = await urlToImageFile(generatedLastFrameImageUrl, filename);
          if (imageFile) {
            setSelectedLastImage(imageFile);
            console.log("Generated last frame image set as selectedLastImage:", imageFile.name);
          } else {
            console.warn("Could not convert generated last frame image URL to File object.");
          }
        } catch (e) {
          console.error("Error converting generated last frame image URL to file:", e);
        }
      }
    };
    updatePreviewFromGeneratedUrl();
  }, [generatedLastFrameImageUrl, lastFrameImageGenerationError]);

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

  // Function to ensure track playback is stopped
  const ensureTrackPlaybackStopped = useCallback(() => {
    if (isPlayingTrack) {
      if (createModeVideoRef.current) {
        createModeVideoRef.current.pause();
      }
      setIsPlayingTrack(false);
      console.log('[App.js] ensureTrackPlaybackStopped: Playback stopped.');
      // MainContent's useEffect watching isPlayingTrack will handle music and clip index reset.
    }
  }, [isPlayingTrack, createModeVideoRef, setIsPlayingTrack]); // createModeVideoRef is stable, setIsPlayingTrack is stable

  const [activeImageTab, setActiveImageTab] = useState('first'); // 'first' or 'last'

  // Wrapped API calls for useCallback
  const memoizedFetchHistoryTasks = useCallback(() => {
    if (isBackendReady) {
      Api.getTasks(1, setHistoryTasks, () => {}, t);
    }
  }, [isBackendReady, setHistoryTasks, t]);

  const memoizedCheckBackendHealth = useCallback(() => {
    Api.checkBackendHealth(setIsBackendReady, t);
  }, [setIsBackendReady, t]);

  const memoizedFetchUserEmail = useCallback(() => {
    if (isBackendReady) {
      Api.fetchUserEmail(setUserEmail, t);
    }
  }, [isBackendReady, setUserEmail, t]);


  useEffect(() => {
    if (!isBackendReady) {
      memoizedCheckBackendHealth();
    }
  }, [isBackendReady, memoizedCheckBackendHealth]);

  useEffect(() => {
    if (isBackendReady) {
      memoizedFetchHistoryTasks();
    }
  }, [isBackendReady, memoizedFetchHistoryTasks]);

  useEffect(() => {
    if (isBackendReady) {
      memoizedFetchUserEmail();
    }
  }, [isBackendReady, memoizedFetchUserEmail]);

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme);
  }, [theme]);

  useEffect(() => {
    // Existing logic for camera control and duration
    if (model !== 'veo-2.0-generate-exp') {
      setCameraControl(''); // Reset to default if model does not support camera control
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

    // New logic for veo-3.0 models limitations
    if (model.startsWith('veo-3.0')) {
      // Limitation: No last frame image
      if (selectedLastImage) {
        // Assuming clearLastImagePreview is stable and correctly clears state
        doClearLastImagePreview();
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
    } else {
      setResolution('720p');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, duration, selectedLastImage, ratio, activeImageTab, setCameraControl, setDuration, setRatio, setActiveImageTab]); // Added setters to dependency array as per exhaustive-deps, clearLastImagePreview is defined in scope

  // Effect to stop track playback if view changes from 'create' while playing
  const prevActiveViewRef = useRef();
  useEffect(() => {
    if (prevActiveViewRef.current === 'create' && activeView !== 'create') {
      ensureTrackPlaybackStopped(); // Call the centralized stop function
    }
    prevActiveViewRef.current = activeView;
  }, [activeView, ensureTrackPlaybackStopped]); // ensureTrackPlaybackStopped depends on isPlayingTrack

  // Removed handleMouseDownResize as it's in handlers.js

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

  // Paste handlers for image previews are useEffects that attach event listeners.
  // These might be better as part of specific components or managed differently if those components are extracted.
  // For now, keeping them here but noting they are candidates for further refactoring.
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
  }, [imagePreviewRef]); // Dependency on the ref

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
  }, [lastImagePreviewRef]); // Dependency on the ref

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

  // Memoized pollTaskStatus
  const memoizedPollTaskStatus = useCallback(() => {
    Api.pollTaskStatus({
      taskId, taskStatus, pollingIntervalId, completedUriPollRetries,
      getTasks: memoizedFetchHistoryTasks, // Use memoized version
      setTaskStatus, setVideoGcsUri, setErrorMessage, setPollingIntervalId,
      setCompletedUriPollRetries, setPrompt, setModel, setRatio,
      setCameraControl, setDuration, setResolution, setGcsOutputBucket, t,
    });
  }, [
    taskId, taskStatus, pollingIntervalId, completedUriPollRetries, memoizedFetchHistoryTasks,
    setTaskStatus, setVideoGcsUri, setErrorMessage, setPollingIntervalId,
    setCompletedUriPollRetries, setPrompt, setModel, setRatio,
    setCameraControl, setDuration, setResolution, setGcsOutputBucket, t
  ]);

  // Poll for Video Task Status
  useEffect(() => {
    if (taskId &&
        (taskStatus === STATUS_PENDING || taskStatus === STATUS_PROCESSING || taskStatus === STATUS_INITIALIZING ||
         taskStatus === STATUS_COMPLETED_WAITING_URI ||
         (taskStatus === STATUS_COMPLETED && !videoGcsUri && completedUriPollRetries < 3))) {
      if (!pollingIntervalId) {
        const intervalId = setInterval(memoizedPollTaskStatus, 5000);
        setPollingIntervalId(intervalId);
      }
    } else if (pollingIntervalId) {
      if ((taskStatus === STATUS_COMPLETED && (videoGcsUri || completedUriPollRetries >= 3)) ||
           taskStatus === STATUS_FAILED ||
           taskStatus === STATUS_ERROR) {
        clearInterval(pollingIntervalId);
        setPollingIntervalId(null);
      }
    }
    return () => {
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
      }
    };
  }, [taskId, taskStatus, videoGcsUri, completedUriPollRetries, pollingIntervalId, memoizedPollTaskStatus]);

  // Poll for Music Task Status
  const memoizedPollMusicTaskStatus = useCallback(() => {
    Api.pollMusicTaskStatus({ 
      musicTaskId, 
      musicTaskStatus, 
      musicPollingIntervalId, // Pass current intervalId for clearing
      setMusicTaskStatus, 
      setGeneratedMusicUrl, 
      setMusicErrorMessage, 
      setMusicPollingIntervalId,
      t, 
      BACKEND_URL, 
    });
  }, [
    musicTaskId, 
    musicTaskStatus, 
    // musicPollingIntervalId, // Removed from dependencies
    setMusicTaskStatus, 
    setGeneratedMusicUrl, 
    setMusicErrorMessage, 
    setMusicPollingIntervalId,
    t 
    // BACKEND_URL is stable from constants, t is stable from useTranslation
  ]);

  useEffect(() => {
    if (musicTaskId &&
        (musicTaskStatus === STATUS_PENDING || musicTaskStatus === STATUS_PROCESSING || musicTaskStatus === STATUS_INITIALIZING)) {
      if (!musicPollingIntervalId) {
        const intervalId = setInterval(memoizedPollMusicTaskStatus, 3000);
        setMusicPollingIntervalId(intervalId);
      }
    } else if (musicPollingIntervalId) {
      // Stop polling if status is completed, failed, or error
      if (musicTaskStatus === STATUS_COMPLETED || musicTaskStatus === STATUS_FAILED || musicTaskStatus === STATUS_ERROR) {
        clearInterval(musicPollingIntervalId);
        setMusicPollingIntervalId(null);
      }
    }
    return () => {
      if (musicPollingIntervalId) {
        clearInterval(musicPollingIntervalId);
      }
    };
  }, [musicTaskId, musicTaskStatus, musicPollingIntervalId, memoizedPollMusicTaskStatus]); // generatedMusicUrl and musicCompletedUriPollRetries removed from deps


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
      // createModeVideoRef.current.load(); // Removed: autoPlay and key change should handle loading
      createModeVideoRef.current.play().catch(error => console.warn("Create mode video autoplay failed:", error));
    }
  }, [videoGcsUri, taskStatus, activeCreateModeVideoSrc, activeView]); // videoRef is stable, not needed in deps

  // Effect to reconcile taskStatus with historyTasks
  useEffect(() => {
    if (taskId && historyTasks.length > 0 && activeView === 'dream') {
      const taskFromHistory = historyTasks.find(t => t.task_id === taskId);
      if (taskFromHistory) {
        const historyStatus = taskFromHistory.status;
        const historyVideoUri = taskFromHistory.local_video_path ? `${BACKEND_URL}${taskFromHistory.local_video_path}` : '';
        const historyErrorMessage = taskFromHistory.error_message || '';

        if (historyStatus === STATUS_COMPLETED && historyVideoUri) {
          if (taskStatus !== STATUS_COMPLETED || videoGcsUri !== historyVideoUri || errorMessage) {
            setTaskStatus(STATUS_COMPLETED);
            setVideoGcsUri(historyVideoUri);
            setErrorMessage('');
            if (pollingIntervalId) { clearInterval(pollingIntervalId); setPollingIntervalId(null); setCompletedUriPollRetries(0); }
          }
        } else if (historyStatus === STATUS_FAILED) {
          const newErrorMessage = historyErrorMessage || t('errorTaskStatusGeneric', {status: t(historyStatus + 'Status')});
          if (taskStatus !== STATUS_FAILED || videoGcsUri !== historyVideoUri || errorMessage !== newErrorMessage) {
            setTaskStatus(STATUS_FAILED);
            setVideoGcsUri(historyVideoUri);
            setErrorMessage(newErrorMessage);
            if (pollingIntervalId) { clearInterval(pollingIntervalId); setPollingIntervalId(null); setCompletedUriPollRetries(0); }
          }
        } else if (historyStatus === STATUS_ERROR) {
            const newErrorMessage = historyErrorMessage || t('errorTaskStatusGeneric', {status: t(historyStatus + 'Status')});
            if (taskStatus !== STATUS_ERROR || videoGcsUri !== historyVideoUri || errorMessage !== newErrorMessage) {
              setTaskStatus(STATUS_ERROR);
              setVideoGcsUri(historyVideoUri);
              setErrorMessage(newErrorMessage);
              if (pollingIntervalId) { clearInterval(pollingIntervalId); setPollingIntervalId(null); setCompletedUriPollRetries(0); }
            }
        } else if (historyStatus === STATUS_PROCESSING && (taskStatus === STATUS_PENDING || taskStatus === STATUS_INITIALIZING)) {
            if (taskStatus !== STATUS_PROCESSING) {
                setTaskStatus(STATUS_PROCESSING);
                if (historyVideoUri && videoGcsUri !== historyVideoUri) setVideoGcsUri(historyVideoUri);
                if (historyErrorMessage && errorMessage !== historyErrorMessage) setErrorMessage(historyErrorMessage);
            }
        }
      }
    }
  }, [historyTasks, taskId, taskStatus, videoGcsUri, errorMessage, pollingIntervalId, activeView, setTaskStatus, setVideoGcsUri, setErrorMessage, setPollingIntervalId, setCompletedUriPollRetries, t]);

  // Effect for task timeout
  useEffect(() => {
    const now = new Date().getTime();
    const fiveMinutes = 5 * 60 * 1000;
    historyTasks.forEach(task => {
      if (task.status === STATUS_PROCESSING) {
        const taskTime = new Date(task.created_at * 1000).getTime();
        if (now - taskTime > fiveMinutes) {
          Api.updateTaskStatus(task.task_id, STATUS_FAILED, 'Task timed out after 5 minutes.');
        }
      }
    });
  }, [historyTasks]);

  // Effect for periodic refresh of the entire history if there are ongoing tasks
  useEffect(() => {
    const hasNonFinalTasks = historyTasks.some(task => task.status === STATUS_PENDING || task.status === STATUS_PROCESSING);
    let historyRefreshIntervalId = null;

    if (hasNonFinalTasks) {
      historyRefreshIntervalId = setInterval(memoizedFetchHistoryTasks, 10000);
    }
    return () => {
      if (historyRefreshIntervalId) {
        clearInterval(historyRefreshIntervalId);
      }
    };
  }, [historyTasks, memoizedFetchHistoryTasks]);

  const currentTask = historyTasks.find(task => task.task_id === taskId);
  const processingTaskCount = historyTasks.filter(task => task.status === 'processing').length;

  // Prepare bound versions of API calls that will be used by handlers
  const boundHandleRefinePrompt = useCallback((args) => Api.handleRefinePrompt({
    ...args, currentPrompt: prompt, isRefining, setIsRefining, setActiveSpinnerButtonKey, setErrorMessage, setPrompt, t,
  }), [prompt, isRefining, setIsRefining, setActiveSpinnerButtonKey, setErrorMessage, setPrompt, t]);

  // Prepare bound versions of handlers
  const doHandleImagePreviewClick = (imageUrl) => Handlers.handleImagePreviewClick(imageUrl, setModalImageUrl, setShowImageModal);
  const doHandlePasteFromClipboard = (target) => Handlers.handlePasteFromClipboard(target, setSelectedImage, setImagePreview, setSelectedLastImage, setLastImagePreview, setErrorMessage, t);
  const doHandleMouseDownResize = (e) => Handlers.handleMouseDownResize(e, setIsResizing, setStartY, setStartHeight, videoHeight);
  const doToggleTheme = () => Handlers.toggleTheme(setTheme);
  const doHandlePromptChange = (e) => Handlers.handlePromptChange(e, setPrompt);
  const doHandleImageChange = (e) => Handlers.handleImageChange(e, setSelectedImage, setImagePreview, fileInputRef);
  const doClearImagePreview = () => Handlers.clearImagePreview(setSelectedImage, setImagePreview, fileInputRef);
  const doHandleLastImageChange = (e) => Handlers.handleLastImageChange(e, setSelectedLastImage, setLastImagePreview, lastFileInputRef);
  const doClearLastImagePreview = () => Handlers.clearLastImagePreview(setSelectedLastImage, setLastImagePreview, lastFileInputRef);

  const doHandleGenerateClick = () => Api.handleGenerateClick({
    prompt, model, ratio, cameraControl, duration, gcsOutputBucket, selectedImage, selectedLastImage, generateAudio, resolution,
    setIsLoading, setErrorMessage, setVideoGcsUri, setTaskStatus, setCompletedUriPollRetries,
    pollingIntervalId, setPollingIntervalId, setTaskId, getTasks: memoizedFetchHistoryTasks, t,
  });

  const doHandleHistoryItemClick = (task) => {
    ensureTrackPlaybackStopped(); // Stop playback before handling history item click
    Handlers.handleHistoryItemClick({
      task, activeView, pollingIntervalId, setPollingIntervalId, setCompletedUriPollRetries,
      setCreateModeClips, setActiveCreateModeVideoSrc, setSelectedClipInTrack,
    setPrompt, setModel, setRatio, setCameraControl, setDuration, setResolution, setGcsOutputBucket,
    setTaskId, setVideoGcsUri, setTaskStatus, setErrorMessage, setIsLoading,
    setSelectedImage, setImagePreview, setSelectedLastImage, setLastImagePreview, t,
  });
}; // Added missing closing brace

  const doHandleDeleteTask = (idToDelete) => Api.handleDeleteTask({
    idToDelete, taskId, activeView, createModeClips, selectedClipInTrack, setIsLoading,
    setPrompt, setModel, setRatio, setCameraControl, setDuration, setGcsOutputBucket,
    setTaskId, setTaskStatus, setVideoGcsUri, setErrorMessage, setSelectedImage,
    setImagePreview, setSelectedLastImage, setLastImagePreview, setCreateModeClips,
    setActiveCreateModeVideoSrc, setSelectedClipInTrack, getTasks: memoizedFetchHistoryTasks, t,
  });
  
  const doHandleCreateVideoClick = () => {
    ensureTrackPlaybackStopped(); // Stop playback before creating video
    Handlers.handleCreateVideoClick({
      createModeClips,
      uploadedMusicBackendUrl, // Added
      generatedMusicUrl,     // Added
      setErrorMessage, 
      setIsCreatingVideo, 
      t,
      setTaskId, 
      setTaskStatus, 
      getTasks: memoizedFetchHistoryTasks,
      setActiveView, 
      setCreateModeClips, 
      setSelectedClipInTrack, 
      setActiveCreateModeVideoSrc, 
    });
  };

  const handleGenerateMusicFeatureComingSoon = () => {
    alert(t('musicGenerationComingSoonMessage', 'Music generation feature is coming soon!'));
  };

  const doHandleGenerateMusicClick = () => Api.handleGenerateMusicClick({
    // musicPrompt: "A happy tune" // Example, if you add a dedicated music prompt state
    setMusicErrorMessage,
    setMusicTaskStatus,
    // setMusicCompletedUriPollRetries, // Removed
    musicPollingIntervalId, // Pass to clear if a new request is made while old one is polling
    setMusicPollingIntervalId,
    setMusicTaskId,
    setGeneratedMusicUrl, // To clear previous music URL
    setSelectedMusicFile, // To clear selected file when generating new
    setUploadedMusicBackendUrl, // To clear uploaded backend URL when generating new
    t,
    // You might need a specific music prompt state if it's different from the video prompt
    // musicPrompt: "A happy tune" // Example
  });


  const doHandleKeywordButtonClick = (keyword) => Handlers.handleKeywordButtonClick(keyword, prompt, setPrompt, boundHandleRefinePrompt);

  const doHandleExtendVideoClick = (taskIdToExtend) => Api.handleExtendVideoClick({
    taskIdToExtend, isExtending, setIsExtending, setErrorMessage, pollingIntervalId, setPollingIntervalId,
    currentTaskId: taskId, setTaskId, setActiveView, setTaskStatus, getTasks: memoizedFetchHistoryTasks, t,
  });

  const handleClipClick = (clip) => {
    if (clip.local_video_path) {
      setActiveCreateModeVideoSrc(`${BACKEND_URL}${clip.local_video_path}`);
      setSelectedClipInTrack(clip.trackInstanceId);
      if (createModeVideoRef.current) {
        // createModeVideoRef.current.load(); // Removed: autoPlay and key change should handle loading
        createModeVideoRef.current.play().catch(e => console.warn("Clip track play failed", e));
      }
    } else {
      console.warn("Clicked clip instance has no video path:", clip);
    }
  };

  const handleRemoveClipFromTrack = (trackInstanceIdToRemove) => {
    setCreateModeClips(prevClips => prevClips.filter(c => c.trackInstanceId !== trackInstanceIdToRemove));
    if (selectedClipInTrack === trackInstanceIdToRemove) {
      setActiveCreateModeVideoSrc('');
      setSelectedClipInTrack(null);
    }
  };

  const handleDragEnd = (result) => {
    if (!result.destination) {
      return;
    }
    const items = Array.from(createModeClips);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setCreateModeClips(items);
  };

  const handleUpdateClip = (trackInstanceId, newStartOffset, newDuration) => {
    setCreateModeClips(prevClips =>
      prevClips.map(clip =>
        clip.trackInstanceId === trackInstanceId
          ? { ...clip, start_offset_seconds: newStartOffset, duration_seconds: newDuration }
          : clip
      )
    );
    // If the currently playing/selected clip is the one being updated,
    // you might want to re-evaluate its playback or seek if the start_offset changed.
    // For now, just updating the data.
  };

  // promptActionButtons need to use the new handlers
  const promptActionButtons = [
    { label: t("refinePromptButton"), onClick: () => boundHandleRefinePrompt({ promptToRefine: prompt, buttonKey: t("refinePromptButton") }), icon: "bi-stars", keywordEffect: false, disabled: !prompt.trim() },
    { label: t("nightTimeButton"), onClick: () => doHandleKeywordButtonClick("night time"), icon: "bi-moon-stars-fill", keywordEffect: true },
    { label: t("cinematicButton"), onClick: () => doHandleKeywordButtonClick("cinematic, 8K"), icon: "bi-film", keywordEffect: true },
    { label: t("animationButton"), onClick: () => doHandleKeywordButtonClick("animation, pixar 3D style"), icon: "bi-easel2", keywordEffect: true },
    { label: t("realisticButton"), onClick: () => doHandleKeywordButtonClick("realistic"), icon: "bi-camera-fill", keywordEffect: true },
    { label: t("creativeButton"), onClick: () => doHandleKeywordButtonClick("creative"), icon: "bi-lightbulb-fill", keywordEffect: true },
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
          <TopToolbar
            userEmail={userEmail}
            userDropdownRef={userDropdownRef}
            showUserDropdown={showUserDropdown}
            setShowUserDropdown={setShowUserDropdown}
            theme={theme}
            onToggleTheme={doToggleTheme}
            i18n={i18n}
            onChangeLanguage={changeLanguage}
            t={t}
            activeView={activeView} // Pass to TopToolbar
            setActiveView={setActiveView} // Pass to TopToolbar
            onUsageAnalysisClick={() => setShowUsageAnalysisModal(true)}
          />

          <div className="app-body d-flex flex-grow-1">
            <Sidebar
              theme={theme}
              t={t}
              activeView={activeView} // Pass activeView to Sidebar
              // setActiveView is still handled by TopToolbar
              // Dream View Props
              prompt={prompt}
              onPromptChange={doHandlePromptChange}
              isLoading={isLoading}
              isRefining={isRefining}
              promptActionButtons={promptActionButtons}
              activeImageTab={activeImageTab}
              onActiveImageTabChange={setActiveImageTab}
              model={model}
              onModelChange={setModel}
              imagePreviewRef={imagePreviewRef}
              imagePreview={imagePreview}
              onImagePreviewClick={doHandleImagePreviewClick}
              onClearImagePreview={doClearImagePreview}
              fileInputRef={fileInputRef}
              onImageChange={doHandleImageChange}
              onPasteFromClipboard={doHandlePasteFromClipboard}
              onGenerateFirstFrameImage={handleGenerateFirstFrameImage}
              isGeneratingFirstFrame={isGeneratingFirstFrame}
              lastImagePreviewRef={lastImagePreviewRef}
              lastImagePreview={lastImagePreview}
              onClearLastImagePreview={doClearLastImagePreview}
              lastFileInputRef={lastFileInputRef}
              onLastImageChange={doHandleLastImageChange}
              onGenerateLastFrameImage={handleGenerateLastFrameImage}
              isGeneratingLastFrame={isGeneratingLastFrame}
              ratio={ratio}
              onRatioChange={setRatio}
              cameraControl={cameraControl}
              onCameraControlChange={setCameraControl}
              duration={duration}
              onDurationChange={setDuration}
              resolution={resolution}
              onResolutionChange={setResolution}
              gcsOutputBucket={gcsOutputBucket}
              onGcsOutputBucketChange={setGcsOutputBucket}
              generateAudio={generateAudio}
              onGenerateAudioChange={(e) => setGenerateAudio(e.target.checked)}
              onGenerateClick={doHandleGenerateClick}
              processingTaskCount={processingTaskCount}
              activeSpinnerButtonKey={activeSpinnerButtonKey}
              // Create View Props
              createModeClips={createModeClips}
              onCreateVideoClick={doHandleCreateVideoClick}
              isCreatingVideo={isCreatingVideo}
              // Music Props are no longer passed to Sidebar
            />
            <MainContent
              theme={theme}
              t={t}
              activeView={activeView}
              videoContainerRef={videoContainerRef}
              videoHeight={videoHeight}
              onMouseDownResize={doHandleMouseDownResize}
              taskStatus={taskStatus}
              errorMessage={errorMessage}
              videoGcsUri={videoGcsUri}
              videoRef={videoRef}
              isLoading={isLoading}
              isRefining={isRefining}
              taskId={taskId}
              currentTask={currentTask}
              onDeleteTask={doHandleDeleteTask}
              onExtendVideo={doHandleExtendVideoClick}
              isExtending={isExtending}
              activeCreateModeVideoSrc={activeCreateModeVideoSrc}
              createModeVideoRef={createModeVideoRef}
              createModeClips={createModeClips}
              selectedClipInTrack={selectedClipInTrack}
              onClipClick={handleClipClick}
              onRemoveClipFromTrack={handleRemoveClipFromTrack}
              pixelsPerSecond={pixelsPerSecond}
              BACKEND_URL={BACKEND_URL}
              onDragEnd={handleDragEnd} // Pass the new handler
              onUpdateClip={handleUpdateClip} // Pass the new handler
              // Music Props for MainContent track
              onMusicFileUpload={(e) => Handlers.handleMusicFileUpload(e, setSelectedMusicFile, setUploadedMusicBackendUrl, setMusicErrorMessage, t)}
              onGenerateMusicClick={handleGenerateMusicFeatureComingSoon} // Use the new alert handler
              isGeneratingMusic={musicTaskStatus === STATUS_PENDING || musicTaskStatus === STATUS_PROCESSING || musicTaskStatus === STATUS_INITIALIZING}
              selectedMusicFile={selectedMusicFile}
              uploadedMusicBackendUrl={uploadedMusicBackendUrl} // Pass new prop
              // isMusicEnabled prop removed
              // onToggleMusic prop removed
              generatedMusicUrl={generatedMusicUrl}
              musicTaskStatus={musicTaskStatus}
              musicErrorMessage={musicErrorMessage}
              isCreatingVideo={isCreatingVideo} // Pass this to disable controls
              onClearMusicSelection={handleClearMusicSelection} // Pass the new handler
              isPlayingTrack={isPlayingTrack} // Pass lifted state
              setIsPlayingTrack={setIsPlayingTrack} // Pass lifted setter
            />
            <HistorySidebar
              theme={theme}
              t={t}
              historyTasks={historyTasks}
              setHistoryTasks={setHistoryTasks}
              historyFilter={historyFilter}
              onHistoryFilterChange={setHistoryFilter}
              activeView={activeView}
              currentDreamTaskId={taskId}
              selectedClipInTrack={selectedClipInTrack}
              createModeClips={createModeClips}
              onHistoryItemClick={doHandleHistoryItemClick}
              onHoveredHistoryItemChange={setHoveredHistoryTaskId}
              hoveredHistoryTaskId={hoveredHistoryTaskId}
              onRefreshHistory={memoizedFetchHistoryTasks}
              BACKEND_URL={BACKEND_URL}
            />
      </div>

      <Footer theme={theme} t={t} />

      <ImageModal
        showModal={showImageModal}
        setShowModal={setShowImageModal}
        imageUrl={modalImageUrl}
        t={t}
      />

      <UsageAnalysisModal
        show={showUsageAnalysisModal}
        onHide={() => setShowUsageAnalysisModal(false)}
        theme={theme}
        t={t}
      />
        </div>
      )}
    </>
  );
}

export default App;
