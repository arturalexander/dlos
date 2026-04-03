'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/login/AuthLayout';
import AntoniaWidget from '@/components/login/AntoniaWidget';

const MESSAGES = [
  'Tengo tu informe listo, se han detectado personas en esta zona',
  'Esta mañana el dron ha volado 2 veces sobre la finca',
  'Se detectaron 47 animales en el cercado norte',
  'Riesgo de incendio BAJO hoy, temperatura 18°C y viento suave',
  'Todo tranquilo en la finca, sin anomalías detectadas',
  'Hay un animal separado del grupo en el sector sur',
];

export default function LoginPage() {
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/');
    } catch {
      setError('Correo o contraseña incorrectos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={<>Infraestructura<br />que piensa.</>}
      subtitle="Monitorización inteligente, mantenimiento predictivo y control asistido para entornos de campo."
      antoniaDesktop={<AntoniaWidget messages={MESSAGES} />}
      antoniaMobile={<AntoniaWidget messages={MESSAGES} compact />}
    >
      <div className="mb-6">
        <h2 className="text-[1.15rem] font-semibold text-slate-900">Iniciar sesión</h2>
        <p className="mt-0.5 text-sm text-slate-500 font-light">Accede a tu panel de control</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-light text-slate-700">Correo electrónico</label>
          <div className="relative">
            <span className="material-icons-round absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">mail</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" required autoComplete="email"
              className="w-full h-11 rounded-xl border border-slate-200 bg-white/60 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-all" />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-light text-slate-700">Contraseña</label>
            <Link href="/login/recuperar" className="text-xs text-primary hover:opacity-75 transition-opacity">¿Olvidaste tu contraseña?</Link>
          </div>
          <div className="relative">
            <span className="material-icons-round absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">lock</span>
            <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password"
              className="w-full h-11 rounded-xl border border-slate-200 bg-white/60 pl-10 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-all" />
            <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors" tabIndex={-1}>
              <span className="material-icons-round text-[18px]">{showPwd ? 'visibility_off' : 'visibility'}</span>
            </button>
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
            ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Entrando...</>
            : <>Entrar <span className="material-icons-round text-[16px]">arrow_forward</span></>}
        </button>
      </form>
    </AuthLayout>
  );
}
