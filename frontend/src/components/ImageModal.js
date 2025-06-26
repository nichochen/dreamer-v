import React from 'react';

function ImageModal({ showModal, setShowModal, imageUrl, t }) {
  if (!showModal) {
    return null;
  }

  return (
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
          setShowModal(false);
        }
      }}
    >
      <div className="modal-dialog modal-xl" style={{ margin: 0, display: 'flex', alignItems: 'center', minHeight: 'calc(100% - (1.75rem * 2))' }}>
        <div className="modal-content" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column', width: '100%', overflowY: 'auto' }}>
          <div className="modal-body text-center" style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src={imageUrl}
              alt={t('imagePreviewModalAlt')}
              style={{ maxWidth: '100%', objectFit: 'contain', display: 'block' }}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              className="btn-close btn-close-white position-absolute top-0 end-0 m-3"
              aria-label={t('closeButtonLabel')}
              style={{ filter: 'invert(1) grayscale(100%) brightness(200%)', zIndex: 1051 }}
              onClick={(e) => {
                e.stopPropagation();
                setShowModal(false);
              }}
            ></button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImageModal;
