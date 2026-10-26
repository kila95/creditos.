import React, { useState, useEffect, useCallback } from 'react';
import { 
  UserPlus, 
  Bike, 
  Mail, 
  KeyRound, 
  MapPin, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Phone, 
  FileText,
  Lock,
  LogIn,
  Building2
} from 'lucide-react';
import { RouteData } from '../data/mockData';
import { registerNewCollectorAccount, DEMO_USERS } from '../services/supabaseAuth';
import { useAuth } from '../context/AuthContext';

export interface CollectorUserRecord {
  uid: string;
  email: string;
  name: string;
  role: string;
  assignedRouteId: string;
  organizationId?: string;
  organizationName?: string;
  createdBy?: string;
  phone?: string;
  documentId?: string;
  isActive: boolean;
  createdAt?: string;
}

interface AdminCollectorUsersManagerProps {
  routes: RouteData[];
  onCollectorCreated?: (collector: CollectorUserRecord) => void;
  onSwitchToCollectorView?: () => void;
}

export const AdminCollectorUsersManager: React.FC<AdminCollectorUsersManagerProps> = ({
  routes,
  onCollectorCreated,
  onSwitchToCollectorView,
}) => {
  const { role, profile, isSuperAdmin, isAdmin, switchDemoUser } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('cobrador123@Medellin');
  const [assignedRouteId, setAssignedRouteId] = useState(routes[0]?.id || 'route-1');
  const [phone, setPhone] = useState('');
  const [documentId, setDocumentId] = useState('');

  const [collectors, setCollectors] = useState<CollectorUserRecord[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadCollectors = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const res = await fetch('/api/collectors');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const mapped: CollectorUserRecord[] = data.map((u: any) => ({
            uid: u.uid || String(u.id),
            email: u.email,
            name: u.name,
            role: u.role || 'collector',
            assignedRouteId: u.assignedRouteId || u.assigned_route_id || 'route-1',
            organizationId: u.organizationId || u.organization_id || 'org-medellin-01',
            organizationName: u.organizationName || u.organization_name || 'Fondo RutaCapital Medellín Central',
            createdBy: u.createdBy || u.created_by || 'usr-admin-001',
            phone: u.phone || '',
            documentId: u.documentId || u.document_id || '',
            isActive: u.isActive ?? u.is_active ?? true,
            createdAt: u.createdAt || u.created_at,
          }));

          // Sincronizar con DEMO_USERS para pruebas de cambio instantáneo de rol
          mapped.forEach((col) => {
            const norm = col.email.trim().toLowerCase();
            if (!DEMO_USERS[norm]) {
              DEMO_USERS[norm] = {
                password: 'cobrador123@Medellin',
                profile: {
                  id: col.uid,
                  email: col.email,
                  fullName: col.name,
                  role: 'collector',
                  assignedRouteId: col.assignedRouteId,
                  organizationId: col.organizationId,
                  organizationName: col.organizationName,
                  createdBy: col.createdBy,
                  phone: col.phone,
                  documentId: col.documentId,
                  isActive: col.isActive,
                  createdAt: col.createdAt || new Date().toISOString(),
                },
              };
            }
          });

          setCollectors(mapped);
        }
      }
    } catch (err) {
      console.warn('Error cargando listado de cobradores:', err);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadCollectors();
  }, [loadCollectors]);

  // Acceso exclusivo para Super Admin o Admin
  if (!isAdmin) {
    return null;
  }

  // AISLAMIENTO RLS DE SEGUNDO NIVEL:
  // - Si el usuario es 'super_admin', tiene visibilidad total de todos los cobradores.
  // - Si el usuario es 'admin', SOLO ve y gestiona los cobradores que él mismo creó (created_by) o de su organización (organization_id).
  const visibleCollectors = isSuperAdmin
    ? collectors
    : collectors.filter(
        (c) =>
          c.createdBy === profile?.id ||
          (profile?.organizationId && c.organizationId === profile.organizationId)
      );

  const handleCreateCollector = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!fullName.trim() || !email.trim() || !password.trim() || !assignedRouteId) {
      setErrorMsg('Completa Nombre completo, Correo electrónico, Contraseña temporal y Ruta Asignada.');
      return;
    }

    if (password.trim().length < 6) {
      setErrorMsg('La contraseña temporal debe tener al menos 6 caracteres (requisito de Supabase Auth).');
      return;
    }

    setIsSubmitting(true);

    const { profile: createdProfile, error } = await registerNewCollectorAccount({
      email: email.trim(),
      password: password.trim(),
      fullName: fullName.trim(),
      assignedRouteId,
      organizationId: profile?.organizationId || 'org-medellin-01',
      organizationName: profile?.organizationName || 'Fondo RutaCapital Medellín Central',
      createdByAdminId: profile?.id || 'usr-admin-001',
      phone: phone.trim(),
      documentId: documentId.trim(),
    });

    setIsSubmitting(false);

    if (error || !createdProfile) {
      setErrorMsg(error || 'No se pudo crear el usuario cobrador.');
      return;
    }

    const newCollectorRecord: CollectorUserRecord = {
      uid: createdProfile.id,
      email: createdProfile.email,
      name: createdProfile.fullName,
      role: 'collector',
      assignedRouteId: createdProfile.assignedRouteId || assignedRouteId,
      organizationId: createdProfile.organizationId || profile?.organizationId || 'org-medellin-01',
      organizationName: createdProfile.organizationName || profile?.organizationName || 'Fondo RutaCapital Medellín',
      createdBy: createdProfile.createdBy || profile?.id || 'usr-admin-001',
      phone: createdProfile.phone,
      documentId: createdProfile.documentId,
      isActive: true,
      createdAt: createdProfile.createdAt,
    };

    setCollectors((prev) => [newCollectorRecord, ...prev.filter((c) => c.email !== newCollectorRecord.email)]);
    if (onCollectorCreated) {
      onCollectorCreated(newCollectorRecord);
    }

    const assignedRouteObj = routes.find((r) => r.id === assignedRouteId);
    setSuccessMsg(
      `¡Cobrador ${createdProfile.fullName} (${createdProfile.email}) creado con rol 'collector', vinculado a ${
        profile?.organizationName || 'tu organización'
      } (created_by: ${profile?.id}) y aislado en ${assignedRouteObj?.name || assignedRouteId}!`
    );

    setFullName('');
    setEmail('');
    setPhone('');
    setDocumentId('');
  };

  const handleTestCollectorLogin = (collectorEmail: string) => {
    switchDemoUser(collectorEmail);
    if (onSwitchToCollectorView) {
      onSwitchToCollectorView();
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      {/* ENCABEZADO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              Nivel 2 → Nivel 3: Gestión de Cobradores ('collector')
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {isSuperAdmin
                ? 'Vista Global Super Admin (Todos los Fondos)'
                : `Fondo Aislado: ${profile?.organizationName || 'Mi Fondo'} (${profile?.organizationId || 'org-medellin-01'})`}
            </span>
          </div>
          <h3 className="text-lg font-bold text-white mt-1.5 flex items-center gap-2">
            <Bike className="w-5 h-5 text-emerald-400" />
            Módulo de Creación de Cobradores y Asignación de Rutas
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Cada cobrador creado queda atado exclusivamente a la gestión de su Administrador (<code className="text-emerald-300 font-mono">created_by = '{profile?.id}'</code> y <code className="text-emerald-300 font-mono">organization_id = '{profile?.organizationId}'</code>) y solo puede ver los clientes de su ruta asignada.
          </p>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
              {isSuperAdmin ? 'Cobradores Globales' : 'Mis Cobradores (RLS)'}
            </span>
            <span className="text-sm font-black text-white font-mono">
              {visibleCollectors.length} Collector(s)
            </span>
          </div>
        </div>
      </div>

      {/* CONTENIDO EN 2 COLUMNAS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-5">
        {/* COLUMNA IZQUIERDA: FORMULARIO DE ALTA DE COBRADOR */}
        <form
          onSubmit={handleCreateCollector}
          className="lg:col-span-5 bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3.5 text-xs"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <span className="font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-emerald-400" />
              Registrar Nuevo Cobrador
            </span>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              role: 'collector'
            </span>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Vínculo jerárquico automático */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Vinculado a Admin / Organización:</span>
            <span className="font-mono font-bold text-indigo-300">
              {profile?.organizationId || 'org-medellin-01'} ({profile?.id || 'usr-admin-001'})
            </span>
          </div>

          {/* 1. NOMBRE COMPLETO */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              1. Nombre Completo del Cobrador *
            </label>
            <input
              type="text"
              required
              placeholder="Ej. Mateo Alejandro Ospina"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* 2. CORREO ELECTRÓNICO */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              2. Correo Electrónico de Acceso (Login) *
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
              <input
                type="email"
                required
                placeholder="Ej. mateo.ruta1@rutacapital.co"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* 3. CONTRASEÑA TEMPORAL */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              3. Contraseña Temporal *
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-emerald-400 absolute left-3.5 top-2.5" />
              <input
                type="text"
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-emerald-300 font-mono font-bold focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* 4. RUTA ASIGNADA */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              4. Ruta Asignada (Aislamiento Estricto RLS) *
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-emerald-400 absolute left-3.5 top-2.5" />
              <select
                value={assignedRouteId}
                onChange={(e) => setAssignedRouteId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-white font-semibold focus:outline-none focus:border-emerald-500"
              >
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — ID: {r.id} ({r.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* CAMPOS OPCIONALES: TELÉFONO Y CÉDULA */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-slate-400 text-[11px] mb-1">WhatsApp / Celular</label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="tel"
                  placeholder="314 000 0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-2.5 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-slate-400 text-[11px] mb-1">Cédula (CC)</label>
              <div className="relative">
                <FileText className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="CC 1.017..."
                  value={documentId}
                  onChange={(e) => setDocumentId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-2.5 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            {isSubmitting ? 'Creando en Supabase Auth & DB...' : "Crear Usuario 'collector' y Vincular Ruta"}
          </button>
        </form>

        {/* COLUMNA DERECHA: DIRECTORIO DE COBRADORES Y PRUEBA DE ACCESO AISLADO */}
        <div className="lg:col-span-7 flex flex-col justify-between bg-slate-950/50 border border-slate-800 rounded-xl p-4">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Bike className="w-4 h-4 text-emerald-400" />
                {isSuperAdmin
                  ? 'Todos los Cobradores del Sistema (Vista Super Admin)'
                  : `Cobradores de ${profile?.organizationName || 'Mi Fondo'} (Aislamiento Admin)`}
              </span>
              <span className="text-[11px] text-slate-400">
                {isLoadingList ? 'Sincronizando...' : `${visibleCollectors.length} cuentas visibles`}
              </span>
            </div>

            {visibleCollectors.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-xs text-slate-400">
                  No tienes cobradores registrados bajo tu administración (<code className="text-indigo-300 font-mono">{profile?.organizationId}</code>).
                </p>
                <p className="text-[11px] text-slate-500">
                  Utiliza el formulario de la izquierda para registrar tu primer cobrador (<code className="text-emerald-400 font-mono">role: 'collector'</code>).
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                      <th className="py-2 px-2">Cobrador / Correo</th>
                      <th className="py-2 px-2">Organización / Admin</th>
                      <th className="py-2 px-2">Ruta Vinculada (RLS)</th>
                      <th className="py-2 px-2 text-right">Simular / Verificar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {visibleCollectors.map((col) => {
                      const routeObj = routes.find((r) => r.id === col.assignedRouteId);
                      return (
                        <tr key={col.uid} className="hover:bg-slate-900/60 transition-colors">
                          <td className="py-2.5 px-2">
                            <div className="font-bold text-white">{col.name}</div>
                            <div className="text-[11px] text-emerald-400 font-mono">{col.email}</div>
                          </td>
                          <td className="py-2.5 px-2">
                            <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 block w-fit">
                              {col.organizationId || 'org-medellin-01'}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                              por: {col.createdBy || 'usr-admin-001'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
                              <MapPin className="w-3 h-3 text-emerald-400" />
                              {routeObj ? `${routeObj.name} (${col.assignedRouteId})` : col.assignedRouteId}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleTestCollectorLogin(col.email)}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white border border-slate-700 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer"
                              title="Entrar como este cobrador para verificar que solo ve su ruta asignada"
                            >
                              <LogIn className="w-3 h-3" />
                              Abrir su Ruta
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>
              Política RLS: <code className="text-emerald-300 font-mono">created_by = auth.uid()</code> (Admin solo modifica sus propios cobradores y clientes).
            </span>
            <span className="font-mono text-[10px] text-slate-500">
              Jerarquía de 3 niveles activa
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
