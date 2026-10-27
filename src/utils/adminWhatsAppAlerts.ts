import { formatCOP } from './financialCalculations';

export interface AdminSubscriptionAlertData {
  tenantId: string;
  organizationName: string;
  adminName: string;
  adminPhone: string;
  adminEmail: string;
  activeRoutes: number;
  monthlyFeeCop: number;
  currentPeriodEnd: string;
  daysOverdue: number;
  daysRemaining: number;
}

export type WhatsAppTemplateTone =
  | 'blocked_mora_strict'
  | 'blocked_mora_urgent'
  | 'expiring_preventive'
  | 'expiring_friendly';

/**
 * Limpia y normaliza el teléfono a formato internacional de Colombia (+57)
 */
export function normalizeColombiaWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('57') && digits.length === 12) {
    return digits;
  }
  if (digits.length === 10) {
    return `57${digits}`;
  }
  return digits.length > 10 ? digits : `57${digits}`;
}

/**
 * Genera el mensaje para administradores en MORA (Servicio y cobradores bloqueados)
 */
export function buildOverdueBlockedMessage(
  data: AdminSubscriptionAlertData,
  tone: 'blocked_mora_strict' | 'blocked_mora_urgent' = 'blocked_mora_strict',
  customNote?: string
): string {
  const formattedFee = formatCOP(data.monthlyFeeCop);
  const formattedDate = new Date(data.currentPeriodEnd).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (tone === 'blocked_mora_strict') {
    return `🚨 *ACCESO SUSPENDIDO | SERVICIO INHABILITADO ENRUTA SAAS* 🚨

Estimado(a) *${data.adminName}* (*${data.organizationName}*):

Le informamos que su cuenta administrativa y la operación de su fondo han sido *BLOQUEADAS* por registrar *${data.daysOverdue} día(s) de mora en su suscripción* (Fecha de corte: ${formattedDate}).

⛔ *ESTADO ACTUAL DE SU SISTEMA:*
• *Usted está sin uso de la aplicación* (acceso restringido por paywall de seguridad).
• *Sus cobradores NO pueden ingresar a la app* en calle ni registrar cobros.
• *Rutas de recaudo paralizadas* hasta confirmar la reactivación de cuenta.
• Los clientes no pueden ser gestionados ni se pueden generar nuevos créditos.

💰 *Total pendiente por pagar:* *${formattedFee} COP* (${data.activeRoutes} ruta(s) activas)

${customNote ? `📝 *Nota de Administración:* ${customNote}\n\n` : ''}⚡ *¿CÓMO DESBLOQUEAR Y TRABAJAR DE INMEDIATO?*
1. Ingrese a su panel web para pagar con Wompi (Nequi / Bancolombia / Tarjeta).
2. O envíe su comprobante de transferencia bancaria por este medio a la administración.

Una vez registrado el pago, su cuenta y los celulares de sus cobradores quedarán habilitados de forma inmediata.

_Atentamente,_
*Dirección Financiera & Operaciones - EnRuta SaaS*`;
  }

  // Tono Urgente pero enfocado en rescate del flujo de caja
  return `⚠️ *URGENTE: COBRADORES SIN ACCESO | ENRUTA SAAS* ⚠️

Hola *${data.adminName}* (*${data.organizationName}*):

Le escribimos de soporte EnRuta para recordarle que su suscripción se encuentra *VENCIDA hace ${data.daysOverdue} días*. 

En este momento *el sistema se encuentra bloqueado y sus cobradores no tienen permitido trabajar ni asentar cuotas en calle* para proteger la integridad contable de su fondo.

📌 *Detalle de liquidación:*
• Fondo: ${data.organizationName}
• Rutas afectadas: ${data.activeRoutes}
• Monto adeudado: *${formattedFee} COP*
• Fecha de corte vencida: ${formattedDate}

${customNote ? `💬 *Mensaje directo:* ${customNote}\n\n` : ''}Por favor póngase al día hoy mismo para restaurar el acceso de su equipo y evitar pérdidas en su recaudo diario.

👉 Responda a este mensaje con su soporte de pago o renueve vía Wompi en la plataforma.`;
}

/**
 * Genera el mensaje para administradores POR VENCER (Ponerse al día oportunamente)
 */
export function buildExpiringSoonMessage(
  data: AdminSubscriptionAlertData,
  tone: 'expiring_preventive' | 'expiring_friendly' = 'expiring_preventive',
  customNote?: string
): string {
  const formattedFee = formatCOP(data.monthlyFeeCop);
  const formattedDate = new Date(data.currentPeriodEnd).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (tone === 'expiring_preventive') {
    return `🔔 *AVISO DE FACTURACIÓN: CORTE PRÓXIMO | ENRUTA SAAS* 🔔

Hola *${data.adminName}* (*${data.organizationName}*):

Le recordamos que la suscripción mensual de su fondo está próxima a vencer el *${formattedDate}* (quedan *${data.daysRemaining} día(s)* de servicio activo).

🛡️ *PÓNGASE AL DÍA A TIEMPO:*
Para evitar la suspensión automática de su plataforma y garantizar que sus cobradores en calle sigan trabajando sin interrupciones ni bloqueos de sesión, gestione el pago oportunamente.

💵 *Valor del ciclo:* *${formattedFee} COP*
🛵 *Rutas cubiertas:* ${data.activeRoutes} ruta(s)
📅 *Fecha límite:* ${formattedDate}

${customNote ? `📝 *Observación:* ${customNote}\n\n` : ''}Puede pagar de forma 100% segura mediante *Wompi (Nequi / Bancolombia / PSE)* desde su panel de administración o coordinar con la SuperAdministración.

¡Gracias por su puntualidad y por confiar la gestión de su cartera a EnRuta!`;
  }

  // Tono amigable / recordatorio de fin de ciclo
  return `👋 *Hola ${data.adminName} (${data.organizationName})*:

Esperamos que las rutas de hoy vayan con excelente recaudo. Le compartimos un recordatorio preventivo: su mensualidad de EnRuta SaaS vencerá en *${data.daysRemaining} días* (${formattedDate}).

Tarifa a renovar: *${formattedFee} COP* (${data.activeRoutes} rutas).

Le recomendamos ponerse al día antes de la fecha de corte para que sus cobradores no experimenten caídas de sesión ni bloqueos en calle.

${customNote ? `Nota: ${customNote}\n` : ''}¡Quedamos atentos a cualquier inquietud!`;
}

/**
 * Genera el enlace oficial de WhatsApp Web / App
 */
export function createWhatsAppWebUrl(phone: string, message: string): string {
  const cleanPhone = normalizeColombiaWhatsAppPhone(phone);
  return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
}
