import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { config as runtimeConfig } from '../config';
import { sessionRepository } from '../repositories/session';
import { userRepository } from '../repositories/user';
import { verifyPassword } from '../utils/password';

interface CleanupManifest {
  createdAt: string;
  projectId: string;
  userIds: string[];
}

function parseArgs(argv: string[]) {
  const options = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      continue;
    }

    options.set(key, next);
    index += 1;
  }

  const outputDir = options.get('output-dir');
  const manifestPath = options.get('manifest') ?? (outputDir ? join(outputDir, 'manifest.json') : '');
  const adminEmail = options.get('admin-email') ?? process.env.SOAK_ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = options.get('admin-password') ?? process.env.SOAK_ADMIN_PASSWORD ?? 'password123';

  if (!manifestPath) {
    throw new Error('Pass --manifest <path> or --output-dir <dir>.');
  }

  return {
    manifestPath: resolve(process.cwd(), manifestPath),
    adminEmail,
    adminPassword,
    baseUrl: (options.get('base-url') ?? 'http://localhost:8080').replace(/\/+$/, ''),
  };
}

async function createSessionCookie(userId: string) {
  const sessionId = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + runtimeConfig.sessionDurationHours * 60 * 60 * 1_000);
  await sessionRepository.create({
    id: sessionId,
    userId,
    expiresAt,
    ip: '127.0.0.1',
    userAgent: 'memory-soak-cleanup',
  });

  return `session_id=${sessionId}`;
}

class CleanupApiSession {
  private cookie: string | null = null;

  constructor(private readonly baseUrl: string) {}

  async login(email: string, password: string) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid admin credentials for cleanup.');
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword || user.isDisabled) {
      throw new Error('Invalid admin credentials for cleanup.');
    }

    this.cookie = await createSessionCookie(user.id);
  }

  private async request(path: string, init: RequestInit) {
    if (!this.cookie) {
      throw new Error('Cleanup session is not authenticated.');
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Cookie: this.cookie,
        ...(init.headers ?? {}),
      },
    });

    if (response.ok) {
      return;
    }

    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    const message = payload?.error?.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  async deleteProject(projectId: string) {
    await this.request(`/api/v1/projects/${projectId}`, { method: 'DELETE' });
  }

  async deleteUser(userId: string) {
    await this.request(`/api/v1/admin/users/${userId}`, { method: 'DELETE' });
  }
}

async function main() {
  const config = parseArgs(Bun.argv.slice(2));
  const manifest = JSON.parse(await readFile(config.manifestPath, 'utf8')) as CleanupManifest;
  const api = new CleanupApiSession(config.baseUrl);
  await api.login(config.adminEmail, config.adminPassword);

  try {
    await api.deleteProject(manifest.projectId);
  } catch (error) {
    console.warn(`Cleanup warning while deleting project ${manifest.projectId}:`, error);
  }

  for (const userId of manifest.userIds) {
    try {
      await api.deleteUser(userId);
    } catch (error) {
      console.warn(`Cleanup warning while deleting user ${userId}:`, error);
    }
  }

  console.log(`Cleanup completed for ${config.manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
