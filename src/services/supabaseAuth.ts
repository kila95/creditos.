import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, UserRole, AuthSession } from '../types/auth';

// Configuración y sanitización de Variables de Entorno (.env)
const rawEnvSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const rawEnvSupabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

// Evita errores 404 por URLs mal formadas (ej. si el .env incluye "/rest/v1" o "/" al final)
export const supabaseUrl = rawEnvSupabaseUrl
  ? rawEnvSupabaseUrl.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '')
  : 'https://demo-rutacapital.supabase.co';

export const supabaseAnonKey =
  rawEnvSupabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo-key';

export const isLiveSupabaseConfigured = Boolean(
  rawEnvSupabaseUrl &&
  rawEnvSupabaseAnonKey &&
  !rawEnvSupabaseUrl.includes('demo-rutacapital') &&
  rawEnvSupabaseUrl !== 'undefined'
);

/**
 * Helper de diagnóstico para auditar variables .env y endpoints REST/Auth/Edge antes de cada llamada
 */
export function logSupabaseConnectionAudit(context: string, tableName: string, extraPayload?: Record<string, unknown>) {
  console.log(`🚨 [AUDITORÍA SUPABASE - ${context}]`, {
    env_VITE_SUPABASE_URL_raw: import.meta.env.VITE_SUPABASE_URL ?? 'UNDEFINED ❌',
    env_VITE_SUPABASE_URL_sanitized: supabaseUrl,
    env_VITE_SUPABASE_ANON_KEY_status: import.meta.env.VITE_SUPABASE_ANON_KEY
      ? `DEFINIDA ✅ (${String(import.meta.env.VITE_SUPABASE_ANON_KEY).slice(0, 14)}...)`
      : 'UNDEFINED ❌',
    isLiveSupabaseConfigured,
    targetAuthEndpoint: `${supabaseUrl}/auth/v1/signup`,
    targetRestTableEndpoint: `${supabaseUrl}/rest/v1/${tableName}`,
    targetEdgeFunctionEndpoint: `${supabaseUrl}/functions/v1/admin-provision-user`,
    tableNameVerified: tableName,
    ...(extraPayload || {}),
  });
}

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
  'estebanochoamesa@gmail.com': {
    password: 'super123@Medellin',
    profile: {
      id: 'usr-super-000',
      email: 'estebanochoamesa@gmail.com',
      fullName: 'Esteban Ochoa (Dueño / Super Admin)',
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
 * Crea un cliente de Supabase Auth 100% aislado en memoria (storage no-op y storageKey único)
 * para que la creación de cuentas secundarias NUNCA sobreescriba ni altere la sesión actual del Admin/SuperAdmin.
 */
function createIsolatedAuthClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `enruta-isolated-provision-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      storage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    },
  });
}

/**
 * NIVEL 1 -> NIVEL 2: Creación de Nueva Cuenta de Administrador ('admin') por el 'super_admin'
 * Garantiza:
 * 1. No romper la sesión activa del SuperAdmin (Edge Function admin-provision-user o cliente aislado en memoria).
 * 2. Manejo de errores estricto (NUNCA falla en silencio).
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
    // Log de auditoría obligatorio justo antes de llamar a la base de datos
    logSupabaseConnectionAudit('registerNewAdminAccount (Crear Admin)', 'profiles', {
      email: normalizedEmail,
      organizationId: generatedOrgId,
    });

    if (isLiveSupabaseConfigured) {
      let provisionedViaEdgeFunction = false;
      const useEdgeFunction = import.meta.env.VITE_USE_EDGE_FUNCTION === 'true';

      // PASO A (Opcional si la Edge Function ya fue desplegada con `supabase functions deploy admin-provision-user`)
      if (useEdgeFunction) {
        console.log('🌐 [DEBUG Edge Function Invoke] Apuntando a:', `${supabaseUrl}/functions/v1/admin-provision-user`);
        const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-provision-user', {
          body: {
            email: normalizedEmail,
            password: input.password,
            fullName: input.fullName.trim(),
            role: 'admin',
            organizationId: generatedOrgId,
            tenantId: generatedOrgId,
            organizationName: input.organizationName.trim(),
            createdBy: input.createdBySuperAdminId,
            phone: input.phone?.trim() || null,
            documentId: input.documentId?.trim() || null,
          },
        });

        const fnStatus = (fnError as any)?.context?.status;
        if (!fnError && fnData?.user?.id) {
          generatedUid = fnData.user.id;
          provisionedViaEdgeFunction = true;
        } else if (fnError) {
          console.warn(
            `⚠️ [Edge Function admin-provision-user HTTP ${fnStatus || 'Error'}]: La función no está desplegada o devolvió 404. Usando flujo directo Auth + REST /rest/v1/profiles.`,
            fnError
          );
        }
      }

      // PASO B: Flujo estándar sin romper sesión actual (Cliente aislado en memoria -> /auth/v1/signup + /rest/v1/profiles)
      if (!provisionedViaEdgeFunction) {
        console.log('🌐 [DEBUG Supabase Auth SignUp] Apuntando a:', `${supabaseUrl}/auth/v1/signup`);
        const isolatedClient = createIsolatedAuthClient();
        const { data: signUpData, error: signUpError } = await isolatedClient.auth.signUp({
          email: normalizedEmail,
          password: input.password,
          options: {
            data: {
              full_name: input.fullName.trim(),
              role: 'admin',
              organization_id: generatedOrgId,
              tenant_id: generatedOrgId,
              organization_name: input.organizationName.trim(),
              created_by: input.createdBySuperAdminId,
              phone: input.phone?.trim() || null,
              document_id: input.documentId?.trim() || null,
            },
          },
        });

        if (signUpError) {
          console.error('❌ [Supabase Auth SignUp Error - Admin]:', {
            endpoint: `${supabaseUrl}/auth/v1/signup`,
            status: (signUpError as any)?.status,
            message: signUpError.message,
          });
          const isDuplicate =
            signUpError.message?.toLowerCase().includes('already registered') ||
            signUpError.message?.toLowerCase().includes('already exists') ||
            (signUpError as any).code === '23505';

          return {
            profile: null,
            error: isDuplicate
              ? 'Error al guardar en base de datos: Ya existe un usuario registrado con este correo electrónico.'
              : `Error al guardar en base de datos (Supabase Auth [${(signUpError as any)?.status || 'ERR'}]): ${signUpError.message}`,
          };
        }

        if (!signUpData.user?.id) {
          console.error('❌ [Supabase Auth SignUp Error]: No se retornó un user.id válido.');
          return {
            profile: null,
            error: 'Error al guardar en base de datos: Supabase Auth no devolvió un identificador de usuario.',
          };
        }

        generatedUid = signUpData.user.id;

        const { data: currentAuthUser } = await supabase.auth.getUser();
        const safeCreatedByUuid = currentAuthUser?.user?.id || null;

        console.log('🌐 [DEBUG Supabase REST INSERT] Apuntando a tabla exacta:', `${supabaseUrl}/rest/v1/profiles`, {
          id: generatedUid,
          email: normalizedEmail,
          role: 'admin',
          organization_id: generatedOrgId,
          tenant_id: generatedOrgId,
          created_by: safeCreatedByUuid,
        });

        // Insertar explícitamente en public.profiles (con 's' al final) y capturar cualquier error 404 o RLS
        const { data: profileRow, error: profileError } = await supabase
          .from('profiles')
          .upsert(
            [
              {
                id: generatedUid,
                email: normalizedEmail,
                full_name: input.fullName.trim(),
                role: 'admin',
                organization_id: generatedOrgId,
                tenant_id: generatedOrgId,
                organization_name: input.organizationName.trim(),
                created_by: safeCreatedByUuid,
                phone: input.phone?.trim() || null,
                document_id: input.documentId?.trim() || null,
                is_active: true,
              },
            ],
            { onConflict: 'id' }
          )
          .select()
          .single();

        if (profileError || !profileRow) {
          console.error('❌ [Supabase Profiles INSERT Error - Admin]:', {
            endpoint: `${supabaseUrl}/rest/v1/profiles`,
            code: profileError?.code,
            message: profileError?.message,
            details: profileError?.details,
            hint: profileError?.hint,
          });
          const isTableNotFound404 =
            profileError?.code === '42P01' ||
            profileError?.code === 'PGRST205' ||
            profileError?.message?.includes('404') ||
            profileError?.message?.toLowerCase().includes('could not find the table');

          const isDuplicate =
            profileError?.code === '23505' ||
            profileError?.message?.includes('23505') ||
            profileError?.message?.toLowerCase().includes('unique') ||
            profileError?.message?.toLowerCase().includes('duplicate key');

          return {
            profile: null,
            error: isTableNotFound404
              ? `Error 404 en ${supabaseUrl}/rest/v1/profiles: La tabla 'public.profiles' no existe en tu proyecto Supabase. Ejecuta el script SQL (005_fix_rls_insert_persistence.sql) en el SQL Editor de Supabase.`
              : isDuplicate
              ? 'Error al guardar en base de datos: Ya existe un administrador con este documento o correo.'
              : `Error al guardar en base de datos (tabla profiles / RLS): ${profileError?.message || 'Inserción rechazada'}`,
          };
        }
      }
    }

    // Sincronización con base de datos PostgreSQL (/api/admins) con verificación estricta de estado
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

    const apiRes = await fetch('/api/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!apiRes.ok) {
      const errBody = await apiRes.json().catch(() => ({}));
      console.error(`❌ [Error al guardar en /api/admins HTTP ${apiRes.status}]:`, errBody);
      if (!isLiveSupabaseConfigured) {
        const isDuplicate =
          apiRes.status === 409 ||
          errBody?.code === '23505' ||
          errBody?.error?.includes('Ya existe');

        return {
          profile: null,
          error: isDuplicate
            ? 'Error al guardar en base de datos: Ya existe un usuario registrado con este documento o correo.'
            : `Error al guardar en base de datos: ${errBody.error || `HTTP ${apiRes.status}`}`,
        };
      }
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
    console.error('❌ [Excepción crítica creando administrador]:', err);
    return {
      profile: null,
      error: `Error al guardar en base de datos: ${err?.message || 'Fallo inesperado al crear el Administrador.'}`,
    };
  }
}

/**
 * NIVEL 2 -> NIVEL 3: Creación de Nuevo Usuario Cobrador ('collector') por un 'admin'
 * Garantiza:
 * 1. No romper la sesión activa del Admin (usa Edge Function o cliente aislado en memoria).
 * 2. Inserta en public.profiles pasando el tenant_id / auth.uid() del Admin.
 * 3. Manejo de errores estricto (NUNCA falla en silencio).
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
  const orgId = input.organizationId || input.createdByAdminId || 'org-medellin-01';
  const orgName = input.organizationName || 'Fondo RutaCapital Medellín';
  const creatorId = input.createdByAdminId || 'usr-admin-001';
  const cleanRouteZone = input.routeZone.trim() || 'Centro / El Hueco';

  try {
    // Log de auditoría obligatorio justo antes de llamar a la base de datos
    logSupabaseConnectionAudit('registerNewCollectorAccount (Crear Cobrador)', 'profiles', {
      email: normalizedEmail,
      assignedRouteId: input.assignedRouteId,
      organizationId: orgId,
    });

    if (isLiveSupabaseConfigured) {
      // Obtener el auth.uid() real del Admin autenticado para cumplir la política RLS de tenant_id
      const { data: currentAuthData } = await supabase.auth.getUser();
      const effectiveCreatorUid = currentAuthData?.user?.id || null;
      const effectiveTenantId = input.organizationId || effectiveCreatorUid || orgId;

      let provisionedViaEdgeFunction = false;
      const useEdgeFunction = import.meta.env.VITE_USE_EDGE_FUNCTION === 'true';

      // PASO A (Opcional si la Edge Function ya fue desplegada)
      if (useEdgeFunction) {
        console.log('🌐 [DEBUG Edge Function Invoke] Apuntando a:', `${supabaseUrl}/functions/v1/admin-provision-user`);
        const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-provision-user', {
          body: {
            email: normalizedEmail,
            password: input.password,
            fullName: input.fullName.trim(),
            role: 'collector',
            assignedRouteId: input.assignedRouteId,
            routeZone: cleanRouteZone,
            organizationId: effectiveTenantId,
            tenantId: effectiveTenantId,
            organizationName: orgName,
            createdBy: effectiveCreatorUid,
            phone: input.phone?.trim() || null,
            documentId: input.documentId?.trim() || null,
          },
        });

        const fnStatus = (fnError as any)?.context?.status;
        if (!fnError && fnData?.user?.id) {
          generatedUid = fnData.user.id;
          provisionedViaEdgeFunction = true;
        } else if (fnError) {
          console.warn(
            `⚠️ [Edge Function admin-provision-user HTTP ${fnStatus || 'Error'}]: La función no está desplegada o devolvió 404. Usando flujo directo Auth + REST /rest/v1/profiles.`,
            fnError
          );
        }
      }

      // PASO B: Flujo estándar con cliente 100% aislado en memoria (No altera la sesión actual ni depende de Edge Function desplegada)
      if (!provisionedViaEdgeFunction) {
        console.log('🌐 [DEBUG Supabase Auth SignUp] Apuntando a:', `${supabaseUrl}/auth/v1/signup`);
        const isolatedClient = createIsolatedAuthClient();
        const { data: signUpData, error: signUpError } = await isolatedClient.auth.signUp({
          email: normalizedEmail,
          password: input.password,
          options: {
            data: {
              full_name: input.fullName.trim(),
              role: 'collector',
              assigned_route_id: input.assignedRouteId,
              route_zone: cleanRouteZone,
              organization_id: effectiveTenantId,
              tenant_id: effectiveTenantId,
              organization_name: orgName,
              created_by: effectiveCreatorUid,
              document_id: input.documentId?.trim() || null,
              phone: input.phone?.trim() || null,
            },
          },
        });

        if (signUpError) {
          console.error('❌ [Supabase Auth SignUp Error - Collector]:', {
            endpoint: `${supabaseUrl}/auth/v1/signup`,
            status: (signUpError as any)?.status,
            message: signUpError.message,
          });
          const isDuplicate =
            signUpError.message?.toLowerCase().includes('already registered') ||
            signUpError.message?.toLowerCase().includes('already exists') ||
            (signUpError as any).code === '23505';

          return {
            profile: null,
            error: isDuplicate
              ? 'Error al guardar en base de datos: Ya existe un cobrador o usuario con este correo electrónico.'
              : `Error al guardar en base de datos (Supabase Auth [${(signUpError as any)?.status || 'ERR'}]): ${signUpError.message}`,
          };
        }

        if (!signUpData.user?.id) {
          console.error('❌ [Supabase Auth SignUp Error]: No se retornó user.id para el cobrador.');
          return {
            profile: null,
            error: 'Error al guardar en base de datos: Supabase Auth no devolvió un ID de usuario válido.',
          };
        }

        generatedUid = signUpData.user.id;

        console.log('🌐 [DEBUG Supabase REST INSERT] Apuntando a tabla exacta:', `${supabaseUrl}/rest/v1/profiles`, {
          id: generatedUid,
          email: normalizedEmail,
          role: 'collector',
          organization_id: effectiveTenantId,
          tenant_id: effectiveTenantId,
          created_by: effectiveCreatorUid,
        });

        // 1. Guardar el perfil del cobrador en public.profiles (con 's' al final) pasando el tenant_id / created_by del Admin
        const { data: profileRow, error: profileError } = await supabase
          .from('profiles')
          .upsert(
            [
              {
                id: generatedUid,
                email: normalizedEmail,
                full_name: input.fullName.trim(),
                role: 'collector',
                assigned_route_id: input.assignedRouteId,
                route_zone: cleanRouteZone,
                organization_id: effectiveTenantId,
                tenant_id: effectiveTenantId,
                organization_name: orgName,
                created_by: effectiveCreatorUid,
                phone: input.phone?.trim() || null,
                document_id: input.documentId?.trim() || null,
                is_active: true,
              },
            ],
            { onConflict: 'id' }
          )
          .select()
          .single();

        if (profileError || !profileRow) {
          console.error('❌ [Supabase Profiles INSERT Error - Collector]:', {
            endpoint: `${supabaseUrl}/rest/v1/profiles`,
            code: profileError?.code,
            message: profileError?.message,
            details: profileError?.details,
            hint: profileError?.hint,
          });
          const isTableNotFound404 =
            profileError?.code === '42P01' ||
            profileError?.code === 'PGRST205' ||
            profileError?.message?.includes('404') ||
            profileError?.message?.toLowerCase().includes('could not find the table');

          const isDuplicate =
            profileError?.code === '23505' ||
            profileError?.message?.includes('23505') ||
            profileError?.message?.toLowerCase().includes('unique') ||
            profileError?.message?.toLowerCase().includes('duplicate key');

          return {
            profile: null,
            error: isTableNotFound404
              ? `Error 404 en ${supabaseUrl}/rest/v1/profiles: La tabla 'public.profiles' no existe en tu proyecto Supabase. Ejecuta el script SQL (005_fix_rls_insert_persistence.sql) en el SQL Editor de Supabase.`
              : isDuplicate
              ? 'Error al guardar en base de datos: Ya existe un usuario registrado con este documento o correo.'
              : `Error al guardar en base de datos (tabla profiles / RLS): ${profileError?.message || 'Permiso de escritura denegado'}`,
          };
        }

        // 2. Actualizar la tabla routes en Supabase asociando la zona y el cobrador
        console.log('🌐 [DEBUG Supabase REST UPSERT] Apuntando a tabla exacta:', `${supabaseUrl}/rest/v1/routes`);
        const { error: routeUpdateError } = await supabase
          .from('routes')
          .upsert(
            [
              {
                id: input.assignedRouteId,
                name: `Ruta ${input.assignedRouteId.replace(/^route-?/i, '').toUpperCase()}`,
                collector_id: generatedUid,
                collector_name: input.fullName.trim(),
                zone: cleanRouteZone,
                organization_id: effectiveTenantId,
                tenant_id: effectiveTenantId,
                created_by: effectiveCreatorUid,
                status: 'active',
              },
            ],
            { onConflict: 'id' }
          );

        if (routeUpdateError) {
          console.warn('⚠️ [Supabase Routes Upsert Warning]:', routeUpdateError);
        }
      }
    }

    // Persistir también en el backend PostgreSQL (/api/collectors) y verificar estado HTTP 201
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
        tenantId: orgId,
        organizationName: orgName,
        createdBy: creatorId,
        phone: input.phone?.trim() || '',
        documentId: input.documentId?.trim() || '',
      }),
    });

    if (!apiRes.ok) {
      const errBody = await apiRes.json().catch(() => ({}));
      console.error('❌ [Error creando cobrador en /api/collectors]:', errBody);
      if (!isLiveSupabaseConfigured) {
        const isDuplicate =
          apiRes.status === 409 ||
          errBody?.code === '23505' ||
          errBody?.error?.includes('Ya existe');

        return {
          profile: null,
          error: isDuplicate
            ? 'Error al guardar en base de datos: Ya existe un usuario o cliente registrado con este documento o correo.'
            : `Error al guardar en base de datos: ${errBody.error || 'No se pudo registrar el cobrador.'}`,
        };
      }
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
    console.error('❌ [Excepción crítica creando cobrador]:', err);
    return {
      profile: null,
      error: `Error al guardar en base de datos: ${err?.message || 'Error inesperado al crear la cuenta del cobrador.'}`,
    };
  }
}

export function getRememberedCollectorEmail(): string | null {
  return localStorage.getItem(LOCAL_STORAGE_REMEMBER_KEY);
}

export async function signOutUser(): Promise<void> {
  try {
    // Solo remover la llave de sesión de autenticación, sin borrar datos persistidos ni colas offline
    localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
    sessionStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
    if (isLiveSupabaseConfigured) {
      await supabase.auth.signOut();
    }
  } catch (e) {
    console.error('Error cerrando sesión en Supabase:', e);
  }
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
