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
// USUARIOS DEMO PRE-CONFIGURADOS PARA VALIDACIÓN INMEDIATA DEL SISTEMA RBAC
// ==============================================================================
export const DEMO_USERS: Record<string, { password: string; profile: UserProfile }> = {
  'admin@rutacapital.co': {
    password: 'admin123@Medellin',
    profile: {
      id: 'usr-admin-001',
      email: 'admin@rutacapital.co',
      fullName: 'Esteban Ochoa (CFO & Arquitecto)',
      role: 'admin',
      phone: '+57 312 890 1234',
      partnerEquityPct: 40.0,
      capitalInvestedCop: 40000000,
      documentId: 'CC 71.392.810',
      isActive: true,
      createdAt: '2025-01-01T08:00:00Z',
    }
  },
  'socio1@rutacapital.co': {
    password: 'socio123@Medellin',
    profile: {
      id: 'usr-socio-002',
      email: 'socio1@rutacapital.co',
      fullName: 'Dr. Alejandro Restrepo (Socio Inversionista A)',
      role: 'socio',
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
      fullName: 'Jhon Alexander Zapata (Cobrador San Javier)',
      role: 'cobrador',
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
      fullName: 'Carlos Mario Henao (Cobrador Manrique)',
      role: 'cobrador',
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
      phone: '+57 310 987 6543',
      documentId: 'CC 43.876.543',
      isActive: true,
      createdAt: '2025-01-20T08:00:00Z',
    }
  }
};

const LOCAL_STORAGE_SESSION_KEY = 'rutacapital_auth_session';
const LOCAL_STORAGE_REMEMBER_KEY = 'rutacapital_remember_collector';

/**
 * Autenticación de usuario con Correo y Contraseña
 */
export async function signInWithEmailPassword(
  email: string, 
  password: string,
  rememberMe: boolean = true
): Promise<{ session: AuthSession | null; error: string | null }> {
  // Si Supabase real está configurado en producción con llaves válidas
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
        // Consultar el perfil y rol desde la tabla public.profiles en Supabase
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

        const session: AuthSession = {
          user: { id: data.user.id, email: data.user.email || email },
          profile: {
            id: profileData.id,
            email: profileData.email,
            fullName: profileData.full_name,
            role: profileData.role as UserRole,
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
      console.warn('Error conectando a Supabase Live, usando motor RBAC local:', err);
    }
  }

  // Fallback / Entorno de Demostración Local de Alta Precisión
  const normalizedEmail = email.trim().toLowerCase();
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
      error: 'Contraseña incorrecta. Verifique su clave o solicite restablecimiento al CFO.' 
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
 * Obtener el correo guardado para recordar sesión de cobrador
 */
export function getRememberedCollectorEmail(): string | null {
  return localStorage.getItem(LOCAL_STORAGE_REMEMBER_KEY);
}

/**
 * Cerrar sesión del usuario
 */
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

/**
 * Obtener la sesión almacenada actualmente
 */
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
 * Validar si un rol tiene autorización ejecutiva ('admin' o 'socio')
 */
export function hasExecutiveClearance(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'socio';
}
