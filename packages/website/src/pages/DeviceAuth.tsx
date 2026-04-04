import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Check, AlertCircle } from 'lucide-react';
import { isLoggedIn, apiFetch } from '../api';
import { useI18n } from '../useI18n';

const DeviceAuth: React.FC = () => {
  const { t, lang } = useI18n();
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'input' | 'success' | 'error'>('input');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  if (!isLoggedIn()) {
    // Redirect to login, then come back
    window.location.href = `/login?redirect=/auth/device`;
    return null;
  }

  const handleAuthorize = async () => {
    if (code.length < 6) { setError(lang === 'es' ? 'Ingresa el código de 6 caracteres' : 'Enter the 6-character code'); return; }
    setLoading(true);
    setError('');

    try {
      await apiFetch('/api/auth/device/authorize', {
        method: 'POST',
        body: JSON.stringify({ user_code: code.toUpperCase() }),
      });
      setStatus('success');
    } catch (err: any) {
      setError(err.message || 'Authorization failed');
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page auth-page">
      <div className="auth-card" style={{ maxWidth: 440, textAlign: 'center' }}>
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
              onClick={handleAuthorize}
              disabled={loading || code.length < 6}
              style={{ marginTop: 8 }}
            >
              {loading
                ? (lang === 'es' ? 'Autorizando...' : 'Authorizing...')
                : (lang === 'es' ? 'Autorizar este Dispositivo' : 'Authorize this Device')}
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
