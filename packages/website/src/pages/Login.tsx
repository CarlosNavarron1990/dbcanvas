import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api';
import { useI18n } from '../useI18n';

const Login: React.FC = () => {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { await login(email, password); navigate('/dashboard'); }
    catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="page auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>{t('welcomeBack')}</h2>
        <p className="auth-sub">{t('signInSub')}</p>
        {error && <div className="auth-error">{error}</div>}
        <input type="email" placeholder={t('email')} value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
        <button type="submit" className="btn btn-primary btn-full" disabled={loading}>{loading ? t('signingIn') : t('signIn')}</button>
        <p className="auth-switch">{t('noAccount')} <Link to="/register">{t('createOne')}</Link></p>
      </form>
    </div>
  );
};
export default Login;
