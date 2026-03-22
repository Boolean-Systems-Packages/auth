/**
 * Genera un fingerprint SHA-256 del browser usando la Crypto API nativa.
 * No requiere librerías externas.
 *
 * El resultado se cachea en memoria para no recalcularse en cada request.
 */
let cachedFingerprint: string | null = null;

export async function getFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint;

  const data = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency ?? 0,
  ].join("|");

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  cachedFingerprint = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return cachedFingerprint;
}

/**
 * Obtiene o genera un deviceId único persistido en localStorage.
 * Formato: device_{timestamp}_{random}
 */
export function getOrCreateDeviceId(storageKey: string): string {
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;

  const deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(storageKey, deviceId);
  return deviceId;
}
