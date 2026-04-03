import React, { useState, useEffect } from 'react';
import { Database, Check, ArrowRight, Zap } from 'lucide-react';
import { useStore } from '../store/useStore';

type Step = 'welcome' | 'connect' | 'ides' | 'done';

const Onboarding: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const { ides, loadIdes, registerAllIdes, runSync } = useStore();
  const [step, setStep] = useState<Step>('welcome');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (step === 'ides') loadIdes();
  }, [step]);

  const handleSync = async () => {
    setSyncing(true);
    try { await runSync(); } catch {}
    setSyncing(false);
    setStep('ides');
  };

  const handleFinish = () => {
    localStorage.setItem('dbcanvas-onboarded', 'true');
    onComplete();
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        {step === 'welcome' && (
          <>
            <div className="onboarding-icon"><Database size={48} /></div>
            <h1>Welcome to DBCanvas</h1>
            <p>Your SQL database inspector for AI-powered IDEs. DBCanvas lets Claude, Cursor, Codex, and other tools explore your database structure.</p>
            <button className="btn-primary-capture" onClick={() => setStep('connect')}>
              Get Started <ArrowRight size={14} />
            </button>
          </>
        )}

        {step === 'connect' && (
          <>
            <div className="onboarding-icon"><Zap size={48} /></div>
            <h1>Database Connection</h1>
            <p>DBCanvas automatically discovers your database connection from <code>.env</code>, <code>web.config</code>, or <code>appsettings.json</code> files in your project.</p>
            <p className="text-muted">Make sure your project has a <code>DATABASE_URL</code> or equivalent connection string configured.</p>
            <div className="onboarding-actions">
              <button className="btn-primary-capture" onClick={handleSync} disabled={syncing}>
                {syncing ? 'Syncing...' : 'Sync Now'} <ArrowRight size={14} />
              </button>
              <button className="btn-sm btn-secondary" onClick={() => setStep('ides')}>
                Skip for now
              </button>
            </div>
          </>
        )}

        {step === 'ides' && (
          <>
            <div className="onboarding-icon"><Check size={48} /></div>
            <h1>Register with AI IDEs</h1>
            <p>DBCanvas can automatically register as an MCP server in your installed IDEs.</p>
            <div className="ide-list" style={{ marginTop: 16 }}>
              {ides.filter(ide => ide.exists).map(ide => (
                <div key={ide.configPath} className="ide-row">
                  <div className="ide-info">
                    <div className="ide-name"><Database size={14} /><span>{ide.name}</span></div>
                  </div>
                  <div className="ide-status">
                    {ide.registered ? <span className="badge-active">Active</span> : <span className="badge-muted">Not registered</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="onboarding-actions">
              <button className="btn-primary-capture" onClick={async () => { await registerAllIdes(); setStep('done'); }}>
                Register All <ArrowRight size={14} />
              </button>
              <button className="btn-sm btn-secondary" onClick={() => setStep('done')}>Skip</button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <div className="onboarding-icon"><Check size={48} style={{ color: '#10b981' }} /></div>
            <h1>You're All Set!</h1>
            <p>DBCanvas is ready. Your AI IDEs can now inspect stored procedures, tables, and relationships in your database.</p>
            <p className="text-muted">Use <kbd>Cmd+K</kbd> to search objects anytime.</p>
            <button className="btn-primary-capture" onClick={handleFinish}>
              Open DBCanvas
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
