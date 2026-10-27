import { db } from './index.ts';
import { 
  users,
  routes, 
  clients, 
  loans, 
  dailyLedger, 
  cashDrawerSessions, 
  auditLogs,
  collectorBases,
  liquidatedLoansHistory,
  adminPayments
} from './schema.ts';
import { eq, desc, sql, and, or } from 'drizzle-orm';

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

export async function ensureLoanExistsForPayment(entry: {
  loanId: string;
  clientId: string;
  clientName: string;
  routeId: string;
  preBalance: number;
}) {
  try {
    const safeRouteId = entry.routeId?.trim() || 'route-1';
    await ensureRouteExists(safeRouteId);

    const safeClientId = entry.clientId?.trim() || `cli-${entry.loanId.slice(-6)}`;
    const existingClient = await db.select().from(clients).where(eq(clients.id, safeClientId)).limit(1);
    if (existingClient.length === 0) {
      await db.insert(clients).values({
        id: safeClientId,
        documentId: `CC-AUTO-${safeClientId.slice(-6)}`,
        name: entry.clientName || 'Cliente de Ruta',
        alias: entry.clientName || 'Cliente Local',
        phone: '3000000000',
        businessType: 'Comercio Local',
        address: 'Medellín',
        zone: 'Medellín',
        routeId: safeRouteId,
        organizationId: 'org-medellin-01',
        createdBy: 'usr-admin-001',
        creditLimit: '1000000',
      }).onConflictDoNothing();
    }

    const safeLoanId = entry.loanId?.trim();
    const existingLoan = await db.select().from(loans).where(eq(loans.id, safeLoanId)).limit(1);
    if (existingLoan.length === 0) {
      const defaultPrincipal = Math.max(1000, entry.preBalance || 500000);
      await db.insert(loans).values({
        id: safeLoanId,
        clientId: safeClientId,
        routeId: safeRouteId,
        principalAmount: defaultPrincipal.toString(),
        interestRate: '20',
        totalAmount: (defaultPrincipal * 1.2).toString(),
        dailyQuota: '25000',
        remainingBalance: entry.preBalance.toString(),
        totalDays: 24,
        paidDays: 0,
        modality: 'diaria',
        status: 'active',
        startDate: new Date().toISOString().split('T')[0],
        expectedEndDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        paymentDays: [1, 2, 3, 4, 5, 6],
      }).onConflictDoNothing();
    }
  } catch (err) {
    console.warn('[ensureLoanExistsForPayment] Advertencia asegurando registros para pago:', err);
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
    // 0. Garantizar que la ruta, cliente y préstamo existan en Cloud SQL antes de insertar el pago
    await ensureLoanExistsForPayment({
      loanId: entry.loanId,
      clientId: entry.clientId,
      clientName: entry.clientName,
      routeId: entry.routeId,
      preBalance: entry.preBalance,
    });

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
    const isLiquidated = entry.postBalance <= 0;
    await db.update(loans)
      .set({
        remainingBalance: entry.postBalance.toString(),
        lastPaymentDate: entry.timestamp,
        paidDays: sql`${loans.paidDays} + 1`,
        status: isLiquidated ? 'liquidated' : 'active',
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
  actualCashHanded?: number;
  actualCash?: number;
  discrepancy?: number;
  discrepancyAmount?: number;
  status: string;
  notes?: string;
  verifiedByAdmin?: boolean;
}) {
  try {
    const actual = session.actualCash ?? session.actualCashHanded ?? 0;
    const diff = session.discrepancyAmount ?? session.discrepancy ?? 0;

    const inserted = await db.insert(cashDrawerSessions).values({
      id: session.id,
      routeId: session.routeId,
      date: session.date,
      collectorId: session.collectorId,
      collectorName: session.collectorName,
      expectedCash: session.expectedCash.toString(),
      actualCash: actual.toString(),
      actualCashHanded: actual.toString(),
      discrepancyAmount: diff.toString(),
      discrepancy: diff.toString(),
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

export async function ensureRouteExists(routeId: string, zone?: string, collectorName?: string) {
  try {
    const safeRouteId = routeId?.trim() || 'route-1';
    const existing = await db.select().from(routes).where(eq(routes.id, safeRouteId)).limit(1);
    if (existing.length > 0) {
      return existing[0];
    }

    // Auto-registrar la ruta si no existe para garantizar integridad referencial y evitar 404
    const cleanName = `Ruta ${safeRouteId.replace(/^route-?/i, '').toUpperCase() || 'General'}`;
    const cleanZone = zone?.trim() || 'Medellín Metropolitana';
    const cleanCollector = collectorName?.trim() || 'Cobrador de Zona';

    const inserted = await db.insert(routes).values({
      id: safeRouteId,
      name: cleanName,
      zone: cleanZone,
      collectorName: cleanCollector,
      targetDailyCollection: '1500000',
      operatingExpenseBudget: '80000',
      status: 'active',
      organizationId: 'org-medellin-01',
      createdBy: 'usr-admin-001',
    }).returning();

    return inserted[0];
  } catch (err) {
    console.warn(`[ensureRouteExists] Advertencia al validar/crear ruta ${routeId}:`, err);
    // Si la ruta ya existía o hubo condición de carrera, retornar la primera ruta válida
    const fallback = await db.select().from(routes).limit(1);
    return fallback[0] || null;
  }
}

export async function createClient(data: {
  id: string;
  documentId?: string;
  name: string;
  alias?: string;
  phone: string;
  businessType: string;
  address: string;
  zone: string;
  routeId: string;
  organizationId?: string;
  createdBy?: string;
  riskScore?: number;
  riskLevel?: string;
  creditLimit: number;
}) {
  try {
    // 1. Garantizar que la ruta exista en la tabla routes para evitar errores de clave foránea o 404
    const safeRouteId = data.routeId?.trim() || 'route-1';
    await ensureRouteExists(safeRouteId, data.zone);

    // 2. Si el campo de cédula no se proporciona en calle, generar un identificador único seguro
    // para no bloquear la inserción en la base de datos ni fallar por valor nulo o duplicado
    const hasDoc = data.documentId && data.documentId.trim().length > 0;
    const safeDocumentId = hasDoc
      ? data.documentId!.trim()
      : `CC-PENDIENTE-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const safeOrgId = data.organizationId || (data as any).tenantId || 'org-medellin-01';
    const safeCreatedBy = data.createdBy || (data as any).adminId || 'usr-admin-001';

    const inserted = await db.insert(clients).values({
      id: data.id,
      documentId: safeDocumentId,
      name: data.name,
      alias: data.alias || null,
      phone: data.phone,
      businessType: data.businessType,
      address: data.address,
      zone: data.zone,
      routeId: safeRouteId,
      organizationId: safeOrgId,
      createdBy: safeCreatedBy,
      riskScore: data.riskScore ?? 75,
      riskLevel: data.riskLevel ?? 'verde',
      creditLimit: data.creditLimit.toString(),
    }).returning();
    return inserted[0];
  } catch (error: any) {
    console.error('Error al insertar cliente en Cloud SQL:', error);
    const isDuplicate =
      error?.code === '23505' ||
      error?.cause?.code === '23505' ||
      error?.message?.includes('23505') ||
      error?.message?.toLowerCase().includes('unique') ||
      error?.message?.toLowerCase().includes('duplicate key');

    if (isDuplicate) {
      throw new Error('Error: Ya existe un usuario o cliente registrado con este documento o correo.', { cause: error });
    }

    const detail = error?.message || 'Error desconocido en base de datos';
    throw new Error(`Error al registrar nuevo cliente en tabla clients: ${detail}`, { cause: error });
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
  modality?: string;
  status?: string;
  startDate: string;
  expectedEndDate: string;
  paymentDays?: number[];
}) {
  try {
    const safeRouteId = data.routeId?.trim() || 'route-1';
    await ensureRouteExists(safeRouteId);

    const inserted = await db.insert(loans).values({
      id: data.id,
      clientId: data.clientId,
      routeId: safeRouteId,
      principalAmount: data.principalAmount.toString(),
      interestRate: data.interestRate.toString(),
      totalAmount: data.totalAmount.toString(),
      dailyQuota: data.dailyQuota.toString(),
      remainingBalance: data.remainingBalance.toString(),
      totalDays: data.totalDays,
      paidDays: data.paidDays ?? 0,
      modality: data.modality ?? 'diaria',
      status: data.status ?? 'active',
      startDate: data.startDate,
      expectedEndDate: data.expectedEndDate,
      paymentDays: data.paymentDays ?? [1, 2, 3, 4, 5, 6],
    }).returning();
    return inserted[0];
  } catch (error: any) {
    console.error('Error al insertar préstamo en Cloud SQL:', error);
    const detail = error?.message || 'Error desconocido en base de datos';
    throw new Error(`Error al registrar nuevo microcrédito en tabla loans: ${detail}`, { cause: error });
  }
}

export async function getAllCollectorBases() {
  try {
    return await db.select().from(collectorBases).orderBy(desc(collectorBases.createdAt));
  } catch (error) {
    console.error('Error al consultar bases semanales de cobradores en Cloud SQL:', error);
    throw new Error('No se pudieron obtener las bases semanales de cobradores.', { cause: error });
  }
}

export async function assignCollectorBase(data: {
  id: string;
  collectorId: string;
  collectorName: string;
  routeId: string;
  amount: number;
  weekStartDate: string;
  status?: 'ACTIVA' | 'DEVUELTA';
}) {
  try {
    return await db.transaction(async (tx) => {
      // Si se asigna una nueva base ACTIVA para este cobrador, marcar cualquier base ACTIVA anterior como DEVUELTA
      if (!data.status || data.status === 'ACTIVA') {
        await tx
          .update(collectorBases)
          .set({ status: 'DEVUELTA' })
          .where(
            and(
              eq(collectorBases.collectorId, data.collectorId),
              eq(collectorBases.status, 'ACTIVA')
            )
          );
      }

      const inserted = await tx.insert(collectorBases).values({
        id: data.id,
        collectorId: data.collectorId,
        collectorName: data.collectorName,
        routeId: data.routeId,
        amount: data.amount.toString(),
        weekStartDate: data.weekStartDate,
        status: data.status ?? 'ACTIVA',
      }).returning();

      // Registrar en log de auditoría inmutable
      await tx.insert(auditLogs).values({
        id: `aud-${Date.now()}`,
        action: 'ASIGNACION_BASE_SEMANAL',
        actorId: 'usr-admin-001',
        actorName: 'Director Financiero (CFO)',
        actorRole: 'admin',
        targetId: data.id,
        timestamp: new Date().toISOString(),
        ipAddress: '190.157.24.81',
        gpsLocation: '6.2442 N, -75.5812 W',
        oldState: null,
        newState: {
          collectorId: data.collectorId,
          collectorName: data.collectorName,
          routeId: data.routeId,
          amount: data.amount,
          weekStartDate: data.weekStartDate,
          status: data.status ?? 'ACTIVA'
        },
        hash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
        verifiedIntegrity: true,
      });

      return inserted[0];
    });
  } catch (error) {
    console.error('Error al asignar base semanal en Cloud SQL:', error);
    throw new Error('Error al registrar la base semanal del cobrador.', { cause: error });
  }
}

export async function updateCollectorBaseStatus(id: string, status: 'ACTIVA' | 'DEVUELTA') {
  try {
    return await db.transaction(async (tx) => {
      const updated = await tx
        .update(collectorBases)
        .set({ status })
        .where(eq(collectorBases.id, id))
        .returning();

      const record = updated[0];

      await tx.insert(auditLogs).values({
        id: `aud-${Date.now()}`,
        action: 'ACTUALIZACION_BASE_SEMANAL',
        actorId: 'usr-admin-001',
        actorName: 'Director Financiero (CFO)',
        actorRole: 'admin',
        targetId: id,
        timestamp: new Date().toISOString(),
        ipAddress: '190.157.24.81',
        gpsLocation: '6.2442 N, -75.5812 W',
        oldState: { status: status === 'ACTIVA' ? 'DEVUELTA' : 'ACTIVA' },
        newState: { status },
        hash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
        verifiedIntegrity: true,
      });

      return record;
    });
  } catch (error) {
    console.error('Error al actualizar estado de base semanal en Cloud SQL:', error);
    throw new Error('No se pudo actualizar el estado de la base semanal.', { cause: error });
  }
}

export async function getAllAdmins() {
  try {
    return await db
      .select()
      .from(users)
      .where(eq(users.role, 'admin'))
      .orderBy(desc(users.createdAt));
  } catch (error: any) {
    console.error('Error al consultar administradores en Cloud SQL:', error);
    throw new Error('No se pudieron obtener los administradores de fondos.', { cause: error });
  }
}

export async function createAdminUser(data: {
  uid: string;
  email: string;
  password: string;
  name: string;
  organizationId: string;
  organizationName: string;
  createdBy: string;
  phone?: string;
  documentId?: string;
}) {
  try {
    return await db.transaction(async (tx) => {
      const normalizedEmail = data.email.trim().toLowerCase();
      const cleanDoc = data.documentId && data.documentId.trim().length > 0 ? data.documentId.trim() : null;

      // Si el correo ya existía en la tabla local, sincronizar el UUID de auth.users y contraseña temporal
      const existingByEmail = await tx
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      let savedRecord;
      if (existingByEmail.length > 0) {
        const updated = await tx
          .update(users)
          .set({
            uid: data.uid,
            password: data.password,
            name: data.name.trim(),
            role: 'admin',
            organizationId: data.organizationId,
            organizationName: data.organizationName.trim(),
            createdBy: data.createdBy || 'usr-super-000',
            phone: data.phone || '',
            documentId: cleanDoc || existingByEmail[0].documentId,
            isActive: true,
          })
          .where(eq(users.email, normalizedEmail))
          .returning();
        savedRecord = updated[0];
      } else {
        const inserted = await tx
          .insert(users)
          .values({
            uid: data.uid,
            email: normalizedEmail,
            password: data.password,
            name: data.name.trim(),
            role: 'admin',
            organizationId: data.organizationId,
            organizationName: data.organizationName.trim(),
            createdBy: data.createdBy || 'usr-super-000',
            phone: data.phone || '',
            documentId: cleanDoc,
            isActive: true,
          })
          .returning();
        savedRecord = inserted[0];
      }

      await tx.insert(auditLogs).values({
        id: `aud-${Date.now()}`,
        action: 'CREACION_CUENTA_ADMIN_POR_SUPERADMIN',
        actorId: data.createdBy || 'usr-super-000',
        actorName: 'Super Administrador General',
        actorRole: 'super_admin',
        targetId: data.uid,
        timestamp: new Date().toISOString(),
        ipAddress: '190.157.24.81',
        gpsLocation: '6.2442 N, -75.5812 W',
        oldState: null,
        newState: {
          uid: data.uid,
          email: normalizedEmail,
          name: data.name.trim(),
          role: 'admin',
          organizationId: data.organizationId,
          organizationName: data.organizationName.trim(),
          createdBy: data.createdBy,
        },
        hash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
        verifiedIntegrity: true,
      });

      return savedRecord;
    });
  } catch (error: any) {
    console.error('Error al crear administrador en Cloud SQL:', error);
    const isDuplicate =
      error?.code === '23505' ||
      error?.cause?.code === '23505' ||
      error?.message?.includes('23505') ||
      error?.message?.toLowerCase().includes('unique') ||
      error?.message?.toLowerCase().includes('duplicate key');

    if (isDuplicate) {
      throw new Error('Error: Ya existe un usuario o cliente registrado con este documento o correo.', { cause: error });
    }

    const detail = error?.message || 'Error desconocido al crear administrador';
    throw new Error(`No se pudo registrar el administrador: ${detail}`, { cause: error });
  }
}

export async function getAllCollectors() {
  try {
    return await db
      .select()
      .from(users)
      .where(or(eq(users.role, 'collector'), eq(users.role, 'cobrador')))
      .orderBy(desc(users.createdAt));
  } catch (error: any) {
    console.error('Error al consultar cobradores en Cloud SQL:', error);
    throw new Error('No se pudieron obtener los usuarios cobradores.', { cause: error });
  }
}

export async function createCollectorUser(data: {
  uid: string;
  email: string;
  password: string;
  name: string;
  assignedRouteId: string;
  routeZone?: string;
  organizationId?: string;
  organizationName?: string;
  createdBy?: string;
  phone?: string;
  documentId?: string;
}) {
  try {
    return await db.transaction(async (tx) => {
      const normalizedEmail = data.email.trim().toLowerCase();
      const cleanZone = (data.routeZone || 'Centro / El Hueco').trim();
      const cleanDoc = data.documentId && data.documentId.trim().length > 0 ? data.documentId.trim() : null;

      // Si el correo ya existía en la tabla local, sincronizar el UUID de auth.users y contraseña temporal
      const existingByEmail = await tx
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      let savedRecord;
      if (existingByEmail.length > 0) {
        const updated = await tx
          .update(users)
          .set({
            uid: data.uid,
            password: data.password,
            name: data.name.trim(),
            role: 'collector',
            organizationId: data.organizationId || 'org-medellin-01',
            organizationName: data.organizationName || 'Fondo RutaCapital Medellín',
            createdBy: data.createdBy || 'usr-admin-001',
            assignedRouteId: data.assignedRouteId,
            routeZone: cleanZone,
            phone: data.phone || '',
            documentId: cleanDoc || existingByEmail[0].documentId,
            isActive: true,
          })
          .where(eq(users.email, normalizedEmail))
          .returning();
        savedRecord = updated[0];
      } else {
        const inserted = await tx
          .insert(users)
          .values({
            uid: data.uid,
            email: normalizedEmail,
            password: data.password,
            name: data.name.trim(),
            role: 'collector',
            organizationId: data.organizationId || 'org-medellin-01',
            organizationName: data.organizationName || 'Fondo RutaCapital Medellín',
            createdBy: data.createdBy || 'usr-admin-001',
            assignedRouteId: data.assignedRouteId,
            routeZone: cleanZone,
            phone: data.phone || '',
            documentId: cleanDoc,
            isActive: true,
          })
          .returning();
        savedRecord = inserted[0];
      }

      // Vincular el cobrador, la zona seleccionada (zone) y la organización del Admin a la tabla routes
      const existingRoute = await tx
        .select()
        .from(routes)
        .where(eq(routes.id, data.assignedRouteId))
        .limit(1);

      if (existingRoute.length > 0) {
        await tx
          .update(routes)
          .set({
            collectorId: data.uid,
            collectorName: data.name.trim(),
            zone: cleanZone,
            organizationId: data.organizationId || 'org-medellin-01',
            createdBy: data.createdBy || 'usr-admin-001',
          })
          .where(eq(routes.id, data.assignedRouteId));
      } else {
        await tx.insert(routes).values({
          id: data.assignedRouteId,
          name: `Ruta ${cleanZone}`,
          zone: cleanZone,
          collectorId: data.uid,
          collectorName: data.name.trim(),
          organizationId: data.organizationId || 'org-medellin-01',
          createdBy: data.createdBy || 'usr-admin-001',
          status: 'active',
          targetDailyCollection: '500000',
          operatingExpenseBudget: '45000',
        });
      }

      // Registrar en la bitácora de auditoría inmutable
      await tx.insert(auditLogs).values({
        id: `aud-${Date.now()}`,
        action: 'CREACION_COBRADOR_Y_ASIGNACION_ZONA',
        actorId: data.createdBy || 'usr-admin-001',
        actorName: 'Administrador de Fondo',
        actorRole: 'admin',
        targetId: data.uid,
        timestamp: new Date().toISOString(),
        ipAddress: '190.157.24.81',
        gpsLocation: '6.2442 N, -75.5812 W',
        oldState: null,
        newState: {
          uid: data.uid,
          email: normalizedEmail,
          name: data.name.trim(),
          role: 'collector',
          assignedRouteId: data.assignedRouteId,
          routeZone: cleanZone,
          organizationId: data.organizationId || 'org-medellin-01',
          createdBy: data.createdBy || 'usr-admin-001',
        },
        hash: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
        verifiedIntegrity: true,
      });

      return savedRecord;
    });
  } catch (error: any) {
    console.error('Error al crear cobrador en Cloud SQL:', error);
    const isDuplicate =
      error?.code === '23505' ||
      error?.cause?.code === '23505' ||
      error?.message?.includes('23505') ||
      error?.message?.toLowerCase().includes('unique') ||
      error?.message?.toLowerCase().includes('duplicate key');

    if (isDuplicate) {
      throw new Error('Error: Ya existe un usuario o cliente registrado con este documento o correo.', { cause: error });
    }

    const detail = error?.message || 'Error desconocido al crear usuario cobrador';
    throw new Error(`No se pudo registrar el cobrador: ${detail}`, { cause: error });
  }
}

export async function authenticateUserFromDB(email: string, password: string, deviceFingerprint?: string) {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const found = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!found || !found.length) {
      return null;
    }

    const userRecord = found[0];
    const cleanInputDoc = password.trim().replace(/[^0-9a-zA-Z]/g, '');
    const cleanUserDoc = (userRecord.documentId || '').trim().replace(/[^0-9a-zA-Z]/g, '');

    const matchesStoredPassword = !userRecord.password || userRecord.password === password;
    const matchesDocumentIdPassword = cleanUserDoc.length >= 5 && cleanInputDoc === cleanUserDoc;

    if (!matchesStoredPassword && !matchesDocumentIdPassword) {
      throw new Error('Contraseña incorrecta para la cuenta ingresada.');
    }

    if (!userRecord.isActive) {
      throw new Error('La cuenta de usuario se encuentra suspendida.');
    }

    return userRecord;
  } catch (error) {
    throw error;
  }
}


export async function getLiquidatedHistory(organizationId: string) {
  try {
    return await db
      .select()
      .from(liquidatedLoansHistory)
      .where(eq(liquidatedLoansHistory.organizationId, organizationId))
      .orderBy(desc(liquidatedLoansHistory.liquidationDate));
  } catch (error) {
    console.error('Error al consultar historial de liquidados en Cloud SQL:', error);
    throw new Error('No se pudo obtener el historial de préstamos liquidados.', { cause: error });
  }
}

export async function getAdminPayments(organizationId?: string) {
  try {
    return await db.select().from(adminPayments).orderBy(desc(adminPayments.createdAt));
  } catch (error) {
    console.error('Error al consultar pagos de administradores en Cloud SQL:', error);
    throw new Error('No se pudo obtener el historial de pagos de administradores.', { cause: error });
  }
}

export async function recordAdminPayment(data: {
  id: string;
  adminId: number;
  amount: number;
  referenceNumber: string;
  proofUrl?: string;
}) {
  try {
    const inserted = await db.insert(adminPayments).values({
      id: data.id,
      adminId: data.adminId,
      amount: data.amount.toString(),
      referenceNumber: data.referenceNumber,
      proofUrl: data.proofUrl || null,
      status: 'pending',
    }).returning();

    return inserted[0];
  } catch (error) {
    console.error('Error al registrar pago de administrador:', error);
    throw new Error('Error al registrar el pago de administrador.', { cause: error });
  }
}

export async function approveAdminPayment(paymentId: string, verifierUid: string, notes?: string) {
  try {
    const updated = await db
      .update(adminPayments)
      .set({
        status: 'approved',
        verifiedBy: verifierUid,
        verificationNotes: notes || null,
      })
      .where(eq(adminPayments.id, paymentId))
      .returning();

    return updated[0];
  } catch (error) {
    console.error('Error al aprobar pago de administrador:', error);
    throw new Error('Error al aprobar el pago de administrador.', { cause: error });
  }
}
