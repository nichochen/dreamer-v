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
  // Lifted state for track playback, passed from App.js
  isPlayingTrack, 
  setIsPlayingTrack,
}) {
  const musicFileInputRef = useRef(null);
  const [uploadedMusicSrc, setUploadedMusicSrc] = useState(null);
  const [isHoveringVideo, setIsHoveringVideo] = useState(false); // Added for video hover effect
  const [hoveredClipId, setHoveredClipId] = useState(null); // For general clip hover (border for resize)
  const [hoveredForDragHandleClipId, setHoveredForDragHandleClipId] = useState(null); // For move icon visibility
  const [mouseOverEdgeInfo, setMouseOverEdgeInfo] = useState(null); // { clipId: string, side: 'start' | 'end' } | null
  const [draggingState, setDraggingState] = useState(null); // { clipId, handleType: 'start' | 'end', initialMouseX, initialStartOffset, initialDuration, originalDuration }
  const [videoPlayerSrcWithFragment, setVideoPlayerSrcWithFragment] = useState(null); // For create mode player
  // const [formattedClipInfoString, setFormattedClipInfoString] = useState(''); // State for formatted clip info - REMOVED as per new play/pause logic
  // const [isPlayingTrack, setIsPlayingTrack] = useState(false); // State for track playback mode - LIFTED TO APP.JS
  const [currentTrackPlaybackClipIndex, setCurrentTrackPlaybackClipIndex] = useState(0); // Index for sequential playback
  const [trackPlaylist, setTrackPlaylist] = useState([]); // Holds the structured playlist for track playback
  const [timelineCurrentTime, setTimelineCurrentTime] = useState(0); // For general video time, and playhead when NOT in track mode
  const [smoothTrackPlayheadTime, setSmoothTrackPlayheadTime] = useState(0); // Timer-driven for track playback playhead
  const trackPlaybackStartTimestampRef = useRef(0); // Stores performance.now() when track play starts
  const musicAudioRef = useRef(null); // Ref for the music audio element

  // Function to stop track playback (uses setIsPlayingTrack prop from App.js)
  const handleStopTrackPlayback = () => {
    const videoElement = createModeVideoRef.current;
    if (videoElement) {
      videoElement.pause();
      // Potentially reset currentTime if stopping means "reset to start of current segment"
      // For now, just pausing and setting state which will reset index.
    }
    // Music pause and currentTime reset will be handled by the new useEffect watching isPlayingTrack prop
    // setCurrentTrackPlaybackClipIndex will also be handled by the new useEffect
    setIsPlayingTrack(false); // This will trigger the useEffect in MainContent to clean up music and clip index
    // setSmoothTrackPlayheadTime(0); // Reset visual playhead - consider if this should be part of stop
  };
  
  // Effect to handle local cleanup when isPlayingTrack prop (from App.js) changes to false
  const prevIsPlayingTrackRef = useRef(isPlayingTrack);
  useEffect(() => {
    if (prevIsPlayingTrackRef.current && !isPlayingTrack) {
      // isPlayingTrack has just become false
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
        musicAudioRef.current.currentTime = 0; // Reset music to beginning on stop
        console.log("[MainContent] isPlayingTrack became false, paused music and reset time.");
      }
      setCurrentTrackPlaybackClipIndex(0); // Reset to beginning of track conceptually
      console.log("[MainContent] isPlayingTrack became false, reset currentTrackPlaybackClipIndex.");
      // setSmoothTrackPlayheadTime(0); // Also reset visual playhead if needed
    }
    prevIsPlayingTrackRef.current = isPlayingTrack;
  }, [isPlayingTrack]); // Depends only on the isPlayingTrack prop

  const MIN_CLIP_DURATION_SECONDS = 1.0; // Minimum duration for a clip
  const EDGE_HOTZONE_WIDTH = 15; // Pixels for edge hover detection
  const MIN_CLIP_WIDTH_FOR_DRAG_HANDLE_PX = 40; // Min clip width in pixels to show drag handle

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

  // Effect to update video player src with media fragments for trimmed playback (when NOT in track playback mode)
  useEffect(() => {
    if (isPlayingTrack || activeView !== 'create') { // Do not run if playing track or not in create view
      // When stopping track playback, we might want to reset to selected clip
      if (!isPlayingTrack && activeView === 'create' && activeCreateModeVideoSrc && selectedClipInTrack && createModeClips.length > 0) {
        const selectedClip = createModeClips.find(clip => clip.trackInstanceId === selectedClipInTrack);
        if (selectedClip) {
          const startTime = parseFloat(selectedClip.start_offset_seconds) || 0;
          const duration = parseFloat(selectedClip.duration_seconds);
          if (!isNaN(duration) && duration > 0) {
            const endTime = startTime + duration;
            setVideoPlayerSrcWithFragment(`${activeCreateModeVideoSrc}#t=${startTime.toFixed(3)},${endTime.toFixed(3)}`);
          } else {
            setVideoPlayerSrcWithFragment(`${activeCreateModeVideoSrc}#t=${startTime.toFixed(3)}`);
          }
        } else {
          setVideoPlayerSrcWithFragment(activeCreateModeVideoSrc);
        }
      } else if (!isPlayingTrack && activeView === 'create' && activeCreateModeVideoSrc) {
        setVideoPlayerSrcWithFragment(activeCreateModeVideoSrc);
      } else if (!isPlayingTrack) {
         setVideoPlayerSrcWithFragment(null); // Clear src if not in create or no active src
      }
      return; 
    }

    // Original logic for selected clip playback (only if !isPlayingTrack and in create view)
    if (activeCreateModeVideoSrc && selectedClipInTrack && createModeClips.length > 0) {
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
      // This case should be covered by the !isPlayingTrack check at the beginning of the effect
      // or by the general activeCreateModeVideoSrc check.
      // If not playing track and no specific conditions met, src might be null or just activeCreateModeVideoSrc.
      // The initial part of this modified effect aims to handle this.
    }
  }, [activeView, activeCreateModeVideoSrc, selectedClipInTrack, createModeClips, isPlayingTrack]);

  // Effect for custom looping based on media fragments (when NOT in track playback mode)
  useEffect(() => {
    const videoElement = createModeVideoRef.current;
    if (isPlayingTrack || !videoElement || !videoPlayerSrcWithFragment || activeView !== 'create') {
      return; 
    }

    // Original custom looping logic for single selected clip
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
  }, [videoPlayerSrcWithFragment, createModeVideoRef, activeView, isPlayingTrack]); // Added isPlayingTrack to dependencies

  // Effect to set the video source when in track playback mode using trackPlaylist
  useEffect(() => {
    if (isPlayingTrack && activeView === 'create' && trackPlaylist.length > 0 && currentTrackPlaybackClipIndex < trackPlaylist.length) {
      const playlistItem = trackPlaylist[currentTrackPlaybackClipIndex];
      console.log(`[Track Playback] Attempting to set source for clip index ${currentTrackPlaybackClipIndex}:`, playlistItem);
      // playlistItem already has src, startTime, endTime, duration
      if (playlistItem && playlistItem.src) {
        const newSrc = `${playlistItem.src}#t=${playlistItem.startTime.toFixed(3)},${playlistItem.endTime.toFixed(3)}`;
        console.log(`[Track Playback] Setting videoPlayerSrcWithFragment to: ${newSrc}`);
        setVideoPlayerSrcWithFragment(newSrc);
      } else {
         console.warn("[Track Playback] Playlist item to play is invalid or missing src:", playlistItem);
         setIsPlayingTrack(false); // Stop playback if data is insufficient
         setCurrentTrackPlaybackClipIndex(0);
      }
    }
    // If isPlayingTrack becomes false, the other useEffect for selectedClipInTrack should take over.
  }, [isPlayingTrack, currentTrackPlaybackClipIndex, trackPlaylist, activeView, t]); // Depends on trackPlaylist now

  // Effect to build the trackPlaylist when createModeClips changes
  useEffect(() => {
    if (activeView === 'create' && createModeClips && createModeClips.length > 0) {
      const newPlaylist = createModeClips.map(clip => {
        const videoSrc = clip.video_url || (clip.local_video_path ? `${BACKEND_URL}${clip.local_video_path}` : null);
        const startTime = parseFloat(clip.start_offset_seconds) || 0;
        const duration = parseFloat(clip.duration_seconds);
        
        if (!videoSrc || isNaN(duration) || duration <= 0) {
          console.warn("Skipping invalid clip for playlist:", clip);
          return null; // Skip invalid clips
        }
        return {
          id: clip.trackInstanceId,
          src: videoSrc,
          startTime: startTime,
          duration: duration,
          endTime: startTime + duration, // Calculated for convenience
        };
      }).filter(item => item !== null); // Remove nulls (invalid clips)
      setTrackPlaylist(newPlaylist);
    } else {
      setTrackPlaylist([]); // Clear playlist if no clips or not in create view
    }
  }, [createModeClips, activeView, BACKEND_URL]); // Removed 't' as it's not directly used here for now

  // Effect to handle 'ended' and 'error' events for sequential track playback
  useEffect(() => {
    const videoElement = createModeVideoRef.current;
    if (!videoElement || !isPlayingTrack || activeView !== 'create' || !videoPlayerSrcWithFragment || trackPlaylist.length === 0) {
      // console.log("[Track Playback EVT] Effect skipped", { isPlayingTrack, videoElementExists: !!videoElement, videoPlayerSrcWithFragmentExists: !!videoPlayerSrcWithFragment, trackPlaylistLength: trackPlaylist.length });
      return;
    }
    
    console.log(`[Track Playback EVT] Attaching listeners for clip index ${currentTrackPlaybackClipIndex}. Src: ${videoPlayerSrcWithFragment}`);

    const advanceToNextClip = (reason) => {
      console.log(`[Track Playback EVT] Advancing clip from index ${currentTrackPlaybackClipIndex}. Reason: ${reason}`);
      videoElement.pause(); // Ensure paused before state change
      const nextClipIndex = currentTrackPlaybackClipIndex + 1;
      if (nextClipIndex < trackPlaylist.length) {
        setCurrentTrackPlaybackClipIndex(nextClipIndex);
      } else {
        console.log("[Track Playback EVT] End of playlist.");
        // Music pause and reset, and setting isPlayingTrack to false,
        // will be handled by the useEffect watching isPlayingTrack prop,
        // or by the handleStopTrackPlayback function if called directly.
        setIsPlayingTrack(false); // This will trigger the cleanup useEffect
        // setCurrentTrackPlaybackClipIndex(0); // This is also handled by the cleanup useEffect
      }
    };

    const handleNativeEnded = () => {
      console.log(`[Track Playback EVT] Native 'ended' event for clip index ${currentTrackPlaybackClipIndex}. currentTime: ${videoElement.currentTime}`);
      // This is a fallback. Timeupdate should ideally handle fragment ends.
      // Only advance if timeupdate hasn't already.
      // This check is tricky; for now, let timeupdate be primary.
      // If timeupdate is removed or fails, this might be the only trigger.
      // Let's assume timeupdate will remove itself, so if this fires, timeupdate didn't complete its job for this segment.
      advanceToNextClip("native_ended");
    };

    const handleTrackClipError = (e) => {
      const currentItem = trackPlaylist[currentTrackPlaybackClipIndex];
      console.error("[Track Playback EVT] Error playing track clip:", currentItem || "Unknown item", e);
      // Music pause and reset, and setting isPlayingTrack to false,
      // will be handled by the useEffect watching isPlayingTrack prop.
      setIsPlayingTrack(false); // This will trigger the cleanup useEffect
      // setCurrentTrackPlaybackClipIndex(0); // This is also handled by the cleanup useEffect
    };

    const handleCanPlayThrough = () => {
      console.log(`[Track Playback EVT] 'canplaythrough' for clip index ${currentTrackPlaybackClipIndex}. Paused: ${videoElement.paused}`);
      if (isPlayingTrack && videoElement.paused) {
        videoElement.play().then(() => {
          console.log(`[Track Playback EVT] Play initiated successfully for clip index ${currentTrackPlaybackClipIndex}`);
        }).catch(e => console.warn(`[Track Playback EVT] Play() failed on canplaythrough for clip index ${currentTrackPlaybackClipIndex}:`, e));
      }
    };

    const currentPlaylistItem = trackPlaylist[currentTrackPlaybackClipIndex];
    let timeUpdateHandler = null;

    if (currentPlaylistItem && currentPlaylistItem.endTime > 0) { // Ensure endTime is valid
      const { endTime: segmentEndTime, startTime: segmentStartTime } = currentPlaylistItem;
      console.log(`[Track Playback EVT] Setting up timeupdate for clip index ${currentTrackPlaybackClipIndex}, startTime: ${segmentStartTime}, endTime: ${segmentEndTime}`);

      timeUpdateHandler = () => {
        // console.log(`[Track Playback EVT] Timeupdate: ${videoElement.currentTime} / ${segmentEndTime}`);
        if (videoElement.currentTime >= segmentEndTime - 0.15) { // Slightly larger buffer
          console.log(`[Track Playback EVT] Timeupdate: Segment end detected for clip index ${currentTrackPlaybackClipIndex}. Time: ${videoElement.currentTime}`);
          // videoElement.removeEventListener('timeupdate', timeUpdateHandler); // Clean self immediately
          advanceToNextClip("timeupdate");
        }
      };
      videoElement.addEventListener('timeupdate', timeUpdateHandler);
    }
    
    videoElement.addEventListener('ended', handleNativeEnded); 
    videoElement.addEventListener('error', handleTrackClipError);
    videoElement.addEventListener('canplaythrough', handleCanPlayThrough); 

    // Rely on canplaythrough to initiate play.
    
    return () => {
      console.log(`[Track Playback EVT] Cleaning up listeners for clip index ${currentTrackPlaybackClipIndex}. Next index will be: ${currentTrackPlaybackClipIndex +1 } (or 0 if end). Src was: ${videoPlayerSrcWithFragment}`);
      videoElement.removeEventListener('ended', handleNativeEnded);
      videoElement.removeEventListener('error', handleTrackClipError);
      videoElement.removeEventListener('canplaythrough', handleCanPlayThrough);
      if (timeUpdateHandler) {
        // console.log("[Track Playback EVT] Removing timeupdate listener in cleanup.");
        videoElement.removeEventListener('timeupdate', timeUpdateHandler);
      }
    };
  }, [isPlayingTrack, currentTrackPlaybackClipIndex, trackPlaylist, createModeVideoRef, activeView, videoPlayerSrcWithFragment, t]);

  // Effect to update timelineCurrentTime based on video player's currentTime (ONLY WHEN NOT in track playback mode)
  useEffect(() => {
    const videoElement = createModeVideoRef.current;

    if (activeView === 'create' && videoElement && !isPlayingTrack) { 
      const handleTimeUpdate = () => {
        let globalCurrentTime = 0;
        if (selectedClipInTrack && createModeClips && createModeClips.length > 0) {
          let offsetForSelectedClip = 0;
          let foundSelectedClip = false;
          for (let i = 0; i < createModeClips.length; i++) {
            if (createModeClips[i].trackInstanceId === selectedClipInTrack) {
              foundSelectedClip = true;
              break;
            }
            offsetForSelectedClip += (parseFloat(createModeClips[i].duration_seconds) || 0);
          }
          if (foundSelectedClip) {
            globalCurrentTime = offsetForSelectedClip + videoElement.currentTime;
          } else {
            globalCurrentTime = videoElement.currentTime; 
          }
        } else {
          globalCurrentTime = videoElement.currentTime; 
        }
        setTimelineCurrentTime(globalCurrentTime);
      };

      videoElement.addEventListener('timeupdate', handleTimeUpdate);
      handleTimeUpdate(); 

      return () => {
        videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      };
    } else if (!isPlayingTrack) { 
      setTimelineCurrentTime(0);
    }
  }, [
    activeView, 
    createModeVideoRef, 
    videoPlayerSrcWithFragment, 
    isPlayingTrack, 
    selectedClipInTrack, 
    createModeClips
  ]);

  // Effect for timer-driven smooth playhead during track playback
  useEffect(() => {
    let animationFrameId = null;
    const isPlayingTrackRef = { current: isPlayingTrack }; // Use a ref to ensure RAF loop has latest state
    isPlayingTrackRef.current = isPlayingTrack;


    if (isPlayingTrack && activeView === 'create') {
      // trackPlaybackStartTimestampRef.current is set when play is clicked
      console.log("[Smooth Playhead] Starting timer. Timestamp ref:", trackPlaybackStartTimestampRef.current);

      const frameUpdate = (timestamp) => {
        if (!isPlayingTrackRef.current) { // Check ref inside loop
          console.log("[Smooth Playhead] Loop: isPlayingTrackRef is false, stopping RAF.");
          return; // Stop the loop if no longer playing
        }
        const elapsedTimeSeconds = (timestamp - trackPlaybackStartTimestampRef.current) / 1000;
        setSmoothTrackPlayheadTime(elapsedTimeSeconds > 0 ? elapsedTimeSeconds : 0); // Ensure non-negative
        animationFrameId = requestAnimationFrame(frameUpdate);
      };
      animationFrameId = requestAnimationFrame(frameUpdate);

      return () => {
        console.log("[Smooth Playhead] Cleaning up timer (canceling RAF).");
        cancelAnimationFrame(animationFrameId);
      };
    } else {
      // Reset smooth playhead time if not playing track or not in create view
      // setSmoothTrackPlayheadTime(0); // This might cause a flicker if called too often.
      // Let the play button click reset it.
    }
  }, [isPlayingTrack, activeView]); // Only depends on isPlayingTrack and activeView to start/stop timer


  // REMOVED useEffect for formattedClipInfoString as it's no longer used by the play button's primary action

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
              className={`card-body ${theme === 'dark' ? 'bg-black text-light' : 'bg-secondary'}`}
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
                  <div 
                    className="d-flex flex-column justify-content-center align-items-center w-100 h-100"
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.8)', // Dark, semi-transparent background
                      borderRadius: '15px', // Rounded corners
                      padding: '20px', // Padding around the content
                      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)', // Subtle shadow for depth
                      border: '0px solid rgba(255, 255, 255, 0.1)', // Faint border
                    }}
                  >
                    <img src="/fail.png" alt={t('failedAltText')} style={{ width: '100px', height: '100px', marginBottom: '20px' }} />
                    <p className="text-center" style={{ maxWidth: '75%', wordWrap: 'break-word', color: '#f8f9fa' }}>
                      {errorMessage || t('errorMessageGeneric')}
                    </p>
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
                    <div className={`${theme === 'dark' ? 'bg-secondary' : 'bg-light'} rounded d-flex align-items-center justify-content-center w-100 h-100`}>
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
                  <div className={`${theme === 'dark' ? 'bg-black' : 'bg-light'} rounded d-flex flex-column align-items-center justify-content-center w-100 h-100`}>
                <i className={`bi bi-film ${theme === 'dark' ? 'text-light' : 'text-dark'}`} style={{ fontSize: '3.8rem', opacity: 0.8 }}></i>
                <p className={`mt-2 ${theme === 'dark' ? 'text-light-emphasis' : 'text-muted'}`}>{t('dreamViewPlaceholderHint')}</p>
                  </div>
                )
              }
            </div>
          </div>
          {taskId && activeView === 'dream' && (
            <div className="card mt-3">
              <div className="card-body">
                {activeView === 'dream' && (
                <div
                  className="video-resize-handle mb-3"
                  onMouseDown={onMouseDownResize}
                  title={t('resizeVideoAreaTooltip', { height: videoHeight })}
                >
                  <i className="bi bi-grip-horizontal"></i>
                </div>
                )}
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
                {errorMessage && taskStatus !== STATUS_COMPLETED && <p className="card-text text-danger mb-2" style={{ maxWidth: '80%', wordWrap: 'break-word' }}><strong><i className="bi bi-exclamation-triangle me-2"></i>{t('taskErrorLabel')}</strong> {errorMessage}</p>}
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
                  key={videoPlayerSrcWithFragment || activeCreateModeVideoSrc} // Key might need to be more dynamic for track playback if base URLs change
                  ref={createModeVideoRef}
                  controls
                  autoPlay={!isPlayingTrack} // Autoplay for single clip selection, track playback handles play manually/via src change
                  // loop // Loop is handled by custom useEffect when !isPlayingTrack
                  src={videoPlayerSrcWithFragment || activeCreateModeVideoSrc}
                  style={{ maxHeight: '140%', maxWidth: '140%', minWidth:'140%', minHeight:'140%', objectFit: 'contain', backgroundColor: theme === 'dark' ? '#000000' : '#f8f9fa' }}
                >
                  {t('videoTagNotSupported')}
                </video>
              ) : (
                <div className={`${theme === 'dark' ? 'bg-black' : 'bg-light'} rounded d-flex flex-column align-items-center justify-content-center w-100 h-100`}>
                  <i className="bi bi-film" style={{ fontSize: '3rem', opacity: 0.5 }}></i>
                  <p className="mt-2">{t('createVideoPlaceholder')}</p>
                </div>
              )}
            </div>
            {activeView === 'create' && (
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
            <div className="card-body p-2 d-flex align-items-start"> {/* Changed to flex-row and align-items-start */}
              {/* Fixed Film Icon and Duration (Moved outside scrollable container) */}
              <div
                className="me-2 d-flex flex-column align-items-center justify-content-center"
                title={t('videoTrackHeadIconTitle', "Start of video track")}
                style={{ minWidth: '50px' }} // Ensure space for icon and text
              >
                <i
                  className={`bi bi-film ${theme === 'dark' ? 'text-light' : 'text-dark'} ${isPlayingTrack ? 'disabled-look' : ''}`}
                  style={{ fontSize: '1.8rem', opacity: 0.8 }}
                ></i>
                {activeView === 'create' && (
                  <div
                    className={`badge ${theme === 'dark' ? 'bg-light text-dark' : 'bg-secondary text-white'} d-flex align-items-center mb-2 ${isPlayingTrack ? 'disabled-look' : ''}`}
                    style={{ fontSize: '0.70rem', marginTop: '3px', whiteSpace: 'nowrap', padding: '0.25em 0.4em' }}
                    title={t('totalTrackDurationLabel', `Total duration: ${totalDurationFormatted}`, { duration: totalDurationFormatted })}
                  >
                    <i className="bi bi-clock me-1"></i>
                    {totalDurationFormatted}
                  </div>
                )}
                {/* Play/Pause button for the track */}
                <button
                  className={`btn btn-sm btn-light mt-1 rounded-circle p-1`}
                  style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => {
                    const videoElement = createModeVideoRef.current;
                      if (isPlayingTrack) { 
                        handleStopTrackPlayback();
                      } else { 
                        if (trackPlaylist.length > 0 && videoElement) { // Ensure videoElement exists
                          trackPlaybackStartTimestampRef.current = performance.now();
                          setSmoothTrackPlayheadTime(0); // Reset timer-driven playhead
                          
                          const firstPlaylistItem = trackPlaylist[0];
                          const targetSrcForFirstClip = `${firstPlaylistItem.src}#t=${firstPlaylistItem.startTime.toFixed(3)},${firstPlaylistItem.endTime.toFixed(3)}`;

                          // Set state to start track playback from the first clip
                          setCurrentTrackPlaybackClipIndex(0); 
                          setIsPlayingTrack(true);

                          // If the videoPlayerSrcWithFragment (which dictates the video key and src) 
                          // is already what the first clip of the track needs, it means the src/key
                          // won't change, and 'canplaythrough' might not fire to reset playback.
                          // In this specific case, we manually set currentTime and play.
                          if (videoPlayerSrcWithFragment === targetSrcForFirstClip) {
                            console.log("[Play Track Button] First clip's target src is same as current. Manually setting currentTime and playing.");
                            videoElement.currentTime = firstPlaylistItem.startTime;
                            videoElement.play().catch(e => console.warn("Play Track Button: Manual play failed", e));
                          }
                          // If videoPlayerSrcWithFragment will change due to the state updates above, 
                          // the existing useEffect chain involving setVideoPlayerSrcWithFragment 
                          // -> new key/src -> canplaythrough event -> (handler sets currentTime + calls play) 
                          // will correctly handle starting playback from the beginning of the first clip's segment.

                          if (musicAudioRef.current) {
                            musicAudioRef.current.currentTime = 0;
                            musicAudioRef.current.play().catch(e => console.warn("Music play failed", e));
                        }
                      }
                    }
                  }}
                  disabled={isCreatingVideo || trackPlaylist.length === 0}
                  title={isPlayingTrack ? t('stopTrackButtonTitle', 'Stop track') : t('playTrackButtonTitle', 'Play track (locks editing)')}
                >
                  <i className={`bi ${isPlayingTrack ? 'bi-stop-fill' : 'bi-play-fill'}`}></i>
                </button>
              </div>
              {/* Combined Scrollable Container for Timeline and Clips with Overlay */}
              <div style={{ overflowX: 'auto', flexGrow: 1, position: 'relative' }}> {/* Added position: relative for overlay */}
                {/* Timeline Playhead - Visible only during track playback */}
                {activeView === 'create' && isPlayingTrack && videoPlayerSrcWithFragment && (
                  <div 
                    className="timeline-playhead"
                    style={{
                      position: 'absolute',
                      left: `${((isPlayingTrack ? smoothTrackPlayheadTime : timelineCurrentTime) * pixelsPerSecond) + 20}px`,
                      top: 0, 
                      bottom: 0, 
                      width: '2px',
                      backgroundColor: 'rgba(255, 255, 255, 0.75)', // White with transparency
                      zIndex: 55, 
                      pointerEvents: 'none', 
                    }}
                  >
                    {/* Top Dot */}
                    <div style={{
                      position: 'absolute',
                      top: '-4px', // Adjust for dot size (dotHeight/2)
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: '8px', // Dot diameter
                      height: '8px', // Dot diameter
                      backgroundColor: 'rgba(255, 255, 255, 0.9)', // Slightly more opaque white
                      borderRadius: '50%',
                    }}></div>
                    {/* Bottom Dot */}
                    <div style={{
                      position: 'absolute',
                      bottom: '-4px', // Adjust for dot size (dotHeight/2)
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: '8px', // Dot diameter
                      height: '8px', // Dot diameter
                      backgroundColor: 'rgba(255, 255, 255, 0.9)', // Slightly more opaque white
                      borderRadius: '50%',
                    }}></div>
                  </div>
                )}
                {isPlayingTrack && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    zIndex: 50, // Ensure it's above clips and timeline but below modals if any
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    borderRadius: '0.25rem', // Match parent's rounding
                  }}>
                    {/* Optional: Text on overlay, e.g., "Playback Active" */}
                    {/* <p>{t('playbackActiveOverlayText', 'Playback Active')}</p> */}
                  </div>
                )}
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
                <Droppable droppableId="clips" direction="horizontal" isDropDisabled={isCreatingVideo || !!draggingState || isPlayingTrack} isCombineEnabled={false}>
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
                        const clipWidthPx = (parseFloat(clip.duration_seconds) || MIN_CLIP_DURATION_SECONDS) * pixelsPerSecond;
                        const showDragHandle = hoveredForDragHandleClipId === clip.trackInstanceId && 
                                               !draggingState && 
                                               !isCreatingVideo && 
                                               !isPlayingTrack && 
                                               clipWidthPx >= MIN_CLIP_WIDTH_FOR_DRAG_HANDLE_PX;
                        
                        // Base class name parts that don't depend on Draggable's snapshot
                        let baseItemClassName = `clip-thumbnail-item ${selectedClipInTrack === clip.trackInstanceId ? 'active' : ''}`;
                        if (isPlayingTrack && trackPlaylist[currentTrackPlaybackClipIndex]?.id === clip.trackInstanceId) {
                          baseItemClassName += ' playing'; // Class for highlighting the currently playing clip
                        }

                        return (
                          <Draggable
                            key={clip.trackInstanceId}
                            draggableId={clip.trackInstanceId}
                            index={index}
                            isDragDisabled={isCreatingVideo || !!draggingState || isPlayingTrack} // Disable dragging if resizing, creating video, or playing track
                          >
                            {(providedDraggable, snapshot) => {
                              const startTime = parseFloat(clip.start_offset_seconds || 0).toFixed(2);
                              const duration = parseFloat(clip.duration_seconds).toFixed(2);
                              const endTime = (parseFloat(startTime) + parseFloat(duration)).toFixed(2);
                              const originalDuration = parseFloat(clip.original_duration_seconds).toFixed(2);
                              const tooltipText = `Start: ${startTime}s\nEnd: ${endTime}s\nDuration: ${duration}s\nOriginal: ${originalDuration}s`;

                              // Add snapshot-dependent class parts here
                              let finalItemClassName = baseItemClassName;
                              if (!snapshot.isDragging && (hoveredClipId === clip.trackInstanceId || isResizingThisClip)) {
                                finalItemClassName += ' interactive-border';
                              }

                              return (
                              <div
                                ref={providedDraggable.innerRef}
                                {...providedDraggable.draggableProps} // Applied to the main container for positioning by R-B-DND
                                // dragHandleProps will be applied to the custom handle, not here
                                className={finalItemClassName} // Use the fully constructed class name
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
                                  if (!draggingState && !snapshot.isDragging && !isPlayingTrack) {
                                    onClipClick(clip);
                                  }
                                }}
                                onMouseEnter={(e) => {
                                  if (!draggingState && !snapshot.isDragging && !isPlayingTrack) {
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
                                  if (!draggingState && !snapshot.isDragging && !isPlayingTrack && hoveredClipId === clip.trackInstanceId) {
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
                                  if (!draggingState && !snapshot.isDragging && !isPlayingTrack) {
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
                                {!snapshot.isDragging && !isCreatingVideo && !isPlayingTrack && (
                                  <>
                                    {((mouseOverEdgeInfo?.clipId === clip.trackInstanceId && mouseOverEdgeInfo?.side === 'start') || (draggingState?.clipId === clip.trackInstanceId && draggingState?.handleType === 'start')) && (
                                      <div
                                        className="clip-resize-handle start"
                                        style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', height: '40px', width: '10px', background: 'white', cursor: 'ew-resize', zIndex: 10, borderRadius: '3px', left: '-5px', boxShadow: '0 0 5px rgba(0,0,0,0.5)' }}
                                        onMouseDownCapture={(e) => handleMouseDownOnClipResize(e, clip, 'start')}
                                      />
                                    )}
                                    {((mouseOverEdgeInfo?.clipId === clip.trackInstanceId && mouseOverEdgeInfo?.side === 'end') || (draggingState?.clipId === clip.trackInstanceId && draggingState?.handleType === 'end')) && (
                                      <div
                                        className="clip-resize-handle end"
                                        style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', height: '40px', width: '10px', background: 'white', cursor: 'ew-resize', zIndex: 10, borderRadius: '3px', right: '-5px', boxShadow: '0 0 5px rgba(0,0,0,0.5)' }}
                                        onMouseDownCapture={(e) => handleMouseDownOnClipResize(e, clip, 'end')}
                                      />
                                    )}
                                  </>
                                )}
                                {!isPlayingTrack && ( // Conditionally render delete button
                                  <button
                                    className="clip-delete-btn"
                                    disabled={isCreatingVideo} // isPlayingTrack check is now on render
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // No need for !isPlayingTrack check here as button won't render if true
                                      onRemoveClipFromTrack(clip.trackInstanceId);
                                    }}
                                    title={t('removeClipFromTrackTitle')}
                                  >
                                    <i className="bi bi-x-lg"></i>
                                  </button>
                                )}
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
                        <audio ref={musicAudioRef} controls src={generatedMusicUrl} className="w-100" style={{ height: '30px' }}>
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
                            disabled={isCreatingVideo || isPlayingTrack}
                            title={t('clearMusicSelectionButtonTitle', 'Clear selected music')}
                            style={{ lineHeight: '1', height: '24px', width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                          >
                            <i className="bi bi-x-lg" style={{ fontSize: '0.8rem' }}></i>
                          </button>
                        </div>
                        {uploadedMusicBackendUrl && (
                          <audio ref={musicAudioRef} key={uploadedMusicBackendUrl} controls src={uploadedMusicBackendUrl} className="w-100 mt-1" style={{ height: '30px' }}>
                            {t('audioTagNotSupported')}
                          </audio>
                        )}
                        {!uploadedMusicBackendUrl && uploadedMusicSrc && musicTaskStatus !== 'processing' && musicTaskStatus !== 'failed' && !isGeneratingMusic && (
                          <audio ref={musicAudioRef} key={uploadedMusicSrc} controls src={uploadedMusicSrc} className="w-100 mt-1" style={{ height: '30px' }}>
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
                          disabled={isCreatingVideo || isGeneratingMusic || isPlayingTrack}
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
                          disabled={isCreatingVideo || isGeneratingMusic || isPlayingTrack}
                          style={{ opacity: 0, position: 'absolute', width: '1px', height: '1px' }}
                        />
                        <button
                          className={`btn btn-sm ${theme === 'dark' ? 'btn-outline-light' : 'btn-outline-secondary'}`}
                          onClick={onGenerateMusicClick}
                          disabled={isCreatingVideo || isGeneratingMusic || true || isPlayingTrack} // Always disable for now
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
