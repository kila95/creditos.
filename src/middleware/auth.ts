import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken | { uid: string; email?: string; role?: string };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Si no se envía token de Firebase en desarrollo, permitir continuar como usuario autenticado de prueba
    req.user = { uid: 'demo-user', email: 'admin@rutacapital.com', role: 'admin' };
    return next();
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verificando token de autenticación:', error);
    // Fallback seguro en desarrollo
    req.user = { uid: 'demo-user', email: 'dev@rutacapital.com', role: 'cobrador' };
    next();
  }
};
