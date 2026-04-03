'use client';

import { useAuth } from '@/lib/auth-context';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, ReactNode } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import Link from 'next/link';
import ChatIA from '@/components/galisancho/ChatIA';

// ── UIDs por tipo de acceso ───────────────────────────────────────────────────
const MAP_ONLY_USERS = [
  'bSo5qgCUNYgCOcz4RyqCQFek4k22',  // Blasson — solo /mapa
  'E6baCtzpLoc4x8Xk9cmP9zPsHnC3',  // Blasson Advanced
];

// UID admin del dashboard Galisancho (hardcoded, siempre tiene acceso)
export const GALISANCHO_ADMIN_UID = 'lxOXBSJziCdAnpkf42qWqihAc5N2';

// ── Navegaciones ──────────────────────────────────────────────────────────────
const FULL_NAV = [
  { href: '/',         icon: 'dashboard',      label: 'Dashboard'  },
  { href: '/misiones', icon: 'flight_takeoff', label: 'Misiones'   },
  { href: '/agentes',  icon: 'smart_toy',      label: 'Agentes IA' },
  { href: '#',         icon: 'photo_library',  label: 'Librería'   },
  { href: '/mapa',     icon: 'map',            label: 'Mapa'       },
  { href: '#',         icon: 'settings',       label: 'Ajustes'    },
];

const GALISANCHO_NAV = [
  { href: '/galisancho/mapa',       icon: 'satellite_alt',  label: 'Mapa'      },
  { href: '/libreria',              icon: 'photo_library',  label: 'Librería'  },
  { href: '/galisancho/misiones',   icon: 'flight_takeoff', label: 'Misiones'  },
  { href: '/galisancho/telemetria', icon: 'radar',          label: 'Telemetría'},
  { href: '/galisancho/informes',   icon: 'summarize',      label: 'Informes'  },
  { href: '/galisancho/ajustes',    icon: 'settings',       label: 'Ajustes'   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(email: string | null | undefined) {
  if (!email) return '?';
  return email.charAt(0).toUpperCase();
}

function getAvatarColor(email: string | null | undefined) {
  const colors = ['bg-cyan-500', 'bg-purple-500', 'bg-emerald-500', 'bg-orange-500', 'bg-blue-500', 'bg-pink-500'];
  if (!email) return colors[0];
  return colors[email.charCodeAt(0) % colors.length];
}

// ── WhatsApp flotante ─────────────────────────────────────────────────────────
const WA_NUMBER  = '34646466203';
const WA_MESSAGE = encodeURIComponent('Hola, me gustaría obtener más información sobre DLOS.AI');

function WhatsAppButton() {
  return (
    <a
      href={`https://wa.me/${WA_NUMBER}?text=${WA_MESSAGE}`}
      target="_blank" rel="noopener noreferrer"
      title="Contactar por WhatsApp"
      className="fixed bottom-20 right-4 lg:bottom-8 lg:right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all hover:scale-110 active:scale-95"
      style={{ background: '#25D366', boxShadow: '0 4px 20px rgba(37,211,102,0.45)' }}
    >
      <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
      </svg>
    </a>
  );
}

// ── Hook: carga emails autorizados desde Firestore ────────────────────────────
function useGalisanchoAccess() {
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getDocs(collection(db, 'galisancho_access'))
      .then(snap => {
        const emails = snap.docs.map(d => d.id.toLowerCase());
        setAllowedEmails(emails);
      })
      .catch(() => {
        // Si no hay permisos o falla, seguimos sin emails extra
      })
      .finally(() => setLoaded(true));
  }, []);

  return { allowedEmails, loaded };
}

// ── AppShell ──────────────────────────────────────────────────────────────────
export default function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router   = useRouter();

  const { allowedEmails, loaded: accessLoaded } = useGalisanchoAccess();

  const isMapOnly = !!user && MAP_ONLY_USERS.includes(user.uid);

  // Admin hardcoded + usuarios con email en galisancho_access
  const isGalisancho = !!user && (
    user.uid === GALISANCHO_ADMIN_UID ||
    (user.email && allowedEmails.includes(user.email.toLowerCase()))
  );

  const isLoginPage = pathname === '/login' || pathname?.startsWith('/login/');

  // Esperamos a que cargue Firestore para evitar flash de redirect
  const fullyLoaded = !loading && accessLoaded;

  // Redirect unauthenticated → /login
  useEffect(() => {
    if (!loading && !user && !isLoginPage) {
      router.replace('/login');
    }
  }, [loading, user, isLoginPage, router]);

  // Redirect MAP_ONLY → /mapa
  useEffect(() => {
    if (fullyLoaded && isMapOnly && pathname !== '/mapa') {
      router.replace('/mapa');
    }
  }, [fullyLoaded, isMapOnly, pathname, router]);

  // Redirect Galisancho → /galisancho/mapa (si está fuera de sus rutas)
  useEffect(() => {
    if (fullyLoaded && isGalisancho) {
      const allowed = ['/galisancho', '/libreria', '/library', '/mision'];
      const isAllowed = allowed.some(r => pathname === r || pathname?.startsWith(r + '/') || pathname === r);
      if (!isAllowed) router.replace('/galisancho/mapa');
    }
  }, [fullyLoaded, isGalisancho, pathname, router]);

  // Páginas login — sin shell
  if (isLoginPage) return <>{children}</>;

  // Cargando
  if (!fullyLoaded) {
    return (
      <>
        <aside className="hidden lg:flex w-16 border-r border-slate-200 flex-col bg-white shrink-0 h-screen sticky top-0">
          <SidebarLogo subtitle="Ganadería IA" />
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-primary rounded-full animate-spin" />
          </div>
        </aside>
        <div className="flex-1 flex flex-col min-h-screen lg:h-screen overflow-hidden">{children}</div>
      </>
    );
  }

  // ── MAP_ONLY (Blasson) — sin sidebar ──
  if (isMapOnly) {
    return (
      <>
        <div className="flex-1 flex flex-col h-screen overflow-hidden">{children}</div>
        <button
          onClick={() => signOut(auth)}
          title="Cerrar sesión"
          className="fixed top-4 right-4 z-50 flex items-center gap-1.5 px-3 py-2 bg-white/90 backdrop-blur-sm rounded-xl shadow border border-slate-200 text-slate-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all text-xs font-semibold"
        >
          <span className="material-icons-round text-base">logout</span>
          Salir
        </button>
        <WhatsAppButton />
      </>
    );
  }

  // ── GALISANCHO — sidebar propio ──
  if (isGalisancho) {
    return <GalisanchoShell pathname={pathname} user={user}>{children}</GalisanchoShell>;
  }

  // ── Usuario normal — sidebar completo ──
  const userEmail   = user?.email || '';
  const displayName = user?.displayName || userEmail.split('@')[0] || 'Usuario';
  const initials    = getInitials(userEmail);
  const avatarColor = getAvatarColor(userEmail);

  return (
    <>
      {/* Sidebar desktop — hover para expandir */}
      <aside className="hidden lg:flex w-16 hover:w-64 transition-[width] duration-200 ease-in-out border-r border-slate-100 flex-col bg-white shrink-0 h-screen sticky top-0 overflow-hidden group">
        <SidebarLogo subtitle="Ganadería IA" />
        <nav className="flex-1 px-2 pt-3 space-y-0.5 overflow-y-auto hide-scrollbar">
          {FULL_NAV.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href + item.label} href={item.href}
                title={item.label}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive ? 'sidebar-active text-primary font-semibold' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <span className={`material-icons-round text-xl shrink-0 ${isActive ? 'text-primary' : ''}`}>{item.icon}</span>
                <span className="whitespace-nowrap overflow-hidden">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <UserFooter email={userEmail} displayName={displayName} initials={initials} avatarColor={avatarColor} />
      </aside>

      <div className="flex-1 flex flex-col min-h-screen lg:h-screen overflow-hidden">{children}</div>

      {/* Mobile nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 z-50">
        <div className="flex justify-around items-center px-1 py-2">
          <MobileNavItem href="/"         icon="dashboard"      label="Inicio"   active={pathname === '/'} />
          <MobileNavItem href="/misiones" icon="flight_takeoff" label="Misiones" active={pathname === '/misiones'} />
          <div className="relative -mt-5">
            <Link href="/misiones" className="w-[52px] h-[52px] bg-primary rounded-full flex items-center justify-center text-white shadow-lg shadow-primary/40 active:scale-95 transition-transform">
              <span className="material-icons-round text-xl">pets</span>
            </Link>
          </div>
          <MobileNavItem href="/agentes" icon="smart_toy" label="Agentes" active={pathname === '/agentes'} />
          <MobileLogoutButton />
        </div>
      </nav>
      <WhatsAppButton />
    </>
  );
}

// ── Galisancho Shell ──────────────────────────────────────────────────────────
function GalisanchoShell({ children, pathname, user }: { children: ReactNode; pathname: string; user: any }) {
  const userEmail   = user?.email || '';
  const displayName = user?.displayName || userEmail.split('@')[0] || 'Usuario';
  const initials    = getInitials(userEmail);
  const avatarColor = getAvatarColor(userEmail);

  return (
    <>
      {/* Sidebar desktop — hover para expandir */}
      <aside className="hidden lg:flex w-16 hover:w-64 transition-[width] duration-200 ease-in-out border-r border-slate-100 flex-col bg-white shrink-0 h-screen sticky top-0 overflow-hidden group">
        <SidebarLogo subtitle="Finca Galisancho" />
        <nav className="flex-1 px-2 pt-3 space-y-0.5 overflow-y-auto hide-scrollbar">
          {GALISANCHO_NAV.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href}
                title={item.label}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive ? 'sidebar-active text-primary font-semibold' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <span className={`material-icons-round text-xl shrink-0 ${isActive ? 'text-primary' : ''}`}>{item.icon}</span>
                <span className="whitespace-nowrap overflow-hidden">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <UserFooter email={userEmail} displayName={displayName} initials={initials} avatarColor={avatarColor} />
      </aside>

      <div className="flex-1 flex flex-col min-h-screen lg:h-screen overflow-hidden">{children}</div>

      {/* Mobile nav Galisancho */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 z-50">
        <div className="flex justify-around items-center px-2 py-2">
          {GALISANCHO_NAV.map(item => (
            <MobileNavItem key={item.href} href={item.href} icon={item.icon} label={item.label}
              active={pathname === item.href || pathname?.startsWith(item.href + '/')} />
          ))}
          <MobileLogoutButton />
        </div>
      </nav>

      {/* Chat IA flotante — disponible en todas las páginas Galisancho */}
      <ChatIA />
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SidebarLogo({ subtitle }: { subtitle: string }) {
  return (
    <div className="p-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
      <div className="w-9 h-9 shrink-0">
        <img src="/logo-icon.svg" alt="dlos.ai" className="w-full h-full" />
      </div>
      <div className="min-w-0 overflow-hidden">
        <h1 className="font-black text-base leading-tight text-slate-900 whitespace-nowrap tracking-tight">dlos<span className="text-primary">.ai</span></h1>
        <p className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold whitespace-nowrap">{subtitle}</p>
      </div>
    </div>
  );
}

function UserFooter({ email, displayName, initials, avatarColor }: {
  email: string; displayName: string; initials: string; avatarColor: string;
}) {
  return (
    <div className="p-3 border-t border-slate-100 shrink-0">
      {/* Avatar + info (oculto cuando colapsado) */}
      <div className="bg-slate-50 rounded-xl p-2.5 flex items-center gap-2.5 mb-2 overflow-hidden">
        <div className="relative shrink-0">
          <div className={`w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center text-white text-sm font-bold`}>
            {initials}
          </div>
          <div className="absolute bottom-0 right-0 w-2 h-2 dot-online border-2 border-white rounded-full" />
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <p className="text-sm font-semibold text-slate-800 truncate whitespace-nowrap">{displayName}</p>
          <p className="text-[10px] text-slate-400 truncate whitespace-nowrap">{email}</p>
        </div>
      </div>
      <button
        onClick={() => signOut(auth)}
        title="Cerrar sesión"
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-all text-sm font-semibold overflow-hidden"
      >
        <span className="material-icons-round text-base shrink-0">logout</span>
        <span className="whitespace-nowrap">Cerrar sesión</span>
      </button>
    </div>
  );
}

function MobileNavItem({ href, icon, label, active }: { href: string; icon: string; label: string; active?: boolean }) {
  return (
    <Link href={href} className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-xl transition-colors min-h-[44px] justify-center ${active ? 'text-primary' : 'text-slate-400 hover:text-slate-600'}`}>
      <span className="material-icons-round text-2xl">{icon}</span>
      <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
    </Link>
  );
}

function MobileLogoutButton() {
  return (
    <button
      onClick={() => signOut(auth)}
      className="flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-xl transition-colors text-red-400 hover:text-red-600 active:text-red-700 min-h-[44px] justify-center"
    >
      <span className="material-icons-round text-2xl">logout</span>
      <span className="text-[9px] font-bold uppercase tracking-wide">Salir</span>
    </button>
  );
}
