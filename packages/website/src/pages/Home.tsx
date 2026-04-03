import React from 'react';
import { Link } from 'react-router-dom';
import { Database, Zap, Shield, GitBranch, Monitor, Terminal, ArrowRight } from 'lucide-react';
import { useI18n } from '../useI18n';

const IDES = ['Claude Desktop', 'Claude Code', 'Cursor', 'Antigravity', 'Windsurf', 'VS Code', 'Codex'];

const Home: React.FC = () => {
  const { t } = useI18n();
  const FEATURES = [
    { icon: <Terminal size={24} />, title: t('feat1Title'), desc: t('feat1Desc') },
    { icon: <Zap size={24} />, title: t('feat2Title'), desc: t('feat2Desc') },
    { icon: <GitBranch size={24} />, title: t('feat3Title'), desc: t('feat3Desc') },
    { icon: <Shield size={24} />, title: t('feat4Title'), desc: t('feat4Desc') },
    { icon: <Database size={24} />, title: t('feat5Title'), desc: t('feat5Desc') },
    { icon: <Monitor size={24} />, title: t('feat6Title'), desc: t('feat6Desc') },
  ];

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-badge">{t('heroBadge')}</div>
        <h1>{t('heroTitle1')}<br /><span className="gradient-text">{t('heroTitle2')}</span></h1>
        <p className="hero-sub">{t('heroSub')}</p>
        <div className="hero-actions">
          <Link to="/download" className="btn btn-primary btn-lg">{t('downloadFree')} <ArrowRight size={16} /></Link>
          <Link to="/pricing" className="btn btn-outline btn-lg">{t('viewPricing')}</Link>
        </div>
        <div className="hero-ides">{IDES.map(ide => <span key={ide} className="ide-chip">{ide}</span>)}</div>
      </section>

      <section className="section">
        <h2 className="section-title">{t('featuresTitle')}</h2>
        <div className="features-grid">{FEATURES.map((f, i) => (
          <div key={i} className="feature-card"><div className="feature-icon">{f.icon}</div><h3>{f.title}</h3><p>{f.desc}</p></div>
        ))}</div>
      </section>

      <section className="section section-dark">
        <h2 className="section-title">{t('simTitle')}</h2>
        <div className="steps">
          {(['simStep1','simStep2','simStep3','simStep4'] as const).map((key, i) => (
            <div key={i} className="step-card"><div className="step-num">{i+1}</div><h3>{t(key)}</h3><p>{t(`${key}Desc` as any)}</p></div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">{t('installTitle')}</h2>
        <div className="install-block">
          <pre className="code-block">{`git clone https://github.com/xmn-services/dbcanvas.git
cd dbcanvas && npm install && npm run build`}</pre>
          <p style={{ marginTop: 16, color: 'var(--muted)' }}>{t('installOr')} <Link to="/download">Download</Link></p>
        </div>
      </section>

      <section className="section cta-section">
        <h2>{t('ctaTitle')}</h2><p>{t('ctaSub')}</p>
        <div className="hero-actions">
          <Link to="/register" className="btn btn-primary btn-lg">{t('createFree')}</Link>
          <Link to="/download" className="btn btn-outline btn-lg">{t('downloadApp')}</Link>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-brand"><Database size={18} /> DBCanvas</div>
        <div className="footer-links"><Link to="/pricing">{t('pricing')}</Link><Link to="/download">{t('download')}</Link><a href="https://github.com/xmn-services/dbcanvas">GitHub</a></div>
        <div className="footer-copy">{t('builtBy')}</div>
      </footer>
    </div>
  );
};
export default Home;
