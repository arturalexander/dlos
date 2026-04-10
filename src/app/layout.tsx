import type { Metadata, Viewport } from "next";
import "./styles/main.css";
import { AuthProvider } from "@/lib/auth-context";
import { PreferencesProvider } from "@/lib/preferences-context";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "dlos.ai - Dashboard",
  description: "AI Ganadería Telemetría",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#F8FAFC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Apply dark mode before first paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            if (localStorage.getItem('dlos_dark') === '1') {
              document.documentElement.classList.add('dark');
            }
            var l = localStorage.getItem('dlos_lang');
            if (l) document.documentElement.lang = l;
          } catch(e) {}
        `}} />
      </head>
      <body suppressHydrationWarning className="bg-slate-50 text-slate-900 min-h-screen flex antialiased pb-16 lg:pb-0">
        {process.env.NEXT_PUBLIC_ENV === 'staging' && (
          <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-400 text-amber-900 text-xs font-bold text-center py-1 tracking-wide">
            ENTORNO DE PRUEBAS — staging
          </div>
        )}
        <AuthProvider>
          <PreferencesProvider>
            <AppShell>{children}</AppShell>
          </PreferencesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
