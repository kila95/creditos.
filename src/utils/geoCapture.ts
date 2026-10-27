/**
 * MÓDULO DE GEOLOCALIZACIÓN Y PREVENCIÓN DE FRAUDE EN RUTA
 * Captura coordenadas satelitales en el momento exacto del recaudo
 * Mitiga: 'jineteo' de cartera, falsos cobros y alteración de rutas
 */

export interface GeoCoordinateCapture {
  lat: number;
  lng: number;
  accuracyMeters: number;
  timestamp: string;
  isLiveSat: boolean;
  formatted: string;
}

// Coordenadas de referencia para Medellín (Plaza Mayor / Alpujarra)
const MEDELLIN_FALLBACK_COORDS = {
  lat: 6.2442,
  lng: -75.5812,
  accuracyMeters: 45,
};

/**
 * Captura GPS obligatoria de alta precisión con fallback defensivo.
 * Nunca bloquea el flujo del cobrador en caso de túnel o sótano,
 * pero etiqueta la señal satelital para auditoría forense.
 */
export async function capturePaymentCoordinates(): Promise<GeoCoordinateCapture> {
  const nowIso = new Date().toISOString();

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return {
      ...MEDELLIN_FALLBACK_COORDS,
      timestamp: nowIso,
      isLiveSat: false,
      formatted: `${MEDELLIN_FALLBACK_COORDS.lat.toFixed(5)}, ${MEDELLIN_FALLBACK_COORDS.lng.toFixed(5)} (Sin GPS Hardware)`,
    };
  }

  return new Promise((resolve) => {
    // Timeout de 6 segundos para garantizar agilidad en la calle
    const timeoutId = setTimeout(() => {
      resolve({
        ...MEDELLIN_FALLBACK_COORDS,
        timestamp: nowIso,
        isLiveSat: false,
        formatted: `${MEDELLIN_FALLBACK_COORDS.lat.toFixed(5)}, ${MEDELLIN_FALLBACK_COORDS.lng.toFixed(5)} (GPS Timeout - Estimado)`,
      });
    }, 6000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeoutId);
        const { latitude, longitude, accuracy } = position.coords;
        const isPrecise = accuracy <= 100;
        
        resolve({
          lat: latitude,
          lng: longitude,
          accuracyMeters: Math.round(accuracy),
          timestamp: new Date(position.timestamp).toISOString(),
          isLiveSat: true,
          formatted: `${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${Math.round(accuracy)}m${isPrecise ? ' SAT' : ' Aprox'})`,
        });
      },
      (geoError) => {
        clearTimeout(timeoutId);
        console.warn('[GPS Ruta] No se pudo obtener satélite exacto:', geoError.message);
        resolve({
          ...MEDELLIN_FALLBACK_COORDS,
          timestamp: nowIso,
          isLiveSat: false,
          formatted: `${MEDELLIN_FALLBACK_COORDS.lat.toFixed(5)}, ${MEDELLIN_FALLBACK_COORDS.lng.toFixed(5)} (GPS Denegado/Interior)`,
        });
      },
      {
        enableHighAccuracy: true, // Forzar GPS de hardware (chip GPS móvil)
        timeout: 5500,
        maximumAge: 10000,        // Máximo 10 segundos de antigüedad
      }
    );
  });
}
