import { relations } from 'drizzle-orm';
import { 
  pgTable, 
  serial, 
  text, 
  integer, 
  numeric, 
  boolean, 
  timestamp, 
  jsonb 
} from 'drizzle-orm/pg-core';

// 1. USUARIOS Y PERFILES JERÁRQUICOS (3 NIVELES: super_admin -> admin -> collector)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Supabase Auth UID / RBAC UID
  email: text('email').notNull().unique(),
  password: text('password'), // Contraseña temporal / hash RBAC
  name: text('name').notNull(),
  role: text('role').notNull().default('collector'), // 'super_admin' | 'admin' | 'collector' | 'socio' | 'cobrador' | 'cliente'
  organizationId: text('organization_id').default('org-medellin-01'), // ID del fondo/negocio del admin
  organizationName: text('organization_name').default('Fondo RutaCapital Medellín'),
  createdBy: text('created_by'), // UID del super_admin o admin que creó esta cuenta
  assignedRouteId: text('assigned_route_id'),
  phone: text('phone'),
  documentId: text('document_id'),
  isActive: boolean('is_active').notNull().default(true),
  partnerEquityPct: numeric('partner_equity_pct', { precision: 5, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow(),
});

// 2. RUTAS DE COBRO DIARIO EN MEDELLÍN
export const routes = pgTable('routes', {
  id: text('id').primaryKey(), // ej. 'route-1'
  name: text('name').notNull(),
  zone: text('zone').notNull(), // ej. 'Comuna 13 San Javier'
  collectorId: text('collector_id'),
  collectorName: text('collector_name').notNull(),
  organizationId: text('organization_id').default('org-medellin-01'),
  createdBy: text('created_by').default('usr-admin-001'),
  status: text('status').notNull().default('active'),
  targetDailyCollection: numeric('target_daily_collection', { precision: 12, scale: 2 }).notNull(),
  operatingExpenseBudget: numeric('operating_expense_budget', { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 3. CLIENTES / DEUDORES
export const clients = pgTable('clients', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().unique(),
  name: text('name').notNull(),
  alias: text('alias'),
  phone: text('phone').notNull(),
  businessType: text('business_type').notNull(),
  address: text('address').notNull(),
  zone: text('zone').notNull(),
  routeId: text('route_id').notNull().references(() => routes.id),
  organizationId: text('organization_id').default('org-medellin-01'),
  createdBy: text('created_by').default('usr-admin-001'),
  riskScore: integer('risk_score').notNull().default(75),
  riskLevel: text('risk_level').notNull().default('verde'), // 'verde' | 'amarillo' | 'rojo'
  creditLimit: numeric('credit_limit', { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 4. MICROCRÉDITOS ACTIVOS (LOANS)
export const loans = pgTable('loans', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  routeId: text('route_id').notNull().references(() => routes.id),
  principalAmount: numeric('principal_amount', { precision: 12, scale: 2 }).notNull(),
  interestRate: numeric('interest_rate', { precision: 5, scale: 2 }).notNull(),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  dailyQuota: numeric('daily_quota', { precision: 12, scale: 2 }).notNull(),
  remainingBalance: numeric('remaining_balance', { precision: 12, scale: 2 }).notNull(),
  totalDays: integer('total_days').notNull(),
  paidDays: integer('paid_days').notNull().default(0),
  status: text('status').notNull().default('active'), // 'active' | 'completed' | 'defaulted'
  startDate: text('start_date').notNull(),
  expectedEndDate: text('expected_end_date').notNull(),
  extendedDueDate: text('extended_due_date'),
  lastPaymentDate: text('last_payment_date'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 5. LIBRO CONTABLE DIARIO (DAILY LEDGER) - INMUTABLE
export const dailyLedger = pgTable('daily_ledger', {
  id: text('id').primaryKey(),
  receiptNumber: text('receipt_number').notNull().unique(),
  loanId: text('loan_id').notNull().references(() => loans.id),
  clientId: text('client_id').notNull().references(() => clients.id),
  clientName: text('client_name').notNull(),
  routeId: text('route_id').notNull().references(() => routes.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  principalPortion: numeric('principal_portion', { precision: 12, scale: 2 }).notNull(),
  interestPortion: numeric('interest_portion', { precision: 12, scale: 2 }).notNull(),
  paymentMethod: text('payment_method').notNull(), // 'efectivo' | 'nequi' | 'daviplata'
  preBalance: numeric('pre_balance', { precision: 12, scale: 2 }).notNull(),
  postBalance: numeric('post_balance', { precision: 12, scale: 2 }).notNull(),
  timestamp: text('timestamp').notNull(),
  gpsLocation: text('gps_location').notNull(),
  hash: text('hash').notNull(),
  isSynced: boolean('is_synced').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// 6. ARQUEOS DE CAJA Y CIERRES DE TURNO (CASH DRAWER SESSIONS)
export const cashDrawerSessions = pgTable('cash_drawer_sessions', {
  id: text('id').primaryKey(),
  routeId: text('route_id').notNull().references(() => routes.id),
  date: text('date').notNull(),
  collectorId: text('collector_id').notNull(),
  collectorName: text('collector_name').notNull(),
  expectedCash: numeric('expected_cash', { precision: 12, scale: 2 }).notNull(),
  actualCashHanded: numeric('actual_cash_handed', { precision: 12, scale: 2 }).notNull(),
  discrepancy: numeric('discrepancy', { precision: 12, scale: 2 }).notNull(),
  status: text('status').notNull(), // 'balanced' | 'surplus' | 'shortage'
  notes: text('notes'),
  verifiedByAdmin: boolean('verified_by_admin').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// 7. BITÁCORA FORENSE DE AUDITORÍA CRIPTOGRÁFICA (AUDIT LOGS)
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  action: text('action').notNull(),
  actorId: text('actor_id').notNull(),
  actorName: text('actor_name').notNull(),
  actorRole: text('actor_role').notNull(),
  targetId: text('target_id').notNull(),
  timestamp: text('timestamp').notNull(),
  ipAddress: text('ip_address'),
  gpsLocation: text('gps_location'),
  oldState: jsonb('old_state'),
  newState: jsonb('new_state'),
  hash: text('hash').notNull(),
  verifiedIntegrity: boolean('verified_integrity').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// 8. GESTIÓN DE BASES SEMANALES PARA COBRADORES (COLLECTOR BASES)
export const collectorBases = pgTable('collector_bases', {
  id: text('id').primaryKey(), // UUID
  collectorId: text('collector_id').notNull(), // ID del usuario cobrador
  collectorName: text('collector_name').notNull(),
  routeId: text('route_id').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  weekStartDate: text('week_start_date').notNull(), // DATE (YYYY-MM-DD)
  status: text('status').notNull().default('ACTIVA'), // 'ACTIVA' | 'DEVUELTA'
  createdAt: timestamp('created_at').defaultNow(),
});

// RELACIONES RELACIONALES
export const clientsRelations = relations(clients, ({ one, many }) => ({
  route: one(routes, {
    fields: [clients.routeId],
    references: [routes.id],
  }),
  loans: many(loans),
}));

export const loansRelations = relations(loans, ({ one, many }) => ({
  client: one(clients, {
    fields: [loans.clientId],
    references: [clients.id],
  }),
  route: one(routes, {
    fields: [loans.routeId],
    references: [routes.id],
  }),
  ledgerEntries: many(dailyLedger),
}));

export const routesRelations = relations(routes, ({ many }) => ({
  clients: many(clients),
  loans: many(loans),
  cashDrawerSessions: many(cashDrawerSessions),
}));

