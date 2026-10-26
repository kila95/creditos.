import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole, AuthSession } from '../types/auth';
import { 
  signInWithEmailPassword, 
  signOutUser, 
  getStoredSession, 
  hasExecutiveClearance,
  DEMO_USERS
} from '../services/supabaseAuth';

interface AuthContextType {
  session: AuthSession | null;
  user: { id: string; email: string } | null;
  profile: UserProfile | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSocio: boolean;
  isCollector: boolean;
  assignedRouteId: string | undefined;
  isAdminOrSocio: boolean;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  switchDemoUser: (email: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Al cargar la app, verificar si hay una sesión guardada
    const stored = getStoredSession();
    if (stored) {
      setSession(stored);
    } else {
      // Iniciar por defecto con la sesión del CFO Principal para una experiencia fluida inmediata
      const defaultAdmin = DEMO_USERS['admin@rutacapital.co'];
      if (defaultAdmin) {
        const defaultSession: AuthSession = {
          user: { id: defaultAdmin.profile.id, email: defaultAdmin.profile.email },
          profile: defaultAdmin.profile,
          token: 'token-default-admin'
        };
        setSession(defaultSession);
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string, rememberMe: boolean = true): Promise<{ success: boolean; error?: string }> => {
    setLoading(true);
    const { session: newSession, error } = await signInWithEmailPassword(email, password, rememberMe);
    setLoading(false);

    if (error || !newSession) {
      return { success: false, error: error || 'Error de autenticación' };
    }

    setSession(newSession);
    return { success: true };
  };

  const logout = async () => {
    await signOutUser();
    setSession(null);
  };

  const switchDemoUser = (email: string) => {
    const user = DEMO_USERS[email];
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
  const isAdmin = role === 'admin';
  const isSocio = role === 'socio';
  const isCollector = role === 'cobrador';
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
        isAdmin,
        isSocio,
        isCollector,
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
