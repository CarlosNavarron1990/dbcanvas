import React from 'react';
import { Link } from 'react-router-dom';
import { Database, Globe } from 'lucide-react';
import { isLoggedIn, logout } from '../api';
import { useI18n } from '../useI18n';

const Navbar: React.FC = () => {
  const { t, lang, toggleLang } = useI18n();
  const logged = isLoggedIn();
  return (
    <nav className="navbar">
      <Link to="/" className="nav-brand">
        <Database size={24} /> <span>DBCanvas</span>
      </Link>
      <div className="nav-links">
        <Link to="/pricing">{t('pricing')}</Link>
        <Link to="/download">{t('download')}</Link>
        <button className="lang-toggle" onClick={toggleLang} title="Switch language">
          <Globe size={14} /> {lang.toUpperCase()}
        </button>
        {logged ? (
          <>
            <Link to="/dashboard">{t('dashboard')}</Link>
            <button className="nav-btn-outline" onClick={logout}>{t('logout')}</button>
          </>
        ) : (
          <>
            <Link to="/login" className="nav-btn-outline">{t('login')}</Link>
            <Link to="/register" className="nav-btn-primary">{t('getStarted')}</Link>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
