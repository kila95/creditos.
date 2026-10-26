import React, { useState } from 'react';
import { 
  Building2, 
  LogOut, 
  ShieldCheck, 
  ExternalLink, 
  CreditCard, 
  Wallet,
  UserCheck
} from 'lucide-react';
import { ClientProfile, LoanDetail, LedgerEntry } from '../data/mockData';
import { ClientAuthOtp } from './ClientPortal/ClientAuthOtp';
import { ClientCreditSummary } from './ClientPortal/ClientCreditSummary';
import { ClientPaymentLedger } from './ClientPortal/ClientPaymentLedger';
import { ClientPaymentActionSheet } from './ClientPortal/ClientPaymentActionSheet';
import { DigitalWalletModal } from './DigitalWalletModal';

interface ClientBorrowerViewProps {
  clients: ClientProfile[];
  loans: LoanDetail[];
  onDigitalPay: (loanId: string, amount: number, channel: 'nequi' | 'daviplata') => void;
  ledger?: LedgerEntry[];
}

export const ClientBorrowerView: React.FC<ClientBorrowerViewProps> = ({
  clients,
  loans,
  onDigitalPay,
  ledger = []
}) => {
  // Estado de autenticación sin contraseña (Magic link / OTP)
  const [authenticatedClient, setAuthenticatedClient] = useState<ClientProfile | null>(clients[0]);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  // Si no está autenticado, muestra la pantalla de acceso seguro OTP
  if (!authenticatedClient) {
    return (
      <ClientAuthOtp
        clients={clients}
        onAuthenticated={(client) => setAuthenticatedClient(client)}
      />
    );
  }

  // Buscar préstamos e historial del cliente autenticado
  const clientLoans = loans.filter(l => l.clientId === authenticatedClient.id);
  const activeLoan = clientLoans.find(l => l.status === 'activo' || l.status === 'mora_severa') || clientLoans[0];
  
  // Filtrar ledger correspondiente exclusivamente a este cliente
  const clientLedger = ledger.filter(e => e.clientId === authenticatedClient.id);

  return (
    <div className="max-w-xl mx-auto space-y-5 pb-16">
      {/* BARRA SUPERIOR DE SESIÓN DEL CLIENTE */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 px-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-300 font-semibold truncate max-w-[200px]">
            {authenticatedClient.tradeName}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Selector de simulación para desarrollo */}
          <select
            value={authenticatedClient.id}
            onChange={(e) => {
              const matched = clients.find(c => c.id === e.target.value);
              if (matched) setAuthenticatedClient(matched);
            }}
            className="bg-slate-800 text-[11px] text-slate-300 rounded-lg px-2 py-1 border border-slate-700"
          >
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                Cambiar: {c.tradeName}
              </option>
            ))}
          </select>

          <button
            onClick={() => setAuthenticatedClient(null)}
            className="text-slate-400 hover:text-rose-400 font-semibold flex items-center gap-1 text-[11px] transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Salir
          </button>
        </div>
      </div>

      {/* 1. RESUMEN DEL CRÉDITO ACTIVO */}
      {activeLoan ? (
        <ClientCreditSummary
          client={authenticatedClient}
          loan={activeLoan}
          onOpenPaymentActions={() => setWalletModalOpen(true)}
        />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-2">
          <UserCheck className="w-10 h-10 text-emerald-400 mx-auto" />
          <h3 className="text-base font-bold text-white">¡No tienes préstamos pendientes!</h3>
          <p className="text-xs text-slate-400">
            Tu historial está completamente al día. Puedes solicitar un nuevo cupo con tu cobrador asignado.
          </p>
        </div>
      )}

      {/* 2. ACCIONES DE PAGO DIGITAL & SOPORTE */}
      {activeLoan && (
        <ClientPaymentActionSheet
          client={authenticatedClient}
          loan={activeLoan}
          onOpenQrModal={() => setWalletModalOpen(true)}
        />
      )}

      {/* 3. HISTORIAL OFICIAL DE PAGOS (LEDGER) */}
      <ClientPaymentLedger
        ledgerEntries={clientLedger}
        totalDebt={activeLoan ? activeLoan.totalDebt : 1200000}
      />

      {/* MODAL DE BILLETERA DIGITAL & PAGOS CON QR */}
      {walletModalOpen && (
        <DigitalWalletModal
          client={authenticatedClient}
          loan={activeLoan}
          onApplyWalletToLoan={(amt) => {
            if (activeLoan) {
              onDigitalPay(activeLoan.id, amt, 'nequi');
            }
          }}
          onInstantDisbursement={() => {}}
          onClose={() => setWalletModalOpen(false)}
        />
      )}
    </div>
  );
};
