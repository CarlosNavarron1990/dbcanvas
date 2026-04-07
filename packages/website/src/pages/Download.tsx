import React from 'react';
import { Monitor, Terminal, Apple, Download as DlIcon } from 'lucide-react';
import { useI18n } from '../useI18n';

const API_URL = 'https://dbcanvasplatform-production.up.railway.app'; // Update to your production URL

const Download: React.FC = () => {
  const { t } = useI18n();
  const platforms = [
    { name: 'macOS (Apple Silicon)', icon: <Apple size={32} />, desc: 'M1/M2/M3/M4', file: 'DBCanvas-arm64.dmg', link: `${API_URL}/api/download/mac-arm` },
    { name: 'macOS (Intel)', icon: <Apple size={32} />, desc: 'Intel Mac', file: 'DBCanvas-x64.dmg', link: `${API_URL}/api/download/mac-intel` },
    { name: t('dlWin'), icon: <Monitor size={32} />, desc: t('dlWinDesc'), file: 'DBCanvas-Setup.exe', link: `${API_URL}/api/download/win` },
    { name: t('dlLinux'), icon: <Terminal size={32} />, desc: t('dlLinuxDesc'), file: 'DBCanvas.AppImage', link: `${API_URL}/api/download/linux` },
  ];

  return (
    <div className="page" style={{ background: 'radial-gradient(circle at top, var(--bg-hover) 0%, var(--bg) 100%)', minHeight: '100vh' }}>
      <section className="section" style={{ paddingTop: 120 }}>
        <div style={{ textAlign: 'center', maxWidth: 800, margin: '0 auto 60px' }}>
          <h1 className="section-title" style={{ fontSize: 48, fontWeight: 800, marginBottom: 20, background: 'linear-gradient(135deg, #fff 0%, #aaa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t('dlTitle')}
          </h1>
          <p style={{ fontSize: 18, color: 'var(--muted)', marginBottom: 40 }}>{t('dlSub')}</p>
        </div>

        <div className="download-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, maxWidth: 1200, margin: '0 auto' }}>
          {platforms.map(p => (
            <a key={p.name} href={p.link} className="download-card" target="_blank" rel="noopener" style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 24,
              padding: 32,
              textDecoration: 'none',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center'
            }}>
              <div style={{ 
                width: 64, height: 64, borderRadius: 16, 
                background: 'linear-gradient(135deg, var(--brand-blue) 0%, var(--brand-purple) 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
                boxShadow: '0 8px 16px rgba(0,0,0,0.2)'
              }}>
                {p.icon}
              </div>
              <h3 style={{ fontSize: 20, marginBottom: 8, color: '#fff' }}>{p.name}</h3>
              <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24 }}>{p.desc}</p>
              
              <div style={{ 
                marginTop: 'auto', 
                padding: '12px 24px', 
                borderRadius: 12, 
                background: 'rgba(255,255,255,0.05)',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--muted)',
                width: '100%',
                justifyContent: 'center'
              }}>
                <DlIcon size={14} /> {p.file}
              </div>
              
              <div className="hover-shine" style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'linear-gradient(45deg, transparent 40%, rgba(255,255,255,0.05) 50%, transparent 60%)',
                transform: 'translateX(-100%)',
                transition: 'transform 0.6s'
              }} />
            </a>
          ))}
        </div>

        <div className="install-block" style={{ marginTop: 80, padding: 40, background: 'rgba(0,0,0,0.2)', borderRadius: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ marginBottom: 16, fontSize: 18, color: '#fff' }}>{t('dlCli')}</h3>
          <pre className="code-block" style={{ padding: 24, background: '#000', borderRadius: 12, border: '1px solid #222', fontSize: 14, lineHeight: 1.6 }}>{`git clone https://github.com/xaman1990/dbcanvas.git
cd dbcanvas && npm install && npm run build
npm run start:mcp`}</pre>
        </div>
      </section>
    </div>
  );
};
export default Download;

