import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Monitor, Check, AlertCircle, Loader2 } from 'lucide-react';
import { isLoggedIn, apiFetch } from '../api';
import { useI18n } from '../useI18n';

const DeviceAuth: React.FC = () => {
  const { t, lang } = useI18n();
  const [searchParams] = useSearchParams();
  const codeFromUrl = searchParams.get('code')?.toUpperCase().replace(/[^A-F0-9]/g, '').substring(0, 6) || '';
  const [code, setCode] = useState(codeFromUrl);
  const [status, setStatus] = useState<'input' | 'authorizing' | 'success' | 'error'>('input');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  if (!isLoggedIn()) {
    const redirect = `/auth/device${codeFromUrl ? `?code=${codeFromUrl}` : ''}`;
    window.location.href = `/login?redirect=${encodeURIComponent(redirect)}`;
    return null;
  }

  const doAuthorize = async (userCode: string) => {
    if (userCode.length < 6) {
      setError(lang === 'es' ? 'Ingresa el código de 6 caracteres' : 'Enter the 6-character code');
      return;
    }
    setStatus('authorizing');
    setError('');

    try {
      await apiFetch('/api/auth/device/authorize', {
        method: 'POST',
        body: JSON.stringify({ user_code: userCode }),
      });
      setStatus('success');
    } catch (err: any) {
      setError(err.message || 'Authorization failed');
      setStatus('error');
    }
  };

  // Auto-authorize if code came from URL (Postman-style: user just sees "Authorizing...")
  useEffect(() => {
    if (codeFromUrl.length === 6) {
      doAuthorize(codeFromUrl);
    }
  }, []);

  return (
    <div className="page auth-page">
      <div className="auth-card" style={{ maxWidth: 440, textAlign: 'center' }}>
        {status === 'authorizing' && (
          <>
            <div style={{ color: 'var(--accent)', marginBottom: 16 }}><Loader2 size={48} className="spin" /></div>
            <h2>{lang === 'es' ? 'Autorizando...' : 'Authorizing...'}</h2>
            <p className="auth-sub">
              {lang === 'es'
                ? 'Conectando tu aplicación de escritorio...'
                : 'Connecting your desktop app...'}
            </p>
          </>
        )}

        {status === 'input' && (
          <>
            <div style={{ color: 'var(--accent)', marginBottom: 16 }}><Monitor size={48} /></div>
            <h2>{lang === 'es' ? 'Autorizar Dispositivo' : 'Authorize Device'}</h2>
            <p className="auth-sub">
              {lang === 'es'
                ? 'Ingresa el código que aparece en tu aplicación de escritorio DBCanvas.'
                : 'Enter the code shown in your DBCanvas desktop application.'}
            </p>

            {error && <div className="auth-error">{error}</div>}

            <input
              type="text"
              placeholder="A3F2B1"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g, '').substring(0, 6))}
              style={{
                textAlign: 'center',
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: 8,
                fontFamily: 'monospace',
                textTransform: 'uppercase',
              }}
              maxLength={6}
              autoFocus
            />

            <button
              className="btn btn-primary btn-full"
              onClick={() => doAuthorize(code)}
              disabled={code.length < 6}
              style={{ marginTop: 8 }}
            >
              {lang === 'es' ? 'Autorizar este Dispositivo' : 'Authorize this Device'}
            </button>

            <p style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)' }}>
              {lang === 'es'
                ? 'El código expira en 10 minutos.'
                : 'The code expires in 10 minutes.'}
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ color: '#10b981', marginBottom: 16 }}><Check size={48} /></div>
            <h2>{lang === 'es' ? '¡Dispositivo Autorizado!' : 'Device Authorized!'}</h2>
            <p className="auth-sub">
              {lang === 'es'
                ? 'Tu aplicación de escritorio ya está conectada. Puedes cerrar esta pestaña.'
                : 'Your desktop app is now connected. You can close this tab.'}
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ color: '#ef4444', marginBottom: 16 }}><AlertCircle size={48} /></div>
            <h2>{lang === 'es' ? 'Error' : 'Error'}</h2>
            <p className="auth-sub">{error}</p>
            <button className="btn btn-outline" onClick={() => { setStatus('input'); setError(''); setCode(''); }}>
              {lang === 'es' ? 'Intentar de nuevo' : 'Try again'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default DeviceAuth;
