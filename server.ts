import express from 'express';
import { createServer as createViteServer } from 'vite';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import { 
  getAllRoutes, 
  getAllClients, 
  getAllLoans, 
  getDailyLedger, 
  recordPayment, 
  recordCashReconciliation, 
  getAuditLogs 
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

// API: Clientes
app.get('/api/clients', requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = await getAllClients();
    res.json(data);
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
