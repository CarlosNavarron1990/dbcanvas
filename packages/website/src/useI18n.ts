import { useState, useEffect, useCallback } from 'react';
import { t, getLang, setLang, toggleLang } from './i18n';

export function useI18n() {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const handler = () => forceUpdate(n => n + 1);
    window.addEventListener('langchange', handler);
    return () => window.removeEventListener('langchange', handler);
  }, []);

  return { t, lang: getLang(), setLang, toggleLang };
}
