export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'collector'
  | 'socio'
  | 'cobrador'
  | 'cliente';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  organizationId?: string; // ID del fondo/negocio vinculado al admin
  organizationName?: string; // Nombre comercial del fondo/negocio
  createdBy?: string; // UID del super_admin o admin que creó este usuario
  phone?: string;
  partnerEquityPct?: number; // % de participación si es socio (ej: 35.00)
  capitalInvestedCop?: number; // Capital aportado al fondo común
  assignedRouteId?: string; // Para collectors / cobradores
  routeZone?: string; // Zona o comuna de Medellín asignada al cobrador (route_zone)
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
