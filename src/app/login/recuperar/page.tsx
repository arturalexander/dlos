'use client';

import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Link from 'next/link';
import AuthLayout from '@/components/login/AuthLayout';
import AntoniaWidget from '@/components/login/AntoniaWidget';

const MESSAGES = [
  'No pasa nada, te ayudo a recuperar el acceso',
  'Te mando un enlace al correo y listo',
  'En menos de un minuto estarás de vuelta',
];

export default function RecuperarPage() {
  const [email, setEmail]     = useState('');
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setSent(true);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        setSent(true);
      } else {
        setError('No se pudo enviar el correo. Inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={<>Recupera<br />tu acceso.</>}
      subtitle="Te enviamos un enlace para restablecer tu contraseña en segundos."
      antoniaDesktop={<AntoniaWidget messages={MESSAGES} />}
      antoniaMobile={<AntoniaWidget messages={MESSAGES} compact />}
    >
      {!sent ? (
        <>
          <div className="mb-6">
            <h2 className="text-[1.15rem] font-semibold text-slate-900">Recuperar contraseña</h2>
            <p className="mt-0.5 text-sm text-slate-500 font-light">Introduce tu correo y te enviamos un enlace</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-light text-slate-700">Correo electrónico</label>
              <div className="relative">
                <span className="material-icons-round absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">mail</span>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" required autoComplete="email" autoFocus
                  className="w-full h-11 rounded-xl border border-slate-200 bg-white/60 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-all" />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 text-red-600 text-sm p-3 rounded-xl border border-red-200">
                <span className="material-icons-round text-base shrink-0">error_outline</span>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="h-11 w-full rounded-xl bg-primary text-sm font-medium text-white hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm shadow-primary/30">
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Enviando...</>
                : <>Enviar enlace <span className="material-icons-round text-[16px]">send</span></>}
            </button>
          </form>
        </>
      ) : (
        <div className="text-center py-2">
          <div className="w-14 h-14 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="material-icons-round text-3xl text-emerald-600">mark_email_read</span>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Correo enviado</h2>
          <p className="text-sm font-light text-slate-500 mb-4">
            Si <strong className="font-medium">{email}</strong> tiene una cuenta, recibirás el enlace en breve. Revisa también spam.
          </p>
          <p className="text-xs text-slate-400">El enlace expira en 1 hora.</p>
        </div>
      )}

      <div className="mt-5 flex justify-center">
        <Link href="/login" className="flex items-center gap-1 text-sm font-light text-primary hover:opacity-75 transition-opacity">
          <span className="material-icons-round text-[16px]">arrow_back</span>
          Volver al inicio de sesión
        </Link>
      </div>
    </AuthLayout>
  );
}
