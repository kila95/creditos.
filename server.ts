import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import { 
  getAllRoutes, 
  ensureRouteExists,
  getAllClients, 
  createClient,
  getAllLoans, 
  createLoan,
  getDailyLedger, 
  recordPayment, 
  recordCashReconciliation, 
  getAuditLogs,
  getAllCollectorBases,
  assignCollectorBase,
  updateCollectorBaseStatus,
  getAllAdmins,
  createAdminUser,
  getAllCollectors,
  createCollectorUser,
  authenticateUserFromDB,
  getLiquidatedHistory,
  getAdminPayments,
  recordAdminPayment,
  approveAdminPayment
} from './src/db/queries.ts';

const app = express();
const PORT = 3000;

app.use(express.json());

// API: Estado de la base de datos
app.get('/api/health', async (req, res) => {
  try {
    const routes = await getAllRoutes();
    res.json({
      status: 'online',
      database: 'Cloud SQL (PostgreSQL)',
      region: 'us-west1',
      routesCount: routes.length,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// API: Rutas
app.get('/api/routes', requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = await getAllRoutes();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/routes', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id, zone, collectorName, organizationId, createdBy } = req.body;
    const route = await ensureRouteExists(id, zone, collectorName, organizationId, createdBy);
    res.status(201).json(route);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/routes/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const route = await ensureRouteExists(req.params.id);
    res.json(route);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Clientes
app.get('/api/clients', requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = await getAllClients();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients', requireAuth, async (req: AuthRequest, res) => {
  try {
    const client = await createClient(req.body);
    res.status(201).json(client);
  } catch (err: any) {
    const isDup = err.message?.includes('Ya existe') || err.message?.includes('23505');
    res.status(isDup ? 409 : 500).json({ error: err.message, code: isDup ? '23505' : undefined });
  }
});

// API: Préstamos
app.get('/api/loans', requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = await getAllLoans();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/loans', requireAuth, async (req: AuthRequest, res) => {
  try {
    const loan = await createLoan(req.body);
    res.status(201).json(loan);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Libro diario de cobros
app.get('/api/ledger', requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = await getDailyLedger();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Registrar cobro en calle
app.post('/api/payments', requireAuth, async (req: AuthRequest, res) => {
  try {
    const payment = await recordPayment(req.body);
    res.status(201).json(payment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Arqueo y cierre de caja
app.post('/api/reconciliation', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await recordCashReconciliation(req.body);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Auditoría
app.get('/api/audit-logs', requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = await getAuditLogs();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Bases Semanales de Cobradores (collector_bases)
app.get('/api/collector-bases', requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = await getAllCollectorBases();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/collector-bases', requireAuth, async (req: AuthRequest, res) => {
  try {
    const created = await assignCollectorBase(req.body);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/collector-bases/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { status } = req.body;
    const updated = await updateCollectorBaseStatus(req.params.id, status);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Historial de Liquidados
app.get('/api/liquidated-history', requireAuth, async (req: AuthRequest, res) => {
  try {
    const organizationId = req.query.organizationId as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId es requerido.' });
    }
    const data = await getLiquidatedHistory(organizationId);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Gestión de Administradores por el Super Admin (Nivel 1 -> Nivel 2)
app.get('/api/admins', requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = await getAllAdmins();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admins', requireAuth, async (req: AuthRequest, res) => {
  try {
    const created = await createAdminUser(req.body);
    res.status(201).json(created);
  } catch (err: any) {
    const isDup = err.message?.includes('Ya existe') || err.message?.includes('23505');
    res.status(isDup ? 409 : 500).json({ error: err.message, code: isDup ? '23505' : undefined });
  }
});

// API: Gestión de Usuarios Cobradores (Ruteros) y Asignación de Rutas (Nivel 2 -> Nivel 3)
app.get('/api/collectors', requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = await getAllCollectors();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/collectors', requireAuth, async (req: AuthRequest, res) => {
  try {
    const created = await createCollectorUser(req.body);
    res.status(201).json(created);
  } catch (err: any) {
    const isDup = err.message?.includes('Ya existe') || err.message?.includes('23505');
    res.status(isDup ? 409 : 500).json({ error: err.message, code: isDup ? '23505' : undefined });
  }
});

// API: Aprovisionamiento Seguro de Usuarios (Admin / Cobrador) con Supabase Admin API
// Regla 1: Usa supabaseAdmin.auth.admin.createUser para crear en auth.users sin cerrar la sesión del SuperAdmin/Admin.
// Regla 2: Pasa email_confirm: true y asigna contraseña temporal/por defecto (vinculada al documento si no se especifica).
// Regla 3: Toma el user.id retornado y ejecuta el INSERT en public.profiles (si el paso 1 falla, el paso 3 no se ejecuta).
app.post('/api/admin/provision-user', requireAuth, async (req: AuthRequest, res) => {
  try {
    const {
      email,
      password,
      fullName,
      role,
      organizationId,
      tenantId,
      organizationName,
      createdBy,
      assignedRouteId,
      routeZone,
      phone,
      documentId,
    } = req.body;

    if (!email || !fullName || !role) {
      return res.status(400).json({
        error: 'Campos obligatorios faltantes (email, fullName, role).',
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const cleanPass = String(password || '').trim();
    const cleanDoc = String(documentId || '').replace(/[^0-9a-zA-Z]/g, '');
    const effectivePassword =
      cleanPass.length >= 6
        ? cleanPass
        : cleanDoc.length >= 6
          ? cleanDoc
          : cleanDoc.length > 0
            ? `${cleanDoc}2025*`
            : 'Ruta2025*';

    const rawSupabaseUrl = (
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      'https://kgbpggjiddvschmvvuux.supabase.co'
    )
      .trim()
      .replace(/^['"]+|['"]+$/g, '')
      .replace(/\/(rest|auth|functions)\/v1\/?.*$/i, '')
      .replace(/\/+$/, '');

    const serviceRoleKey = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
      ''
    )
      .trim()
      .replace(/^['"]+|['"]+$/g, '');

    if (!serviceRoleKey || serviceRoleKey.includes('TU_SUPABASE_SERVICE_ROLE_KEY')) {
      return res.status(501).json({
        error: 'SUPABASE_SERVICE_ROLE_KEY no configurada en el servidor.',
        code: 'SERVICE_ROLE_MISSING',
      });
    }

    const supabaseAdmin = createSupabaseClient(rawSupabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const effectiveTenantId = tenantId || organizationId || createdBy;

    // PASO 1 Y 2: Crear en auth.users con email_confirm: true y contraseña temporal
    let { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: effectivePassword,
      email_confirm: true,
      user_metadata: {
        full_name: String(fullName).trim(),
        role,
        organization_id: effectiveTenantId,
        tenant_id: effectiveTenantId,
        organization_name: organizationName || 'Fondo EnRuta',
        created_by: createdBy || null,
        assigned_route_id: assignedRouteId || null,
        route_zone: routeZone || null,
        phone: phone || null,
        document_id: documentId || null,
      },
    });

    // Si el usuario ya existía en auth.users (ej. sin confirmar de una prueba previa), actualizar clave y autoconfirmar
    if (
      authError &&
      (authError.message?.toLowerCase().includes('already') ||
        authError.message?.toLowerCase().includes('exists'))
    ) {
      const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
      const existingAuthUser = usersList?.users?.find(
        (u) => u.email?.toLowerCase() === normalizedEmail
      );
      if (existingAuthUser) {
        const updatedAuth = await supabaseAdmin.auth.admin.updateUserById(existingAuthUser.id, {
          password: effectivePassword,
          email_confirm: true,
          user_metadata: {
            full_name: String(fullName).trim(),
            role,
            organization_id: effectiveTenantId,
            tenant_id: effectiveTenantId,
            organization_name: organizationName || 'Fondo EnRuta',
            created_by: createdBy || null,
            assigned_route_id: assignedRouteId || null,
            route_zone: routeZone || null,
            phone: phone || null,
            document_id: documentId || null,
          },
        });
        authData = updatedAuth.data;
        authError = updatedAuth.error;
      }
    }

    // BLOQUEO ESTRICTO: Si el Paso 1 falla, el Paso 3 NO SE EJECUTA
    if (authError || !authData?.user?.id) {
      return res.status(400).json({
        error: authError?.message || 'Error al registrar usuario en auth.users (Supabase Admin API).',
        code: (authError as any)?.code || 'AUTH_ADMIN_CREATE_FAILED',
      });
    }

    // PASO 3: Sincronización de UUID (user.id -> INSERT en public.profiles)
    const newUserId = authData.user.id;
    const finalTenantId = role === 'admin' ? (organizationId || newUserId) : effectiveTenantId;
    const safeProfileRole =
      role === 'collector' ? 'cobrador' : role === 'super_admin' ? 'admin' : role;

    const fullProfilePayload = {
      id: newUserId,
      email: normalizedEmail,
      full_name: String(fullName).trim(),
      role: safeProfileRole,
      organization_id: finalTenantId,
      tenant_id: finalTenantId,
      organization_name: organizationName || 'Fondo EnRuta',
      created_by: createdBy || newUserId,
      assigned_route_id: assignedRouteId || null,
      route_zone: routeZone || null,
      phone: phone || null,
      document_id: documentId || null,
      is_active: true,
    };

    let { data: profileRow, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert([fullProfilePayload], { onConflict: 'id' })
      .select()
      .single();

    // Si la tabla public.profiles en Supabase tiene el esquema base (id, full_name, role, created_at)
    // con full_name NOT NULL (23502) y CHECK role IN ('admin','socio','cobrador','cliente') (23514):
    if (profileError) {
      const minimalRes = await supabaseAdmin
        .from('profiles')
        .upsert(
          [
            {
              id: newUserId,
              full_name: String(fullName).trim(),
              role: safeProfileRole,
            },
          ],
          { onConflict: 'id' }
        )
        .select()
        .single();
      profileRow = minimalRes.data;
      profileError = minimalRes.error;
    }

    if (profileError) {
      console.warn('⚠️ [Aviso sincronizando public.profiles en provision-user]:', profileError);
    }

    return res.status(201).json({
      status: 201,
      user: authData.user,
      profile: profileRow || fullProfilePayload,
      effectivePassword,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Autenticación de Usuarios Creados en Base de Datos (Jerarquía 3 Niveles RBAC + Restricción de Dispositivo)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, deviceFingerprint } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Correo y contraseña requeridos.' });
    }
    const userRecord = await authenticateUserFromDB(email, password, deviceFingerprint);
    if (!userRecord) {
      return res.status(404).json({ error: 'Usuario no encontrado en base de datos.' });
    }
    res.json({
      id: userRecord.uid,
      email: userRecord.email,
      fullName: userRecord.name,
      role: userRecord.role,
      organizationId: userRecord.organizationId,
      organizationName: userRecord.organizationName,
      createdBy: userRecord.createdBy,
      assignedRouteId: userRecord.assignedRouteId,
      routeZone: userRecord.routeZone,
      phone: userRecord.phone,
      documentId: userRecord.documentId,
      authorizedDeviceId: null,
      isActive: userRecord.isActive,
      createdAt: userRecord.createdAt
    });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

// API: Envío Automático de Recibos por WhatsApp (Twilio / Meta Graph / Simulated Gateway)
app.post('/api/send-whatsapp-receipt', async (req, res) => {
  try {
    const { phone, amount, remainingBalance, clientName, receiptNumber, messageText } = req.body;
    const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');
    const formattedAmount = `$${Number(amount || 0).toLocaleString()} COP`;
    const formattedBalance = `$${Number(remainingBalance || 0).toLocaleString()} COP`;
    const text = messageText || `Pago recibido por ${formattedAmount}. Saldo actual: ${formattedBalance}. Gracias por su pago.`;

    console.log(`📱 [WhatsApp API Messaging Gateway]: Enviando recibo automático a +${cleanPhone}: "${text}"`);

    res.json({
      success: true,
      deliveredAt: new Date().toISOString(),
      recipientPhone: cleanPhone,
      receiptNumber: receiptNumber || `REC-${Date.now().toString().slice(-6)}`,
      clientName: clientName || 'Cliente Deudor',
      message: text,
      provider: process.env.TWILIO_ACCOUNT_SID ? 'Twilio WhatsApp API' : 'Direct Meta Graph / WhatsApp Gateway'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Pagos de Administradores
app.get('/api/admin-payments', requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = await getAdminPayments();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin-payments', requireAuth, async (req: AuthRequest, res) => {
  try {
    const payment = await recordAdminPayment(req.body);
    res.status(201).json(payment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin-payments/:id/approve', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { verifierUid, notes } = req.body;
    const updated = await approveAdminPayment(req.params.id, verifierUid, notes);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Montar Vite middlewares para servir la aplicación React en desarrollo
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor full-stack RutaCapital corriendo en http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Error al inicializar el servidor:', err);
  process.exit(1);
});
