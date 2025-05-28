import React from 'react';

function Footer({ theme, t }) {
  return (
    <footer className={`${theme === 'dark' ? 'bg-dark text-light' : 'bg-light text-dark'} text-center text-lg-start mt-auto`}>
      <div className="text-center p-3" style={{ backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }}>
        {t('footerCopyright')}
      </div>
    </footer>
  );
}

export default Footer;
