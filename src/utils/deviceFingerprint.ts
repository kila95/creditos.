/**
 * MÓDULO DE FINGERPRINTING Y SEGURIDAD DE DISPOSITIVOS
 * Captura un identificador único del navegador/teléfono celular y valida la autorización de acceso del cobrador.
 */

export function getDeviceFingerprint(): string {
  if (typeof window === 'undefined') return 'server-side-node';

  const STORAGE_KEY = 'rutacapital_device_fingerprint_v1';
  let deviceUUID = localStorage.getItem(STORAGE_KEY);

  if (!deviceUUID) {
    const screenRes = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
    const userAgent = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const lang = navigator.language || '';
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const rawFingerprint = `${screenRes}|${userAgent}|${platform}|${lang}|${timeZone}|${Date.now()}`;

    let hash = 0;
    for (let i = 0; i < rawFingerprint.length; i++) {
      const char = rawFingerprint.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }

    const shortHash = Math.abs(hash).toString(36).toUpperCase();
    const timeHex = Date.now().toString(36).toUpperCase();
    deviceUUID = `DEV-${shortHash}-${timeHex}`;

    try {
      localStorage.setItem(STORAGE_KEY, deviceUUID);
    } catch {
      // Ignorar restricciones de cookies/localstorage de terceros
    }
  }

  return deviceUUID;
}

export function resetLocalDeviceFingerprint(): string {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('rutacapital_device_fingerprint_v1');
  }
  return getDeviceFingerprint();
}
