import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadavg } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { randomBytes } from 'node:crypto';
import * as Y from 'yjs';
import { config as runtimeConfig } from '../config';
import { sessionRepository } from '../repositories/session';
import { userRepository } from '../repositories/user';
import { verifyPassword } from '../utils/password';

type Scenario = 'chat' | 'doc' | 'whiteboard' | 'mixed';
type Phase = 'warmup' | 'active' | 'idle' | 'recovery' | 'complete';
type ClientKind = 'chat' | 'doc' | 'whiteboard';

interface CliConfig {
  scenario: Scenario;
  clients: number;
  warmupMs: number;
  activeMs: number;
  idleMs: number;
  recoveryMs: number;
  sampleMs: number;
  baseUrl: string;
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  workspaceName: string;
  outputDir: string;
  startBackend: boolean;
  startDb: boolean;
  seedHistory: number;
  quiet: boolean;
  verbose: boolean;
  logJson: boolean;
}

interface ProjectRecord {
  id: string;
  name: string;
}

interface DocRecord {
  id: string;
  title: string;
}

interface WhiteboardRecord {
  id: string;
  name: string;
}

interface ChannelRecord {
  id: string;
  name: string;
  projectId: string | null;
}

interface ResourceBundle {
  project: ProjectRecord;
  docs: DocRecord[];
  whiteboards: WhiteboardRecord[];
  channels: ChannelRecord[];
}

interface SoakUser {
  id: string;
  email: string;
  password: string;
  cookie: string;
}

interface CleanupManifest {
  createdAt: string;
  projectId: string;
  userIds: string[];
}

interface DiagnosticsSnapshot {
  ts: string;
  phase: Phase;
  payload: DiagnosticsPayload;
  system: SystemMetrics;
}

interface SystemMetrics {
  cpuPercent: number | null;
  loadAverage: [number, number, number];
  memory: {
    totalBytes: number;
    availableBytes: number;
    usedBytes: number;
    usedPercent: number;
  };
}

interface CpuSampleState {
  total: number;
  idle: number;
}

interface DiagnosticsPayload {
  data: {
    websockets: {
      chat: {
        connections: number;
        connectedUsers: number;
        subscribedChannels: number;
        awaitingPong: number;
      };
      docs: {
        activeRooms: number;
        clients: number;
        awaitingPong: number;
      };
      whiteboards: {
        activeRooms: number;
        clients: number;
        awaitingPong: number;
      };
    };
    runtime: {
      process: {
        memory: {
          rss: number;
          heapUsed: number;
          heapTotal: number;
          external: number;
        };
      };
      eventLoopDelayMs: {
        mean: number;
        p95: number;
        max: number;
      };
    };
  };
}

interface ErrorPayload {
  error?: {
    message?: string;
  };
}

interface Summary {
  scenario: Scenario;
  clients: number;
  durationsMs: {
    warmup: number;
    active: number;
    idle: number;
    recovery: number;
  };
  resources: ResourceBundle;
  peaks: {
    rss: number;
    heapUsed: number;
    chatConnections: number;
    docClients: number;
    whiteboardClients: number;
    cpuPercent: number;
    memoryUsedPercent: number;
  };
  final: {
    rss: number;
    heapUsed: number;
    chatConnections: number;
    docClients: number;
    whiteboardClients: number;
    cpuPercent: number | null;
    memoryUsedPercent: number;
    availableMemoryBytes: number;
  };
  warnings: WarningEvent[];
  checks: {
    websocketCountsRecovered: boolean;
    roomsRecovered: boolean;
    awaitingPongRecovered: boolean;
    heapRecoveredNearBaseline: boolean;
    heapGrowthFlattenedDuringActivePhase: boolean;
  };
}

interface WarningEvent {
  ts: string;
  phase: Phase;
  code: string;
  message: string;
}

interface WarningTracker {
  highCpuStreak: number;
  triggeredCodes: Set<string>;
}

interface ChatSyncMessage {
  type: 'connected';
  userId: string;
}

interface DocSyncMessage {
  type: 'doc.sync';
  snapshot: string | null;
  updates: string[];
  latestSeq: number;
}

interface WhiteboardSyncMessage {
  type: 'whiteboard.sync';
  latestSeq: number;
}

const DEFAULT_BASE_URL = 'http://localhost:8080';
const DEFAULT_ADMIN_EMAIL = process.env.SOAK_ADMIN_EMAIL || 'admin@example.com';
const DEFAULT_ADMIN_PASSWORD = process.env.SOAK_ADMIN_PASSWORD || 'password123';
const DEFAULT_ADMIN_NAME = 'Memory Soak Admin';
const DEFAULT_WORKSPACE_NAME = 'Tuesday Memory Soak';
const DEFAULT_SAMPLE_INTERVAL_MS = 15_000;
const DEFAULT_SEED_HISTORY = 250;
const SOAK_PROJECT_PREFIX = 'Memory Soak';
const WHITEBOARD_ROOM_CAPACITY = 16;
const CHAT_CONNECTIONS_PER_USER = 5;
const REPORT_NAME = 'report.md';
const SUMMARY_NAME = 'summary.json';
const DIAGNOSTICS_NAME = 'diagnostics.ndjson';
const MANIFEST_NAME = 'manifest.json';
const CPU_WARNING_THRESHOLD_PERCENT = 85;
const CPU_WARNING_STREAK = 3;
const MEMORY_AVAILABLE_WARNING_PERCENT = 15;
const EVENT_LOOP_WARNING_P95_MS = 100;

function parseDuration(value: string) {
  const match = value.match(/^(\d+)(ms|s|m|h)?$/);
  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }

  const amount = Number.parseInt(match[1] ?? '0', 10);
  const unit = match[2] ?? 'ms';

  switch (unit) {
    case 'ms':
      return amount;
    case 's':
      return amount * 1_000;
    case 'm':
      return amount * 60_000;
    case 'h':
      return amount * 3_600_000;
    default:
      throw new Error(`Unsupported duration unit: ${unit}`);
  }
}

function formatTimestampForPath(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function parseArgs(argv: string[]): CliConfig {
  const options = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      options.set(key, true);
      continue;
    }

    options.set(key, next);
    index += 1;
  }

  const scenario = (options.get('scenario') as Scenario | undefined) ?? 'mixed';
  if (!['chat', 'doc', 'whiteboard', 'mixed'].includes(scenario)) {
    throw new Error(`Unsupported scenario: ${scenario}`);
  }

  const clients = Number.parseInt(String(options.get('clients') ?? '50'), 10);
  if (!Number.isFinite(clients) || clients <= 0) {
    throw new Error(`Invalid client count: ${clients}`);
  }

  const outputDir = resolve(
    process.cwd(),
    String(options.get('output') ?? join('soak-results', formatTimestampForPath()))
  );

  return {
    scenario,
    clients,
    warmupMs: parseDuration(String(options.get('warmup') ?? '5m')),
    activeMs: parseDuration(String(options.get('active') ?? '20m')),
    idleMs: parseDuration(String(options.get('idle') ?? '10m')),
    recoveryMs: parseDuration(String(options.get('recovery') ?? '10m')),
    sampleMs: parseDuration(String(options.get('sample') ?? `${DEFAULT_SAMPLE_INTERVAL_MS}ms`)),
    baseUrl: String(options.get('base-url') ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
    adminEmail: String(options.get('admin-email') ?? DEFAULT_ADMIN_EMAIL),
    adminPassword: String(options.get('admin-password') ?? DEFAULT_ADMIN_PASSWORD),
    adminName: String(options.get('admin-name') ?? DEFAULT_ADMIN_NAME),
    workspaceName: String(options.get('workspace-name') ?? DEFAULT_WORKSPACE_NAME),
    outputDir,
    startBackend: options.get('start-backend') === true,
    startDb: options.get('start-db') === true,
    seedHistory: Number.parseInt(String(options.get('seed-history') ?? DEFAULT_SEED_HISTORY), 10),
    quiet: options.get('quiet') === true,
    verbose: options.get('verbose') === true,
    logJson: options.get('log-json') === true,
  };
}

function formatBytes(value: number) {
  if (value >= 1024 ** 3) {
    return `${(value / 1024 ** 3).toFixed(2)}GB`;
  }

  return `${(value / 1024 ** 2).toFixed(0)}MB`;
}

function formatDuration(valueMs: number) {
  const totalSeconds = Math.floor(valueMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function logLine(config: CliConfig, scope: string, message: string, force = false) {
  if (config.quiet && !force) {
    return;
  }

  if (config.logJson) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), scope, message }));
    return;
  }

  console.log(`[${scope}] ${message}`);
}

async function readCpuSample() {
  const contents = await readFile('/proc/stat', 'utf8');
  const firstLine = contents.split('\n')[0] ?? '';
  const values = firstLine
    .trim()
    .split(/\s+/)
    .slice(1)
    .map((value) => Number.parseInt(value, 10));

  if (values.length < 4 || values.some((value) => Number.isNaN(value))) {
    throw new Error('Unable to read /proc/stat CPU values');
  }

  const idle = (values[3] ?? 0) + (values[4] ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  return { idle, total } satisfies CpuSampleState;
}

async function readSystemMetrics(previousCpu: CpuSampleState | null) {
  const [cpuSample, meminfo] = await Promise.all([
    readCpuSample(),
    readFile('/proc/meminfo', 'utf8'),
  ]);

  const memTotalKb = Number.parseInt(meminfo.match(/^MemTotal:\s+(\d+)\s+kB$/m)?.[1] ?? '0', 10);
  const memAvailableKb = Number.parseInt(meminfo.match(/^MemAvailable:\s+(\d+)\s+kB$/m)?.[1] ?? '0', 10);
  const totalBytes = memTotalKb * 1024;
  const availableBytes = memAvailableKb * 1024;
  const usedBytes = Math.max(0, totalBytes - availableBytes);
  const usedPercent = totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(1)) : 0;

  let cpuPercent: number | null = null;
  if (previousCpu) {
    const totalDelta = cpuSample.total - previousCpu.total;
    const idleDelta = cpuSample.idle - previousCpu.idle;
    if (totalDelta > 0) {
      cpuPercent = Number((((totalDelta - idleDelta) / totalDelta) * 100).toFixed(1));
    }
  }

  return {
    cpuSample,
    metrics: {
      cpuPercent,
      loadAverage: loadavg().map((value) => Number(value.toFixed(2))) as [number, number, number],
      memory: {
        totalBytes,
        availableBytes,
        usedBytes,
        usedPercent,
      },
    } satisfies SystemMetrics,
  };
}

function phaseForOffset(offsetMs: number, config: CliConfig): Phase {
  if (offsetMs < config.warmupMs) {
    return 'warmup';
  }

  if (offsetMs < config.warmupMs + config.activeMs) {
    return 'active';
  }

  if (offsetMs < config.warmupMs + config.activeMs + config.idleMs) {
    return 'idle';
  }

  if (offsetMs < config.warmupMs + config.activeMs + config.idleMs + config.recoveryMs) {
    return 'recovery';
  }

  return 'complete';
}

function encodeBase64(data: Uint8Array) {
  return Buffer.from(data).toString('base64');
}

function decodeBase64(data: string) {
  return new Uint8Array(Buffer.from(data, 'base64'));
}

async function waitForBackend(baseUrl: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }

    await sleep(1_000);
  }

  throw new Error(`Backend did not become healthy within ${timeoutMs}ms`);
}

async function maybeStartDb(config: CliConfig) {
  if (!config.startDb) {
    return;
  }

  logLine(config, 'setup', 'starting tuesday-db container');
  const process = Bun.spawn(['docker', 'start', 'tuesday-db'], {
    stdout: 'ignore',
    stderr: 'ignore',
  });
  await process.exited;
  logLine(config, 'setup', 'database container ready');
}

async function maybeStartBackend(config: CliConfig) {
  try {
    await waitForBackend(config.baseUrl, 2_000);
    logLine(config, 'setup', `backend reachable at ${config.baseUrl}`);
    return null;
  } catch {
    if (!config.startBackend) {
      throw new Error('Backend is not reachable. Start it first or pass --start-backend.');
    }
  }

  const backendProcess = Bun.spawn(['bun', 'run', 'dev'], {
    cwd: process.cwd(),
    stdout: 'inherit',
    stderr: 'inherit',
  });
  await waitForBackend(config.baseUrl);
  logLine(config, 'setup', `started backend at ${config.baseUrl}`);
  return backendProcess;
}

function logSample(config: CliConfig, snapshot: DiagnosticsSnapshot, startedAt: number) {
  const elapsed = formatDuration(new Date(snapshot.ts).getTime() - startedAt);
  const systemCpu = snapshot.system.cpuPercent === null ? 'n/a' : `${snapshot.system.cpuPercent.toFixed(1)}%`;
  const totalAwaitingPong =
    snapshot.payload.data.websockets.chat.awaitingPong +
    snapshot.payload.data.websockets.docs.awaitingPong +
    snapshot.payload.data.websockets.whiteboards.awaitingPong;

  logLine(
    config,
    'sample',
    `${elapsed} ${snapshot.phase} proc:rss=${formatBytes(snapshot.payload.data.runtime.process.memory.rss)} heap=${formatBytes(snapshot.payload.data.runtime.process.memory.heapUsed)} ` +
      `evt_p95=${snapshot.payload.data.runtime.eventLoopDelayMs.p95}ms host:cpu=${systemCpu} mem=${snapshot.system.memory.usedPercent.toFixed(1)}% ` +
      `avail=${formatBytes(snapshot.system.memory.availableBytes)} load=${snapshot.system.loadAverage.join('/')} ` +
      `chat=${snapshot.payload.data.websockets.chat.connections} docs=${snapshot.payload.data.websockets.docs.activeRooms}/${snapshot.payload.data.websockets.docs.clients} ` +
      `wb=${snapshot.payload.data.websockets.whiteboards.activeRooms}/${snapshot.payload.data.websockets.whiteboards.clients} pong=${totalAwaitingPong}`
  );
}

function recordWarning(
  config: CliConfig,
  tracker: WarningTracker,
  warnings: WarningEvent[],
  snapshot: DiagnosticsSnapshot,
  code: string,
  message: string
) {
  if (tracker.triggeredCodes.has(code)) {
    return;
  }

  tracker.triggeredCodes.add(code);
  warnings.push({
    ts: snapshot.ts,
    phase: snapshot.phase,
    code,
    message,
  });
  logLine(config, 'warn', `${snapshot.phase} ${message}`, true);
}

function evaluateWarnings(
  config: CliConfig,
  tracker: WarningTracker,
  warnings: WarningEvent[],
  snapshot: DiagnosticsSnapshot
) {
  if (snapshot.system.cpuPercent !== null && snapshot.system.cpuPercent >= CPU_WARNING_THRESHOLD_PERCENT) {
    tracker.highCpuStreak += 1;
  } else {
    tracker.highCpuStreak = 0;
  }

  if (tracker.highCpuStreak >= CPU_WARNING_STREAK) {
    recordWarning(
      config,
      tracker,
      warnings,
      snapshot,
      'high_cpu',
      `high host CPU for ${tracker.highCpuStreak} samples (${snapshot.system.cpuPercent?.toFixed(1)}%)`
    );
  }

  const availablePercent = snapshot.system.memory.totalBytes > 0
    ? (snapshot.system.memory.availableBytes / snapshot.system.memory.totalBytes) * 100
    : 100;
  if (availablePercent <= MEMORY_AVAILABLE_WARNING_PERCENT) {
    recordWarning(
      config,
      tracker,
      warnings,
      snapshot,
      'low_available_memory',
      `low available host memory (${availablePercent.toFixed(1)}% free)`
    );
  }

  if (snapshot.payload.data.runtime.eventLoopDelayMs.p95 >= EVENT_LOOP_WARNING_P95_MS) {
    recordWarning(
      config,
      tracker,
      warnings,
      snapshot,
      'high_event_loop_delay',
      `event loop p95 elevated (${snapshot.payload.data.runtime.eventLoopDelayMs.p95}ms)`
    );
  }
}

function extractCookie(response: Response) {
  const setCookie = response.headers.get('set-cookie');
  const match = setCookie?.match(/session_id=([^;]+)/);
  if (!match?.[1]) {
    throw new Error('Session cookie was not returned by login');
  }

  return `session_id=${match[1]}`;
}

async function createSessionCookie(userId: string) {
  const sessionId = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + runtimeConfig.sessionDurationHours * 60 * 60 * 1_000);
  await sessionRepository.create({
    id: sessionId,
    userId,
    expiresAt,
    ip: '127.0.0.1',
    userAgent: 'memory-soak-runner',
  });

  return `session_id=${sessionId}`;
}

class ApiSession {
  private cookie: string | null = null;

  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (!headers.has('Content-Type') && init.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (this.cookie) {
      headers.set('Cookie', this.cookie);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    const payload = await response.json().catch(async () => ({
      error: {
        message: await response.text(),
      },
    })) as { data: T } & ErrorPayload;

    if (!response.ok) {
      const message = typeof payload.error?.message === 'string'
        ? payload.error.message
        : `Request failed with status ${response.status}`;
      throw new Error(`${response.status} ${message}`);
    }

    return {
      payload: payload as { data: T },
      response,
    };
  }

  async setupIfNeeded(config: CliConfig) {
    const { payload } = await this.request<{ initialized: boolean }>('/api/v1/setup/status');
    if (payload.data.initialized) {
      return;
    }

    await this.request('/api/v1/setup/complete', {
      method: 'POST',
      body: JSON.stringify({
        workspaceName: config.workspaceName,
        adminEmail: config.adminEmail,
        adminName: config.adminName,
        adminPassword: config.adminPassword,
      }),
    });
  }

  async login(email: string, password: string) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials. Pass --admin-email/--admin-password or set SOAK_ADMIN_EMAIL/SOAK_ADMIN_PASSWORD.');
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword || user.isDisabled) {
      throw new Error('Invalid credentials. Pass --admin-email/--admin-password or set SOAK_ADMIN_EMAIL/SOAK_ADMIN_PASSWORD.');
    }

    this.cookie = await createSessionCookie(user.id);
  }

  getCookieHeader() {
    if (!this.cookie) {
      throw new Error('Not authenticated');
    }

    return this.cookie;
  }

  async getDiagnostics() {
    const { payload } = await this.request<DiagnosticsPayload['data']>('/api/v1/admin/diagnostics');
    return { data: payload.data } as DiagnosticsPayload;
  }

  async listProjects() {
    const { payload } = await this.request<ProjectRecord[]>('/api/v1/projects');
    return payload.data;
  }

  async createProject(name: string) {
    const { payload } = await this.request<ProjectRecord>('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name, client: 'Memory Soak' }),
    });
    return payload.data;
  }

  async listDocs(projectId: string) {
    const { payload } = await this.request<DocRecord[]>(`/api/v1/docs/projects/${projectId}/docs`);
    return payload.data;
  }

  async createDoc(projectId: string, title: string) {
    const { payload } = await this.request<DocRecord>(`/api/v1/docs/projects/${projectId}/docs`, {
      method: 'POST',
      body: JSON.stringify({ title, content: [] }),
    });
    return payload.data;
  }

  async listWhiteboards(projectId: string) {
    const { payload } = await this.request<WhiteboardRecord[]>(`/api/v1/whiteboards/projects/${projectId}/whiteboards`);
    return payload.data;
  }

  async createWhiteboard(projectId: string, name: string) {
    const { payload } = await this.request<WhiteboardRecord>(`/api/v1/whiteboards/projects/${projectId}/whiteboards`, {
      method: 'POST',
      body: JSON.stringify({ name, data: { elements: [], files: {} } }),
    });
    return payload.data;
  }

  async listChannels() {
    const { payload } = await this.request<ChannelRecord[]>('/api/v1/channels');
    return payload.data;
  }

  async createChannel(projectId: string, name: string) {
    const { payload } = await this.request<ChannelRecord>('/api/v1/channels', {
      method: 'POST',
      body: JSON.stringify({
        name,
        projectId,
        type: 'project',
        access: 'public',
      }),
    });
    return payload.data;
  }

  async createUser(email: string, name: string, password: string) {
    const { payload } = await this.request<{
      id: string;
      email: string;
      name: string;
      role: string;
    }>('/api/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email,
        name,
        role: 'member',
        password,
      }),
    });
    return payload.data;
  }

  async addProjectMember(projectId: string, userId: string) {
    await this.request(`/api/v1/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify({
        userId,
        role: 'member',
      }),
    });
  }

  async deleteProject(projectId: string) {
    await this.request(`/api/v1/projects/${projectId}`, {
      method: 'DELETE',
    });
  }

  async deleteUser(userId: string) {
    await this.request(`/api/v1/admin/users/${userId}`, {
      method: 'DELETE',
    });
  }
}

async function provisionResources(api: ApiSession, config: CliConfig) {
  const suffix = formatTimestampForPath();
  const project = await api.createProject(`${SOAK_PROJECT_PREFIX} ${suffix}`);
  const poolSize = Math.max(4, Math.ceil(config.clients / WHITEBOARD_ROOM_CAPACITY));

  const docs = await Promise.all(
    Array.from({ length: poolSize }, (_, index) => api.createDoc(project.id, `soak-doc-${index + 1}`))
  );
  const whiteboards = await Promise.all(
    Array.from({ length: poolSize }, (_, index) => api.createWhiteboard(project.id, `soak-whiteboard-${index + 1}`))
  );
  const channels = await Promise.all(
    Array.from({ length: poolSize }, (_, index) => api.createChannel(project.id, `soak-chat-${index + 1}`))
  );

  return { project, docs, whiteboards, channels } satisfies ResourceBundle;
}

function requiredUserCount(config: CliConfig) {
  const chatClients = config.scenario === 'chat'
    ? config.clients
    : config.scenario === 'mixed'
      ? Math.min(20, config.clients)
      : 0;

  return Math.max(1, Math.ceil(chatClients / CHAT_CONNECTIONS_PER_USER));
}

async function provisionUsers(api: ApiSession, config: CliConfig, projectId: string) {
  const userCount = requiredUserCount(config);
  const suffix = formatTimestampForPath();
  const users: SoakUser[] = [];

  for (let index = 0; index < userCount; index += 1) {
    const email = `memory-soak-${suffix}-${index + 1}@example.com`;
    const password = `SoakPass${suffix.slice(-6)}!${index + 1}`;
    const created = await api.createUser(email, `Memory Soak User ${index + 1}`, password);
    await api.addProjectMember(projectId, created.id);

    users.push({
      id: created.id,
      email,
      password,
      cookie: await createSessionCookie(created.id),
    });
  }

  return users;
}

async function writeManifest(outputDir: string, manifest: CleanupManifest) {
  await writeFile(join(outputDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2), 'utf8');
}

async function cleanupResources(api: ApiSession, manifest: CleanupManifest) {
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
}

async function waitForMessage<T extends { type: string }>(
  ws: WebSocket,
  predicate: (message: T) => boolean,
  timeoutMs = 10_000
) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeEventListener('message', onMessage);
      reject(new Error(`Timed out waiting for websocket message after ${timeoutMs}ms`));
    }, timeoutMs);

    const onMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') {
        return;
      }

      try {
        const message = JSON.parse(event.data) as T;
        if (!predicate(message)) {
          return;
        }

        clearTimeout(timeout);
        ws.removeEventListener('message', onMessage);
        resolve(message);
      } catch {
        // Ignore malformed messages for the soak runner.
      }
    };

    ws.addEventListener('message', onMessage);
  });
}

function toWsUrl(baseUrl: string, path: string) {
  const normalized = baseUrl.replace(/^http/, 'ws');
  return `${normalized}${path}`;
}

async function seedDocHistory(baseUrl: string, cookie: string, docId: string, count: number) {
  const ws = new WebSocket(toWsUrl(baseUrl, `/api/v1/collab/docs/${docId}`), {
    headers: {
      Cookie: cookie,
    } as never,
  });

  const sync = await waitForMessage<DocSyncMessage | { type: 'ping'; ts?: number }>(
    ws,
    (message) => message.type === 'doc.sync'
  ) as DocSyncMessage;

  const ydoc = new Y.Doc();
  const text = ydoc.getText('soak');

  if (sync.snapshot) {
    Y.applyUpdate(ydoc, decodeBase64(sync.snapshot), 'remote');
  }
  for (const update of sync.updates) {
    Y.applyUpdate(ydoc, decodeBase64(update), 'remote');
  }

  for (let index = 0; index < count; index += 1) {
    const stateVector = Y.encodeStateVector(ydoc);
    text.insert(text.length, String(index % 10));
    const update = Y.encodeStateAsUpdate(ydoc, stateVector);
    ws.send(JSON.stringify({ type: 'doc.update', update: encodeBase64(update) }));
    if ((index + 1) % 25 === 0) {
      await sleep(10);
    }
  }

  ws.close();
}

async function seedWhiteboardHistory(baseUrl: string, cookie: string, whiteboardId: string, count: number) {
  const ws = new WebSocket(toWsUrl(baseUrl, `/api/v1/collab/whiteboards/${whiteboardId}`), {
    headers: {
      Cookie: cookie,
    } as never,
  });

  await waitForMessage<WhiteboardSyncMessage | { type: 'ping'; ts?: number }>(
    ws,
    (message) => message.type === 'whiteboard.sync'
  );

  for (let index = 0; index < count; index += 1) {
    ws.send(JSON.stringify({
      type: 'whiteboard.update',
      update: {
        elements: [{
          id: 'seed-shape',
          type: 'rectangle',
          x: 40 + index,
          y: 40 + index,
          width: 120,
          height: 80,
          angle: 0,
          strokeColor: '#2563eb',
          backgroundColor: '#bfdbfe',
          fillStyle: 'solid',
          strokeWidth: 1,
          strokeStyle: 'solid',
          roughness: 0,
          opacity: 100,
          groupIds: [],
          roundness: null,
          seed: index + 1,
          version: index + 1,
          versionNonce: index + 1,
          isDeleted: false,
        }],
        files: {},
      },
    }));

    if ((index + 1) % 25 === 0) {
      await sleep(10);
    }
  }

  ws.close();
}

interface ClientTarget {
  kind: ClientKind;
  resourceId: string;
}

class SoakClient {
  private ws: WebSocket | null = null;
  private ready = false;
  private closed = false;
  private ignorePings = false;
  private trafficTimer: ReturnType<typeof setInterval> | null = null;
  private updateTimer: ReturnType<typeof setInterval> | null = null;
  private doc: Y.Doc | null = null;
  private docText: Y.Text | null = null;
  private whiteboardVersion = 0;

  constructor(
    private readonly id: number,
    private readonly baseUrl: string,
    private readonly cookie: string,
    private readonly target: ClientTarget,
    private readonly writesEnabled: boolean
  ) {}

  private buildUrl() {
    switch (this.target.kind) {
      case 'chat':
        return toWsUrl(this.baseUrl, '/api/v1/ws');
      case 'doc':
        return toWsUrl(this.baseUrl, `/api/v1/collab/docs/${this.target.resourceId}`);
      case 'whiteboard':
        return toWsUrl(this.baseUrl, `/api/v1/collab/whiteboards/${this.target.resourceId}`);
    }
  }

  async connect() {
    this.closed = false;
    this.ready = false;
    this.ignorePings = false;

    const ws = new WebSocket(this.buildUrl(), {
      headers: {
        Cookie: this.cookie,
      } as never,
    });

    this.ws = ws;

    ws.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') {
        return;
      }

      let message: Record<string, unknown>;
      try {
        message = JSON.parse(event.data) as Record<string, unknown>;
      } catch {
        return;
      }

      if (message.type === 'ping') {
        if (!this.ignorePings) {
          ws.send(JSON.stringify({ type: 'pong', ts: message.ts }));
        }
        return;
      }

      if (this.target.kind === 'chat' && message.type === 'connected') {
        ws.send(JSON.stringify({ type: 'subscribe', channelId: this.target.resourceId }));
        this.ready = true;
        this.startTraffic();
        return;
      }

      if (this.target.kind === 'doc' && message.type === 'doc.sync') {
        const sync = message as unknown as DocSyncMessage;
        this.doc = new Y.Doc();
        this.docText = this.doc.getText('soak');
        if (sync.snapshot) {
          Y.applyUpdate(this.doc, decodeBase64(sync.snapshot), 'remote');
        }
        for (const update of sync.updates) {
          Y.applyUpdate(this.doc, decodeBase64(update), 'remote');
        }
        this.ready = true;
        this.startTraffic();
        return;
      }

      if (this.target.kind === 'doc' && message.type === 'doc.update' && typeof message.update === 'string' && this.doc) {
        Y.applyUpdate(this.doc, decodeBase64(message.update), 'remote');
        return;
      }

      if (this.target.kind === 'whiteboard' && message.type === 'whiteboard.sync') {
        const sync = message as unknown as WhiteboardSyncMessage;
        this.whiteboardVersion = sync.latestSeq;
        this.ready = true;
        this.startTraffic();
      }
    });

    ws.addEventListener('close', () => {
      this.closed = true;
      this.clearTimers();
    });

    await waitForMessage<ChatSyncMessage | DocSyncMessage | WhiteboardSyncMessage | { type: 'ping'; ts?: number }>(
      ws,
      (message) => message.type === 'connected' || message.type === 'doc.sync' || message.type === 'whiteboard.sync'
    );
  }

  private startTraffic() {
    this.clearTimers();

    if (this.target.kind === 'chat') {
      this.trafficTimer = setInterval(() => {
        this.ws?.send(JSON.stringify({
          type: 'typing',
          channelId: this.target.resourceId,
          isTyping: true,
        }));
      }, 15_000);

      if (this.writesEnabled) {
        this.updateTimer = setInterval(() => {
          this.ws?.send(JSON.stringify({
            type: 'message',
            channelId: this.target.resourceId,
            content: `soak-message-${this.id}-${Date.now()}`,
          }));
        }, 45_000);
      }

      return;
    }

    if (this.target.kind === 'doc') {
      this.trafficTimer = setInterval(() => {
        this.ws?.send(JSON.stringify({ type: 'presence.update', update: 'AAAA' }));
      }, 5_000);

      if (this.writesEnabled && this.doc && this.docText) {
        this.updateTimer = setInterval(() => {
          if (!this.doc || !this.docText) {
            return;
          }

          const stateVector = Y.encodeStateVector(this.doc);
          this.docText.insert(this.docText.length, String(this.id % 10));
          const update = Y.encodeStateAsUpdate(this.doc, stateVector);
          this.ws?.send(JSON.stringify({ type: 'doc.update', update: encodeBase64(update) }));
        }, 15_000);
      }

      return;
    }

    this.trafficTimer = setInterval(() => {
      this.ws?.send(JSON.stringify({
        type: 'whiteboard.presence',
        update: {
          pointer: {
            x: (this.id * 17 + Date.now()) % 800,
            y: (this.id * 29 + Date.now()) % 600,
            tool: 'pointer',
          },
          button: 'up',
        },
      }));
    }, 250);

    if (this.writesEnabled) {
      this.updateTimer = setInterval(() => {
        this.whiteboardVersion += 1;
        this.ws?.send(JSON.stringify({
          type: 'whiteboard.update',
          update: {
            elements: [{
              id: `writer-${this.id}`,
              type: 'ellipse',
              x: 50 + this.whiteboardVersion,
              y: 60 + this.whiteboardVersion,
              width: 80,
              height: 80,
              angle: 0,
              strokeColor: '#0f766e',
              backgroundColor: '#99f6e4',
              fillStyle: 'solid',
              strokeWidth: 1,
              strokeStyle: 'solid',
              roughness: 0,
              opacity: 100,
              groupIds: [],
              roundness: null,
              seed: this.id,
              version: this.whiteboardVersion,
              versionNonce: this.whiteboardVersion,
              isDeleted: false,
            }],
            files: {},
          },
        }));
      }, 12_000);
    }
  }

  setIgnorePings(value: boolean) {
    this.ignorePings = value;
  }

  async reconnect(delayMs: number) {
    await this.close();
    await sleep(delayMs);
    await this.connect();
  }

  async close() {
    this.clearTimers();
    if (!this.ws || this.closed) {
      return;
    }

    const ws = this.ws;
    await new Promise<void>((resolve) => {
      const finalize = () => {
        ws.removeEventListener('close', finalize);
        resolve();
      };
      ws.addEventListener('close', finalize);
      ws.close();
      setTimeout(finalize, 2_000);
    });
    this.closed = true;
    this.ws = null;
  }

  private clearTimers() {
    if (this.trafficTimer) {
      clearInterval(this.trafficTimer);
      this.trafficTimer = null;
    }
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }
}

function buildTargets(config: CliConfig, resources: ResourceBundle): ClientTarget[] {
  if (config.scenario === 'mixed') {
    const targets: ClientTarget[] = [];
    for (let index = 0; index < config.clients; index += 1) {
      if (index < 20) {
        targets.push({ kind: 'chat', resourceId: resources.channels[index % resources.channels.length].id });
      } else if (index < 35) {
        targets.push({ kind: 'doc', resourceId: resources.docs[index % resources.docs.length].id });
      } else {
        targets.push({ kind: 'whiteboard', resourceId: resources.whiteboards[index % resources.whiteboards.length].id });
      }
    }
    return targets;
  }

  const source = config.scenario === 'chat'
    ? resources.channels.map((channel) => channel.id)
    : config.scenario === 'doc'
      ? resources.docs.map((doc) => doc.id)
      : resources.whiteboards.map((whiteboard) => whiteboard.id);

  const kind: ClientKind = config.scenario;

  return Array.from({ length: config.clients }, (_, index) => ({
    kind,
    resourceId: source[index % source.length],
  }));
}

function assignUser(index: number, users: SoakUser[]) {
  return users[index % users.length];
}

function runChurn(clients: SoakClient[], config: CliConfig) {
  const cleanCloseCount = Math.min(10, clients.length);
  const staleCount = Math.min(10, Math.max(0, clients.length - cleanCloseCount));
  const reconnectCount = Math.min(10, Math.max(0, clients.length - cleanCloseCount - staleCount));
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const reconnectDelayMs = 5_000;

  timers.push(setTimeout(() => {
    logLine(config, 'churn', `clean-close clients=${cleanCloseCount}`);
    for (const client of clients.slice(0, cleanCloseCount)) {
      void client.close();
    }
  }, Math.floor(config.activeMs * 0.25)));

  timers.push(setTimeout(() => {
    logLine(config, 'churn', `ignoring heartbeat responses for clients=${staleCount}`);
    for (const client of clients.slice(cleanCloseCount, cleanCloseCount + staleCount)) {
      client.setIgnorePings(true);
    }
  }, Math.floor(config.activeMs * 0.5)));

  if (config.activeMs >= reconnectDelayMs * 2) {
    timers.push(setTimeout(() => {
      logLine(config, 'churn', `reconnect wave clients=${reconnectCount} delay=${reconnectDelayMs}ms`);
      for (const client of clients.slice(cleanCloseCount + staleCount, cleanCloseCount + staleCount + reconnectCount)) {
        void client.reconnect(reconnectDelayMs).catch((error) => {
          console.warn(`Reconnect warning for client during soak churn:`, error);
        });
      }
    }, Math.floor(config.activeMs * 0.75)));
  }

  return () => {
    for (const timer of timers) {
      clearTimeout(timer);
    }
  };
}

async function sampleDiagnostics(
  api: ApiSession,
  config: CliConfig,
  outputDir: string,
  startedAt: number,
  snapshots: DiagnosticsSnapshot[],
  previousCpu: CpuSampleState | null,
  tracker: WarningTracker,
  warnings: WarningEvent[],
  lastPhase: { value: Phase | null }
) {
  const diagnosticsPath = join(outputDir, DIAGNOSTICS_NAME);
  const phase = phaseForOffset(Date.now() - startedAt, config);
  const payload = await api.getDiagnostics();
  const systemSnapshot = await readSystemMetrics(previousCpu);
  const snapshot: DiagnosticsSnapshot = {
    ts: new Date().toISOString(),
    phase,
    payload,
    system: systemSnapshot.metrics,
  };

  if (lastPhase.value !== phase) {
    logLine(config, 'phase', `${phase} started`, true);
    lastPhase.value = phase;
  }

  snapshots.push(snapshot);
  logSample(config, snapshot, startedAt);
  evaluateWarnings(config, tracker, warnings, snapshot);
  await appendFile(diagnosticsPath, `${JSON.stringify(snapshot)}\n`, 'utf8');
  return systemSnapshot.cpuSample;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function buildSummary(
  config: CliConfig,
  resources: ResourceBundle,
  snapshots: DiagnosticsSnapshot[],
  warnings: WarningEvent[]
): Summary {
  const initial = snapshots[0]?.payload.data;
  const final = snapshots[snapshots.length - 1]?.payload.data;
  const finalSystem = snapshots[snapshots.length - 1]?.system;
  if (!initial || !final) {
    throw new Error('No diagnostics snapshots were captured');
  }

  const activeSnapshots = snapshots.filter((snapshot) => snapshot.phase === 'active');
  const activeHeapValues = activeSnapshots.map((snapshot) => snapshot.payload.data.runtime.process.memory.heapUsed);
  const midpoint = Math.max(1, Math.floor(activeHeapValues.length / 2));
  const firstHalfAverage = average(activeHeapValues.slice(0, midpoint));
  const secondHalfAverage = average(activeHeapValues.slice(midpoint));

  return {
    scenario: config.scenario,
    clients: config.clients,
    durationsMs: {
      warmup: config.warmupMs,
      active: config.activeMs,
      idle: config.idleMs,
      recovery: config.recoveryMs,
    },
    resources,
    peaks: {
      rss: Math.max(...snapshots.map((snapshot) => snapshot.payload.data.runtime.process.memory.rss)),
      heapUsed: Math.max(...snapshots.map((snapshot) => snapshot.payload.data.runtime.process.memory.heapUsed)),
      chatConnections: Math.max(...snapshots.map((snapshot) => snapshot.payload.data.websockets.chat.connections)),
      docClients: Math.max(...snapshots.map((snapshot) => snapshot.payload.data.websockets.docs.clients)),
      whiteboardClients: Math.max(...snapshots.map((snapshot) => snapshot.payload.data.websockets.whiteboards.clients)),
      cpuPercent: Math.max(...snapshots.map((snapshot) => snapshot.system.cpuPercent ?? 0)),
      memoryUsedPercent: Math.max(...snapshots.map((snapshot) => snapshot.system.memory.usedPercent)),
    },
    final: {
      rss: final.runtime.process.memory.rss,
      heapUsed: final.runtime.process.memory.heapUsed,
      chatConnections: final.websockets.chat.connections,
      docClients: final.websockets.docs.clients,
      whiteboardClients: final.websockets.whiteboards.clients,
      cpuPercent: finalSystem?.cpuPercent ?? null,
      memoryUsedPercent: finalSystem?.memory.usedPercent ?? 0,
      availableMemoryBytes: finalSystem?.memory.availableBytes ?? 0,
    },
    warnings,
    checks: {
      websocketCountsRecovered:
        final.websockets.chat.connections <= initial.websockets.chat.connections + 1 &&
        final.websockets.docs.clients <= initial.websockets.docs.clients + 1 &&
        final.websockets.whiteboards.clients <= initial.websockets.whiteboards.clients + 1,
      roomsRecovered:
        final.websockets.docs.activeRooms <= initial.websockets.docs.activeRooms + 1 &&
        final.websockets.whiteboards.activeRooms <= initial.websockets.whiteboards.activeRooms + 1,
      awaitingPongRecovered:
        final.websockets.chat.awaitingPong <= initial.websockets.chat.awaitingPong + 1 &&
        final.websockets.docs.awaitingPong <= initial.websockets.docs.awaitingPong + 1 &&
        final.websockets.whiteboards.awaitingPong <= initial.websockets.whiteboards.awaitingPong + 1,
      heapRecoveredNearBaseline: final.runtime.process.memory.heapUsed <= Math.round(initial.runtime.process.memory.heapUsed * 1.35),
      heapGrowthFlattenedDuringActivePhase: secondHalfAverage <= Math.round(firstHalfAverage * 1.2),
    },
  };
}

function formatSummaryReport(summary: Summary) {
  return [
    '# Memory Soak Report',
    '',
    `- Scenario: ${summary.scenario}`,
    `- Clients: ${summary.clients}`,
    `- Project: ${summary.resources.project.name} (${summary.resources.project.id})`,
    '',
    '## Peaks',
    '',
    `- RSS: ${summary.peaks.rss}`,
    `- Heap Used: ${summary.peaks.heapUsed}`,
    `- Host CPU: ${summary.peaks.cpuPercent.toFixed(1)}%`,
    `- Host Memory Used: ${summary.peaks.memoryUsedPercent.toFixed(1)}%`,
    `- Chat Connections: ${summary.peaks.chatConnections}`,
    `- Doc Clients: ${summary.peaks.docClients}`,
    `- Whiteboard Clients: ${summary.peaks.whiteboardClients}`,
    '',
    '## Final',
    '',
    `- RSS: ${summary.final.rss}`,
    `- Heap Used: ${summary.final.heapUsed}`,
    `- Host CPU: ${summary.final.cpuPercent === null ? 'n/a' : `${summary.final.cpuPercent.toFixed(1)}%`}`,
    `- Host Memory Used: ${summary.final.memoryUsedPercent.toFixed(1)}%`,
    `- Host Available Memory: ${formatBytes(summary.final.availableMemoryBytes)}`,
    `- Chat Connections: ${summary.final.chatConnections}`,
    `- Doc Clients: ${summary.final.docClients}`,
    `- Whiteboard Clients: ${summary.final.whiteboardClients}`,
    '',
    '## Checks',
    '',
    `- Websocket counts recovered: ${summary.checks.websocketCountsRecovered}`,
    `- Room counts recovered: ${summary.checks.roomsRecovered}`,
    `- Awaiting pong recovered: ${summary.checks.awaitingPongRecovered}`,
    `- Heap recovered near baseline: ${summary.checks.heapRecoveredNearBaseline}`,
    `- Heap growth flattened during active phase: ${summary.checks.heapGrowthFlattenedDuringActivePhase}`,
    '',
    '## Warnings',
    '',
    ...(summary.warnings.length === 0
      ? ['- None detected', '']
      : [...summary.warnings.map((warning) => `- [${warning.phase}] ${warning.ts} ${warning.code}: ${warning.message}`), '']),
  ].join('\n');
}

async function main() {
  const config = parseArgs(Bun.argv.slice(2));
  await mkdir(config.outputDir, { recursive: true });

  logLine(
    config,
    'soak',
    `scenario=${config.scenario} clients=${config.clients} warmup=${formatDuration(config.warmupMs)} active=${formatDuration(config.activeMs)} idle=${formatDuration(config.idleMs)} recovery=${formatDuration(config.recoveryMs)} sample=${formatDuration(config.sampleMs)}`,
    true
  );
  logLine(config, 'soak', `output=${config.outputDir}`, true);
  logLine(config, 'soak', `backend=${config.baseUrl} cleanup=enabled`, true);

  await maybeStartDb(config);
  const backendProcess = await maybeStartBackend(config);
  const api = new ApiSession(config.baseUrl);
  let manifest: CleanupManifest | null = null;
  let completed = false;

  try {
    logLine(config, 'setup', 'checking setup status');
    await api.setupIfNeeded(config);
    logLine(config, 'setup', `authenticating admin ${config.adminEmail}`);
    await api.login(config.adminEmail, config.adminPassword);
    logLine(config, 'setup', 'admin authenticated');
    const resources = await provisionResources(api, config);
    const cookie = api.getCookieHeader();
    const users = await provisionUsers(api, config, resources.project.id);
    logLine(config, 'resources', `project=${resources.project.name} id=${resources.project.id}`, true);
    logLine(
      config,
      'resources',
      `users=${users.length} docs=${resources.docs.length} whiteboards=${resources.whiteboards.length} channels=${resources.channels.length}`,
      true
    );
    if (config.verbose) {
      logLine(config, 'resources', `docIds=${resources.docs.map((doc) => doc.id).join(',')}`);
      logLine(config, 'resources', `whiteboardIds=${resources.whiteboards.map((whiteboard) => whiteboard.id).join(',')}`);
      logLine(config, 'resources', `channelIds=${resources.channels.map((channel) => channel.id).join(',')}`);
    }
    manifest = {
      createdAt: new Date().toISOString(),
      projectId: resources.project.id,
      userIds: users.map((user) => user.id),
    };
    await writeManifest(config.outputDir, manifest);
    logLine(config, 'resources', `manifest=${join(config.outputDir, MANIFEST_NAME)}`, true);

    if (config.seedHistory > 0 && (config.scenario === 'doc' || config.scenario === 'whiteboard' || config.scenario === 'mixed')) {
      logLine(config, 'seed', `seeding history count=${config.seedHistory} for docs=${resources.docs.length} whiteboards=${resources.whiteboards.length}`, true);
      for (const doc of resources.docs) {
        await seedDocHistory(config.baseUrl, cookie, doc.id, config.seedHistory);
      }
      for (const whiteboard of resources.whiteboards) {
        await seedWhiteboardHistory(config.baseUrl, cookie, whiteboard.id, config.seedHistory);
      }
      logLine(config, 'seed', 'history seeding complete', true);
    }

    const targets = buildTargets(config, resources);
    const clients = targets.map((target, index) => new SoakClient(
      index,
      config.baseUrl,
      assignUser(index, users).cookie,
      target,
      index % 5 === 0
    ));

    logLine(config, 'clients', `connecting ${clients.length} clients`, true);
    for (let index = 0; index < clients.length; index += 10) {
      const batch = clients.slice(index, index + 10);
      await Promise.all(batch.map((client) => client.connect()));
      logLine(config, 'clients', `connected ${Math.min(index + batch.length, clients.length)}/${clients.length}`);
    }

    const snapshots: DiagnosticsSnapshot[] = [];
    const startedAt = Date.now();
    let cpuState: CpuSampleState | null = null;
    const warningTracker: WarningTracker = {
      highCpuStreak: 0,
      triggeredCodes: new Set<string>(),
    };
    const warnings: WarningEvent[] = [];
    const lastPhase = { value: null as Phase | null };
    cpuState = await sampleDiagnostics(api, config, config.outputDir, startedAt, snapshots, cpuState, warningTracker, warnings, lastPhase);

    const sampler = setInterval(() => {
      void sampleDiagnostics(api, config, config.outputDir, startedAt, snapshots, cpuState, warningTracker, warnings, lastPhase)
        .then((nextCpuState) => {
          cpuState = nextCpuState;
        })
        .catch((error) => {
          logLine(config, 'warn', `diagnostics sample failed: ${error instanceof Error ? error.message : String(error)}`, true);
        });
    }, config.sampleMs);

    const stopChurn = runChurn(clients, config);

    await sleep(config.warmupMs + config.activeMs + config.idleMs);
    stopChurn();
    logLine(config, 'churn', 'recovery closing remaining clients', true);
    await Promise.all(clients.map((client) => client.close()));
    await sleep(config.recoveryMs);

    clearInterval(sampler);
    cpuState = await sampleDiagnostics(api, config, config.outputDir, startedAt, snapshots, cpuState, warningTracker, warnings, lastPhase);

    const summary = buildSummary(config, resources, snapshots, warnings);
    await writeFile(join(config.outputDir, SUMMARY_NAME), JSON.stringify(summary, null, 2), 'utf8');
    await writeFile(join(config.outputDir, REPORT_NAME), formatSummaryReport(summary), 'utf8');
    completed = true;

    if (manifest) {
      await cleanupResources(api, manifest);
      logLine(config, 'cleanup', 'temporary soak resources deleted', true);
    }

    logLine(config, 'summary', `peak_rss=${formatBytes(summary.peaks.rss)} peak_heap=${formatBytes(summary.peaks.heapUsed)} peak_cpu=${summary.peaks.cpuPercent.toFixed(1)}%`, true);
    logLine(
      config,
      'summary',
      `checks websocket=${summary.checks.websocketCountsRecovered} rooms=${summary.checks.roomsRecovered} pong=${summary.checks.awaitingPongRecovered} heap_recovery=${summary.checks.heapRecoveredNearBaseline}`,
      true
    );
    console.log(`Soak complete. Results written to ${config.outputDir}`);
  } catch (error) {
    if (manifest) {
      await cleanupResources(api, manifest);
      logLine(config, 'cleanup', 'temporary soak resources deleted after failure', true);
    }
    throw error;
  } finally {
    if (backendProcess) {
      backendProcess.kill();
    }

    if (!completed && manifest) {
      console.warn(`Cleanup manifest written to ${join(config.outputDir, MANIFEST_NAME)}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
