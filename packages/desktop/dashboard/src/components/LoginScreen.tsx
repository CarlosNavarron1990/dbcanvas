import React, { useState, useEffect, useRef } from 'react';
import { Database, Loader2, Check, AlertCircle } from 'lucide-react';

interface Session {
  token: string;
  user: { id: string; email: string; name: string };
  license: { key: string; tier: string; expiresAt?: string } | null;
}

interface LoginScreenProps {
  onLogin: (session: Session) => void;
  onSkip: () => void;
}

const isElectron = typeof window !== 'undefined' && !!(window as any).dbcanvas?.startLogin;

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onSkip }) => {
  const [step, setStep] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [userCode, setUserCode] = useState('');
  const [error, setError] = useState('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    if (!isElectron) return;
    (window as any).dbcanvas.getSession().then((session: Session | null) => {
      if (session?.token) {
        onLogin(session);
      }
    });
  }, []);

  const startLogin = async () => {
    if (!isElectron) return;
    setStep('waiting');
    setError('');

    try {
      const { deviceCode, userCode: code } = await (window as any).dbcanvas.startLogin();
      setUserCode(code);

      // Start polling every 3 seconds
      pollingRef.current = setInterval(async () => {
        try {
          const result = await (window as any).dbcanvas.pollAuth(deviceCode);
          if (result?.error === 'expired') {
            clearInterval(pollingRef.current!);
            setStep('error');
            setError('Code expired. Try again.');
            return;
          }
          if (result?.token) {
            clearInterval(pollingRef.current!);
            setStep('success');
            setTimeout(() => onLogin(result), 1500);
          }
        } catch {}
      }, 3000);
    } catch (err: any) {
      setStep('error');
      setError(err.message || 'Failed to start login');
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo"><Database size={48} /></div>
        <h1>DBCanvas</h1>
        <p className="login-sub">SQL Database Inspector for AI IDEs</p>

        {step === 'idle' && (
          <>
            {isElectron ? (
              <>
                <button className="btn-primary-capture login-btn" onClick={startLogin}>
                  Login with DBCanvas Account
                </button>
                <button className="login-skip" onClick={onSkip}>
                  Continue without account (Free tier)
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                  Account login is available in the desktop app.
                </p>
                <button className="btn-primary-capture login-btn" onClick={onSkip}>
                  Continue to Dashboard
                </button>
              </>
            )}
          </>
        )}

        {step === 'waiting' && (
          <div className="login-waiting">
            <Loader2 size={24} className="spin" />
            <p>A browser window has opened. Log in and enter this code:</p>
            <div className="login-code">{userCode}</div>
            <p className="login-hint">Waiting for authorization...</p>
          </div>
        )}

        {step === 'success' && (
          <div className="login-success">
            <Check size={40} style={{ color: '#10b981' }} />
            <p>Authorized! Loading your workspace...</p>
          </div>
        )}

        {step === 'error' && (
          <div className="login-error">
            <AlertCircle size={40} style={{ color: '#ef4444' }} />
            <p>{error}</p>
            <button className="btn-primary-capture login-btn" onClick={startLogin}>Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginScreen;
