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
        if (isLiveSupabaseConfigured) {
          const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser();
          if (authUser && !authErr) {
            const isMasterEmail = authUser.email?.toLowerCase() === 'estebanochoamesa@gmail.com' || authUser.email?.toLowerCase() === 'superadmin@rutacapital.co';
            const { data: profileData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', authUser.id)
              .single();

            const resolvedRole: UserRole = isMasterEmail ? 'super_admin' : (profileData?.role as UserRole || 'admin');

            if ((profileData || isMasterEmail) && isMounted) {
              const activeSession: AuthSession = {
                user: { id: authUser.id, email: authUser.email || profileData?.email || 'estebanochoamesa@gmail.com' },
                profile: {
                  id: profileData?.id || authUser.id,
                  email: authUser.email || profileData?.email || 'estebanochoamesa@gmail.com',
                  fullName: profileData?.full_name || 'Esteban Ochoa (Dueño / Super Admin)',
                  role: resolvedRole,
                  organizationId: profileData?.organization_id || 'org-global-hq',
                  organizationName: profileData?.organization_name || 'RutaCapital Holding Matriz',
                  assignedRouteId: profileData?.assigned_route_id || 'route-1',
                  routeZone: profileData?.route_zone || '',
                  phone: profileData?.phone,
                  partnerEquityPct: profileData?.partner_equity_pct ?? 100,
                  capitalInvestedCop: profileData?.capital_invested_cop ?? 100000000,
                  documentId: profileData?.document_id,
                  isActive: profileData?.is_active ?? true,
                  createdAt: profileData?.created_at || new Date().toISOString()
                },
                token: 'live-supabase-jwt'
              };
              setSession(activeSession);
            }
          }
        } else {
          const raw = localStorage.getItem('rutacapital_auth_session');
          if (raw) {
            const parsed = JSON.parse(raw) as AuthSession;
            if (parsed && parsed.profile) {
              setSession(parsed);
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, authSession) => {
      if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        localStorage.clear();
        sessionStorage.clear();
        setSession(null);
      } else if (event === 'SIGNED_IN' && authSession?.user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authSession.user.id)
          .single();

        if (profileData) {
          const newSess: AuthSession = {
            user: { id: authSession.user.id, email: authSession.user.email || profileData.email },
            profile: {
              id: profileData.id,
              email: profileData.email,
              fullName: profileData.full_name,
              role: profileData.role as UserRole,
              organizationId: profileData.organization_id || 'org-medellin-01',
              organizationName: profileData.organization_name || 'Fondo RutaCapital',
              assignedRouteId: profileData.assigned_route_id || 'route-1',
              routeZone: profileData.route_zone || '',
              phone: profileData.phone,
              partnerEquityPct: profileData.partner_equity_pct,
              capitalInvestedCop: profileData.capital_invested_cop,
              documentId: profileData.document_id,
              isActive: profileData.is_active,
              createdAt: profileData.created_at
            },
            token: authSession.access_token
          };
          setSession(newSess);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string, rememberMe: boolean = true): Promise<{ success: boolean; role?: UserRole; error?: string }> => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn('Error purging storage before login:', e);
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
      localStorage.clear();
      sessionStorage.clear();
      await signOutUser();
    } catch (e) {
      console.warn('Error during logout cache purge:', e);
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
