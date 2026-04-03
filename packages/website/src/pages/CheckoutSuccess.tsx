import React from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useI18n } from '../useI18n';

const CheckoutSuccess: React.FC = () => {
  const { t } = useI18n();
  return (
    <div className="page auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ color: '#10b981', marginBottom: 16 }}><Check size={48} /></div>
        <h2>{t('paymentSuccess')}</h2>
        <p style={{ color: 'var(--muted)', margin: '12px 0 24px' }}>{t('paymentSuccessSub')}</p>
        <Link to="/dashboard" className="btn btn-primary">{t('goToDash')}</Link>
      </div>
    </div>
  );
};
export default CheckoutSuccess;
