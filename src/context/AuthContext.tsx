import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole, AuthSession } from '../types/auth';
import { 
  signInWithEmailPassword, 
  signOutUser, 
  hasExecutiveClearance,
  DEMO_USERS
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
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; role?: UserRole; error?: string }>;
  logout: () => Promise<void>;
  switchDemoUser: (email: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    // REGLA CRÍTICA DE ACCESO: Nunca iniciar sesión automáticamente ni recordar credenciales.
    // Toda apertura de la app en celular o computadora debe exigir login manual.
    try {
      localStorage.removeItem('rutacapital_auth_session');
      localStorage.removeItem('rutacapital_remembered_collector');
    } catch (e) {
      console.warn('Error limpiando sesión previa:', e);
    }
    setSession(null);
    setLoading(false);
  }, []);

  const login = async (email: string, password: string, rememberMe: boolean = true): Promise<{ success: boolean; role?: UserRole; error?: string }> => {
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
    await signOutUser();
    setSession(null);
  };

  const switchDemoUser = (email: string) => {
    const normalized = email.trim().toLowerCase();
    const user = DEMO_USERS[normalized];
    if (user) {
      const newSession: AuthSession = {
        user: { id: user.profile.id, email: user.profile.email },
        profile: user.profile,
        token: `token-demo-${Date.now()}`
      };
      setSession(newSession);
      localStorage.setItem('rutacapital_auth_session', JSON.stringify(newSession));
    }
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
        login,
        logout,
        switchDemoUser,
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
