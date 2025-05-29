import React from 'react';

function TopToolbar({
  userEmail,
  userDropdownRef,
  showUserDropdown,
  setShowUserDropdown,
  theme,
  onToggleTheme,
  i18n,
  onChangeLanguage,
  t,
  activeView, // New prop
  setActiveView, // New prop
}) {
  return (
    <div className={`top-toolbar ${theme === 'dark' ? 'bg-dark text-light' : 'bg-light text-dark'}`}>
      {userEmail && (
        <div className="dropdown me-auto" ref={userDropdownRef}> {/* Added me-auto for left alignment */}
          <button
            className={`btn btn-link ${theme === 'dark' ? 'text-light' : 'text-dark'} p-0`}
            type="button"
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            aria-expanded={showUserDropdown}
            title={t('userInfoTitle')}
          >
            <i className="bi bi-person-circle"></i>
          </button>
          {showUserDropdown && (
            <ul className={`dropdown-menu dropdown-menu-start show ${theme === 'dark' ? 'dropdown-menu-dark' : ''}`} style={{ position: 'absolute', inset: '0px auto auto 0px', margin: '0px', transform: 'translate(0px, 30px)', minWidth: '250px' }}> {/* Changed to dropdown-menu-start */}
              <li><span className="dropdown-item-text">{userEmail}</span></li>
            </ul>
          )}
        </div>
      )}

      {/* Centered View Switcher */}
      <div className="custom-pill-toggle-group mx-auto my-1">
        <button
          className={`custom-pill-toggle-btn btn-sm ${activeView === 'dream' ? 'active' : ''}`}
          onClick={() => setActiveView('dream')}
          type="button"
        >
          <i className="bi bi-cloud"></i>
          {t('dreamView')}
        </button>
        <button
          className={`custom-pill-toggle-btn btn-sm ${activeView === 'create' ? 'active' : ''}`}
          onClick={() => setActiveView('create')}
          type="button"
        >
          <i className="bi bi-intersect"></i>
          {t('createView')}
        </button>
      </div>
      {/* End of Centered View Switcher */}

      {/* Theme Switch and Language Dropdown - moved to the right */}
      <div className="ms-auto d-flex align-items-center">
        <div className="form-check form-switch me-3">
          <input
            className="form-check-input"
            type="checkbox"
            role="switch"
            id="themeSwitchToolbar"
            checked={theme === 'dark'}
            onChange={onToggleTheme}
          />
          <label className="form-check-label" htmlFor="themeSwitchToolbar">
            {theme === 'dark' ? <i className="bi bi-moon-stars-fill"></i> : <i className="bi bi-sun-fill"></i>}
          </label>
        </div>
        <div className="dropdown">
        <button
          className={`btn btn-outline-secondary dropdown-toggle ${theme === 'dark' ? 'text-light border-secondary' : ''}`}
          type="button"
          id="languageDropdownButtonToolbar"
          data-bs-toggle="dropdown"
          aria-expanded="false"
        >
          {i18n.language === 'es' ? '🇪🇸' : (i18n.language === 'zh-CN' ? '🇨🇳' : (i18n.language === 'ja' ? '🇯🇵' : '🇺🇸'))}
        </button>
        <ul className={`dropdown-menu dropdown-menu-end ${theme === 'dark' ? 'dropdown-menu-dark' : ''}`} aria-labelledby="languageDropdownButtonToolbar">
          <li><button className="dropdown-item" type="button" onClick={() => onChangeLanguage('en')}>🇺🇸 English</button></li>
          <li><button className="dropdown-item" type="button" onClick={() => onChangeLanguage('es')}>🇪🇸 Español</button></li>
            <li><button className="dropdown-item" type="button" onClick={() => onChangeLanguage('zh-CN')}>🇨🇳 简体中文</button></li>
            <li><button className="dropdown-item" type="button" onClick={() => onChangeLanguage('ja')}>🇯🇵 日本語</button></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default TopToolbar;
