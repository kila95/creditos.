import React, { useState, useEffect, useCallback } from 'react';
import {
  Crown,
  Building2,
  UserPlus,
  Mail,
  Lock,
  User,
  Phone,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  KeyRound,
  Layers,
  FileText,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  registerNewAdminAccount,
  DEMO_USERS,
  supabase,
  supabaseUrl,
  isLiveSupabaseConfigured,
} from '../services/supabaseAuth';

export interface RegisteredAdminRecord {
  id: string;
  email: string;
  password?: string;
  fullName: string;
  role: 'admin';
  organizationId: string;
  organizationName: string;
  createdBy: string;
  phone: string;
  cedula: string;
  createdAt: string;
}

export const SuperAdminTenantsManager: React.FC = () => {
  const { profile, isSuperAdmin } = useAuth();

  const [adminsList, setAdminsList] = useState<RegisteredAdminRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form states for creating a new 'admin'
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('admin123@Medellin');
  const [phone, setPhone] = useState('');
  const [cedula, setCedula] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadAdmins = useCallback(async () => {
    setIsLoading(true);
    try {
      const mergedMap = new Map<string, RegisteredAdminRecord>();

      // 1. Consultar el backend PostgreSQL (/api/admins)
      try {
        const res = await fetch('/api/admins');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            data.forEach((a: any) => {
              const normEmail = (a.email || '').trim().toLowerCase();
              if (!normEmail) return;
              mergedMap.set(normEmail, {
                id: a.uid || `usr-admin-${a.id}`,
                email: a.email,
                password: a.password || DEMO_USERS[normEmail]?.password || 'admin123@Medellin',
                fullName: a.name || a.fullName || 'Administrador',
                role: 'admin',
                organizationId: a.organizationId || a.organization_id || `org-${a.id}`,
                organizationName:
                  a.organizationName || a.organization_name || `Fondo ${a.name || a.fullName}`,
                createdBy: a.createdBy || a.created_by || 'usr-super-000',
                phone: a.phone || '300 000 0000',
                cedula: a.documentId || a.document_id || 'N/A',
                createdAt: a.createdAt || a.created_at || new Date().toISOString(),
              });
            });
          }
        }
      } catch {
        // Si /api/admins no responde en un host estático, continuar con Supabase public.profiles
      }

      // 2. Consultar también Supabase public.profiles para entornos de producción / móvil
      if (isLiveSupabaseConfigured) {
        try {
          const { data: sbProfiles } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'admin');

          if (Array.isArray(sbProfiles)) {
            sbProfiles.forEach((p: any) => {
              const key = (p.email || `admin-${String(p.id).slice(0, 8)}@rutacapital.co`)
                .trim()
                .toLowerCase();
              if (!mergedMap.has(key)) {
                mergedMap.set(key, {
                  id: p.id,
                  email: p.email || key,
                  password: DEMO_USERS[key]?.password || 'admin123@Medellin',
                  fullName: p.full_name || p.name || 'Administrador',
                  role: 'admin',
                  organizationId: p.organization_id || p.tenant_id || `org-${String(p.id).slice(0, 6)}`,
                  organizationName:
                    p.organization_name || `Fondo ${p.full_name || 'RutaCapital'}`,
                  createdBy: p.created_by || 'usr-super-000',
                  phone: p.phone || '300 000 0000',
                  cedula: p.document_id || 'N/A',
                  createdAt: p.created_at || new Date().toISOString(),
                });
              }
            });
          }
        } catch {
          // Ignorar errores de lectura de profiles
        }
      }

      // 3. Incluir administradores aprovisionados en DEMO_USERS / localStorage
      Object.entries(DEMO_USERS).forEach(([emailKey, entry]) => {
        if (entry?.profile?.role === 'admin' && !mergedMap.has(emailKey)) {
          mergedMap.set(emailKey, {
            id: entry.profile.id,
            email: entry.profile.email,
            password: entry.password,
            fullName: entry.profile.fullName,
            role: 'admin',
            organizationId: entry.profile.organizationId || 'org-medellin-01',
            organizationName:
              entry.profile.organizationName || `Fondo ${entry.profile.fullName}`,
            createdBy: entry.profile.createdBy || 'usr-super-000',
            phone: entry.profile.phone || '300 000 0000',
            cedula: entry.profile.documentId || 'N/A',
            createdAt: entry.profile.createdAt || new Date().toISOString(),
          });
        }
      });

      const finalAdmins = Array.from(mergedMap.values());

      // Register in DEMO_USERS for instant RBAC switching
      finalAdmins.forEach((adm) => {
        const norm = adm.email.trim().toLowerCase();
        DEMO_USERS[norm] = {
          password: adm.password || DEMO_USERS[norm]?.password || 'admin123@Medellin',
          profile: {
            id: adm.id,
            email: adm.email,
            fullName: adm.fullName,
            role: 'admin',
            organizationId: adm.organizationId,
            organizationName: adm.organizationName,
            createdBy: adm.createdBy,
            phone: adm.phone,
            documentId: adm.cedula,
            isActive: true,
            createdAt: adm.createdAt,
          },
        };
      });

      setAdminsList(finalAdmins);
    } catch (err) {
      console.warn('[SuperAdminTenantsManager] Aviso cargando administradores:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      loadAdmins();
    }
  }, [isSuperAdmin, loadAdmins]);

  // Strict RBAC guard: Only 'super_admin' can see or execute this module
  if (!isSuperAdmin) {
    return null;
  }

  const handleGeneratePassword = () => {
    const cleanCedula = cedula.replace(/[^0-9a-zA-Z]/g, '');
    if (cleanCedula.length >= 6) {
      setTemporaryPassword(cleanCedula);
      return;
    }
    const num = Math.floor(100 + Math.random() * 900);
    setTemporaryPassword(`Admin${num}@Fondo`);
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanCedulaDigits = cedula.replace(/[^0-9a-zA-Z]/g, '');
    const effectiveTempPassword =
      temporaryPassword.trim() ||
      (cleanCedulaDigits.length >= 6 ? cleanCedulaDigits : 'admin123@Medellin');

    if (!fullName.trim() || !organizationName.trim() || !email.trim()) {
      setErrorMsg('Nombre completo, Nombre del Fondo/Negocio y Correo son obligatorios.');
      return;
    }

    if (effectiveTempPassword.length < 6) {
      setErrorMsg('La contraseña temporal debe tener mínimo 6 caracteres.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { profile: createdAdmin, error } = await registerNewAdminAccount({
        email: email.trim(),
        password: effectiveTempPassword,
        fullName: fullName.trim(),
        organizationName: organizationName.trim(),
        phone: phone.trim() || '300 000 0000',
        documentId: cedula.trim(),
        createdBySuperAdminId: profile?.id || 'usr-super-000',
      });

      if (error || !createdAdmin) {
        throw new Error(
          error || 'Error al guardar en base de datos: No se pudo registrar la cuenta de Administrador.'
        );
      }

      const newRecord: RegisteredAdminRecord = {
        id: createdAdmin.id,
        email: createdAdmin.email,
        password: effectiveTempPassword,
        fullName: createdAdmin.fullName,
        role: 'admin',
        organizationId: createdAdmin.organizationId || 'org-nuevo',
        organizationName: createdAdmin.organizationName || organizationName.trim(),
        createdBy: createdAdmin.createdBy || profile?.id || 'usr-super-000',
        phone: createdAdmin.phone || '',
        cedula: createdAdmin.documentId || cedula.trim() || 'N/A',
        createdAt: createdAdmin.createdAt,
      };

      setAdminsList((prev) => [newRecord, ...prev.filter((a) => a.email !== newRecord.email)]);
      setSuccessMsg(
        `¡Cuenta 'admin' creada en auth.users + profiles para ${newRecord.fullName} (${newRecord.organizationName} • Org ID: ${newRecord.organizationId})!`
      );

      setFullName('');
      setOrganizationName('');
      setEmail('');
      setPhone('');
      setCedula('');
    } catch (err: any) {
      const rawSupabaseEnvUrl =
        import.meta.env.VITE_SUPABASE_URL || `${supabaseUrl} (fallback)`;
      const endpointName = '/functions/v1/admin-provision-user | /rest/v1/profiles | /api/admins';
      const errDetail = err?.message || 'Error inesperado creando el administrador.';

      // RASTREADOR VISUAL DE URL EN EL BLOQUE CATCH (Diagnóstico en pantalla de celular)
      window.alert(
        `🔍 RASTREADOR DE CONEXIÓN (DEBUG MÓVIL)\n\n` +
          `• VITE_SUPABASE_URL: ${rawSupabaseEnvUrl}\n` +
          `• URL Base Efectiva: ${supabaseUrl}\n` +
          `• Endpoint: ${endpointName}\n` +
          `• Detalle: ${errDetail}`
      );

      setErrorMsg(
        `${errDetail} (VITE_SUPABASE_URL: ${rawSupabaseEnvUrl} | Endpoint: ${endpointName})`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900 border-2 border-amber-500/30 rounded-2xl overflow-hidden shadow-2xl">
      {/* Header exclusively for SUPER_ADMIN */}
      <div className="p-5 border-b border-slate-800 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-950 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5 shadow-inner">
            <Crown className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                Panel Maestro Super Admin — Creación de Administradores de Fondos ('admin')
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Nivel 1: super_admin (Visibilidad Global)
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Exclusivo para <strong className="text-amber-300">super_admin</strong>. Crea cuentas con rol <code className="text-amber-300 font-mono font-bold">'admin'</code> para cada fondo/negocio. Cada administrador queda vinculado a su propio <code className="text-emerald-300 font-mono">organization_id</code> y solo puede gestionar los cobradores y clientes que él mismo cree.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadAdmins}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
            Sincronizar Fondos ({adminsList.length})
          </button>
        </div>
      </div>

      {/* Main Grid: Left = Form to create 'admin', Right = Active Admins / Organizations */}
      <div className="p-5 grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Column: Create 'admin' form */}
        <div className="xl:col-span-5 bg-slate-950/90 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-black uppercase tracking-wider text-white">
                Crear Cuenta de Administrador ('admin')
              </h4>
            </div>
            <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              Nivel 2 Jerárquico
            </span>
          </div>

          {errorMsg && (
            <div className="mb-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2.5 text-emerald-300 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleCreateAdmin} className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                1. Nombre del Fondo / Negocio *
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Ej: Fondo Capital Oriente / Inversiones Aburrá"
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  2. Nombre Completo del Admin *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ej: Andrés Felipe Restrepo"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Teléfono / WhatsApp
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ej: 310 555 8899"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Documento / Cédula (Opcional - vincula clave temporal)
              </label>
              <div className="relative">
                <FileText className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value)}
                  placeholder="Ej: 1037615890"
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  3. Correo Electrónico (Login) *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin.oriente@rutacapital.co"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl text-xs text-white font-mono focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    4. Contraseña Temporal *
                  </label>
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    className="text-[10px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                  >
                    <KeyRound className="w-3 h-3" /> Generar
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={temporaryPassword}
                    onChange={(e) => setTemporaryPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl text-xs text-amber-300 font-mono focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creando Cuenta Admin & Organización...
                </>
              ) : (
                <>
                  <Crown className="w-4 h-4" />
                  Crear Usuario 'admin' y Aprovisionar Fondo
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: List of Provisioned 'admin' Tenants */}
        <div className="xl:col-span-7 bg-slate-950/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                  Administradores de Fondos Creados ({adminsList.length})
                </h4>
              </div>
              <span className="text-[10px] text-slate-400">
                Aislamiento RLS por <code className="text-indigo-300 font-mono">organization_id</code> y <code className="text-indigo-300 font-mono">created_by</code>
              </span>
            </div>

            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                <span className="text-xs">Cargando fondos y administradores...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      <th className="py-2 px-2.5">Fondo / Organización</th>
                      <th className="py-2 px-2.5">Administrador ('admin')</th>
                      <th className="py-2 px-2.5">Credenciales</th>
                      <th className="py-2 px-2.5">Jerarquía RLS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-xs">
                    {adminsList.map((adm) => (
                      <tr key={adm.id} className="hover:bg-slate-900/70 transition-colors">
                        <td className="py-2.5 px-2.5">
                          <div className="font-bold text-white flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{adm.organizationName}</span>
                          </div>
                          <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 inline-block mt-1">
                            org_id: {adm.organizationId}
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5">
                          <div className="font-bold text-slate-200">{adm.fullName}</div>
                          <div className="text-[10px] text-slate-500 font-mono">uid: {adm.id}</div>
                        </td>
                        <td className="py-2.5 px-2.5 font-mono text-[11px]">
                          <div className="text-emerald-300">{adm.email}</div>
                          <div className="text-slate-400 text-[10px]">Pass: {adm.password || 'admin123@Medellin'}</div>
                        </td>
                        <td className="py-2.5 px-2.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 block w-fit">
                            role: 'admin'
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                            created_by: {adm.createdBy || 'usr-super-000'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>
              Como <strong className="text-amber-300">super_admin</strong> tienes visibilidad y control global de aprovisionamiento de fondos con estricto aislamiento multi-tenant.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
