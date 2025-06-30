import React, { useState, useEffect } from 'react';
import { getTasks } from '../api';
import {
  STATUS_COMPLETED,
  STATUS_PROCESSING,
  STATUS_PENDING,
  STATUS_INITIALIZING,
  STATUS_COMPLETED_WAITING_URI,
  STATUS_FAILED,
  STATUS_ERROR,
} from '../constants';

function HistorySidebar({
  theme,
  t,
  historyTasks,
  setHistoryTasks,
  historyFilter,
  onHistoryFilterChange,
  activeView,
  currentDreamTaskId, // Renamed from taskId for clarity
  selectedClipInTrack,
  createModeClips,
  onHistoryItemClick,
  onHoveredHistoryItemChange,
  hoveredHistoryTaskId,
  onRefreshHistory,
  BACKEND_URL,
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    getTasks(currentPage, setHistoryTasks, setTotalPages, t);
  }, [currentPage, setHistoryTasks, setTotalPages, t]);

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  return (
    <div className={`right-sidebar p-3 border-start ${theme === 'dark' ? 'bg-dark text-light' : 'bg-light text-dark'}`} style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card border-0 flex-grow-1">
        <div className="card-body d-flex flex-column h-100">
          <h2 className="card-title h5 mb-3" onClick={onRefreshHistory} style={{ cursor: 'pointer' }} title={t('refreshHistoryTooltip')}><i className="bi bi-clock-history me-2"></i>{t('historyTitle')}</h2>
          <div className="mb-3">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder={t('historyFilterPlaceholder')}
              value={historyFilter}
              onChange={(e) => onHistoryFilterChange(e.target.value)}
            />
          </div>
          {historyTasks.filter(task => task.prompt && task.prompt.toLowerCase().includes(historyFilter.toLowerCase())).length === 0 && <p className={`${theme === 'dark' ? 'text-light' : 'text-muted'}`}>{t('historyNoMatchingTasks')}</p>}
          <ul className="list-group list-group-flush flex-grow-1" style={{ overflowY: 'auto', maxHeight: 'calc(75vh)' }}>
            {historyTasks
              .filter(task => task.prompt && task.prompt.toLowerCase().includes(historyFilter.toLowerCase()))
              .map((task) => {
                const isSelectedInCreateTrack = activeView === 'create' &&
                  selectedClipInTrack &&
                  createModeClips.some(clip =>
                    clip.trackInstanceId === selectedClipInTrack &&
                    clip.task_id === task.task_id
                  );
                const isCurrentDreamTask = activeView === 'dream' && task.task_id === currentDreamTaskId;

                return (
                  <li
                    key={task.task_id}
                    className={`list-group-item-action d-flex flex-column align-items-center p-2 ${theme === 'dark' ? 'list-group-item-dark-no-border' : 'list-group-item-light-no-border'} ${isCurrentDreamTask ? 'has-selected-thumbnail' : ''} ${isSelectedInCreateTrack ? 'has-selected-thumbnail' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onHistoryItemClick(task)}
                    onMouseEnter={() => activeView === 'create' && onHoveredHistoryItemChange(task.task_id)}
                    onMouseLeave={() => activeView === 'create' && onHoveredHistoryItemChange(null)}
                  >
                    {(task.status === STATUS_COMPLETED && task.local_thumbnail_path) ? (
                      <div className={`thumbnail-container position-relative mb-2 ${isCurrentDreamTask || isSelectedInCreateTrack ? 'selected-thumbnail-custom-border' : ''}`}>
                        <img
                          src={`${BACKEND_URL}${task.local_thumbnail_path}`}
                          alt={t('historyThumbnailAlt', { prompt: task.prompt })}
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
                      <div className={`thumbnail-container position-relative mb-2 ${isCurrentDreamTask || isSelectedInCreateTrack ? 'selected-thumbnail-custom-border' : ''}`} title={t('videoTrackHeadIconTitle', "Start of video track")}>
                        <img src="/gears.gif" alt={t('statusIconAlt', "Status icon")} style={{ width: '80px', height: '80px', borderRadius: '8px' }} />
                      </div>
                    ) : task.status === STATUS_FAILED || task.status === STATUS_ERROR ? (
                      <div className={`thumbnail-container position-relative mb-2 ${isCurrentDreamTask || isSelectedInCreateTrack ? 'selected-thumbnail-custom-border' : ''}`}>
                        <img
                          src="/fail.png"
                          alt={t('historyFailedAlt')}
                          className="img-thumbnail"
                          style={{ width: '80px', height: '80px' }}
                        />
                      </div>
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
            <div className="d-flex justify-content-between align-items-center mt-3">
              <button className="btn btn-sm btn-outline-light btn-no-border" onClick={handlePrevPage} disabled={currentPage === 1}>
                <i className="bi bi-arrow-left"></i>
              </button>
              <span>{currentPage} / {totalPages}</span>
              <button className="btn btn-sm btn-outline-light btn-no-border" onClick={handleNextPage} disabled={currentPage === totalPages}>
                <i className="bi bi-arrow-right"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}

export default HistorySidebar;
