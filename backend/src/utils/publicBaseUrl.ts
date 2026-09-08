import { config } from '../config';

function normalizePublicUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      return null;
    }
    const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (config.nodeEnv === 'production' && url.protocol !== 'https:' && !isLoopback) return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function resolvePublicBaseUrl(legacySiteUrl?: string | null): string | null {
  if (config.publicBaseUrl) return normalizePublicUrl(config.publicBaseUrl);

  const legacyUrl = normalizePublicUrl(legacySiteUrl);
  if (legacyUrl) return legacyUrl;

  return config.nodeEnv === 'production' ? null : normalizePublicUrl(config.corsOrigin);
}
