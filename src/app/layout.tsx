import type { Metadata, Viewport } from "next";
import "./styles/main.css";

export const metadata: Metadata = {
  title: "Cattle Vision - Dashboard",
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
    <html lang="es">
      <body className="bg-slate-50 text-slate-900 min-h-screen flex antialiased pb-16 lg:pb-0">
        {/* Sidebar - Desktop Only */}
        <aside className="hidden lg:flex w-64 border-r border-slate-200 flex-col bg-white shrink-0 h-screen sticky top-0">
          <div className="p-6 flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white">
              <span className="material-icons-round">analytics</span>
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">Cattle Vision</h1>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">AI GANADERÍA</p>
            </div>
          </div>

          <nav className="flex-1 px-4 space-y-1">
            <a className="flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-50 rounded-xl transition-all" href="/">
              <span className="material-icons-round text-xl">dashboard</span>
              <span>Dashboard</span>
            </a>
            <a className="flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-50 rounded-xl transition-all" href="/misiones">
              <span className="material-icons-round text-xl">flight_takeoff</span>
              <span>Misiones</span>
            </a>
            <a className="flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-50 rounded-xl transition-all" href="#">
              <span className="material-icons-round text-xl">insights</span>
              <span>Analytics</span>
            </a>
            <a className="flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-50 rounded-xl transition-all" href="#">
              <span className="material-icons-round text-xl">photo_library</span>
              <span>Capturas</span>
            </a>
            <a className="flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-50 rounded-xl transition-all" href="#">
              <span className="material-icons-round text-xl">map</span>
              <span>Mapa</span>
            </a>
            <a className="flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-50 rounded-xl transition-all" href="#">
              <span className="material-icons-round text-xl">settings</span>
              <span>Configuración</span>
            </a>
          </nav>

          <div className="p-4 mt-auto">
            <div className="bg-slate-50 p-4 rounded-2xl flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                  <span className="material-icons-round">person</span>
                </div>
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">DLOS.AI</p>
                <p className="text-xs text-slate-500">Conectado</p>
              </div>
              <button className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round text-lg">logout</span>
              </button>
            </div>
          </div>
        </aside>

        {/* MainShell */}
        <div className="flex-1 flex flex-col min-h-screen lg:h-screen overflow-hidden">
          {children}
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 px-6 py-3 flex justify-between items-center safe-area-bottom">
          <a href="/" className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600">
            <span className="material-icons-round text-2xl">dashboard</span>
            <span className="text-[10px] font-bold">Inicio</span>
          </a>
          <a href="/misiones" className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600">
            <span className="material-icons-round text-2xl">flight_takeoff</span>
            <span className="text-[10px] font-bold">Misiones</span>
          </a>
          <div className="relative -mt-8">
            <a href="/misiones" className="w-14 h-14 bg-primary rounded-full flex items-center justify-center text-white shadow-lg shadow-cyan-500/30">
              <span className="material-icons-round text-2xl">pets</span>
            </a>
          </div>
          <a href="#" className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600">
            <span className="material-icons-round text-2xl">photo_library</span>
            <span className="text-[10px] font-bold">Fotos</span>
          </a>
          <a href="#" className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600">
            <span className="material-icons-round text-2xl">person</span>
            <span className="text-[10px] font-bold">Perfil</span>
          </a>
        </nav>
      </body>
    </html>
  );
}