'use client';

import { useEffect, useState } from 'react';
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

export default function InvitacionPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'ask_email' | 'signing' | 'done' | 'error'>('checking');
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) {
      setStatus('error');
      setErrorMsg('El enlace no es válido o ha caducado.');
      return;
    }
    // El invitado siempre viene de otro dispositivo — pedir email siempre
    // (por seguridad Firebase requiere confirmarlo de todas formas)
    setStatus('ask_email');
  }, []);

  async function completeSignIn(emailToUse: string) {
    setStatus('signing');
    try {
      await signInWithEmailLink(auth, emailToUse, window.location.href);
      setStatus('done');
      setTimeout(() => router.replace('/galisancho/mapa'), 1500);
    } catch (e: any) {
      setStatus('error');
      setErrorMsg(
        e?.code === 'auth/invalid-action-code'
          ? 'El enlace ya fue usado o ha caducado. Pide al administrador un nuevo acceso.'
          : 'Error al iniciar sesión. Inténtalo de nuevo.'
      );
    }
  }

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 w-full max-w-sm p-8 text-center">

        {/* Logo */}
        <div className="w-14 h-14 mx-auto mb-5">
          <img src="/logo-icon.svg" alt="dlos.ai" className="w-full h-full" />
        </div>

        <h1 className="text-xl font-black text-slate-900 mb-1">dlos<span className="text-primary">.ai</span></h1>
        <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-6">Finca Galisancho</p>

        {/* checking */}
        {status === 'checking' && (
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-primary rounded-full animate-spin" />
            <p className="text-sm">Verificando enlace...</p>
          </div>
        )}

        {/* pedir email */}
        {status === 'ask_email' && (
          <div className="space-y-4 text-left">
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-blue-700 mb-0.5">Has recibido una invitación</p>
              <p className="text-xs text-blue-600">
                Confirma el email con el que te invitaron para entrar al dashboard.
              </p>
            </div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && completeSignIn(email.trim())}
              placeholder="tu@email.com"
              className="w-full text-sm border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              autoFocus
            />
            <button
              onClick={() => completeSignIn(email.trim())}
              disabled={!email.includes('@')}
              className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              Acceder al dashboard
            </button>
          </div>
        )}

        {/* firmando */}
        {status === 'signing' && (
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-primary rounded-full animate-spin" />
            <p className="text-sm">Iniciando sesión...</p>
          </div>
        )}

        {/* éxito */}
        {status === 'done' && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
              <span className="material-icons-round text-emerald-600 text-2xl">check_circle</span>
            </div>
            <p className="text-sm font-semibold text-slate-700">¡Acceso concedido!</p>
            <p className="text-xs text-slate-400">Redirigiendo al dashboard...</p>
          </div>
        )}

        {/* error */}
        {status === 'error' && (
          <div className="space-y-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <span className="material-icons-round text-red-500 text-2xl">error</span>
            </div>
            <p className="text-sm text-red-600 font-semibold">{errorMsg}</p>
            <button
              onClick={() => router.replace('/login')}
              className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all"
            >
              Ir al login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
