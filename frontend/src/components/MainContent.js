import React, { useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
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
  onDragEnd, // New prop for handling drag and drop
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

  return (
    <main className={`main-content-area flex-grow-1 p-4 d-flex flex-column ${theme === 'dark' ? 'bg-dark text-light' : ''}`}>
      {activeView === 'dream' && (
        <div className="d-flex flex-column flex-grow-1"> {/* Allow this section to grow vertically */}
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
              onMouseDown={onMouseDownResize}
              title={t('resizeVideoAreaTooltip', { height: videoHeight })}
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
                <video key={activeCreateModeVideoSrc} ref={createModeVideoRef} controls autoPlay loop src={activeCreateModeVideoSrc} className="w-100" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', backgroundColor: theme === 'dark' ? '#212529' : '#f8f9fa' }}>
                  {t('videoTagNotSupported')}
                </video>
              ) : (
                <div className={`${theme === 'dark' ? 'bg-secondary' : 'bg-light'} border rounded d-flex flex-column align-items-center justify-content-center w-100 h-100`}>
                  <i className="bi bi-film" style={{ fontSize: '3rem', opacity: 0.5 }}></i>
                  <p className="mt-2">{t('createVideoPlaceholder')}</p>
                </div>
              )}
            </div>
            <div
              className="video-resize-handle"
              onMouseDown={onMouseDownResize}
              title={t('resizeVideoAreaTooltip', { height: videoHeight })}
            >
              <i className="bi bi-grip-horizontal"></i>
            </div>
          </div>
          <div className={`video-clip-track card mt-2 ${theme === 'dark' ? 'bg-dark' : 'bg-light'}`}>
            <div className="card-body p-2 d-flex align-items-center"> {/* Changed to flex-row and align-items-center */}
              {/* Fixed Film Icon (Moved outside scrollable container) */}
              <div className="me-2" title={t('videoTrackHeadIconTitle', "Start of video track")}>
                <i className={`bi bi-film ${theme === 'dark' ? 'text-light' : 'text-dark'}`} style={{ fontSize: '1.8rem', opacity: 0.8 }}></i>
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
                <Droppable droppableId="clips" direction="horizontal" isDropDisabled={isCreatingVideo} isCombineEnabled={false}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="clips-scroll-container d-flex align-items-center"
                      style={{ paddingLeft: '10px', minHeight: '100px' /* New smaller padding */ }}
                    >
                      {/* Film Icon Removed from here */}
                      {createModeClips.length === 0 && <p className={`m-0 ${theme === 'dark' ? 'text-light' : 'text-muted'}`}>{t('createClipTrackPlaceholder')}</p>}
                      {createModeClips.map((clip, index) => (
                        <Draggable key={clip.trackInstanceId} draggableId={clip.trackInstanceId} index={index}>
                          {(providedDraggable) => (
                            <div
                              ref={providedDraggable.innerRef}
                              {...providedDraggable.draggableProps}
                              {...providedDraggable.dragHandleProps}
                              className={`clip-thumbnail-item ${selectedClipInTrack === clip.trackInstanceId ? 'active' : ''}`}
                              style={{
                                ...providedDraggable.draggableProps.style,
                                width: `${(parseInt(clip.duration_seconds, 10) || 5) * pixelsPerSecond}px`,
                              }}
                              onClick={() => onClipClick(clip)}
                            >
                              <button
                                className="clip-delete-btn"
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
                            </div>
                          )}
                        </Draggable>
                      ))}
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
