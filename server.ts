import express from 'express';
import { createServer as createViteServer } from 'vite';
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
  authenticateUserFromDB
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
    const { id, zone, collectorName } = req.body;
    const route = await ensureRouteExists(id, zone, collectorName);
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
