import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole, AuthSession } from '../types/auth';
import { 
  signInWithEmailPassword, 
  signOutUser, 
  hasExecutiveClearance,
  supabase,
  isLiveSupabaseConfigured
} from '../services/supabaseAuth';

interface AuthContextType {
  session: AuthSession | null;
  user: { id: string; email: string } | null;
  profile: UserProfile | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isSocio: boolean;
  isCollector: boolean;
  organizationId: string | undefined;
  organizationName: string | undefined;
  assignedRouteId: string | undefined;
  isAdminOrSocio: boolean;
  loading: boolean;
  isLoggingOut: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; role?: UserRole; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  // Escucha activa de cambios de sesión en Supabase Auth con purga automática
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        // Primero verificar si ya existe una sesión activa persistida en localStorage
        const rawStored = localStorage.getItem('rutacapital_auth_session');
        if (rawStored) {
          try {
            const parsed = JSON.parse(rawStored) as AuthSession;
            if (parsed && parsed.profile && isMounted) {
              setSession(parsed);
            }
          } catch {
            // Ignorar JSON corrupto
          }
        }

        if (isLiveSupabaseConfigured) {
          const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser();
          if (authUser && !authErr) {
            const isMasterEmail =
              authUser.email?.toLowerCase() === 'estebanochoamesa@gmail.com' ||
              authUser.email?.toLowerCase() === 'superadmin@rutacapital.co';
            const { data: profileData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', authUser.id)
              .maybeSingle();

            const meta = authUser.user_metadata || {};
            const resolvedRole: UserRole = isMasterEmail
              ? 'super_admin'
              : ((profileData?.role || meta.role || 'admin') as UserRole);

            if (isMounted) {
              const activeSession: AuthSession = {
                user: {
                  id: authUser.id,
                  email: authUser.email || profileData?.email || 'estebanochoamesa@gmail.com',
                },
                profile: {
                  id: profileData?.id || authUser.id,
                  email: authUser.email || profileData?.email || 'estebanochoamesa@gmail.com',
                  fullName:
                    profileData?.full_name ||
                    meta.full_name ||
                    (isMasterEmail ? 'Esteban Ochoa (Dueño / Super Admin)' : authUser.email?.split('@')[0] || 'Usuario'),
                  role: resolvedRole,
                  organizationId:
                    profileData?.organization_id ||
                    meta.organization_id ||
                    meta.tenant_id ||
                    (isMasterEmail ? 'org-global-hq' : 'org-medellin-01'),
                  organizationName:
                    profileData?.organization_name ||
                    meta.organization_name ||
                    (isMasterEmail ? 'RutaCapital Holding Matriz' : 'Fondo RutaCapital Medellín'),
                  assignedRouteId: profileData?.assigned_route_id || meta.assigned_route_id || 'route-1',
                  routeZone: profileData?.route_zone || meta.route_zone || '',
                  phone: profileData?.phone || meta.phone,
                  partnerEquityPct: profileData?.partner_equity_pct ?? 100,
                  capitalInvestedCop: profileData?.capital_invested_cop ?? 100000000,
                  documentId: profileData?.document_id || meta.document_id,
                  isActive: profileData?.is_active ?? true,
                  createdAt: profileData?.created_at || authUser.created_at || new Date().toISOString(),
                },
                token: 'live-supabase-jwt',
              };
              setSession(activeSession);
              localStorage.setItem('rutacapital_auth_session', JSON.stringify(activeSession));
            }
          }
        }
      } catch (err) {
        console.warn('Auth initialization warning:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initAuth();

    // Safety timeout for loading
    const timer = setTimeout(() => {
      setLoading(false);
    }, 10000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, authSession) => {
      clearTimeout(timer);
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('rutacapital_auth_session');
        sessionStorage.removeItem('rutacapital_auth_session');
        setSession(null);
      } else if (event === 'SIGNED_IN' && authSession?.user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authSession.user.id)
          .maybeSingle();

        const meta = authSession.user.user_metadata || {};
        const resolvedData = profileData || {
          id: authSession.user.id,
          email: authSession.user.email || '',
          full_name: meta.full_name || authSession.user.email?.split('@')[0] || 'Usuario',
          role: meta.role || 'collector',
          organization_id: meta.organization_id || meta.tenant_id || 'org-medellin-01',
          organization_name: meta.organization_name || 'Fondo RutaCapital',
          assigned_route_id: meta.assigned_route_id || 'route-1',
          route_zone: meta.route_zone || '',
          phone: meta.phone || '',
          document_id: meta.document_id || '',
          is_active: true,
          created_at: authSession.user.created_at || new Date().toISOString(),
        };

        const newSess: AuthSession = {
          user: { id: authSession.user.id, email: authSession.user.email || resolvedData.email },
          profile: {
            id: resolvedData.id,
            email: resolvedData.email,
            fullName: resolvedData.full_name,
            role: resolvedData.role as UserRole,
            organizationId: resolvedData.organization_id || 'org-medellin-01',
            organizationName: resolvedData.organization_name || 'Fondo RutaCapital',
            assignedRouteId: resolvedData.assigned_route_id || 'route-1',
            routeZone: resolvedData.route_zone || '',
            phone: resolvedData.phone,
            partnerEquityPct: resolvedData.partner_equity_pct,
            capitalInvestedCop: resolvedData.capital_invested_cop,
            documentId: resolvedData.document_id,
            isActive: resolvedData.is_active ?? true,
            createdAt: resolvedData.created_at,
          },
          token: authSession.access_token,
        };
        setSession(newSess);
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string, rememberMe: boolean = true): Promise<{ success: boolean; role?: UserRole; error?: string }> => {
    try {
      localStorage.removeItem('rutacapital_auth_session');
      sessionStorage.removeItem('rutacapital_auth_session');
    } catch (e) {
      console.warn('Error purging session before login:', e);
    }

    setLoading(true);
    const { session: newSession, error } = await signInWithEmailPassword(email, password, rememberMe);
    setLoading(false);

    if (error || !newSession) {
      return { success: false, error: error || 'Error de autenticación' };
    }

    setSession(newSession);
    return { success: true, role: newSession.profile.role };
  };

  const logout = async () => {
    setIsLoggingOut(true);
    try {
      localStorage.removeItem('rutacapital_auth_session');
      sessionStorage.removeItem('rutacapital_auth_session');
      await signOutUser();
    } catch (e) {
      console.warn('Error during logout session purge:', e);
    }
    
    setTimeout(() => {
      setSession(null);
      setIsLoggingOut(false);
    }, 800);
  };

  const user = session?.user || null;
  const profile = session?.profile || null;
  const role = profile?.role || null;
  const isAuthenticated = Boolean(session && profile);
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isSocio = role === 'socio';
  const isCollector = role === 'collector' || role === 'cobrador';
  const organizationId = profile?.organizationId;
  const organizationName = profile?.organizationName;
  const assignedRouteId = profile?.assignedRouteId;
  const isAdminOrSocio = hasExecutiveClearance(role || undefined);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        role,
        isAuthenticated,
        isSuperAdmin,
        isAdmin,
        isSocio,
        isCollector,
        organizationId,
        organizationName,
        assignedRouteId,
        isAdminOrSocio,
        loading,
        isLoggingOut,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
