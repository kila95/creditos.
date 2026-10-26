export type UserRole = 'admin' | 'socio' | 'cobrador' | 'cliente';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone?: string;
  partnerEquityPct?: number; // % de participación si es socio (ej: 35.00)
  capitalInvestedCop?: number; // Capital aportado al fondo común
  assignedRouteId?: string; // Para cobradores
  documentId?: string;
  avatarUrl?: string;
  lastLoginAt?: string;
  isActive: boolean;
  createdAt: string;
}

export interface AuthSession {
  user: {
    id: string;
    email: string;
  };
  profile: UserProfile;
  token?: string;
  expiresAt?: number;
}
