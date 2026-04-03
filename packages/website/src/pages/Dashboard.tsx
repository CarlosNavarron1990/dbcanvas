import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, ExternalLink, Key, Shield, Zap } from 'lucide-react';
import { isLoggedIn, getMyLicense, createSubscription, cancelSubscription } from '../api';
import { useI18n } from '../useI18n';

const Dashboard: React.FC = () => {
  const { t } = useI18n();
  const [license, setLicense] = useState<any>(null);
  const [tools, setTools] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn()) { navigate('/login'); return; }
    getMyLicense().then(d => { setLicense(d.license); setTools(d.tools || []); setLoading(false); }).catch(() => navigate('/login'));
  }, []);

  const copyKey = () => { if (license?.license_key) { navigator.clipboard.writeText(license.license_key); setCopied(true); setTimeout(() => setCopied(false), 2000); } };
  const handleUpgrade = async (tier: string) => { try { const { url } = await createSubscription(tier); if (url) window.location.href = url; } catch (e: any) { alert(e.message); } };
  const handleCancel = async () => { if (confirm('Cancel subscription? You will be downgraded to Free.')) { try { await cancelSubscription(); window.location.reload(); } catch (e: any) { alert(e.message); } } };

  if (loading) return <div className="page auth-page"><p>Loading...</p></div>;
  const tier = license?.tier || 'free';

  return (
    <div className="page">
      <section className="section" style={{ paddingTop: 100, maxWidth: 800, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>{t('yourAccount')}</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 30 }}>{t('yourAccountSub')}</p>

        <div className="dash-card">
          <div className="dash-card-header"><Key size={18} /> <span>{t('licenseKey')}</span><span className={`tier-badge tier-${tier}`}>{tier.toUpperCase()}</span></div>
          <div className="license-key-row">
            <code className="license-key">{license?.license_key || t('noLicense')}</code>
            <button className="btn btn-sm" onClick={copyKey}>{copied ? <><Check size={14} /> {t('copied')}</> : <><Copy size={14} /> {t('copy')}</>}</button>
          </div>
          <p className="dash-hint">{t('addHint')} <code>DBCANVAS_LICENSE_KEY={license?.license_key}</code></p>
        </div>

        <div className="dash-card">
          <div className="dash-card-header"><Shield size={18} /> <span>{t('mcpConfig')}</span></div>
          <pre className="code-block">{`{
  "mcpServers": {
    "dbcanvas": {
      "command": "node",
      "args": ["path/to/dbcanvas/packages/mcp-server/build/index.js"],
      "env": {
        "DBCANVAS_LICENSE_KEY": "${license?.license_key || 'YOUR_KEY'}",
        "DBCANVAS_PLATFORM_URL": "http://127.0.0.1:4000"
      }
    }
  }
}`}</pre>
        </div>

        <div className="dash-card">
          <div className="dash-card-header"><Zap size={18} /> <span>{t('availableTools')} ({tools.length})</span></div>
          <div className="tools-grid">{tools.map(tl => <span key={tl} className="tool-chip">{tl}</span>)}</div>
          {tier === 'free' && (
            <div className="upgrade-cta"><p>{t('upgradeMsg')}</p><button className="btn btn-primary" onClick={() => handleUpgrade('pro')}>{t('upgradePro')}</button></div>
          )}
        </div>

        {tier !== 'free' && license?.stripe_subscription_id && (
          <div className="dash-card">
            <div className="dash-card-header"><ExternalLink size={18} /> <span>{t('subscription')}</span></div>
            <button className="btn btn-outline" onClick={handleCancel}>Cancel Subscription</button>
          </div>
        )}
      </section>
    </div>
  );
};
export default Dashboard;
