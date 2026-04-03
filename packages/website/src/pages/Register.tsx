import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api';
import { useI18n } from '../useI18n';

const Register: React.FC = () => {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { await register(email, name, password); navigate('/dashboard'); }
    catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="page auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>{t('createAccount')}</h2>
        <p className="auth-sub">{t('createSub')}</p>
        {error && <div className="auth-error">{error}</div>}
        <input type="text" placeholder={t('fullName')} value={name} onChange={e => setName(e.target.value)} />
        <input type="email" placeholder={t('email')} value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" placeholder={t('password')} value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
        <button type="submit" className="btn btn-primary btn-full" disabled={loading}>{loading ? t('creating') : t('createFreeAccount')}</button>
        <p className="auth-switch">{t('haveAccount')} <Link to="/login">{t('signInLink')}</Link></p>
      </form>
    </div>
  );
};
export default Register;
