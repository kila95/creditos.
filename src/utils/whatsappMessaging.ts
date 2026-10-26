/**
 * GENERADOR DE MENSAJES Y COMPROBANTES VÍA WHATSAPP API
 * Compatible con Twilio WhatsApp API, Evolution API y enlaces directos
 */

import { LoanDetail, ClientProfile, LedgerEntry } from '../data/mockData';
import { formatCOP } from './financialCalculations';

export interface WhatsAppTemplate {
  recipientPhone: string;
  recipientName: string;
  tradeName: string;
  messageText: string;
  whatsappUrl: string;
}

/**
 * Genera el recordatorio de cobro matutino con detalles de cuota y link de pago digital
 */
export function buildMorningPaymentReminder(
  client: ClientProfile,
  loan: LoanDetail
): WhatsAppTemplate {
  // Limpiar teléfono para formato internacional E.164 (Colombia +57)
  const cleanPhone = client.phone.replace(/[^0-9]/g, '');

  const text = `🔔 *RECORDATORIO DE CUOTA DIARIA - RUTACAPITAL*
Hola *${client.name}* (${client.tradeName}), esperamos que tenga un excelente día en su negocio.

Le recordamos los detalles de su microcrédito activo:
📌 *Cuota de hoy:* ${formatCOP(loan.installmentAmount)}
📊 *Progreso:* Cuota ${loan.installmentsPaid + 1} de ${loan.termDays}
💰 *Saldo pendiente:* ${formatCOP(loan.remainingBalance)}

🛵 *El cobrador pasará por su local en su horario habitual matutino.*
📲 Si prefiere cancelar digitalmente, puede transferir vía *Nequi o Daviplata* y el cobrador le validará su comprobante al instante.

¡Agradecemos su puntualidad para mantener su cupo en categoría VERDE! ✅`;

  const encodedText = encodeURIComponent(text);
  const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;

  return {
    recipientPhone: client.phone,
    recipientName: client.name,
    tradeName: client.tradeName,
    messageText: text,
    whatsappUrl
  };
}

/**
 * Genera el comprobante digital certificado de recaudo para enviar al cliente por WhatsApp
 */
export function buildDigitalReceiptWhatsAppMessage(
  entry: LedgerEntry,
  client: ClientProfile,
  loan: LoanDetail
): WhatsAppTemplate {
  const cleanPhone = client.phone.replace(/[^0-9]/g, '');

  const dateStr = new Date(entry.timestamp).toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const text = `🧾 *COMPROBANTE OFICIAL DE RECAUDO DIGITAL*
*RutaCapital OS - Microfinanzas Medellín*
---------------------------------------
📄 *Folio Recibo:* #${entry.receiptNumber}
📅 *Fecha/Hora:* ${dateStr}
👤 *Cliente:* ${client.name}
🏪 *Comercio:* ${client.tradeName}
📍 *Sector:* ${client.neighborhood}

💵 *VALOR ABONADO:* *${formatCOP(entry.amount)}*
💳 *Medio de pago:* ${entry.paymentMethod.toUpperCase()}
---------------------------------------
📉 *Desglose Financiero:*
  • Amortización a Capital: ${formatCOP(entry.principalPortion)}
  • Interés devengado: ${formatCOP(entry.interestPortion)}
  
📊 *ESTADO DE SU CRÉDITO:*
  • Saldo anterior: ${formatCOP(entry.preBalance)}
  • *NUEVO SALDO PENDIENTE:* *${formatCOP(entry.postBalance)}*
  • Cuotas cumplidas: ${loan.installmentsPaid} de ${loan.termDays}

🔐 *Sello de Seguridad SHA-256:*
_${entry.hash.substring(0, 16)}..._
---------------------------------------
¡Gracias por su pago puntual! Este comprobante digital certifica la cancelación legal de su cuota.`;

  const encodedText = encodeURIComponent(text);
  const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;

  return {
    recipientPhone: client.phone,
    recipientName: client.name,
    tradeName: client.tradeName,
    messageText: text,
    whatsappUrl
  };
}
