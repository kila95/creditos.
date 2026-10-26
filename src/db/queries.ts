import { db } from './index.ts';
import { 
  routes, 
  clients, 
  loans, 
  dailyLedger, 
  cashDrawerSessions, 
  auditLogs 
} from './schema.ts';
import { eq, desc, sql } from 'drizzle-orm';

export async function getAllRoutes() {
  try {
    return await db.select().from(routes);
  } catch (error) {
    console.error('Error al consultar rutas en Cloud SQL:', error);
    throw new Error('No se pudieron obtener las rutas desde la base de datos.', { cause: error });
  }
}

export async function getAllClients() {
  try {
    return await db.select().from(clients);
  } catch (error) {
    console.error('Error al consultar clientes en Cloud SQL:', error);
    throw new Error('No se pudieron obtener los clientes desde la base de datos.', { cause: error });
  }
}

export async function getAllLoans() {
  try {
    return await db.select().from(loans);
  } catch (error) {
    console.error('Error al consultar préstamos en Cloud SQL:', error);
    throw new Error('No se pudieron obtener los préstamos desde la base de datos.', { cause: error });
  }
}

export async function getDailyLedger() {
  try {
    return await db.select().from(dailyLedger).orderBy(desc(dailyLedger.createdAt)).limit(100);
  } catch (error) {
    console.error('Error al consultar el libro contable en Cloud SQL:', error);
    throw new Error('No se pudo obtener el historial de pagos.', { cause: error });
  }
}

export async function recordPayment(entry: {
  id: string;
  receiptNumber: string;
  loanId: string;
  clientId: string;
  clientName: string;
  routeId: string;
  amount: number;
  principalPortion: number;
  interestPortion: number;
  paymentMethod: string;
  preBalance: number;
  postBalance: number;
  timestamp: string;
  gpsLocation: string;
  hash: string;
}) {
  try {
    // 1. Insertar en libro diario inmutable
    const inserted = await db.insert(dailyLedger).values({
      id: entry.id,
      receiptNumber: entry.receiptNumber,
      loanId: entry.loanId,
      clientId: entry.clientId,
      clientName: entry.clientName,
      routeId: entry.routeId,
      amount: entry.amount.toString(),
      principalPortion: entry.principalPortion.toString(),
      interestPortion: entry.interestPortion.toString(),
      paymentMethod: entry.paymentMethod,
      preBalance: entry.preBalance.toString(),
      postBalance: entry.postBalance.toString(),
      timestamp: entry.timestamp,
      gpsLocation: entry.gpsLocation,
      hash: entry.hash,
      isSynced: true,
    }).returning();

    // 2. Actualizar saldo y cuotas del préstamo
    await db.update(loans)
      .set({
        remainingBalance: entry.postBalance.toString(),
        lastPaymentDate: entry.timestamp,
        paidDays: sql`${loans.paidDays} + 1`,
        status: entry.postBalance <= 0 ? 'completed' : 'active',
      })
      .where(eq(loans.id, entry.loanId));

    // 3. Registrar evento forense en bitácora de auditoría
    try {
      await db.insert(auditLogs).values({
        id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        action: 'PAGO_RECAUDADO_CALLE',
        actorId: 'cobrador-calle',
        actorName: 'Cobrador de Ruta',
        actorRole: 'cobrador',
        targetId: entry.loanId,
        timestamp: entry.timestamp,
        gpsLocation: entry.gpsLocation,
        oldState: { balance: entry.preBalance },
        newState: { balance: entry.postBalance, amountPaid: entry.amount, receipt: entry.receiptNumber },
        hash: entry.hash,
        verifiedIntegrity: true,
      });
    } catch (auditErr) {
      console.warn('Advertencia registrando audit log secundario:', auditErr);
    }

    return inserted[0];
  } catch (error) {
    console.error('Error al registrar pago en Cloud SQL:', error);
    throw new Error('Error persistiendo el pago en la base de datos.', { cause: error });
  }
}

export async function recordCashReconciliation(session: {
  id: string;
  routeId: string;
  date: string;
  collectorId: string;
  collectorName: string;
  expectedCash: number;
  actualCashHanded: number;
  discrepancy: number;
  status: string;
  notes?: string;
  verifiedByAdmin?: boolean;
}) {
  try {
    const inserted = await db.insert(cashDrawerSessions).values({
      id: session.id,
      routeId: session.routeId,
      date: session.date,
      collectorId: session.collectorId,
      collectorName: session.collectorName,
      expectedCash: session.expectedCash.toString(),
      actualCashHanded: session.actualCashHanded.toString(),
      discrepancy: session.discrepancy.toString(),
      status: session.status,
      notes: session.notes || null,
      verifiedByAdmin: session.verifiedByAdmin ?? false,
    }).returning();

    return inserted[0];
  } catch (error) {
    console.error('Error al registrar arqueo de caja en Cloud SQL:', error);
    throw new Error('Error persistiendo el arqueo de caja.', { cause: error });
  }
}

export async function getAuditLogs() {
  try {
    return await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(50);
  } catch (error) {
    console.error('Error al consultar bitácora de auditoría en Cloud SQL:', error);
    throw new Error('No se pudo obtener la bitácora de auditoría.', { cause: error });
  }
}

export async function createClient(data: {
  id: string;
  documentId: string;
  name: string;
  alias?: string;
  phone: string;
  businessType: string;
  address: string;
  zone: string;
  routeId: string;
  riskScore?: number;
  riskLevel?: string;
  creditLimit: number;
}) {
  try {
    const inserted = await db.insert(clients).values({
      id: data.id,
      documentId: data.documentId,
      name: data.name,
      alias: data.alias || null,
      phone: data.phone,
      businessType: data.businessType,
      address: data.address,
      zone: data.zone,
      routeId: data.routeId,
      riskScore: data.riskScore ?? 75,
      riskLevel: data.riskLevel ?? 'verde',
      creditLimit: data.creditLimit.toString(),
    }).returning();
    return inserted[0];
  } catch (error) {
    console.error('Error al insertar cliente en Cloud SQL:', error);
    throw new Error('Error al registrar nuevo cliente.', { cause: error });
  }
}

export async function createLoan(data: {
  id: string;
  clientId: string;
  routeId: string;
  principalAmount: number;
  interestRate: number;
  totalAmount: number;
  dailyQuota: number;
  remainingBalance: number;
  totalDays: number;
  paidDays?: number;
  status?: string;
  startDate: string;
  expectedEndDate: string;
}) {
  try {
    const inserted = await db.insert(loans).values({
      id: data.id,
      clientId: data.clientId,
      routeId: data.routeId,
      principalAmount: data.principalAmount.toString(),
      interestRate: data.interestRate.toString(),
      totalAmount: data.totalAmount.toString(),
      dailyQuota: data.dailyQuota.toString(),
      remainingBalance: data.remainingBalance.toString(),
      totalDays: data.totalDays,
      paidDays: data.paidDays ?? 0,
      status: data.status ?? 'active',
      startDate: data.startDate,
      expectedEndDate: data.expectedEndDate,
    }).returning();
    return inserted[0];
  } catch (error) {
    console.error('Error al insertar préstamo en Cloud SQL:', error);
    throw new Error('Error al registrar nuevo microcrédito.', { cause: error });
  }
}

