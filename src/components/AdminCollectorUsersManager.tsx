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
  Building2,
  Search,
  Compass,
} from 'lucide-react';
import { RouteData } from '../data/mockData';
import { registerNewCollectorAccount, DEMO_USERS, supabase, isLiveSupabaseConfigured } from '../services/supabaseAuth';
import { useAuth } from '../context/AuthContext';

export interface MedellinZoneOption {
  value: string;
  label: string;
  comuna: string;
}

export const MEDELLIN_ZONES_CATALOG: MedellinZoneOption[] = [
  {
    value: 'Centro / El Hueco',
    label: 'Centro / El Hueco',
    comuna: 'Comuna 10 · La Candelaria',
  },
  {
    value: 'Laureles / Estadio',
    label: 'Laureles / Estadio',
    comuna: 'Comuna 11 · Occidente',
  },
  {
    value: 'El Poblado',
    label: 'El Poblado',
    comuna: 'Comuna 14 · Suroriente',
  },
  {
    value: 'Aranjuez / Manrique',
    label: 'Aranjuez / Manrique',
    comuna: 'Comunas 3 y 4 · Nororiente',
  },
  {
    value: 'Belén',
    label: 'Belén',
    comuna: 'Comuna 16 · Suroccidente',
  },
  {
    value: 'Doce de Octubre / Robledo',
    label: 'Doce de Octubre / Robledo',
    comuna: 'Comunas 6 y 7 · Noroccidente',
  },
  {
    value: 'Castilla / Flórez',
    label: 'Castilla / Flórez',
    comuna: 'Comunas 5 y 12 · La América',
  },
  {
    value: 'Comuna 13 / San Javier',
    label: 'Comuna 13 / San Javier',
    comuna: 'Comuna 13 · Occidente',
  },
  {
    value: 'Buenos Aires / Villa Hermosa',
    label: 'Buenos Aires / Villa Hermosa',
    comuna: 'Comunas 8 y 9 · Centro Oriente',
  },
  {
    value: 'Guayabal / Cristo Rey',
    label: 'Guayabal / Cristo Rey',
    comuna: 'Comuna 15 · Sur',
  },
  {
    value: 'Popular / Santa Cruz',
    label: 'Popular / Santa Cruz',
    comuna: 'Comunas 1 y 2 · Nororiente',
  },
  {
    value: 'Itagüí / Envigado / Sabaneta (Área Metropolitana)',
    label: 'Itagüí / Envigado / Sabaneta (Área Metropolitana)',
    comuna: 'Valle de Aburrá Sur',
  },
  {
    value: 'Bello / Copacabana (Área Metropolitana Norte)',
    label: 'Bello / Copacabana (Área Metropolitana Norte)',
    comuna: 'Valle de Aburrá Norte',
  },
];

const CUSTOM_ZONE_VALUE = '__CUSTOM_ZONE__';

export interface CollectorUserRecord {
  uid: string;
  email: string;
  name: string;
  role: string;
  assignedRouteId: string;
  routeZone: string;
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
  currentAdminEmail?: string;
  currentOrganizationId?: string;
  currentUserRole?: 'super_admin' | 'admin';
  onCollectorCreated?: (collector: CollectorUserRecord) => void;
  onSwitchToCollectorView?: () => void;
}

export const AdminCollectorUsersManager: React.FC<AdminCollectorUsersManagerProps> = ({
  routes,
  onCollectorCreated,
  onSwitchToCollectorView,
}) => {
  const { profile, isSuperAdmin, isAdmin } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('cobrador123@Medellin');
  const [assignedRouteId, setAssignedRouteId] = useState(routes[0]?.id || 'route-1');

  // Estado del Selector Ampliado de Zonas y Comunas de Medellín
  const [zoneSearchFilter, setZoneSearchFilter] = useState('');
  const [selectedZoneOption, setSelectedZoneOption] = useState<string>(
    MEDELLIN_ZONES_CATALOG[0].value
  );
  const [customZoneText, setCustomZoneText] = useState<string>('');

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
      const mergedMap = new Map<string, CollectorUserRecord>();

      // 1. Consultar directamente Supabase (tabla public.profiles) si está configurado
      if (isLiveSupabaseConfigured) {
        const { data: sbCollectors, error: sbErr } = await supabase
          .from('profiles')
          .select('*')
          .in('role', ['collector', 'cobrador'])
          .order('created_at', { ascending: false });

        if (sbErr) {
          if (
            sbErr.code === 'PGRST205' ||
            sbErr.code === '42P01' ||
            sbErr.code === '42P17' ||
            sbErr.code === 'PGRST204'
          ) {
            console.info('ℹ️ [Supabase tabla profiles pendiente de ajuste SQL/RLS]: Cargando cobradores desde motor PostgreSQL (/api/collectors).');
          } else {
            console.warn('⚠️ [Supabase SELECT profiles (collector) Aviso]:', sbErr);
          }
        } else if (Array.isArray(sbCollectors)) {
          sbCollectors.forEach((u: any) => {
            const normEmail = (u.email || '').trim().toLowerCase();
            if (!normEmail) return;
            const assignedId = u.assigned_route_id || u.assignedRouteId || 'route-1';
            const fallbackRoute = routes.find((r) => r.id === assignedId);
            mergedMap.set(normEmail, {
              uid: u.id,
              email: u.email,
              name: u.full_name || u.name || 'Cobrador',
              role: u.role || 'collector',
              assignedRouteId: assignedId,
              routeZone: u.route_zone || u.routeZone || fallbackRoute?.zone || 'Centro / El Hueco',
              organizationId: u.organization_id || u.tenant_id || 'org-medellin-01',
              organizationName: u.organization_name || 'Fondo RutaCapital Medellín Central',
              createdBy: u.created_by || 'usr-admin-001',
              phone: u.phone || '',
              documentId: u.document_id || '',
              isActive: u.is_active ?? true,
              createdAt: u.created_at || new Date().toISOString(),
            });
          });
        }
      }

      // 2. Consultar también el backend PostgreSQL (/api/collectors)
      const res = await fetch('/api/collectors');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          data.forEach((u: any) => {
            const normEmail = (u.email || '').trim().toLowerCase();
            if (!normEmail || mergedMap.has(normEmail)) return;
            const assignedId = u.assignedRouteId || u.assigned_route_id || 'route-1';
            const fallbackRoute = routes.find((r) => r.id === assignedId);
            mergedMap.set(normEmail, {
              uid: u.uid || String(u.id),
              email: u.email,
              name: u.name,
              role: u.role || 'collector',
              assignedRouteId: assignedId,
              routeZone:
                u.routeZone ||
                u.route_zone ||
                fallbackRoute?.zone ||
                'Centro / El Hueco',
              organizationId: u.organizationId || u.organization_id || 'org-medellin-01',
              organizationName:
                u.organizationName ||
                u.organization_name ||
                'Fondo RutaCapital Medellín Central',
              createdBy: u.createdBy || u.created_by || 'usr-admin-001',
              phone: u.phone || '',
              documentId: u.documentId || u.document_id || '',
              isActive: u.isActive ?? u.is_active ?? true,
              createdAt: u.createdAt || u.created_at,
            });
          });
        }
      }

      const finalCollectors = Array.from(mergedMap.values());

      finalCollectors.forEach((col) => {
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
              routeZone: col.routeZone,
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

      setCollectors(finalCollectors);
    } catch (err) {
      console.warn('Aviso cargando listado de cobradores:', err);
    } finally {
      setIsLoadingList(false);
    }
  }, [routes]);

  useEffect(() => {
    loadCollectors();
  }, [loadCollectors]);

  if (!isAdmin) {
    return null;
  }

  // Filtrado de zonas de Medellín según buscador rápido
  const filteredZones = MEDELLIN_ZONES_CATALOG.filter(
    (z) =>
      z.label.toLowerCase().includes(zoneSearchFilter.toLowerCase()) ||
      z.comuna.toLowerCase().includes(zoneSearchFilter.toLowerCase())
  );

  // Zona efectiva final que se guardará en `route_zone` (profiles) y `zone` (routes)
  const resolvedRouteZone =
    selectedZoneOption === CUSTOM_ZONE_VALUE ? customZoneText.trim() : selectedZoneOption;

  // AISLAMIENTO RLS DE SEGUNDO NIVEL:
  // Super Admin ve todos; Admin ve solo los cobradores que él creó o de su organización
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
      setErrorMsg(
        'Completa Nombre completo, Correo electrónico, Contraseña temporal y Ruta Asignada.'
      );
      return;
    }

    if (!resolvedRouteZone) {
      setErrorMsg('Por favor selecciona una zona de Medellín o escribe la zona personalizada.');
      return;
    }

    if (password.trim().length < 6) {
      setErrorMsg(
        'La contraseña temporal debe tener al menos 6 caracteres (requisito de Supabase Auth).'
      );
      return;
    }

    setIsSubmitting(true);

    const { profile: createdProfile, error } = await registerNewCollectorAccount({
      email: email.trim(),
      password: password.trim(),
      fullName: fullName.trim(),
      assignedRouteId,
      routeZone: resolvedRouteZone,
      organizationId: profile?.organizationId || 'org-medellin-01',
      organizationName: profile?.organizationName || 'Fondo RutaCapital Medellín Central',
      createdByAdminId: profile?.id || 'usr-admin-001',
      phone: phone.trim(),
      documentId: documentId.trim(),
    });

    setIsSubmitting(false);

    if (error || !createdProfile) {
      console.warn('⚠️ [Aviso de validación al crear Cobrador]:', error);
      setErrorMsg(error || 'Error al guardar en base de datos: No se pudo crear el usuario cobrador.');
      return;
    }

    const newCollectorRecord: CollectorUserRecord = {
      uid: createdProfile.id,
      email: createdProfile.email,
      name: createdProfile.fullName,
      role: 'collector',
      assignedRouteId: createdProfile.assignedRouteId || assignedRouteId,
      routeZone: createdProfile.routeZone || resolvedRouteZone,
      organizationId: createdProfile.organizationId || profile?.organizationId || 'org-medellin-01',
      organizationName:
        createdProfile.organizationName ||
        profile?.organizationName ||
        'Fondo RutaCapital Medellín',
      createdBy: createdProfile.createdBy || profile?.id || 'usr-admin-001',
      phone: createdProfile.phone,
      documentId: createdProfile.documentId,
      isActive: true,
      createdAt: createdProfile.createdAt,
    };

    setCollectors((prev) => [
      newCollectorRecord,
      ...prev.filter((c) => c.email !== newCollectorRecord.email),
    ]);

    if (onCollectorCreated) {
      onCollectorCreated(newCollectorRecord);
    }

    setSuccessMsg(
      `¡Cobrador ${createdProfile.fullName} registrado! Zona asignada en perfil (route_zone): "${resolvedRouteZone}" vinculada a la ruta ${assignedRouteId}.`
    );

    setFullName('');
    setEmail('');
    setPhone('');
    setDocumentId('');
    if (selectedZoneOption === CUSTOM_ZONE_VALUE) {
      setCustomZoneText('');
    }
  };

  const handleTestCollectorLogin = (collectorEmail: string) => {
    if (onSwitchToCollectorView) {
      onSwitchToCollectorView();
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
      {/* ENCABEZADO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              Nivel 2 → Nivel 3: Gestión de Cobradores y Zonas de Medellín
            </span>
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {isSuperAdmin
                ? 'Vista Global Super Admin'
                : `${profile?.organizationName || 'Mi Fondo'} (${
                    profile?.organizationId || 'org-medellin-01'
                  })`}
            </span>
          </div>
          <h3 className="text-lg font-bold text-white mt-1.5 flex items-center gap-2">
            <Bike className="w-5 h-5 text-emerald-400" />
            Creación de Cobradores y Asignación de Comunas / Zonas en Medellín
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Selecciona la comuna o zona metropolitana de Medellín y guárdala directamente en{' '}
            <code className="text-emerald-300 font-mono">profiles.route_zone</code> y{' '}
            <code className="text-emerald-300 font-mono">routes.zone</code>.
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
            <span className="text-sm font-bold text-white font-mono tabular-nums">
              {visibleCollectors.length} Activos
            </span>
          </div>
        </div>
      </div>

      {/* CONTENIDO EN 2 COLUMNAS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-5">
        {/* COLUMNA IZQUIERDA: FORMULARIO DE ALTA DE COBRADOR Y SELECTOR DE ZONAS DE MEDELLÍN */}
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
              route_zone + RLS
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
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500"
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
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
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
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-3.5 py-2.5 text-emerald-300 font-mono font-bold focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* =====================================================================
              4. SELECTOR DE ZONAS AMPLIADO (COMUNAS Y ZONAS DE MEDELLÍN + PERSONALIZADA)
             ===================================================================== */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-emerald-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-emerald-300 font-semibold flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-emerald-400" />
                4. Zona / Comuna de Cobro en Medellín *
              </label>
              <span className="text-[10px] font-mono text-slate-400">profiles.route_zone</span>
            </div>

            {/* Buscador rápido para filtrar comunas/zonas */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filtrar comuna o barrio (ej: Laureles, Hueco, Envigado...)"
                value={zoneSearchFilter}
                onChange={(e) => setZoneSearchFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Menú desplegable (<select>) con todas las zonas de Medellín + Opción Personalizada */}
            <div className="relative">
              <MapPin className="w-4 h-4 text-emerald-400 absolute left-3 top-2.5" />
              <select
                value={selectedZoneOption}
                onChange={(e) => setSelectedZoneOption(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-white font-semibold focus:outline-none focus:border-emerald-500"
              >
                <optgroup label="Comunas y Zonas Principales de Medellín">
                  {(filteredZones.length > 0 ? filteredZones : MEDELLIN_ZONES_CATALOG).map((z) => (
                    <option key={z.value} value={z.value}>
                      {z.label} — ({z.comuna})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Zona Abierta / Personalizada">
                  <option value={CUSTOM_ZONE_VALUE}>
                    + Otra zona personalizada (Escribir texto libre)...
                  </option>
                </optgroup>
              </select>
            </div>

            {/* Campo de texto libre si el usuario elige "Otra zona personalizada" */}
            {selectedZoneOption === CUSTOM_ZONE_VALUE && (
              <div className="pt-1">
                <label className="block text-[11px] text-amber-300 font-semibold mb-1">
                  Escribe el nombre de la Zona o Barrio personalizado *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ej. Barrio Antioquia / Guayabal, San Antonio de Prado, Rionegro..."
                  value={customZoneText}
                  onChange={(e) => setCustomZoneText(e.target.value)}
                  className="w-full bg-slate-950 border border-amber-500/50 focus:border-amber-400 rounded-lg px-3 py-2 text-white font-medium focus:outline-none"
                />
              </div>
            )}

            {/* Código de Ruta Técnica Vinculada (assigned_route_id) */}
            <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between gap-2">
              <label className="text-[11px] text-slate-400 shrink-0">
                ID de Ruta (<code className="font-mono text-slate-300">route_id</code>):
              </label>
              <select
                value={assignedRouteId}
                onChange={(e) => setAssignedRouteId(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              >
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} ({r.code})
                  </option>
                ))}
                <option value={`route-${routes.length + 1}`}>
                  + Crear nueva ruta (route-{routes.length + 1})
                </option>
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
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-2.5 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
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
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-2.5 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            {isSubmitting
              ? 'Guardando en profiles & routes...'
              : 'Asignar Cobrador y Guardar Zona'}
          </button>
        </form>

        {/* COLUMNA DERECHA: DIRECTORIO DE COBRADORES Y ZONAS ASIGNADAS */}
        <div className="lg:col-span-7 flex flex-col justify-between bg-slate-950/50 border border-slate-800 rounded-xl p-4">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Bike className="w-4 h-4 text-emerald-400" />
                {isSuperAdmin
                  ? 'Directorio Global de Cobradores y Zonas Asignadas'
                  : `Cobradores de ${profile?.organizationName || 'Mi Fondo'} y Zonas en Medellín`}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {isLoadingList ? 'Sincronizando...' : `${visibleCollectors.length} registros`}
              </span>
            </div>

            {visibleCollectors.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-xs text-slate-400">
                  No hay cobradores registrados aún en esta organización.
                </p>
                <p className="text-[11px] text-slate-500">
                  Usa el formulario para crear un cobrador y asignarle su comuna o zona en Medellín.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase">
                      <th className="py-2 px-2">Cobrador / Correo</th>
                      <th className="py-2 px-2">Zona de Medellín (route_zone)</th>
                      <th className="py-2 px-2">Ruta ID</th>
                      <th className="py-2 px-2 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {visibleCollectors.map((col) => {
                      const routeObj = routes.find((r) => r.id === col.assignedRouteId);
                      const displayZone =
                        col.routeZone || routeObj?.zone || 'Centro / El Hueco';
                      return (
                        <tr key={col.uid} className="hover:bg-slate-900/60 transition-colors">
                          <td className="py-2.5 px-2">
                            <div className="font-bold text-white">{col.name}</div>
                            <div className="text-[11px] text-emerald-400 font-mono">
                              {col.email}
                            </div>
                          </td>
                          <td className="py-2.5 px-2">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span>{displayZone}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-2 font-mono text-[11px] text-slate-300">
                            {col.assignedRouteId}
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleTestCollectorLogin(col.email)}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white border border-slate-700 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <LogIn className="w-3 h-3" />
                              Ver Ruta
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
              Sincronización automática en{' '}
              <code className="text-emerald-300 font-mono">profiles.route_zone</code> y{' '}
              <code className="text-emerald-300 font-mono">routes.zone</code>.
            </span>
            <span className="font-mono text-[10px] text-slate-500">
              Medellín & Área Metropolitana
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
