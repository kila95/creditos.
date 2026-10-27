import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, UserRole, AuthSession } from '../types/auth';

// Configuración de Supabase (Variables de entorno con fallback amigable)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://demo-rutacapital.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo-key';

export const isLiveSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && 
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  !import.meta.env.VITE_SUPABASE_URL.includes('demo-rutacapital')
);

// Cliente real de Supabase
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});

// ==============================================================================
// JERARQUÍA DE 3 NIVELES PRE-CONFIGURADA (super_admin -> admin -> collector)
// ==============================================================================
export const DEMO_USERS: Record<string, { password: string; profile: UserProfile }> = {
  'superadmin@rutacapital.co': {
    password: 'super123@Medellin',
    profile: {
      id: 'usr-super-000',
      email: 'superadmin@rutacapital.co',
      fullName: 'Esteban Ochoa (Super Admin Global)',
      role: 'super_admin',
      organizationId: 'org-global-hq',
      organizationName: 'RutaCapital Holding Matriz',
      phone: '+57 312 890 1234',
      partnerEquityPct: 100.0,
      capitalInvestedCop: 100000000,
      documentId: 'CC 71.392.810',
      isActive: true,
      createdAt: '2025-01-01T08:00:00Z',
    }
  },
  'admin@rutacapital.co': {
    password: 'admin123@Medellin',
    profile: {
      id: 'usr-admin-001',
      email: 'admin@rutacapital.co',
      fullName: 'Carlos Andrés Vélez (Admin Fondo Medellín)',
      role: 'admin',
      organizationId: 'org-medellin-01',
      organizationName: 'Fondo RutaCapital Medellín Central',
      createdBy: 'usr-super-000',
      phone: '+57 310 411 2233',
      partnerEquityPct: 40.0,
      capitalInvestedCop: 40000000,
      documentId: 'CC 71.882.104',
      isActive: true,
      createdAt: '2025-01-02T08:00:00Z',
    }
  },
  'admin2@rutacapital.co': {
    password: 'admin123@Medellin',
    profile: {
      id: 'usr-admin-002',
      email: 'admin2@rutacapital.co',
      fullName: 'Jorge Iván Montoya (Admin Fondo Norte)',
      role: 'admin',
      organizationId: 'org-norte-02',
      organizationName: 'Fondo Microcrédito Bello & Norte',
      createdBy: 'usr-super-000',
      phone: '+57 311 522 8899',
      partnerEquityPct: 30.0,
      capitalInvestedCop: 30000000,
      documentId: 'CC 98.541.220',
      isActive: true,
      createdAt: '2025-01-03T08:00:00Z',
    }
  },
  'socio1@rutacapital.co': {
    password: 'socio123@Medellin',
    profile: {
      id: 'usr-socio-002',
      email: 'socio1@rutacapital.co',
      fullName: 'Dr. Alejandro Restrepo (Socio Inversionista A)',
      role: 'socio',
      organizationId: 'org-medellin-01',
      organizationName: 'Fondo RutaCapital Medellín Central',
      createdBy: 'usr-admin-001',
      phone: '+57 300 456 7890',
      partnerEquityPct: 35.0,
      capitalInvestedCop: 35000000,
      documentId: 'CC 98.765.432',
      isActive: true,
      createdAt: '2025-01-05T08:00:00Z',
    }
  },
  'socio2@rutacapital.co': {
    password: 'socio123@Medellin',
    profile: {
      id: 'usr-socio-003',
      email: 'socio2@rutacapital.co',
      fullName: 'Dra. Valentina Giraldo (Socio Inversionista B)',
      role: 'socio',
      organizationId: 'org-medellin-01',
      organizationName: 'Fondo RutaCapital Medellín Central',
      createdBy: 'usr-admin-001',
      phone: '+57 311 234 5678',
      partnerEquityPct: 25.0,
      capitalInvestedCop: 25000000,
      documentId: 'CC 1.037.620.198',
      isActive: true,
      createdAt: '2025-01-10T08:00:00Z',
    }
  },
  'cobrador@rutacapital.co': {
    password: 'cobrador123@Medellin',
    profile: {
      id: 'usr-collector-004',
      email: 'cobrador@rutacapital.co',
      fullName: 'Jhon Alexander Zapata (Collector San Javier)',
      role: 'collector',
      organizationId: 'org-medellin-01',
      organizationName: 'Fondo RutaCapital Medellín Central',
      createdBy: 'usr-admin-001',
      phone: '+57 314 555 9012',
      assignedRouteId: 'route-1',
      documentId: 'CC 1.017.543.210',
      isActive: true,
      createdAt: '2025-01-15T08:00:00Z',
    }
  },
  'cobrador2@rutacapital.co': {
    password: 'cobrador123@Medellin',
    profile: {
      id: 'usr-collector-005',
      email: 'cobrador2@rutacapital.co',
      fullName: 'Carlos Mario Henao (Collector Manrique)',
      role: 'collector',
      organizationId: 'org-medellin-01',
      organizationName: 'Fondo RutaCapital Medellín Central',
      createdBy: 'usr-admin-001',
      phone: '+57 301 445 9932',
      assignedRouteId: 'route-2',
      documentId: 'CC 70.892.411',
      isActive: true,
      createdAt: '2025-01-18T08:00:00Z',
    }
  },
  'cliente@ejemplo.com': {
    password: 'cliente123@Medellin',
    profile: {
      id: 'usr-client-006',
      email: 'cliente@ejemplo.com',
      fullName: 'Doña Gloria Inés Montoya (Cliente - Peluquería)',
      role: 'cliente',
      organizationId: 'org-medellin-01',
      createdBy: 'usr-admin-001',
      phone: '+57 310 987 6543',
      documentId: 'CC 43.876.543',
      isActive: true,
      createdAt: '2025-01-20T08:00:00Z',
    }
  }
};

const LOCAL_STORAGE_SESSION_KEY = 'rutacapital_auth_session';
const LOCAL_STORAGE_REMEMBER_KEY = 'rutacapital_remember_collector';

import { getDeviceFingerprint } from '../utils/deviceFingerprint';

/**
 * Autenticación de usuario con Correo y Contraseña (3 niveles: super_admin, admin, collector)
 */
export async function signInWithEmailPassword(
  email: string, 
  password: string,
  rememberMe: boolean = true
): Promise<{ session: AuthSession | null; error: string | null }> {
  const deviceFingerprint = getDeviceFingerprint();

  if (isLiveSupabaseConfigured) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (error) {
        return { session: null, error: error.message };
      }

      if (data.user) {
        const { data: profileData, error: profileErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        if (profileErr || !profileData) {
          return { 
            session: null, 
            error: 'Usuario autenticado pero no se encontró un perfil activo en la tabla profiles.' 
          };
        }

        const isCollector = profileData.role === 'collector' || profileData.role === 'cobrador';
        if (isCollector) {
          if (!profileData.authorized_device_id) {
            // Primer inicio de sesión del cobrador: capturar y registrar el identificador del dispositivo en Supabase
            await supabase
              .from('profiles')
              .update({ authorized_device_id: deviceFingerprint, device_approved: true })
              .eq('id', profileData.id);
            profileData.authorized_device_id = deviceFingerprint;
          } else if (profileData.authorized_device_id !== deviceFingerprint) {
            await supabase.auth.signOut();
            return {
              session: null,
              error: '⚠️ Dispositivo No Autorizado: Este equipo no está registrado para su cuenta de cobrador. Solicite la aprobación de su Administrador para autorizar este nuevo dispositivo.'
            };
          }
        }

        const session: AuthSession = {
          user: { id: data.user.id, email: data.user.email || email },
          profile: {
            id: profileData.id,
            email: profileData.email,
            fullName: profileData.full_name,
            role: profileData.role as UserRole,
            organizationId: profileData.organization_id || data.user.user_metadata?.organization_id || 'org-medellin-01',
            organizationName: profileData.organization_name || data.user.user_metadata?.organization_name || 'Fondo RutaCapital',
            createdBy: profileData.created_by || data.user.user_metadata?.created_by,
            assignedRouteId: profileData.assigned_route_id || data.user.user_metadata?.assigned_route_id || 'route-1',
            routeZone: profileData.route_zone || data.user.user_metadata?.route_zone || '',
            phone: profileData.phone,
            partnerEquityPct: profileData.partner_equity_pct,
            capitalInvestedCop: profileData.capital_invested_cop,
            documentId: profileData.document_id,
            isActive: profileData.is_active,
            createdAt: profileData.created_at
          },
          token: data.session?.access_token
        };

        localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(session));
        return { session, error: null };
      }
    } catch (err: unknown) {
      console.warn('Error conectando a Supabase Live, usando motor RBAC / Cloud SQL:', err);
    }
  }

  const normalizedEmail = email.trim().toLowerCase();

  // 2. Verificar contra la tabla `users` en Cloud SQL PostgreSQL con Device Fingerprinting
  try {
    const dbAuthRes = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password, deviceFingerprint }),
    });

    if (dbAuthRes.ok) {
      const dbUser = await dbAuthRes.json();
      const dbProfile: UserProfile = {
        id: dbUser.id,
        email: dbUser.email,
        fullName: dbUser.fullName,
        role: (dbUser.role as UserRole) || 'collector',
        organizationId: dbUser.organizationId || 'org-medellin-01',
        organizationName: dbUser.organizationName || 'Fondo RutaCapital Medellín',
        createdBy: dbUser.createdBy || 'usr-admin-001',
        assignedRouteId: dbUser.assignedRouteId || 'route-1',
        routeZone: dbUser.routeZone || '',
        phone: dbUser.phone || '',
        documentId: dbUser.documentId || '',
        isActive: dbUser.isActive ?? true,
        createdAt: dbUser.createdAt || new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };

      DEMO_USERS[normalizedEmail] = {
        password,
        profile: dbProfile,
      };

      const session: AuthSession = {
        user: { id: dbProfile.id, email: dbProfile.email },
        profile: dbProfile,
        token: `token-rbac-db-${Date.now()}`,
      };

      localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(session));
      return { session, error: null };
    } else if (dbAuthRes.status === 401) {
      const errData = await dbAuthRes.json().catch(() => ({}));
      if (errData.error && errData.error.includes('EQUIPO_NO_AUTORIZADO')) {
        return {
          session: null,
          error: '⚠️ Dispositivo No Autorizado: Este equipo no está registrado para su cuenta de cobrador. Solicite la aprobación de su Administrador para autorizar este nuevo dispositivo.',
        };
      }
      const demoUser = DEMO_USERS[normalizedEmail];
      if (!demoUser || demoUser.password !== password) {
        return {
          session: null,
          error: errData.error || 'Contraseña incorrecta para la cuenta ingresada.',
        };
      }
    }
  } catch (dbErr) {
    console.warn('Aviso consultando /api/auth/login, verificando usuarios preconfigurados:', dbErr);
  }

  // 3. Fallback / Usuarios preconfigurados del sistema RBAC
  const foundUser = DEMO_USERS[normalizedEmail];

  if (!foundUser) {
    return { 
      session: null, 
      error: 'Credenciales inválidas. Correo no registrado en el sistema de seguridad de RutaCapital.' 
    };
  }

  if (foundUser.password !== password) {
    return { 
      session: null, 
      error: 'Contraseña incorrecta. Verifique su clave o solicite restablecimiento al Super Admin / Admin.' 
    };
  }

  if (!foundUser.profile.isActive) {
    return { 
      session: null, 
      error: 'La cuenta se encuentra inactiva o suspendida por auditoría interna.' 
    };
  }

  const session: AuthSession = {
    user: {
      id: foundUser.profile.id,
      email: foundUser.profile.email
    },
    profile: { ...foundUser.profile, lastLoginAt: new Date().toISOString() },
    token: `token-rbac-jwt-${Date.now()}`
  };

  localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(session));

  if (rememberMe) {
    localStorage.setItem(LOCAL_STORAGE_REMEMBER_KEY, normalizedEmail);
  } else {
    localStorage.removeItem(LOCAL_STORAGE_REMEMBER_KEY);
  }

  return { session, error: null };
}

/**
 * NIVEL 1 -> NIVEL 2: Creación de Nueva Cuenta de Administrador ('admin') por el 'super_admin'
 */
export async function registerNewAdminAccount(input: {
  email: string;
  password: string;
  fullName: string;
  organizationName: string;
  createdBySuperAdminId: string;
  phone?: string;
  documentId?: string;
}): Promise<{ profile: UserProfile | null; error: string | null }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  let generatedUid = `usr-adm-${Date.now().toString().slice(-6)}`;
  const generatedOrgId = `org-${input.organizationName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 16)}-${Date.now().toString().slice(-4)}`;

  try {
    if (isLiveSupabaseConfigured) {
      const superProvisionClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: signUpData, error: signUpError } = await superProvisionClient.auth.signUp({
        email: normalizedEmail,
        password: input.password,
        options: {
          data: {
            full_name: input.fullName.trim(),
            role: 'admin',
            organization_id: generatedOrgId,
            organization_name: input.organizationName.trim(),
            created_by: input.createdBySuperAdminId,
          },
        },
      });

      if (signUpError) {
        console.error('❌ [Supabase Auth SignUp Error - Admin]:', signUpError);
        return {
          profile: null,
          error: `Error en Supabase Auth (auth.users): ${signUpError.message}`,
        };
      }

      if (signUpData.user?.id) {
        generatedUid = signUpData.user.id;
      }

      const { error: profileError } = await supabase.from('profiles').upsert([
        {
          id: generatedUid,
          email: normalizedEmail,
          full_name: input.fullName.trim(),
          role: 'admin',
          organization_id: generatedOrgId,
          organization_name: input.organizationName.trim(),
          created_by: input.createdBySuperAdminId,
          phone: input.phone?.trim() || null,
          document_id: input.documentId?.trim() || null,
          is_active: true,
        },
      ]);

      if (profileError) {
        console.error('❌ [Supabase Profiles Upsert Error - Admin]:', profileError);
        return {
          profile: null,
          error: `Error al vincular perfil Admin en tabla profiles (RLS): ${profileError.message}`,
        };
      }
    }

    const payload = {
      uid: generatedUid,
      email: normalizedEmail,
      password: input.password,
      name: input.fullName.trim(),
      organizationId: generatedOrgId,
      organizationName: input.organizationName.trim(),
      createdBy: input.createdBySuperAdminId,
      phone: input.phone?.trim() || '',
      documentId: input.documentId?.trim() || '',
    };

    const targetAdminApiUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/admins`;
    console.log('🔍 [DEBUG registerNewAdminAccount - API Payload & Tenant ID]:', {
      endpoint: targetAdminApiUrl,
      tenant_id: generatedOrgId,
      payload,
      headers: { 'Content-Type': 'application/json' }
    });

    try {
      const apiRes = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('🔍 [DEBUG registerNewAdminAccount - API Response Status]:', {
        status: apiRes.status,
        ok: apiRes.ok
      });

      if (!apiRes.ok) {
        const errBody = await apiRes.json().catch(() => ({}));
        console.warn(`⚠️ [/api/admins HTTP ${apiRes.status}]: Backend devolvió error o 404 (${errBody.error || 'Endpoint no disponible en preview estática'}). Se registrará la cuenta localmente en modo resiliente.`);
      }
    } catch (fetchErr) {
      console.warn('⚠️ [API Fetch Error /api/admins]: Servidor no alcanzable de inmediato. Guardando cuenta en caché local:', fetchErr);
    }

    const newAdminProfile: UserProfile = {
      id: generatedUid,
      email: normalizedEmail,
      fullName: input.fullName.trim(),
      role: 'admin',
      organizationId: generatedOrgId,
      organizationName: input.organizationName.trim(),
      createdBy: input.createdBySuperAdminId,
      phone: input.phone?.trim() || '',
      documentId: input.documentId?.trim() || '',
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    DEMO_USERS[normalizedEmail] = {
      password: input.password,
      profile: newAdminProfile,
    };

    return { profile: newAdminProfile, error: null };
  } catch (err: any) {
    console.error('❌ [Excepción creando administrador]:', err);
    return {
      profile: null,
      error: err?.message || 'Error inesperado al crear la cuenta de Administrador.',
    };
  }
}

/**
 * NIVEL 2 -> NIVEL 3: Creación de Nuevo Usuario Cobrador ('collector') por un 'admin'
 */
export async function registerNewCollectorAccount(input: {
  email: string;
  password: string;
  fullName: string;
  assignedRouteId: string;
  routeZone: string;
  organizationId?: string;
  organizationName?: string;
  createdByAdminId?: string;
  phone?: string;
  documentId?: string;
}): Promise<{ profile: UserProfile | null; error: string | null }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  let generatedUid = `usr-col-${Date.now().toString().slice(-6)}`;
  const orgId = input.organizationId || 'org-medellin-01';
  const orgName = input.organizationName || 'Fondo RutaCapital Medellín';
  const creatorId = input.createdByAdminId || 'usr-admin-001';
  const cleanRouteZone = input.routeZone.trim() || 'Centro / El Hueco';

  try {
    if (isLiveSupabaseConfigured) {
      const adminProvisionClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });

      const { data: signUpData, error: signUpError } = await adminProvisionClient.auth.signUp({
        email: normalizedEmail,
        password: input.password,
        options: {
          data: {
            full_name: input.fullName.trim(),
            role: 'collector',
            assigned_route_id: input.assignedRouteId,
            route_zone: cleanRouteZone,
            organization_id: orgId,
            organization_name: orgName,
            created_by: creatorId,
          },
        },
      });

      if (signUpError) {
        console.error('❌ [Supabase Auth SignUp Error]:', signUpError);
        return {
          profile: null,
          error: `Error en Supabase Auth (auth.users): ${signUpError.message}`,
        };
      }

      if (signUpData.user?.id) {
        generatedUid = signUpData.user.id;
      }

      // 1. Guardar el perfil del cobrador incluyendo `route_zone` en la tabla `profiles`
      const { error: profileError } = await supabase.from('profiles').upsert([
        {
          id: generatedUid,
          email: normalizedEmail,
          full_name: input.fullName.trim(),
          role: 'collector',
          assigned_route_id: input.assignedRouteId,
          route_zone: cleanRouteZone,
          organization_id: orgId,
          organization_name: orgName,
          created_by: creatorId,
          phone: input.phone?.trim() || null,
          document_id: input.documentId?.trim() || null,
          is_active: true,
        },
      ]);

      if (profileError) {
        console.error('❌ [Supabase Profiles Upsert Error]:', profileError);
        return {
          profile: null,
          error: `Error al vincular perfil en tabla profiles (RLS): ${profileError.message}`,
        };
      }

      // 2. Actualizar también la tabla `routes` en Supabase asociando la zona (`zone`) y el cobrador
      await supabase
        .from('routes')
        .update({
          collector_id: generatedUid,
          collector_name: input.fullName.trim(),
          zone: cleanRouteZone,
        })
        .eq('id', input.assignedRouteId);
    }

    const apiRes = await fetch('/api/collectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: generatedUid,
        email: normalizedEmail,
        password: input.password,
        name: input.fullName.trim(),
        assignedRouteId: input.assignedRouteId,
        routeZone: cleanRouteZone,
        organizationId: orgId,
        organizationName: orgName,
        createdBy: creatorId,
        phone: input.phone?.trim() || '',
        documentId: input.documentId?.trim() || '',
      }),
    });

    if (!apiRes.ok) {
      const errBody = await apiRes.json().catch(() => ({}));
      console.error('❌ [Error creando cobrador en /api/collectors]:', errBody);
      return {
        profile: null,
        error: errBody.error || 'No se pudo registrar el cobrador en la base de datos.',
      };
    }

    const newProfile: UserProfile = {
      id: generatedUid,
      email: normalizedEmail,
      fullName: input.fullName.trim(),
      role: 'collector',
      organizationId: orgId,
      organizationName: orgName,
      createdBy: creatorId,
      assignedRouteId: input.assignedRouteId,
      routeZone: cleanRouteZone,
      phone: input.phone?.trim() || '',
      documentId: input.documentId?.trim() || '',
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    DEMO_USERS[normalizedEmail] = {
      password: input.password,
      profile: newProfile,
    };

    return { profile: newProfile, error: null };
  } catch (err: any) {
    console.error('❌ [Excepción creando cobrador]:', err);
    return {
      profile: null,
      error: err?.message || 'Error inesperado al crear la cuenta del cobrador.',
    };
  }
}

export function getRememberedCollectorEmail(): string | null {
  return localStorage.getItem(LOCAL_STORAGE_REMEMBER_KEY);
}

export async function signOutUser(): Promise<void> {
  if (isLiveSupabaseConfigured) {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Error cerrando sesión en Supabase:', e);
    }
  }
  localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
}

export function getStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch (e) {
    console.error('Error leyendo sesión almacenada:', e);
    return null;
  }
}

/**
 * Validar si un rol tiene autorización ejecutiva ('super_admin', 'admin' o 'socio')
 */
export function hasExecutiveClearance(role: UserRole | undefined): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'socio';
}
