'use client';

// Gestion de accesos — Simulacion preparada para integracion con Firebase Auth
// TODO: Conectar con Firebase Admin SDK para creacion real de usuarios
// TODO: Implementar RBAC con Firebase Custom Claims

import { useState } from 'react';

type UserRole = 'propietario' | 'admin' | 'piloto' | 'vigilante' | 'observador';
type AccessLevel = 'completo' | 'operativo' | 'solo_mapa' | 'solo_vista';

interface SystemUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  access: AccessLevel;
  lastSeen: Date;
  active: boolean;
  phone?: string;
}

const ROLE_CONFIG: Record<UserRole, { label: string; color: string; bg: string; icon: string; desc: string }> = {
  propietario: { label: 'Propietario',    color: 'text-purple-700', bg: 'bg-purple-100', icon: 'shield',          desc: 'Acceso completo a todo el sistema' },
  admin:       { label: 'Administrador',  color: 'text-blue-700',   bg: 'bg-blue-100',   icon: 'manage_accounts', desc: 'Acceso completo, gestión de usuarios' },
  piloto:      { label: 'Piloto',         color: 'text-cyan-700',   bg: 'bg-cyan-100',   icon: 'flight',          desc: 'Mapa, informes, envío de eventos' },
  vigilante:   { label: 'Vigilante',      color: 'text-orange-700', bg: 'bg-orange-100', icon: 'security',        desc: 'Solo mapa y alarmas' },
  observador:  { label: 'Observador',     color: 'text-slate-600',  bg: 'bg-slate-100',  icon: 'visibility',      desc: 'Vista de solo lectura (mapa)' },
};

const ACCESS_PAGES: Record<AccessLevel, string[]> = {
  completo:   ['Mapa', 'Fuego', 'Vigilancia', 'Alarmas', 'Accesos', 'Informes', 'Dashboard', 'Misiones', 'Agentes'],
  operativo:  ['Mapa', 'Fuego', 'Vigilancia', 'Alarmas', 'Informes'],
  solo_mapa:  ['Mapa'],
  solo_vista: ['Mapa', 'Vigilancia', 'Informes'],
};

const ROLE_ACCESS: Record<UserRole, AccessLevel> = {
  propietario: 'completo',
  admin:       'completo',
  piloto:      'operativo',
  vigilante:   'solo_mapa',
  observador:  'solo_vista',
};

const INITIAL_USERS: SystemUser[] = [
  { id: 'u1', name: 'Artur Blasson',  email: 'artur@blasson.com',          role: 'propietario', access: 'completo',  lastSeen: new Date(),                           active: true,  phone: '+34 600 000 001' },
  { id: 'u2', name: 'Carlos García',  email: 'carlos@blasson.com',          role: 'admin',       access: 'completo',  lastSeen: new Date(Date.now() - 1 * 3600000),    active: true,  phone: '+34 600 000 002' },
  { id: 'u3', name: 'Carlos — Norte', email: 'piloto.norte@blasson.com',    role: 'piloto',      access: 'operativo', lastSeen: new Date(Date.now() - 30 * 60000),     active: true },
  { id: 'u4', name: 'Pedro — Sur',    email: 'piloto.sur@blasson.com',      role: 'piloto',      access: 'operativo', lastSeen: new Date(Date.now() - 2 * 3600000),    active: true },
  { id: 'u5', name: 'Ana — Este',     email: 'piloto.este@blasson.com',     role: 'piloto',      access: 'operativo', lastSeen: new Date(Date.now() - 5 * 3600000),    active: true },
  { id: 'u6', name: 'Vigilante',      email: 'vigilante@blasson.com',       role: 'vigilante',   access: 'solo_mapa', lastSeen: new Date(Date.now() - 24 * 3600000),   active: false },
];

const ALL_PAGES = ['Mapa', 'Fuego', 'Vigilancia', 'Alarmas', 'Accesos', 'Informes', 'Dashboard', 'Misiones', 'Agentes'];

export default function AccesosTab() {
  const [users, setUsers] = useState<SystemUser[]>(INITIAL_USERS);
  const [showForm, setShowForm] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'piloto' as UserRole, phone: '' });
  const [activeView, setActiveView] = useState<'usuarios' | 'matriz'>('usuarios');

  const formatTime = (date: Date) => {
    const diff = Date.now() - date.getTime();
    if (diff < 2 * 60000) return '🟢 Online';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)}h`;
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  };

  const toggleActive = (id: string) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, active: !u.active } : u));
  };

  const addUser = () => {
    if (!newUser.name.trim() || !newUser.email.trim()) return;
    setUsers(prev => [...prev, {
      id: `u${Date.now()}`,
      name: newUser.name.trim(),
      email: newUser.email.trim(),
      role: newUser.role,
      access: ROLE_ACCESS[newUser.role],
      lastSeen: new Date(0),
      active: true,
      phone: newUser.phone.trim() || undefined,
    }]);
    setNewUser({ name: '', email: '', role: 'piloto', phone: '' });
    setShowForm(false);
  };

  const removeUser = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="p-6 space-y-6 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Gestión de Accesos</h2>
            <p className="text-sm text-slate-500 mt-0.5">Usuarios, roles y permisos — Simulación</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors"
          >
            <span className="material-icons-round text-sm">person_add</span>
            Añadir usuario
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total usuarios',  value: users.length,                         icon: 'group',   color: 'text-blue-700 bg-blue-50' },
            { label: 'Online ahora',    value: users.filter(u => u.active && Date.now() - u.lastSeen.getTime() < 5 * 60000).length, icon: 'wifi', color: 'text-green-700 bg-green-50' },
            { label: 'Pilotos',         value: users.filter(u => u.role === 'piloto').length, icon: 'flight', color: 'text-cyan-700 bg-cyan-50' },
            { label: 'Inactivos',       value: users.filter(u => !u.active).length,  icon: 'block',   color: 'text-slate-500 bg-slate-100' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                <span className="material-icons-round">{s.icon}</span>
              </div>
              <div>
                <p className="text-2xl font-black text-slate-800">{s.value}</p>
                <p className="text-[10px] text-slate-500 leading-tight">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Add user form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="material-icons-round text-primary">person_add</span>
              Nuevo Usuario
              <span className="ml-2 text-xs text-slate-400 font-normal">(Simulación — integración Firebase pendiente)</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1.5">Nombre completo *</label>
                <input
                  value={newUser.name}
                  onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ej: Juan Pérez"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1.5">Email *</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
                  placeholder="email@blasson.com"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1.5">Rol</label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser(p => ({ ...p, role: e.target.value as UserRole }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {Object.entries(ROLE_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label} — {v.desc}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1.5">Teléfono (opcional)</label>
                <input
                  value={newUser.phone}
                  onChange={e => setNewUser(p => ({ ...p, phone: e.target.value }))}
                  placeholder="+34 600 000 000"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={addUser}
                disabled={!newUser.name.trim() || !newUser.email.trim()}
                className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                <span className="material-icons-round text-sm">check</span>
                Crear usuario
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-5 py-2.5 rounded-xl font-semibold text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* View toggle */}
        <div className="flex gap-1 bg-slate-200/60 p-1 rounded-xl w-fit">
          {(['usuarios', 'matriz'] as const).map(v => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeView === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <span className="material-icons-round text-base">{v === 'usuarios' ? 'group' : 'table_chart'}</span>
              {v === 'usuarios' ? 'Usuarios' : 'Matriz de acceso'}
            </button>
          ))}
        </div>

        {/* USERS LIST */}
        {activeView === 'usuarios' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-100">
              {users.map(user => {
                const rc = ROLE_CONFIG[user.role];
                const isOnline = user.active && Date.now() - user.lastSeen.getTime() < 5 * 60000;
                return (
                  <div key={user.id} className={`flex items-center gap-4 p-4 ${!user.active ? 'opacity-60' : ''}`}>
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center">
                        <span className="material-icons-round text-slate-500">person</span>
                      </div>
                      <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${isOnline ? 'bg-green-500' : user.active ? 'bg-slate-300' : 'bg-slate-200'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm">{user.name}</p>
                      <p className="text-xs text-slate-500 truncate">{user.email}</p>
                      {user.phone && <p className="text-xs text-slate-400">{user.phone}</p>}
                      <p className="text-xs text-slate-400 mt-0.5">{formatTime(user.lastSeen)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${rc.bg} ${rc.color}`}>
                        <span className="material-icons-round text-xs">{rc.icon}</span>
                        {rc.label}
                      </span>
                      <button
                        onClick={() => toggleActive(user.id)}
                        className={`text-xs px-2.5 py-1 rounded-full font-bold transition-colors ${
                          user.active
                            ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                            : 'bg-slate-100 text-slate-500 hover:bg-green-100 hover:text-green-700'
                        }`}
                      >
                        {user.active ? 'Activo' : 'Inactivo'}
                      </button>
                      {user.role !== 'propietario' && (
                        <button
                          onClick={() => removeUser(user.id)}
                          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors"
                        >
                          <span className="material-icons-round text-sm">delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ACCESS MATRIX */}
        {activeView === 'matriz' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Matriz de Acceso por Rol</h3>
              <p className="text-xs text-slate-400 mt-0.5">✅ = acceso permitido &nbsp;·&nbsp; ⭕ = sin acceso</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 sticky left-0 bg-slate-50">Sección</th>
                    {Object.entries(ROLE_CONFIG).map(([role, rc]) => (
                      <th key={role} className="px-4 py-3 text-center">
                        <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-full ${rc.bg} ${rc.color}`}>
                          <span className="material-icons-round text-xs">{rc.icon}</span>
                          <span className="hidden sm:inline">{rc.label}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_PAGES.map((page, i) => (
                    <tr key={page} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="px-5 py-3 font-medium text-slate-700 text-sm sticky left-0 bg-inherit">
                        <div className="flex items-center gap-2">
                          <span className="material-icons-round text-sm text-slate-400">
                            {page === 'Mapa' ? 'map' : page === 'Fuego' ? 'local_fire_department' :
                             page === 'Vigilancia' ? 'visibility' : page === 'Alarmas' ? 'notifications_active' :
                             page === 'Accesos' ? 'lock' : page === 'Informes' ? 'summarize' :
                             page === 'Dashboard' ? 'dashboard' : page === 'Misiones' ? 'flight_takeoff' : 'smart_toy'}
                          </span>
                          {page}
                        </div>
                      </td>
                      {(Object.keys(ROLE_CONFIG) as UserRole[]).map(role => {
                        const hasAccess = ACCESS_PAGES[ROLE_ACCESS[role]].includes(page);
                        return (
                          <td key={role} className="px-4 py-3 text-center">
                            <span className={`text-base ${hasAccess ? 'text-green-500' : 'text-slate-200'}`}>
                              {hasAccess ? '✅' : '⭕'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
