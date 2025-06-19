import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'; // Re-added
import {
  STATUS_PROCESSING,
  STATUS_INITIALIZING,
  STATUS_PENDING,
  STATUS_COMPLETED_WAITING_URI,
  STATUS_FAILED,
  STATUS_ERROR,
  STATUS_COMPLETED,
} from '../constants'; // Assuming constants are in ../constants

function MainContent({
  theme,
  t,
  activeView,
  // Dream View Main Panel Props
  videoContainerRef,
  videoHeight,
  onMouseDownResize,
  taskStatus,
  errorMessage,
  videoGcsUri,
  videoRef,
  isLoading,
  isRefining,
  // Task Details Props (Dream View)
  taskId,
  currentTask,
  onDeleteTask,
  onExtendVideo,
  isExtending, // for extend button spinner
  // Create View Main Panel Props
  activeCreateModeVideoSrc,
  createModeVideoRef,
  // Create View Timeline/Clips Props
  createModeClips,
  selectedClipInTrack,
  onClipClick, // handles setActiveCreateModeVideoSrc, setSelectedClipInTrack
  onRemoveClipFromTrack,
  pixelsPerSecond,
  BACKEND_URL, // For constructing src URLs
  onDragEnd, // Re-added: New prop for handling drag and drop
  onUpdateClip, // New prop for updating clip start/duration
  // Music Props for the track
  onMusicFileUpload,
  onGenerateMusicClick,
  isGeneratingMusic,
  selectedMusicFile,
  // isMusicEnabled, // Removed
  // onToggleMusic, // Removed
  generatedMusicUrl,
  musicTaskStatus,
  musicErrorMessage,
  uploadedMusicBackendUrl, // New prop
  isCreatingVideo, // To disable controls
  onClearMusicSelection, // New prop for clearing selected music
}) {
  const musicFileInputRef = useRef(null);
  const [uploadedMusicSrc, setUploadedMusicSrc] = useState(null);
  const [isHoveringVideo, setIsHoveringVideo] = useState(false); // Added for video hover effect
  const [hoveredClipId, setHoveredClipId] = useState(null); // For general clip hover (border for resize)
  const [hoveredForDragHandleClipId, setHoveredForDragHandleClipId] = useState(null); // For move icon visibility
  const [mouseOverEdgeInfo, setMouseOverEdgeInfo] = useState(null); // { clipId: string, side: 'start' | 'end' } | null
  const [draggingState, setDraggingState] = useState(null); // { clipId, handleType: 'start' | 'end', initialMouseX, initialStartOffset, initialDuration, originalDuration }
  const [videoPlayerSrcWithFragment, setVideoPlayerSrcWithFragment] = useState(null); // For create mode player

  const MIN_CLIP_DURATION_SECONDS = 0.5; // Minimum duration for a clip
  const EDGE_HOTZONE_WIDTH = 15; // Pixels for edge hover detection

  // Handle Mouse Down on Resize Handles
  const handleMouseDownOnClipResize = (e, clip, handleType) => {
    // Stop event propagation forcefully to prevent R-B-DND from initiating a drag
    e.preventDefault();
    e.stopPropagation();
    if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
      e.nativeEvent.stopImmediatePropagation();
    }

    document.body.style.cursor = 'ew-resize'; // Set global cursor

    setDraggingState({
      clipId: clip.trackInstanceId,
      handleType,
      initialMouseX: e.clientX,
      initialStartOffset: clip.start_offset_seconds || 0,
      initialDuration: clip.duration_seconds,
      originalDuration: clip.original_duration_seconds,
    });
  };

  // Handle Mouse Move for Resizing
  const handleMouseMoveForClipResize = useCallback((e) => {
    if (!draggingState) return;

    const deltaX = e.clientX - draggingState.initialMouseX;
    let newStartOffset = draggingState.initialStartOffset;
    let newDuration = draggingState.initialDuration;

    const deltaTime = deltaX / pixelsPerSecond;

    if (draggingState.handleType === 'start') {
      const potentialNewStartOffset = draggingState.initialStartOffset + deltaTime;
      const potentialNewDuration = draggingState.initialDuration - deltaTime;

      if (potentialNewDuration < MIN_CLIP_DURATION_SECONDS) {
        newStartOffset = draggingState.initialStartOffset + (draggingState.initialDuration - MIN_CLIP_DURATION_SECONDS);
        newDuration = MIN_CLIP_DURATION_SECONDS;
      } else if (potentialNewStartOffset < 0) {
        newStartOffset = 0;
        newDuration = draggingState.initialDuration + draggingState.initialStartOffset;
      } else {
        newStartOffset = potentialNewStartOffset;
        newDuration = potentialNewDuration;
      }
    } else { // handleType === 'end'
      const potentialNewDuration = draggingState.initialDuration + deltaTime;

      if (potentialNewDuration < MIN_CLIP_DURATION_SECONDS) {
        newDuration = MIN_CLIP_DURATION_SECONDS;
      } else if ((draggingState.initialStartOffset + potentialNewDuration) > draggingState.originalDuration) {
        newDuration = draggingState.originalDuration - draggingState.initialStartOffset;
      } else {
        newDuration = potentialNewDuration;
      }
    }
    
    // Clamp duration to original bounds considering start_offset
    const maxPossibleDuration = draggingState.originalDuration - newStartOffset;
    newDuration = Math.min(newDuration, maxPossibleDuration);
    newDuration = Math.max(MIN_CLIP_DURATION_SECONDS, newDuration); // Ensure min duration again after clamping

    // Clamp start_offset
    newStartOffset = Math.max(0, newStartOffset);
    newStartOffset = Math.min(newStartOffset, draggingState.originalDuration - MIN_CLIP_DURATION_SECONDS);


    if (onUpdateClip) {
      onUpdateClip(draggingState.clipId, parseFloat(newStartOffset.toFixed(3)), parseFloat(newDuration.toFixed(3)));
    }
  }, [draggingState, pixelsPerSecond, onUpdateClip, MIN_CLIP_DURATION_SECONDS]);

  // Handle Mouse Up for Resizing
  const handleMouseUpForClipResize = useCallback(() => {
    if (!draggingState) return;
    document.body.style.cursor = ''; // Reset global cursor
    setDraggingState(null);
  }, [draggingState]);

  useEffect(() => {
    if (draggingState) {
      document.addEventListener('mousemove', handleMouseMoveForClipResize);
      document.addEventListener('mouseup', handleMouseUpForClipResize);
      return () => {
        document.removeEventListener('mousemove', handleMouseMoveForClipResize);
        document.removeEventListener('mouseup', handleMouseUpForClipResize);
        document.body.style.cursor = ''; // Ensure cursor is reset if component unmounts during drag
      };
    }
  }, [draggingState, handleMouseMoveForClipResize, handleMouseUpForClipResize]);


  useEffect(() => {
    if (selectedMusicFile) {
      const objectUrl = URL.createObjectURL(selectedMusicFile);
      setUploadedMusicSrc(objectUrl);

      return () => {
        URL.revokeObjectURL(objectUrl);
        setUploadedMusicSrc(null); // Clear src on cleanup
      };
    } else {
      // If selectedMusicFile becomes null, ensure uploadedMusicSrc is also null.
      // Cleanup from a previous effect (when selectedMusicFile was present) handles revocation.
      setUploadedMusicSrc(null);
    }
  }, [selectedMusicFile]);

  // Effect to update video player src with media fragments for trimmed playback
  useEffect(() => {
    if (activeView === 'create' && activeCreateModeVideoSrc && selectedClipInTrack && createModeClips.length > 0) {
      const selectedClip = createModeClips.find(clip => clip.trackInstanceId === selectedClipInTrack);
      if (selectedClip) {
        const startTime = parseFloat(selectedClip.start_offset_seconds) || 0;
        const duration = parseFloat(selectedClip.duration_seconds);
        if (!isNaN(duration) && duration > 0) {
          const endTime = startTime + duration;
          setVideoPlayerSrcWithFragment(`${activeCreateModeVideoSrc}#t=${startTime.toFixed(3)},${endTime.toFixed(3)}`);
        } else {
          // Fallback if duration is invalid, play full or from start_offset without end
          setVideoPlayerSrcWithFragment(`${activeCreateModeVideoSrc}#t=${startTime.toFixed(3)}`);
        }
      } else {
        setVideoPlayerSrcWithFragment(activeCreateModeVideoSrc); // Fallback if clip not found
      }
    } else if (activeView === 'create' && activeCreateModeVideoSrc) {
      setVideoPlayerSrcWithFragment(activeCreateModeVideoSrc); // No specific clip selected, play full
    } else {
      setVideoPlayerSrcWithFragment(null); // No video src
    }
  }, [activeView, activeCreateModeVideoSrc, selectedClipInTrack, createModeClips]);

  // Effect for custom looping based on media fragments
  useEffect(() => {
    const videoElement = createModeVideoRef.current;
    if (!videoElement || !videoPlayerSrcWithFragment || activeView !== 'create') {
      return; // Exit if no video, no fragment src, or not in create view
    }

    const fragmentString = videoPlayerSrcWithFragment.split('#t=')[1];
    if (!fragmentString) return; // Exit if no fragment part

    const times = fragmentString.split(',');
    const startTime = parseFloat(times[0]);
    const endTime = times[1] ? parseFloat(times[1]) : videoElement.duration; // If no end time, loop to end of video

    if (isNaN(startTime) || isNaN(endTime) || startTime >= endTime) {
      return; // Invalid times
    }

    const handleTimeUpdate = () => {
      if (videoElement.currentTime >= endTime - 0.1) { // Using a small buffer
        videoElement.currentTime = startTime;
        videoElement.play().catch(e => console.warn("Custom loop play failed:", e));
      }
    };

    videoElement.addEventListener('timeupdate', handleTimeUpdate);

    // When the source changes, ensure the video starts at the correct startTime if autoPlay is on
    // and the fragment specifies a start time.
    const handleLoadedData = () => {
        if (videoElement.autoplay && startTime > 0 && videoElement.currentTime < startTime) {
            videoElement.currentTime = startTime;
        }
    };
    videoElement.addEventListener('loadeddata', handleLoadedData);


    return () => {
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      videoElement.removeEventListener('loadeddata', handleLoadedData);
    };
  }, [videoPlayerSrcWithFragment, createModeVideoRef, activeView]);

  let totalDurationFormatted = '0.00s';
  if (activeView === 'create' && createModeClips && createModeClips.length > 0) {
    const totalSeconds = createModeClips.reduce((acc, clip) => {
      const duration = parseFloat(clip.duration_seconds);
      return acc + (isNaN(duration) ? 0 : duration);
    }, 0);
    totalDurationFormatted = `${totalSeconds.toFixed(2)}s`;
  }

  return (
    <main className={`main-content-area flex-grow-1 p-4 d-flex flex-column ${theme === 'dark' ? 'bg-dark text-light' : ''}`}>
      {activeView === 'dream' && (
        <div className="d-flex flex-column flex-grow-1"> {/* Allow this section to grow vertically */}
          <div ref={videoContainerRef} className="card video-display-card">
            <div
              className="card-body ${theme === 'dark' ? 'bg-dark text-light' : 'bg-secondary'}"
              style={{ height: `${videoHeight}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}
              onMouseEnter={() => activeView === 'dream' && setIsHoveringVideo(true)}
              onMouseLeave={() => activeView === 'dream' && setIsHoveringVideo(false)}
            >
              {
                (taskStatus === STATUS_PROCESSING || taskStatus === STATUS_INITIALIZING || taskStatus === STATUS_PENDING || taskStatus === STATUS_COMPLETED_WAITING_URI) ? (
                  <div className="flashlight-loader w-100 h-100 bg-black">
                    <p>{taskStatus === STATUS_COMPLETED_WAITING_URI ? t(STATUS_COMPLETED_WAITING_URI + 'Status') : t('processingMessage')}</p>
                  </div>
                ) : (taskStatus === STATUS_FAILED || taskStatus === STATUS_ERROR) ? (
                  <div className="d-flex flex-column justify-content-center align-items-center w-100 h-100">
                    <img src="/fail.png" alt={t('failedAltText')} style={{ width: '100px', height: '100px', marginBottom: '10px' }} />
                    <p >{errorMessage || t('errorMessageGeneric')}</p>
                  </div>
                ) : taskStatus === STATUS_COMPLETED ? (
                  videoGcsUri ? (
                    <video
                      key={videoGcsUri}
                      ref={videoRef}
                      controls
                      autoPlay
                      loop
                      src={videoGcsUri}
                      // className="w-100" // Removed to allow dynamic width changes
                      style={{
                        objectFit: 'contain',
                        backgroundColor: theme === 'dark' ? '#000000' : '#000000', // Original background colors
                        transition: 'max-width 0.2s ease-in-out, max-height 0.2s ease-in-out, min-width 0.2s ease-in-out',
                        ...(isHoveringVideo ? { // MOUSE OVER
                          maxHeight: '100%',
                          maxWidth: '100%',
                        } : { // MOUSE OUT (default)
                          maxHeight: '140%',
                          maxWidth: '140%',
                          minWidth: '140%',
                        })
                      }}
                    >
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
                  <div className={`${theme === 'dark' ? 'bg-black' : 'bg-light'} border rounded d-flex flex-column align-items-center justify-content-center w-100 h-100`}>
                <i className={`bi bi-film ${theme === 'dark' ? 'text-light' : 'text-dark'}`} style={{ fontSize: '3.8rem', opacity: 0.8 }}></i>
                <p className={`mt-2 ${theme === 'dark' ? 'text-light-emphasis' : 'text-muted'}`}>{t('dreamViewPlaceholderHint')}</p>
                  </div>
                )
              }
            </div>
            {activeView === 'dream' && (
            <div
              className="video-resize-handle"
              onMouseDown={onMouseDownResize}
              title={t('resizeVideoAreaTooltip', { height: videoHeight })}
            >
              <i className="bi bi-grip-horizontal"></i>
            </div>
            )}
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
                      onClick={() => onDeleteTask(taskId)}
                      disabled={isLoading}
                      title={t('deleteTaskButtonTitle')}
                    >
                      <i className="bi bi-trash3"></i>
                    </button>
                    {taskStatus === STATUS_COMPLETED && videoGcsUri && (
                      <button
                        className="btn btn-info btn-sm mt-2"
                        onClick={() => onExtendVideo(taskId)}
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
          <div style={{ flexGrow: 1 }}></div> {/* Spacer to consume remaining vertical space */}
        </div>
      )}

      {activeView === 'create' && (
        // h-100 should work fine if parent is a flex column and this is a flex item.
        // Or, can also use flex-grow-1 here for consistency. Let's try h-100 first.
        <div className="d-flex flex-column h-100">
          <div className="card video-display-card">
            <div className="card-body d-flex justify-content-center align-items-center" style={{ overflow: 'hidden', height: `${videoHeight}px` }}>
              {activeCreateModeVideoSrc ? (
                <video
                  key={activeCreateModeVideoSrc} // Key is the base URL
                  ref={createModeVideoRef}
                  controls
                  autoPlay
                  // loop // Removed: Implementing custom loop for fragments
                  src={videoPlayerSrcWithFragment || activeCreateModeVideoSrc} // Use fragment if available, else base
                  style={{ maxHeight: '140%', maxWidth: '140%', minWidth:'140%', minHeight:'140%', objectFit: 'contain', backgroundColor: theme === 'dark' ? '#000000' : '#f8f9fa' }}
                >
                  {t('videoTagNotSupported')}
                </video>
              ) : (
                <div className={`${theme === 'dark' ? 'bg-black' : 'bg-light'} border rounded d-flex flex-column align-items-center justify-content-center w-100 h-100`}>
                  <i className="bi bi-film" style={{ fontSize: '3rem', opacity: 0.5 }}></i>
                  <p className="mt-2">{t('createVideoPlaceholder')}</p>
                </div>
              )}
            </div>
            {activeView === 'dream' && (
            <div
              className="video-resize-handle"
              onMouseDown={onMouseDownResize}
              title={t('resizeVideoAreaTooltip', { height: videoHeight })}
            >
              <i className="bi bi-grip-horizontal"></i>
            </div>
            )}
          </div>
          <div className={`video-clip-track card mt-2 ${theme === 'dark' ? 'bg-dark' : 'bg-light'}`}>
            <div className="card-body p-2 d-flex align-items-center"> {/* Changed to flex-row and align-items-center */}
              {/* Fixed Film Icon and Duration (Moved outside scrollable container) */}
              <div
                className="me-2 d-flex flex-column align-items-center justify-content-center"
                title={t('videoTrackHeadIconTitle', "Start of video track")}
                style={{ minWidth: '50px' }} // Ensure space for icon and text
              >
                <i
                  className={`bi bi-film ${theme === 'dark' ? 'text-light' : 'text-dark'}`}
                  style={{ fontSize: '1.8rem', opacity: 0.8 }}
                ></i>
                {activeView === 'create' && (
                  <div
                    className={`${theme === 'dark' ? 'text-light-emphasis' : 'text-muted'}`}
                    style={{ fontSize: '0.70rem', marginTop: '3px', whiteSpace: 'nowrap' }}
                    title={t('totalTrackDurationLabel', `Total duration: ${totalDurationFormatted}`, { duration: totalDurationFormatted })}
                  >
                    {totalDurationFormatted}
                  </div>
                )}
              </div>
              {/* Combined Scrollable Container for Timeline and Clips */}
              <div style={{ overflowX: 'auto', flexGrow: 1 }}> {/* Added flexGrow: 1 */}
                <div
                  className="timeline-container mb-2"
                style={{
                  height: '35px', // Reduced height
                  backgroundColor: theme === 'dark' ? '#343a40' : '#f1f3f5',
                  borderRadius: '0.25rem',
                  border: theme === 'dark' ? '1px solid #495057' : '1px solid #ced4da',
                  position: 'relative',
                  minWidth: `${10 + (65 * pixelsPerSecond)}px`, 
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    height: '100%',
                    minWidth: `${10 + (65 * pixelsPerSecond)}px`, // Maintains total width for 0-64s span
                    display: 'flex',
                    alignItems: 'flex-end',
                    paddingLeft: '10px',
                  }}
                >
                  {Array.from({ length: 65 }, (_, i) => i).map((time) => {
                    const isMajorTickTime = time % 5 === 0 && time <= 60;
                    return (
                      <div
                        key={time}
                        style={{
                          width: `${pixelsPerSecond}px`, // Each tick represents 1 second
                          position: 'relative',
                          fontSize: '0.8em',
                          color: theme === 'dark' ? '#adb5bd' : '#495057',
                          flexShrink: 0,
                          paddingBottom: isMajorTickTime ? '5px' : '0px', // Padding for label on major ticks
                          height: '100%', // Ensure div takes full height to align tick correctly
                        }}
                      >
                        <div style={{
                          position: 'absolute',
                          bottom: '15px', // Position from bottom of the div's padding box
                          left: '0%',
                          width: '1px',
                          height: isMajorTickTime ? '10px' : '6px', // Taller for major, shorter for minor
                          backgroundColor: theme === 'dark' ? '#6c757d' : '#adb5bd',
                        }}></div>
                        {isMajorTickTime && <span style={{ paddingLeft: '2px' }}>{`${time}s`}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="clips" direction="horizontal" isDropDisabled={isCreatingVideo || !!draggingState} isCombineEnabled={false}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="clips-scroll-container d-flex align-items-center"
                      style={{ paddingLeft: '10px', minHeight: '100px' }}
                    >
                      {createModeClips.length === 0 && <p className={`m-0 ${theme === 'dark' ? 'text-light' : 'text-muted'}`}>{t('createClipTrackPlaceholder')}</p>}
                      {createModeClips.map((clip, index) => {
                        const isResizingThisClip = draggingState && draggingState.clipId === clip.trackInstanceId;
                        const showDragHandle = hoveredForDragHandleClipId === clip.trackInstanceId && !draggingState && !isCreatingVideo;

                        return (
                          <Draggable
                            key={clip.trackInstanceId}
                            draggableId={clip.trackInstanceId}
                            index={index}
                            isDragDisabled={isCreatingVideo || !!draggingState} // Disable dragging if resizing or creating video
                          >
                            {(providedDraggable, snapshot) => {
                              const startTime = parseFloat(clip.start_offset_seconds || 0).toFixed(2);
                              const duration = parseFloat(clip.duration_seconds).toFixed(2);
                              const endTime = (parseFloat(startTime) + parseFloat(duration)).toFixed(2);
                              const originalDuration = parseFloat(clip.original_duration_seconds).toFixed(2);
                              const tooltipText = `Start: ${startTime}s\nEnd: ${endTime}s\nDuration: ${duration}s\nOriginal: ${originalDuration}s`;

                              return (
                              <div
                                ref={providedDraggable.innerRef}
                                {...providedDraggable.draggableProps} // Applied to the main container for positioning by R-B-DND
                                // dragHandleProps will be applied to the custom handle, not here
                                className={`clip-thumbnail-item ${selectedClipInTrack === clip.trackInstanceId ? 'active' : ''} ${!snapshot.isDragging && (hoveredClipId === clip.trackInstanceId || isResizingThisClip) ? 'interactive-border' : ''}`}
                                title={tooltipText}
                                style={
                                  snapshot.isDragging
                                    ? providedDraggable.draggableProps.style
                                    : {
                                        ...providedDraggable.draggableProps.style,
                                        width: `${(parseFloat(clip.duration_seconds) || 5) * pixelsPerSecond}px`,
                                        position: 'relative',
                                      }
                                }
                                onClick={() => {
                                  if (!draggingState && !snapshot.isDragging) {
                                    onClipClick(clip);
                                  }
                                }}
                                onMouseEnter={(e) => {
                                  if (!draggingState && !snapshot.isDragging) {
                                    setHoveredClipId(clip.trackInstanceId); // For resize handles and border
                                    setHoveredForDragHandleClipId(clip.trackInstanceId); // For move icon
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const x = e.clientX - rect.left;
                                    if (x < EDGE_HOTZONE_WIDTH) {
                                      setMouseOverEdgeInfo({ clipId: clip.trackInstanceId, side: 'start' });
                                    } else if (rect.width - x < EDGE_HOTZONE_WIDTH) {
                                      setMouseOverEdgeInfo({ clipId: clip.trackInstanceId, side: 'end' });
                                    } else {
                                      setMouseOverEdgeInfo(null);
                                    }
                                  }
                                }}
                                onMouseMove={(e) => {
                                  // Keep existing mouse move for resize handles
                                  if (!draggingState && !snapshot.isDragging && hoveredClipId === clip.trackInstanceId) {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const x = e.clientX - rect.left;
                                    if (x < EDGE_HOTZONE_WIDTH) {
                                      if (mouseOverEdgeInfo?.side !== 'start' || mouseOverEdgeInfo?.clipId !== clip.trackInstanceId) {
                                        setMouseOverEdgeInfo({ clipId: clip.trackInstanceId, side: 'start' });
                                      }
                                    } else if (rect.width - x < EDGE_HOTZONE_WIDTH) {
                                      if (mouseOverEdgeInfo?.side !== 'end' || mouseOverEdgeInfo?.clipId !== clip.trackInstanceId) {
                                        setMouseOverEdgeInfo({ clipId: clip.trackInstanceId, side: 'end' });
                                      }
                                    } else {
                                      if (mouseOverEdgeInfo !== null) {
                                        setMouseOverEdgeInfo(null);
                                      }
                                    }
                                  }
                                }}
                                onMouseLeave={() => {
                                  if (!draggingState && !snapshot.isDragging) {
                                    setHoveredClipId(null);
                                    setHoveredForDragHandleClipId(null);
                                    setMouseOverEdgeInfo(null);
                                  }
                                }}
                              >
                                {/* Custom Drag Handle */}
                                {showDragHandle && !snapshot.isDragging && (
                                  <div
                                    {...providedDraggable.dragHandleProps} // Apply drag handle props here
                                    style={{
                                      position: 'absolute',
                                      top: '50%',
                                      left: '50%',
                                      transform: 'translate(-50%, -50%)',
                                      width: '30px',
                                      height: '30px',
                                      backgroundColor: 'rgba(0,0,0,0.6)',
                                      borderRadius: '50%',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'grab',
                                      zIndex: 20, // Above other elements like resize handles
                                      color: 'white',
                                    }}
                                    onClick={(e) => e.stopPropagation()} // Prevent clip click when clicking handle
                                    onMouseDown={(e) => e.stopPropagation()} // Prevent resize logic if handle is on edge
                                  >
                                    <i className="bi bi-arrows-move" style={{ fontSize: '1rem' }}></i>
                                  </div>
                                )}

                                {/* Resize Handles */}
                                {!snapshot.isDragging && !isCreatingVideo && (
                                  <>
                                    {((mouseOverEdgeInfo?.clipId === clip.trackInstanceId && mouseOverEdgeInfo?.side === 'start') || (draggingState?.clipId === clip.trackInstanceId && draggingState?.handleType === 'start')) && (
                                      <div
                                        className="clip-resize-handle start"
                                        style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', height: '20px', width: '10px', background: 'white', cursor: 'ew-resize', zIndex: 10, borderRadius: '3px', left: '-5px', boxShadow: '0 0 5px rgba(0,0,0,0.5)' }}
                                        onMouseDownCapture={(e) => handleMouseDownOnClipResize(e, clip, 'start')}
                                      />
                                    )}
                                    {((mouseOverEdgeInfo?.clipId === clip.trackInstanceId && mouseOverEdgeInfo?.side === 'end') || (draggingState?.clipId === clip.trackInstanceId && draggingState?.handleType === 'end')) && (
                                      <div
                                        className="clip-resize-handle end"
                                        style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', height: '20px', width: '10px', background: 'white', cursor: 'ew-resize', zIndex: 10, borderRadius: '3px', right: '-5px', boxShadow: '0 0 5px rgba(0,0,0,0.5)' }}
                                        onMouseDownCapture={(e) => handleMouseDownOnClipResize(e, clip, 'end')}
                                      />
                                    )}
                                  </>
                                )}
                                <button
                                  className="clip-delete-btn"
                                  disabled={isCreatingVideo}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRemoveClipFromTrack(clip.trackInstanceId);
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
                              {/* Display duration when resizing this clip */}
                              {isResizingThisClip && (
                                <div style={{
                                  position: 'absolute',
                                  bottom: '5px',
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                  color: 'white',
                                  padding: '2px 5px',
                                  borderRadius: '3px',
                                  fontSize: '0.8em',
                                  zIndex: 15, // Above image, potentially below handles if they overlap
                                }}>
                                  {`${parseFloat(clip.duration_seconds).toFixed(2)}s`}
                                </div>
                              )}
                              </div>
                            );
                           }}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
              </div> {/* Closing tag for the new wrapper div */}
            </div>
          </div>

          {/* Music Track */}
          <div className={`music-track card mt-2 ${theme === 'dark' ? 'bg-dark' : 'bg-light'}`}>
            <div className="card-body p-2 d-flex align-items-center" style={{ minHeight: '60px' }}> {/* Ensure some height */}
              {/* Music Icon at the head of the track */}
              <div className="me-2" title={t('musicTrackHeadIconTitle', "Music track")}>
                <i className={`bi bi-music-note-beamed ${theme === 'dark' ? 'text-light' : 'text-dark'}`} style={{ fontSize: '1.8rem', opacity: 0.8 }}></i>
              </div>
              {/* Music Controls Area */}
              <div className="flex-grow-1 d-flex flex-column justify-content-center ms-2">
                {(() => {
                  // Case 1: Generated music (Lyria) is completed and available
                  if (musicTaskStatus === 'completed' && generatedMusicUrl) {
                    return (
                      <div className="mt-1 mb-1">
                        <audio controls src={generatedMusicUrl} className="w-100" style={{ height: '30px' }}>
                          {t('audioTagNotSupported')}
                        </audio>
                        {/* For future: Optionally, allow clearing Lyria-generated music too. */}
                      </div>
                    );
                  }

                  // Case 2: An uploaded file is selected (selectedMusicFile is not null)
                  // This takes precedence over "processing" or "failed" if a file is still considered "selected"
                  if (selectedMusicFile) {
                    return (
                      <>
                        <div className="d-flex align-items-center justify-content-between mt-1 mb-1">
                          <small
                            className={`form-text ${theme === 'dark' ? 'text-light-emphasis' : 'text-muted'} me-2 text-truncate`}
                            title={selectedMusicFile.name}
                            style={{ flexGrow: 1, minWidth: 0 }} // Allow text to take space and truncate
                          >
                            {t('selectedMusicFileLabel')}: {selectedMusicFile.name}
                            {isGeneratingMusic && !generatedMusicUrl ? ` (${t('generatingNewMusicPlaceholder', 'generating new...')})` : ''}
                            {!uploadedMusicBackendUrl && uploadedMusicSrc && musicTaskStatus !== 'processing' && musicTaskStatus !== 'failed' && !isGeneratingMusic ? ' (local preview)' : ''}
                          </small>
                          <button
                            className={`btn btn-sm ${theme === 'dark' ? 'btn-outline-light' : 'btn-outline-danger'} p-1`}
                            onClick={() => {
                              onClearMusicSelection();
                              if (musicFileInputRef.current) {
                                musicFileInputRef.current.value = ""; // Reset file input
                              }
                            }}
                            disabled={isCreatingVideo}
                            title={t('clearMusicSelectionButtonTitle', 'Clear selected music')}
                            style={{ lineHeight: '1', height: '24px', width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                          >
                            <i className="bi bi-x-lg" style={{ fontSize: '0.8rem' }}></i>
                          </button>
                        </div>
                        {uploadedMusicBackendUrl && (
                          <audio key={uploadedMusicBackendUrl} controls src={uploadedMusicBackendUrl} className="w-100 mt-1" style={{ height: '30px' }}>
                            {t('audioTagNotSupported')}
                          </audio>
                        )}
                        {!uploadedMusicBackendUrl && uploadedMusicSrc && musicTaskStatus !== 'processing' && musicTaskStatus !== 'failed' && !isGeneratingMusic && (
                          <audio key={uploadedMusicSrc} controls src={uploadedMusicSrc} className="w-100 mt-1" style={{ height: '30px' }}>
                            {t('audioTagNotSupported')}
                          </audio>
                        )}
                      </>
                    );
                  }

                  // Case 3: Music is being processed (Lyria generation or user upload in progress)
                  if (musicTaskStatus === 'processing') { // Lyria processing
                    return (
                      <div className="mt-1 mb-1 text-center">
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        <small>{t('musicProcessingStatus')}</small>
                      </div>
                    );
                  }
                  if (musicErrorMessage === t('uploadingMusicMessage', 'Uploading music...')) { // User file upload processing
                    return (
                       <div className="mt-1 mb-1 text-center">
                         <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                         <small>{musicErrorMessage}</small>
                       </div>
                    );
                  }

                  // Case 4: Music processing/generation failed (Lyria) or upload error message exists
                  if (musicTaskStatus === 'failed' || (musicErrorMessage && musicErrorMessage !== t('uploadingMusicMessage', 'Uploading music...'))) {
                    return (
                      <div className="alert alert-danger mt-1 mb-1 p-1" role="alert">
                        <small>{musicErrorMessage || t('musicGenerationFailedGeneric')}</small>
                      </div>
                    );
                  }

                  // Case 5: Default - Show buttons to upload or generate music (if no file selected and no active operations/errors)
                  return (
                    <>
                      <div className="d-flex align-items-center mb-1">
                        <button
                          className={`btn btn-sm ${theme === 'dark' ? 'btn-outline-light' : 'btn-outline-secondary'} me-2`}
                          onClick={() => musicFileInputRef.current && musicFileInputRef.current.click()}
                          disabled={isCreatingVideo || isGeneratingMusic}
                          title={t('uploadMusicFileLabel')}
                        >
                          <i className="bi bi-upload"></i>
                        </button>
                        <input
                          ref={musicFileInputRef}
                          type="file"
                          id="musicFileUploadMain"
                          accept=".mp3,.wav"
                          onChange={onMusicFileUpload}
                          disabled={isCreatingVideo || isGeneratingMusic}
                          style={{ opacity: 0, position: 'absolute', width: '1px', height: '1px' }}
                        />
                        <button
                          className={`btn btn-sm ${theme === 'dark' ? 'btn-outline-light' : 'btn-outline-secondary'}`}
                          onClick={onGenerateMusicClick}
                          disabled={isCreatingVideo || isGeneratingMusic || true} // Always disable for now
                          title={t('generateMusicButton')}
                        >
                          {isGeneratingMusic ? ( // This condition might not be met if button is always disabled
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                          ) : (
                            <i className="bi bi-soundwave"></i>
                          )}
                        </button>
                      </div>
                      <small className={`form-text ${theme === 'dark' ? 'text-light-emphasis' : 'text-muted'} mt-1 mb-1`}>
                        {t('addOrGenerateMusicPlaceholder', 'Upload or generate music.')}
                      </small>
                    </>
                  );
                })()}
              </div>
              {/* Music Toggle Switch Removed */}
            </div>
          </div>

          <div style={{ flexGrow: 1 }}></div> {/* Spacer to consume remaining vertical space */}
        </div>
      )}
    </main>
  );
}

export default MainContent;
