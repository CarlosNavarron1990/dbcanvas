import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { User, CreditCard, Key, BarChart3, LogOut, Copy, Check, Shield, Monitor, AlertCircle } from 'lucide-react';
import { isLoggedIn, logout, getProfile, updateProfile, changePassword, getBilling, getLicense, getUsageStats, createSubscription } from '../api';
import { useI18n } from '../useI18n';

type Tab = 'profile' | 'billing' | 'license' | 'usage';

const Account: React.FC = () => {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'profile');
  const [profile, setProfile] = useState<any>(null);
  const [billing, setBilling] = useState<any>(null);
  const [license, setLicense] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) { navigate('/login'); return; }
    loadData();
  }, []);

  useEffect(() => { loadData(); }, [tab]);

  const loadData = async () => {
    try {
      if (tab === 'profile' && !profile) { const p = await getProfile(); setProfile(p); setEditName(p.name || ''); }
      if (tab === 'billing' && !billing) setBilling(await getBilling());
      if (tab === 'license' && !license) setLicense(await getLicense());
      if (tab === 'usage' && !usage) setUsage(await getUsageStats());
    } catch {}
  };

  const handleSaveProfile = async () => {
    setSaving(true); setMsg('');
    try { await updateProfile({ name: editName }); setMsg('Saved!'); setProfile({ ...profile, name: editName }); }
    catch (e: any) { setMsg(e.message); }
    finally { setSaving(false); setTimeout(() => setMsg(''), 3000); }
  };

  const handleChangePassword = async () => {
    if (pwNew.length < 6) { setMsg('Password must be at least 6 characters'); return; }
    setSaving(true); setMsg('');
    try { await changePassword(pwCurrent, pwNew); setMsg('Password changed!'); setPwCurrent(''); setPwNew(''); }
    catch (e: any) { setMsg(e.message); }
    finally { setSaving(false); setTimeout(() => setMsg(''), 3000); }
  };

  const copyKey = () => {
    const key = license?.license?.license_key || billing?.license?.license_key;
    if (key) { navigator.clipboard.writeText(key); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const handleUpgrade = async (tier: string) => {
    try { const { url } = await createSubscription(tier); if (url) window.location.href = url; }
    catch (e: any) { alert(e.message); }
  };

  const tierLabel = (l: any) => {
    if (!l) return 'Free';
    if (l.is_trial) return `${l.tier?.toUpperCase()} Trial`;
    return l.tier?.toUpperCase();
  };

  return (
    <div className="account-layout">
      <aside className="account-sidebar">
        <div className="account-brand"><Shield size={20} /> DBCanvas</div>
        <nav className="account-nav">
          <div className={`account-nav-item ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>
            <User size={16} /> {lang === 'es' ? 'Perfil' : 'Profile'}
          </div>
          <div className={`account-nav-item ${tab === 'billing' ? 'active' : ''}`} onClick={() => setTab('billing')}>
            <CreditCard size={16} /> {lang === 'es' ? 'Facturación' : 'Billing'}
          </div>
          <div className={`account-nav-item ${tab === 'license' ? 'active' : ''}`} onClick={() => setTab('license')}>
            <Key size={16} /> {lang === 'es' ? 'Licencia' : 'License'}
          </div>
          <div className={`account-nav-item ${tab === 'usage' ? 'active' : ''}`} onClick={() => setTab('usage')}>
            <BarChart3 size={16} /> {lang === 'es' ? 'Uso' : 'Usage'}
          </div>
        </nav>
        <div className="account-nav-bottom">
          <Link to="/" className="account-nav-item"><span>&larr;</span> {lang === 'es' ? 'Volver al sitio' : 'Back to site'}</Link>
          <div className="account-nav-item" onClick={logout}><LogOut size={16} /> {lang === 'es' ? 'Cerrar sesión' : 'Log out'}</div>
        </div>
      </aside>

      <main className="account-main">
        {/* PROFILE */}
        {tab === 'profile' && profile && (
          <div className="account-section">
            <h1>{lang === 'es' ? 'Perfil' : 'Profile'}</h1>
            {msg && <div className="account-msg">{msg}</div>}
            <div className="account-card">
              <label>{lang === 'es' ? 'Nombre' : 'Name'}</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} />
              <label>Email</label>
              <input type="email" value={profile.email} disabled />
              <button className="btn btn-primary" onClick={handleSaveProfile} disabled={saving}>
                {saving ? 'Saving...' : (lang === 'es' ? 'Guardar' : 'Save')}
              </button>
            </div>
            <div className="account-card">
              <h3>{lang === 'es' ? 'Cambiar contraseña' : 'Change password'}</h3>
              <label>{lang === 'es' ? 'Contraseña actual' : 'Current password'}</label>
              <input type="password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} />
              <label>{lang === 'es' ? 'Nueva contraseña' : 'New password'}</label>
              <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} />
              <button className="btn btn-outline" onClick={handleChangePassword} disabled={saving}>
                {lang === 'es' ? 'Cambiar' : 'Change Password'}
              </button>
            </div>
          </div>
        )}

        {/* BILLING */}
        {tab === 'billing' && billing && (
          <div className="account-section">
            <h1>{lang === 'es' ? 'Facturación' : 'Billing'}</h1>
            <div className="account-card">
              <h3>{lang === 'es' ? 'Plan actual' : 'Current Plan'}</h3>
              <div className="plan-display">
                <span className={`tier-badge tier-${billing.license?.tier || 'free'}`}>
                  {tierLabel(billing.license)}
                </span>
                {billing.license?.days_remaining != null && (
                  <span className="days-badge">
                    {billing.license.days_remaining}d {lang === 'es' ? 'restantes' : 'remaining'}
                  </span>
                )}
              </div>
              {(!billing.license || billing.license.tier === 'free' || billing.license.is_trial) && (
                <div className="upgrade-block">
                  <p>{lang === 'es' ? 'Actualiza para acceder a todas las herramientas.' : 'Upgrade to access all tools.'}</p>
                  <button className="btn btn-primary" onClick={() => handleUpgrade('pro')}>
                    {lang === 'es' ? 'Actualizar a Pro — $19/mes' : 'Upgrade to Pro — $19/mo'}
                  </button>
                </div>
              )}
            </div>
            {billing.payments.length > 0 && (
              <div className="account-card">
                <h3>{lang === 'es' ? 'Historial de pagos' : 'Payment History'}</h3>
                <table className="account-table">
                  <thead><tr><th>{lang === 'es' ? 'Monto' : 'Amount'}</th><th>Plan</th><th>Status</th><th>{lang === 'es' ? 'Fecha' : 'Date'}</th></tr></thead>
                  <tbody>
                    {billing.payments.map((p: any) => (
                      <tr key={p.id}>
                        <td>${(p.amount / 100).toFixed(2)}</td>
                        <td>{p.tier?.toUpperCase()}</td>
                        <td>{p.status}</td>
                        <td>{p.created_at?.substring(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* LICENSE */}
        {tab === 'license' && license && (
          <div className="account-section">
            <h1>{lang === 'es' ? 'Licencia' : 'License'}</h1>
            <div className="account-card">
              <h3>License Key</h3>
              {license.license ? (
                <>
                  <div className="license-row">
                    <code className="license-display">{license.license.license_key}</code>
                    <button className="btn btn-sm" onClick={copyKey}>
                      {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                    </button>
                  </div>
                  <div className="license-meta">
                    <span>Plan: <strong>{tierLabel(license.license)}</strong></span>
                    <span>Status: <strong>{license.license.status}</strong></span>
                    {license.license.days_remaining != null && (
                      <span>{lang === 'es' ? 'Expira en' : 'Expires in'}: <strong>{license.license.days_remaining} {lang === 'es' ? 'días' : 'days'}</strong></span>
                    )}
                  </div>
                </>
              ) : (
                <p className="no-license">{lang === 'es' ? 'Sin licencia activa' : 'No active license'}</p>
              )}
            </div>

            <div className="account-card">
              <h3>{lang === 'es' ? 'Configuración MCP' : 'MCP Configuration'}</h3>
              <pre className="config-block">{`{
  "mcpServers": {
    "dbcanvas": {
      "command": "node",
      "args": ["path/to/dbcanvas/packages/mcp-server/build/index.js"],
      "env": {
        "DBCANVAS_LICENSE_KEY": "${license.license?.license_key || 'YOUR_KEY'}"
      }
    }
  }
}`}</pre>
            </div>

            {license.activations?.length > 0 && (
              <div className="account-card">
                <h3><Monitor size={16} /> {lang === 'es' ? 'Dispositivos activos' : 'Active Devices'} ({license.activations.length})</h3>
                <table className="account-table">
                  <thead><tr><th>Machine</th><th>Hostname</th><th>{lang === 'es' ? 'Último uso' : 'Last Seen'}</th></tr></thead>
                  <tbody>
                    {license.activations.map((a: any, i: number) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{a.machine_id}</td>
                        <td>{a.hostname || '-'}</td>
                        <td>{a.last_seen?.substring(0, 16) || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* USAGE */}
        {tab === 'usage' && usage && (
          <div className="account-section">
            <h1>{lang === 'es' ? 'Uso' : 'Usage'}</h1>
            <div className="account-card">
              <div className="usage-stat">
                <span className="usage-number">{usage.totalCalls}</span>
                <span className="usage-label">{lang === 'es' ? 'Llamadas totales' : 'Total API Calls'}</span>
              </div>
            </div>
            {usage.recentTools?.length > 0 && (
              <div className="account-card">
                <h3>{lang === 'es' ? 'Herramientas usadas (30 días)' : 'Tools Used (30 days)'}</h3>
                <table className="account-table">
                  <thead><tr><th>Tool</th><th>{lang === 'es' ? 'Llamadas' : 'Calls'}</th></tr></thead>
                  <tbody>
                    {usage.recentTools.map((t: any) => (
                      <tr key={t.tool_name}><td>{t.tool_name}</td><td>{t.count}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {((tab === 'profile' && !profile) || (tab === 'billing' && !billing) ||
          (tab === 'license' && !license) || (tab === 'usage' && !usage)) && (
          <div className="account-section"><p>Loading...</p></div>
        )}
      </main>
    </div>
  );
};

export default Account;
