import React from 'react';
import { Monitor, Terminal, Apple, Download as DlIcon } from 'lucide-react';
import { useI18n } from '../useI18n';

const GH = 'https://github.com/xaman1990/dbcanvas/releases/latest';

const Download: React.FC = () => {
  const { t } = useI18n();
  const platforms = [
    { name: t('dlMac'), icon: <Apple size={32} />, desc: t('dlMacDesc'), file: 'DBCanvas.dmg', link: `${GH}/download/DBCanvas.dmg` },
    { name: t('dlWin'), icon: <Monitor size={32} />, desc: t('dlWinDesc'), file: 'DBCanvas-Setup.exe', link: `${GH}/download/DBCanvas-Setup.exe` },
    { name: t('dlLinux'), icon: <Terminal size={32} />, desc: t('dlLinuxDesc'), file: 'DBCanvas.AppImage', link: `${GH}/download/DBCanvas.AppImage` },
  ];

  return (
    <div className="page">
      <section className="section" style={{ paddingTop: 100 }}>
        <h1 className="section-title" style={{ fontSize: 36 }}>{t('dlTitle')}</h1>
        <p style={{ textAlign: 'center', color: 'var(--muted)', marginBottom: 40, maxWidth: 500, margin: '0 auto 40px' }}>{t('dlSub')}</p>
        <div className="download-grid">
          {platforms.map(p => (
            <a key={p.name} href={p.link} className="download-card" target="_blank" rel="noopener">
              <div className="download-icon">{p.icon}</div><h3>{p.name}</h3><p>{p.desc}</p>
              <div className="download-file"><DlIcon size={14} /> {p.file}</div>
            </a>
          ))}
        </div>
        <div className="install-block" style={{ marginTop: 60 }}>
          <h3 style={{ marginBottom: 12 }}>{t('dlCli')}</h3>
          <pre className="code-block">{`git clone https://github.com/xaman1990/dbcanvas.git
cd dbcanvas && npm install && npm run build
npm run start:mcp`}</pre>
        </div>
      </section>
    </div>
  );
};
export default Download;
