import React from 'react';
import { Check } from 'lucide-react';
import { isLoggedIn, createSubscription } from '../api';
import { useI18n } from '../useI18n';

const Pricing: React.FC = () => {
  const { t } = useI18n();

  const plans = [
    { name: t('free'), price: '$0', period: t('forever'), tier: 'free', hl: false, cta: t('freeCta'),
      features: [t('f_tools9'), t('f_1proj'), t('f_10tables'), t('f_schema'), t('f_query'), t('f_graph')] },
    { name: 'Pro', price: '$19', period: t('month'), tier: 'pro', hl: true, cta: t('proCta'),
      features: [t('f_tools18'), t('f_unlimited'), t('f_simulator'), t('f_lineage'), t('f_diff'), t('f_annotations'), t('f_agents'), t('f_export'), t('f_support')] },
    { name: 'Team', price: '$49', period: t('month'), tier: 'team', hl: false, cta: t('teamCta'),
      features: [t('f_allPro'), t('f_5seats'), t('f_sharedAnnot'), t('f_sharedCap'), t('f_teamDash'), t('f_admin')] },
    { name: 'Enterprise', price: t('custom'), period: '', tier: 'enterprise', hl: false, cta: t('entCta'),
      features: [t('f_allTeam'), t('f_unlimitedSeats'), t('f_sso'), t('f_onprem'), t('f_sla'), t('f_dedicated')] },
  ];

  const handleSub = async (tier: string) => {
    if (!isLoggedIn()) { window.location.href = '/register'; return; }
    if (tier === 'free') { window.location.href = '/dashboard'; return; }
    if (tier === 'enterprise') { window.location.href = 'mailto:hello@dbcanvas.dev'; return; }
    try { const { url } = await createSubscription(tier); if (url) window.location.href = url; else alert('PayPal not configured yet.'); }
    catch (e: any) { alert(e.message); }
  };

  return (
    <div className="page">
      <section className="section" style={{ paddingTop: 100 }}>
        <h1 className="section-title" style={{ fontSize: 36 }}>{t('pricingTitle')}</h1>
        <p style={{ textAlign: 'center', color: 'var(--muted)', marginBottom: 40 }}>{t('pricingSub')}</p>
        <div className="pricing-grid">
          {plans.map(p => (
            <div key={p.tier} className={`pricing-card ${p.hl ? 'pricing-highlight' : ''}`}>
              {p.hl && <div className="pricing-badge">{t('mostPopular')}</div>}
              <h3>{p.name}</h3>
              <div className="pricing-price"><span className="price-amount">{p.price}</span><span className="price-period">{p.period}</span></div>
              <ul className="pricing-features">{p.features.map((f, i) => <li key={i}><Check size={14} /> {f}</li>)}</ul>
              <button className={`btn ${p.hl ? 'btn-primary' : 'btn-outline'} btn-full`} onClick={() => handleSub(p.tier)}>{p.cta}</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
export default Pricing;
