'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { usePreferences } from '@/lib/preferences-context';
import { signOut, sendSignInLinkToEmail } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { GALISANCHO_ADMIN_UID } from '@/components/AppShell';

// ─────────────────────────────────────────────────────────────────────────────
export default function GalisanchoAjustesPage() {
  const { user, loading } = useAuth();
  const isAdmin = !loading && (
    user?.uid === GALISANCHO_ADMIN_UID ||
    user?.email === 'galisancho@gmail.com'
  );

  const { darkMode, setDarkMode, lang, setLang } = usePreferences();

  // Panel de acceso
  const [showAccesos, setShowAccesos] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 pb-20 lg:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900">Ajustes</h1>
          <p className="text-sm text-slate-500">Finca Galisancho · Preferencias</p>
        </div>

        {/* Botón Gestión de Accesos — solo admin */}
        {isAdmin && (
          <button
            id="btn-gestionar-accesos"
            onClick={() => setShowAccesos(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold shadow-sm hover:bg-primary/90 active:scale-95 transition-all"
          >
            <span className="material-icons-round text-base">manage_accounts</span>
            <span>Gestionar accesos</span>
          </button>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">

        {/* Apariencia */}
        <SettingsCard title="Apariencia" icon="palette">
          <SettingRow
            label="Modo oscuro"
            desc="Cambia el tema de la interfaz"
            control={<Toggle value={darkMode} onChange={setDarkMode} />}
          />
          <SettingRow
            label="Idioma"
            desc="Idioma de la plataforma"
            control={
              <select value={lang} onChange={e => setLang(e.target.value as 'es' | 'en')}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            }
          />
        </SettingsCard>

        {/* Cuenta */}
        <SettingsCard title="Cuenta" icon="person">
          <SettingRow label="Finca" desc="" control={<span className="text-sm font-semibold text-slate-700">Galisancho, Sevilla</span>} />
          <SettingRow label="Plan" desc="" control={<span className="text-xs font-bold bg-primary/10 text-primary px-3 py-1 rounded-lg">PROFESSIONAL</span>} />
          <SettingRow label="Almacenamiento S3" desc="Bucket AWS asociado" control={<span className="text-xs font-mono text-slate-500">dlosai-media-prod</span>} />
        </SettingsCard>

        {/* Accesos — solo admin */}
        {isAdmin && (
          <SettingsCard title="Accesos" icon="group">
            <div className="px-5 py-3 text-sm text-slate-500">
              Gestiona quién puede ver el dashboard de Galisancho.
              Haz clic en <strong>Gestionar accesos</strong> en la parte superior para añadir o quitar usuarios.
            </div>
            <AccessSummary />
          </SettingsCard>
        )}

        {/* Sesión */}
        <SettingsCard title="Sesión" icon="security">
          <div className="py-1 px-5 pb-3 pt-2">
            <button
              onClick={() => signOut(auth)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl text-red-600 font-semibold text-sm transition-colors">
              <span className="material-icons-round">logout</span>
              Cerrar sesión
            </button>
          </div>
        </SettingsCard>

        <p className="text-center text-xs text-slate-400 py-4">dlos.ai · Finca Galisancho · v1.0</p>
      </div>

      {/* Modal gestión de accesos */}
      {showAccesos && isAdmin && (
        <AccessModal onClose={() => setShowAccesos(false)} />
      )}
    </div>
  );
}

// ── Resumen de accesos (inline en la card) ────────────────────────────────────
function AccessSummary() {
  const [emails, setEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(collection(db, 'galisancho_access')).then(snap => {
      setEmails(snap.docs.map(d => d.id));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="px-5 py-3 flex items-center gap-2 text-slate-400 text-sm">
        <div className="w-4 h-4 border-2 border-slate-200 border-t-primary rounded-full animate-spin shrink-0" />
        Cargando accesos...
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="px-5 py-3 text-sm text-slate-400 italic">
        No hay usuarios adicionales con acceso.
      </div>
    );
  }

  return (
    <div className="px-5 py-2 space-y-1.5">
      {emails.map(email => (
        <div key={email} className="flex items-center gap-2 text-sm text-slate-700">
          <span className="material-icons-round text-base text-emerald-500">check_circle</span>
          {email}
        </div>
      ))}
    </div>
  );
}

// ── Modal gestión de accesos ──────────────────────────────────────────────────
function AccessModal({ onClose }: { onClose: () => void }) {
  const [emails, setEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'galisancho_access'));
      setEmails(snap.docs.map(d => d.id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (!loading) inputRef.current?.focus(); }, [loading]);

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  const handleAdd = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!validateEmail(email)) { setError('Email no válido'); return; }
    if (emails.includes(email)) { setError('Este email ya tiene acceso'); return; }
    setAdding(true);
    setError('');
    setAddSuccess('');
    try {
      // 1. Guardar en Firestore
      await setDoc(doc(db, 'galisancho_access', email), {
        addedAt: serverTimestamp(),
        addedBy: 'galisancho@gmail.com',
      });
      // 2. Enviar email de invitación (Firebase Email Link)
      const origin = window.location.origin;
      await sendSignInLinkToEmail(auth, email, {
        url: `${origin}/login/invitacion`,
        handleCodeInApp: true,
      });
      setEmails(prev => [...prev, email]);
      setNewEmail('');
      setAddSuccess(`Invitación enviada a ${email}`);
    } catch (e: any) {
      // Si falla solo el email (ej. Email Link no activado), el acceso sí se guardó
      if (e?.code?.includes('auth/')) {
        setEmails(prev => [...prev, email]);
        setNewEmail('');
        setError('Acceso guardado, pero el email falló. Activa "Email Link" en Firebase Console → Authentication → Sign-in methods.');
      } else {
        setError('Error al añadir. Comprueba permisos de Firestore.');
      }
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (email: string) => {
    setRemoving(email);
    try {
      await deleteDoc(doc(db, 'galisancho_access', email));
      setEmails(prev => prev.filter(e => e !== email));
    } catch {
      setError('Error al eliminar acceso.');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="material-icons-round text-primary">manage_accounts</span>
            </div>
            <div>
              <h2 className="font-black text-slate-900 text-base">Gestión de Accesos</h2>
              <p className="text-xs text-slate-400">Dashboard · Finca Galisancho</p>
            </div>
          </div>
          <button
            id="btn-cerrar-accesos"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <span className="material-icons-round text-xl">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">
          {/* Añadir usuario */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">
              Añadir acceso
            </label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                id="input-nuevo-email"
                type="email"
                value={newEmail}
                onChange={e => { setNewEmail(e.target.value); setError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                placeholder="email@ejemplo.com"
                disabled={adding}
                className="flex-1 text-sm border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 transition-all"
              />
              <button
                id="btn-añadir-acceso"
                onClick={handleAdd}
                disabled={adding || !newEmail.trim()}
                className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center gap-1.5 shrink-0"
              >
                {adding ? (
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <span className="material-icons-round text-base">person_add</span>
                )}
                Añadir
              </button>
            </div>
            {error && (
              <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                <span className="material-icons-round text-sm">error_outline</span>
                {error}
              </p>
            )}
            {addSuccess && (
              <p className="mt-1.5 text-xs text-emerald-600 flex items-center gap-1">
                <span className="material-icons-round text-sm">mark_email_read</span>
                {addSuccess}
              </p>
            )}
          </div>

          {/* Lista de usuarios con acceso */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">
              Usuarios con acceso
            </label>

            {/* Admin siempre listado (no eliminable) */}
            <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl mb-2">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="material-icons-round text-primary text-sm">shield</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">galisancho@gmail.com</p>
                  <p className="text-[10px] text-primary font-bold uppercase tracking-wide">Admin · Acceso permanente</p>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm py-3">
                <div className="w-4 h-4 border-2 border-slate-200 border-t-primary rounded-full animate-spin shrink-0" />
                Cargando...
              </div>
            ) : emails.length === 0 ? (
              <div className="text-sm text-slate-400 italic py-2 text-center">
                No hay usuarios adicionales
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {emails.map(email => (
                  <div
                    key={email}
                    className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <span className="text-emerald-600 font-bold text-sm">
                          {email.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 truncate">{email}</p>
                    </div>
                    <button
                      id={`btn-quitar-${email.replace('@', '-at-')}`}
                      onClick={() => handleRemove(email)}
                      disabled={removing === email}
                      title="Quitar acceso"
                      className="ml-2 w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 transition-all shrink-0"
                    >
                      {removing === email ? (
                        <div className="w-4 h-4 border-2 border-slate-200 border-t-red-400 rounded-full animate-spin" />
                      ) : (
                        <span className="material-icons-round text-base">person_remove</span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5">
          <p className="text-[10px] text-slate-400 text-center">
            Los usuarios añadidos podrán ver el dashboard al iniciar sesión con su email.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── UI Components ─────────────────────────────────────────────────────────────
function SettingsCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
        <span className="material-icons-round text-xl text-primary">{icon}</span>
        <h2 className="font-bold text-slate-900">{title}</h2>
      </div>
      <div className="divide-y divide-slate-50">{children}</div>
    </div>
  );
}

function SettingRow({ label, desc, control }: { label: string; desc: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-primary' : 'bg-slate-200'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}
