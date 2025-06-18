import React from 'react';

function Sidebar({
  theme,
  t,
  activeView, // Added back activeView as it's used internally
  // setActiveView is still removed as it's handled by TopToolbar
  // Dream View Props
  prompt,
  onPromptChange,
  isLoading,
  isRefining,
  promptActionButtons,
  activeImageTab,
  onActiveImageTabChange,
  model,
  onModelChange,
  imagePreviewRef,
  imagePreview,
  onImagePreviewClick,
  onClearImagePreview,
  fileInputRef,
  onImageChange,
  onPasteFromClipboard,
  onGenerateFirstFrameImage, // New prop
  isGeneratingFirstFrame, // New prop
  lastImagePreviewRef,
  lastImagePreview,
  onClearLastImagePreview,
  lastFileInputRef,
  onLastImageChange,
  onGenerateLastFrameImage, // New prop
  isGeneratingLastFrame, // New prop
  ratio,
  onRatioChange,
  cameraControl,
  onCameraControlChange,
  duration,
  onDurationChange,
  gcsOutputBucket,
  onGcsOutputBucketChange,
  onGenerateClick,
  processingTaskCount,
  activeSpinnerButtonKey,
  // Create View Props
  createModeClips,
  onCreateVideoClick,
  isCreatingVideo,
  // Music Props (These will be moved to MainContent)
  // onMusicFileUpload,
  // onGenerateMusicClick,
  // isGeneratingMusic,
  // selectedMusicFile,
  // isMusicEnabled,
  // onToggleMusic,
  // generatedMusicUrl,
  // musicTaskStatus,
  // musicErrorMessage,
}) {
  return (
    <div className={`sidebar p-3 border-end ${theme === 'dark' ? 'bg-dark text-light' : 'bg-light text-dark'}`}>
      <header className="mb-3" style={{ background: 'linear-gradient(to right, black, #b8485f)', borderRadius: '0.375rem', padding: '1rem', color: 'white' }}>
        <div className="container-fluid p-0">
          <h1 className="h3 mb-0" style={{ color: 'white' }}><i className="bi bi-film me-2"></i>{t('appTitle')}</h1>
          <p className="mb-0" style={{ fontSize: '0.8rem', opacity: 0.7, color: 'white' }}>{t('poweredBy')}</p>
        </div>
      </header>
      {/* View switcher removed from here */}

      {/* Conditional rendering based on activeView prop, which is still needed for Sidebar's content */}
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
                onChange={onPromptChange}
                disabled={isLoading || isRefining || isGeneratingFirstFrame || isGeneratingLastFrame}
              ></textarea>
              <div className="mt-2 d-flex flex-wrap">
                {promptActionButtons.map((btn, index) => (
                  <button
                    key={index}
                    className={`btn ${theme === 'dark' ? 'btn-outline-light' : 'btn-outline-secondary'} me-1 mb-1`}
                    onClick={btn.onClick}
                    title={btn.label}
                    style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0' }}
                    disabled={isLoading || isRefining || isGeneratingFirstFrame || isGeneratingLastFrame || (btn.disabled !== undefined ? btn.disabled : false) || (btn.keywordEffect && activeSpinnerButtonKey === btn.keyword)}
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
                    onClick={() => onActiveImageTabChange('first')}
                    type="button"
                  >
                    <i className="bi bi-image me-1"></i> {t('firstFrameTab')}
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeImageTab === 'last' ? 'active' : ''} ${theme === 'dark' && activeImageTab !== 'last' ? 'text-light' : ''}`}
                    onClick={() => onActiveImageTabChange('last')}
                    type="button"
                    disabled={model === 'veo-3.0-generate-preview'}
                    title={model === 'veo-3.0-generate-preview' ? t('lastFrameNotSupportedTooltip') : t('selectLastFrameImageTooltip')}
                  >
                    <i className="bi bi-image-alt me-1"></i> {t('lastFrameTab')}
                  </button>
                </li>
              </ul>

              <div className="tab-content">
                <div className={`tab-pane fade ${activeImageTab === 'first' ? 'show active' : ''}`} id="firstFrameTabContent">
                  <div
                    ref={imagePreviewRef}
                    className="mb-3 text-center border rounded p-3"
                    style={{ minHeight: '170px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }}
                    tabIndex={0}
                    title={t('pasteImageTooltip')}
                  >
                    {imagePreview ? (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img src={imagePreview} alt={t('firstFramePreviewAlt')} className="img-thumbnail" style={{ maxHeight: '150px', maxWidth: '100%', cursor: 'pointer' }} onClick={() => onImagePreviewClick(imagePreview)} />
                        <button
                          type="button"
                          className="btn btn-secondary position-absolute top-0 end-0 m-1 rounded-circle"
                          style={{ width: '28px', height: '28px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, opacity: 0.6 }}
                          onClick={onClearImagePreview}
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
                          onClick={() => onPasteFromClipboard('first')}
                          title={t('pasteImageFromClipboardButtonTitle')}
                          style={{ fontSize: '1.5rem' }}
                        >
                          <i className="bi bi-clipboard-plus"></i>
                        </button>
                        <span className={`${theme === 'dark' ? 'text-light' : 'text-muted'} mx-1`}>{t('orSeparator')}</span>
                        <button
                          className={`btn btn-link ${theme === 'dark' ? 'text-light' : 'text-primary'} p-2`}
                          onClick={onGenerateFirstFrameImage}
                          title={t('generateFirstFrameButtonTitle')}
                          style={{ fontSize: '1.5rem' }}
                          disabled={isLoading || isRefining || isGeneratingFirstFrame}
                        >
                          {isGeneratingFirstFrame ? (
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                          ) : (
                            <i className="bi bi-stars"></i>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="form-control"
                    id="imageUploadSidebar" // Changed ID to avoid conflict if App.js still has one
                    accept="image/*"
                    onChange={onImageChange}
                    disabled={isLoading || isGeneratingFirstFrame || isGeneratingLastFrame}
                    style={{ display: 'none' }}
                  />
                </div>

                <div className={`tab-pane fade ${activeImageTab === 'last' ? 'show active' : ''}`} id="lastFrameTabContent">
                  <div
                    ref={lastImagePreviewRef}
                    className="mb-3 text-center border rounded p-3"
                    style={{ minHeight: '170px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }}
                    tabIndex={0}
                    title={t('pasteImageTooltip')}
                  >
                    {lastImagePreview ? (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img src={lastImagePreview} alt={t('lastFramePreviewAlt')} className="img-thumbnail" style={{ maxHeight: '150px', maxWidth: '100%', cursor: 'pointer' }} onClick={() => onImagePreviewClick(lastImagePreview)} />
                        <button
                          type="button"
                          className="btn btn-secondary position-absolute top-0 end-0 m-1 rounded-circle"
                          style={{ width: '28px', height: '28px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, opacity: 0.6 }}
                          onClick={onClearLastImagePreview}
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
                          onClick={() => onPasteFromClipboard('last')}
                          title={t('pasteLastFrameImageFromClipboardButtonTitle')}
                          style={{ fontSize: '1.5rem' }}
                          disabled={model === 'veo-3.0-generate-preview' || isLoading || isRefining || isGeneratingLastFrame}
                        >
                          <i className="bi bi-clipboard-plus"></i>
                        </button>
                        <span className={`${theme === 'dark' ? 'text-light' : 'text-muted'} mx-1`}>{t('orSeparator')}</span>
                        <button
                          className={`btn btn-link ${theme === 'dark' ? 'text-light' : 'text-primary'} p-2`}
                          onClick={onGenerateLastFrameImage}
                          title={t('generateLastFrameButtonTitle')}
                          style={{ fontSize: '1.5rem' }}
                          disabled={model === 'veo-3.0-generate-preview' || isLoading || isRefining || isGeneratingLastFrame}
                        >
                          {isGeneratingLastFrame ? (
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                          ) : (
                            <i className="bi bi-stars"></i>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    ref={lastFileInputRef}
                    type="file"
                    className="form-control"
                    id="lastImageUploadSidebar" // Changed ID
                    accept="image/*"
                    onChange={onLastImageChange}
                    disabled={isLoading || model === 'veo-3.0-generate-preview' || isGeneratingFirstFrame || isGeneratingLastFrame}
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
              <label htmlFor="modelSelectSidebar" className={`form-label ${theme === 'dark' ? 'text-light' : ''}`}><i className="bi bi-box me-2"></i>{t('modelLabel')}</label>
              <select
                id="modelSelectSidebar" // Changed ID
                className="form-select"
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                disabled={isLoading || isGeneratingFirstFrame || isGeneratingLastFrame}
              >
                <option value="veo-2.0-generate-001">veo-2.0-generate-001</option>
                <option value="veo-2.0-generate-exp">veo-2.0-generate-exp</option>
                <option value="veo-3.0-generate-preview">veo-3.0-generate-preview</option>
              </select>
            </div>

            <div className="mb-3">
              <label htmlFor="ratioSelectSidebar" className={`form-label ${theme === 'dark' ? 'text-light' : ''}`}><i className="bi bi-aspect-ratio me-2"></i>{t('aspectRatioLabel')}</label>
              <select
                id="ratioSelectSidebar" // Changed ID
                className="form-select"
                value={ratio}
                onChange={(e) => onRatioChange(e.target.value)}
                disabled={isLoading || isGeneratingFirstFrame || isGeneratingLastFrame}
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
              <label htmlFor="cameraControlSelectSidebar" className={`form-label ${theme === 'dark' ? 'text-light' : ''}`}><i className="bi bi-camera-video me-2"></i>{t('cameraControlLabel')}</label>
              <select
                id="cameraControlSelectSidebar" // Changed ID
                className="form-select"
                value={cameraControl}
                onChange={(e) => onCameraControlChange(e.target.value)}
                disabled={isLoading || model !== 'veo-2.0-generate-exp' || isGeneratingFirstFrame || isGeneratingLastFrame}
              >
                <option value="">{t('selectOption')}</option>
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
              <label htmlFor="durationSelectSidebar" className={`form-label ${theme === 'dark' ? 'text-light' : ''}`}><i className="bi bi-clock me-2"></i>{t('videoDurationLabel')}</label>
              <select
                id="durationSelectSidebar" // Changed ID
                className="form-select"
                value={duration}
                onChange={(e) => onDurationChange(parseInt(e.target.value, 10))}
                disabled={isLoading || isGeneratingFirstFrame || isGeneratingLastFrame}
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
              <label htmlFor="gcsOutputBucketSidebar" className={`form-label ${theme === 'dark' ? 'text-light' : ''}`}><i className="bi bi-bucket me-2"></i>{t('gcsOutputBucketLabel')}</label>
              <input
                type="text"
                className="form-control"
                id="gcsOutputBucketSidebar" // Changed ID
                placeholder={t('gcsOutputBucketPlaceholder')}
                value={gcsOutputBucket}
                onChange={(e) => onGcsOutputBucketChange(e.target.value)}
                disabled={isLoading || isGeneratingFirstFrame || isGeneratingLastFrame}
              />
            </div>

            <button
              className="btn btn-primary w-100 mt-4"
              onClick={onGenerateClick}
              disabled={isLoading || isRefining || !prompt.trim() || processingTaskCount >= 4 || isGeneratingFirstFrame || isGeneratingLastFrame}
            >
              {isLoading ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>{t('generatingButtonInProgress')}</> : (processingTaskCount >= 4 ? <><i className="bi bi-exclamation-triangle-fill me-2"></i>{t('maxProcessingTasksButton')}</> : <><i className="bi bi-magic me-2"></i>{t('generateButtonDefault')}</>)}
            </button>
          </div>
        </div>
      )}

      {activeView === 'create' && (
        <>
          <div className={`alert alert-info mt-3 ${theme === 'dark' ? 'alert-info-dark' : ''}`} role="alert">
            <h5 className="alert-heading"><i className="bi bi-tools me-2"></i>{t('videoEditingUnderDevelopmentNoticeTitle')}</h5>
            <p style={{ fontSize: '0.85rem' }}>{t('videoEditingUnderDevelopmentNoticeBody')}</p>
            <hr />
            <p className="mb-0" style={{ fontSize: '0.85rem' }}>{t('videoEditingUnderDevelopmentNoticeSuggestion')}</p>
          </div>
          {/* Music Panel Removed */}
          <div className="card">
            <div className="card-body text-center">
              <button
                className={`btn btn-primary btn-lg mt-2 w-100`}
                onClick={onCreateVideoClick}
              disabled={isCreatingVideo || createModeClips.length < 2}
            >
              {isCreatingVideo ? (
                <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>{t('creatingVideoButtonInProgress')}</>
              ) : (
                <><i className="bi bi-film me-2"></i>{t('createVideoButton')}</>
              )}
            </button>
          </div>
        </div>
      </>
      )}
    </div>
  );
}

export default Sidebar;
