import React from 'react';
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
}) {
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
            <div className="card-body p-2 d-flex flex-column">
              <div
                className="timeline-container mb-2"
                style={{
                  width: '100%',
                  height: '50px',
                  backgroundColor: theme === 'dark' ? '#343a40' : '#f1f3f5',
                  borderRadius: '0.25rem',
                  border: theme === 'dark' ? '1px solid #495057' : '1px solid #ced4da',
                  overflowX: 'auto',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    height: '100%',
                    minWidth: `${(60 * pixelsPerSecond) + 10 + 40}px`,
                    display: 'flex',
                    alignItems: 'flex-end',
                    paddingLeft: '10px',
                  }}
                >
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map((time) => (
                    <div
                      key={time}
                      style={{
                        width: `${5 * pixelsPerSecond}px`,
                        position: 'relative',
                        fontSize: '0.8em',
                        color: theme === 'dark' ? '#adb5bd' : '#495057',
                        flexShrink: 0,
                        paddingBottom: '5px',
                      }}
                    >
                      <div style={{ position: 'absolute', bottom: '20px', left: '0%', width: '1px', height: '8px', backgroundColor: theme === 'dark' ? '#6c757d' : '#adb5bd' }}></div>
                      {time}s
                    </div>
                  ))}
                </div>
              </div>
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="clips" direction="horizontal">
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="clips-scroll-container d-flex"
                      style={{ overflowX: 'auto', flexGrow: 1 }}
                    >
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
            </div>
          </div>
          <div style={{ flexGrow: 1 }}></div> {/* Spacer to consume remaining vertical space */}
        </div>
      )}
    </main>
  );
}

export default MainContent;
