'use client';

import { createContext, useContext, useEffect, useState } from 'react';

// ── Translations ──────────────────────────────────────────────────────────────
const translations: Record<string, Record<string, string>> = {
  es: {
    'nav.dashboard':   'Dashboard',
    'nav.missions':    'Misiones',
    'nav.map':         'Mapa',
    'nav.settings':    'Ajustes',
    'mission.animals': 'Animales',
    'mission.persons': 'Personas',
    'mission.vehicles':'Vehículos',
    'mission.media':   'Media',
    'mission.summary': 'Resumen',
    'mission.data':    'Datos',
    'mission.analysis':'Análisis',
    'settings.dark':   'Modo oscuro',
    'settings.lang':   'Idioma',
    'settings.account':'Cuenta',
    'settings.access': 'Accesos',
    'settings.logout': 'Cerrar sesión',
  },
  en: {
    'nav.dashboard':   'Dashboard',
    'nav.missions':    'Missions',
    'nav.map':         'Map',
    'nav.settings':    'Settings',
    'mission.animals': 'Animals',
    'mission.persons': 'Persons',
    'mission.vehicles':'Vehicles',
    'mission.media':   'Media',
    'mission.summary': 'Summary',
    'mission.data':    'Data',
    'mission.analysis':'Analysis',
    'settings.dark':   'Dark mode',
    'settings.lang':   'Language',
    'settings.account':'Account',
    'settings.access': 'Access',
    'settings.logout': 'Sign out',
  },
};

// ── Context ───────────────────────────────────────────────────────────────────
interface PreferencesCtx {
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  lang: 'es' | 'en';
  setLang: (v: 'es' | 'en') => void;
  t: (key: string) => string;
}

const Ctx = createContext<PreferencesCtx>({
  darkMode: false,
  setDarkMode: () => {},
  lang: 'es',
  setLang: () => {},
  t: (k) => k,
});

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [darkMode, _setDarkMode] = useState(false);
  const [lang, _setLang]         = useState<'es' | 'en'>('es');
  const [mounted, setMounted]    = useState(false);

  // Read from localStorage on mount
  useEffect(() => {
    const savedDark = localStorage.getItem('dlos_dark') === '1';
    const savedLang = (localStorage.getItem('dlos_lang') as 'es' | 'en') || 'es';
    _setDarkMode(savedDark);
    _setLang(savedLang);
    if (savedDark) document.documentElement.classList.add('dark');
    else           document.documentElement.classList.remove('dark');
    document.documentElement.lang = savedLang;
    setMounted(true);
  }, []);

  const setDarkMode = (v: boolean) => {
    _setDarkMode(v);
    localStorage.setItem('dlos_dark', v ? '1' : '0');
    if (v) document.documentElement.classList.add('dark');
    else   document.documentElement.classList.remove('dark');
  };

  const setLang = (v: 'es' | 'en') => {
    _setLang(v);
    localStorage.setItem('dlos_lang', v);
    document.documentElement.lang = v;
  };

  const t = (key: string) => translations[lang]?.[key] ?? translations['es']?.[key] ?? key;

  if (!mounted) return null; // avoid SSR mismatch

  return (
    <Ctx.Provider value={{ darkMode, setDarkMode, lang, setLang, t }}>
      {children}
    </Ctx.Provider>
  );
}

export const usePreferences = () => useContext(Ctx);
