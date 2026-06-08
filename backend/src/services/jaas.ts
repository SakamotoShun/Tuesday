import { settingsRepository } from '../repositories/settings';

export interface JaasSettings {
  enabled: boolean;
  appId: string;
  domain: string;
  defaultProvider: boolean;
  keyId: string;
  privateKey: string;
}

export interface PublicJaasSettings {
  enabled: boolean;
  defaultProvider: boolean;
  appId: string;
  domain: string;
}

export interface JaasJwtInput {
  meetingId: string;
  title: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
  };
  moderator: boolean;
}

export async function getJaasSettings(): Promise<JaasSettings> {
  const [enabled, appId, domain, defaultProvider, keyId, privateKey] = await Promise.all([
    settingsRepository.get<boolean>('jaas_enabled'),
    settingsRepository.get<string>('jaas_app_id'),
    settingsRepository.get<string>('jaas_domain'),
    settingsRepository.get<boolean>('jaas_default_provider'),
    settingsRepository.get<string>('jaas_key_id'),
    settingsRepository.get<string>('jaas_private_key'),
  ]);

  return {
    enabled: enabled ?? false,
    appId: appId?.trim() ?? '',
    domain: normalizeJaasDomain(domain ?? '8x8.vc'),
    defaultProvider: defaultProvider ?? true,
    keyId: keyId?.trim() ?? '',
    privateKey: privateKey?.trim() ?? '',
  };
}

export async function getPublicJaasSettings(): Promise<PublicJaasSettings> {
  const settings = await getJaasSettings();
  return {
    enabled: settings.enabled && settings.appId.length > 0,
    defaultProvider: settings.defaultProvider,
    appId: settings.enabled ? settings.appId : '',
    domain: settings.domain,
  };
}

export function buildJaasMeetingUrl(settings: JaasSettings, meetingId: string, title: string): string {
  if (!settings.enabled) {
    throw new Error('JaaS meetings are not enabled');
  }

  if (!settings.appId) {
    throw new Error('JaaS App ID is not configured');
  }

  if (!settings.domain) {
    throw new Error('JaaS domain is not configured');
  }

  const roomName = getJaasRoomName(title, meetingId);
  return `https://${settings.domain}/${encodeURIComponent(settings.appId)}/${encodeURIComponent(roomName)}`;
}

export async function buildJaasJoinUrl(settings: JaasSettings, input: JaasJwtInput): Promise<string> {
  const roomName = getJaasRoomName(input.title, input.meetingId);
  const token = await signJaasJwt(settings, input, roomName);
  return `https://${settings.domain}/${encodeURIComponent(settings.appId)}/${encodeURIComponent(roomName)}?jwt=${encodeURIComponent(token)}`;
}

export function assertJaasJwtConfigured(settings: JaasSettings): void {
  if (!settings.enabled) {
    throw new Error('JaaS meetings are not enabled');
  }
  if (!settings.appId) {
    throw new Error('JaaS App ID is not configured');
  }
  if (!settings.keyId) {
    throw new Error('JaaS Key ID is not configured');
  }
  if (!settings.privateKey) {
    throw new Error('JaaS private key is not configured');
  }
}

function normalizeJaasDomain(domain: string): string {
  return domain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function slugifyRoomTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');

  return slug || 'meeting';
}

function getJaasRoomName(title: string, fallbackSeed: string): string {
  const slug = slugifyRoomTitle(title);
  const suffix = generateStableSuffix(fallbackSeed);
  return slug === 'meeting' ? generateFallbackPassphrase(fallbackSeed) : `${slug}-${suffix}`;
}

function generateFallbackPassphrase(seed: string): string {
  const words = ['cedar', 'atlas', 'river', 'ember', 'harbor', 'signal', 'orbit', 'copper'];
  const normalizedSeed = seed.replace(/[^a-z0-9]/gi, '').toLowerCase() || crypto.randomUUID().replace(/-/g, '');
  const firstIndex = normalizedSeed.charCodeAt(0) % words.length;
  const secondIndex = normalizedSeed.charCodeAt(Math.min(1, normalizedSeed.length - 1)) % words.length;
  const suffix = normalizedSeed.slice(0, 4).padEnd(4, 'x');
  return `${words[firstIndex]}-${words[secondIndex]}-${suffix}`;
}

function generateStableSuffix(seed: string): string {
  const normalizedSeed = seed.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return (normalizedSeed || crypto.randomUUID().replace(/-/g, '')).slice(0, 6).padEnd(6, 'x');
}

async function signJaasJwt(settings: JaasSettings, input: JaasJwtInput, roomName: string): Promise<string> {
  assertJaasJwtConfigured(settings);

  const now = Math.floor(Date.now() / 1000);
  const kid = settings.keyId.includes('/') ? settings.keyId : `${settings.appId}/${settings.keyId}`;
  const header = { alg: 'RS256', kid, typ: 'JWT' };
  const payload = {
    aud: 'jitsi',
    iss: 'chat',
    sub: settings.appId,
    room: roomName,
    nbf: now - 10,
    exp: now + 60 * 60,
    context: {
      user: {
        id: input.user.id,
        name: input.user.name,
        email: input.user.email,
        avatar: input.user.avatarUrl ?? '',
        moderator: input.moderator ? 'true' : 'false',
      },
      features: {
        livestreaming: false,
        recording: false,
        transcription: false,
        'outbound-call': false,
      },
      room: { regex: false },
    },
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await importPrivateKey(settings.privateKey);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function importPrivateKey(privateKeyPem: string): Promise<CryptoKey> {
  const normalizedPem = privateKeyPem.replace(/\\n/g, '\n');
  const base64 = normalizedPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const keyData = Buffer.from(base64, 'base64');
  return crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function base64UrlEncode(value: string | ArrayBuffer): string {
  const buffer = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value);
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
