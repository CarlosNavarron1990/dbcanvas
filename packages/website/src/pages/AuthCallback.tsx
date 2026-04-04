import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const AuthCallback: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    const provider = params.get('provider');

    if (token) {
      localStorage.setItem('dbc_token', token);
      navigate('/dashboard');
    } else {
      navigate('/login?error=oauth_failed');
    }
  }, []);

  return (
    <div className="page auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <Loader2 size={32} className="spin" style={{ color: 'var(--accent)' }} />
        <p style={{ marginTop: 16, color: 'var(--muted)' }}>Authenticating...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
