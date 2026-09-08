import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const scripts = import.meta.dir;
const roots: string[] = [];

// The mock executes filesystem commands only after mapping container paths into
// a disposable directory. It never invokes Docker or connects to PostgreSQL.
const dockerMock = String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const root = process.env.MOCK_ROOT;
const file = root + '/state.json';
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const scenario = process.env.MOCK_SCENARIO;
const map = value => value.replaceAll('/app/data', root + '/data');
const save = () => fs.writeFileSync(file, JSON.stringify(state));
const fail = () => { save(); process.exit(1); };
state.calls.push(args);
save();
if (args[0] === 'run') {
  if (scenario === 'container_collision') fail();
  console.log('mock');
} else if (args[0] === 'rm') {
  if (args[args.length - 1] !== 'mock') throw new Error('Deleting an unowned container');
} else if (args[0] === 'cp') {
  if (scenario === 'copy_fail') fail();
  const paths = args.slice(1).map(value => map(value.replace(/^mock:/, '')));
  fs.cpSync(paths[0], paths[1], { recursive: true });
} else if (args[0] === 'exec') {
  args.shift();
  while (args[0].startsWith('-')) {
    if (args.shift() === '-u') args.shift();
  }
  if (args.shift() !== 'mock') throw new Error('Unexpected container');
  const command = args.shift();
  if (command === 'supervisorctl') {
    if (args[0] === 'status') {
      console.log('tuesday       ' + state.app + '     mock process');
      process.exit(state.app === 'STOPPED' ? 3 : 0);
    }
    if (args[0] === 'stop') {
      if (scenario === 'rollback_stop_fail' && state.started) fail();
      state.app = 'STOPPED';
    } else if (args[0] === 'start') {
      state.app = 'RUNNING';
      state.started = true;
    } else throw new Error('Unexpected supervisor command');
  } else if (command === 'pg_isready') {
    if (!args.includes('-h') || !args.includes('127.0.0.1')) throw new Error('Initialization socket race');
  } else if (command === 'curl') {
    if (state.app !== 'RUNNING' ||
        (['ready_fail', 'rollback_stop_fail'].includes(scenario) && state.db.tuesday === 'new')) fail();
  } else if (command === 'pg_dump') {
    if (state.app !== 'STOPPED') throw new Error('Live backup');
    if (scenario === 'dump_fail') fail();
    console.log('SELECT 1;');
  } else if (command === 'psql') {
    if (args.includes('-c')) {
      const sql = args[args.indexOf('-c') + 1];
      if (sql.startsWith('ALTER DATABASE')) {
        if (state.app !== 'STOPPED') throw new Error('Live database rename');
        const [, from, to] = sql.match(/ALTER DATABASE (\w+) RENAME TO (\w+)/);
        if (scenario === 'promote_fail' && from.startsWith('tuesday_restore_')) fail();
        if (!(from in state.db) || to in state.db) fail();
        state.db[to] = state.db[from];
        delete state.db[from];
      } else if (sql.startsWith('SELECT 1 FROM pg_database')) {
        const name = sql.match(/datname = '([^']+)'/)[1];
        if (name in state.db) console.log('1');
      } else if (sql.startsWith('SELECT count(*)')) {
        console.log('1');
      } else if (!sql.startsWith('SELECT datname') && !sql.startsWith('SELECT pg_terminate_backend')) {
        throw new Error('Unexpected SQL: ' + sql);
      }
    } else {
      fs.readFileSync(0);
      if (scenario === 'sql_fail') fail();
      state.db[args[args.length - 1]] = 'new';
    }
  } else if (command === 'createdb') {
    state.db[args[args.length - 1]] = 'empty';
  } else if (command === 'dropdb') {
    delete state.db[args[args.length - 1]];
  } else if (command === 'chown') {
    // The test user does not have the image's tuesday UID/GID.
  } else if (command === 'sh') {
    const mapped = args.map(map);
    const index = mapped.indexOf('-c') + 1;
    let code = mapped[index];
    if (scenario === 'upload_swap_fail' && code.includes('staging="$1"')) {
      code = code.replace('mv "$staging"', 'exit 1\n mv "$staging"');
    }
    mapped[index] = 'chown() { :; }; ' + code;
    const result = spawnSync('sh', mapped, { stdio: 'inherit' });
    if (result.status !== 0) fail();
    if (scenario === 'signal_after_upload_swap' && code.includes('staging="$1"')) {
      process.kill(process.ppid, 'SIGTERM');
    }
  } else if (['test', 'mkdir', 'rm'].includes(command)) {
    const result = spawnSync(command, args.map(map), { stdio: 'inherit' });
    if (result.status !== 0) fail();
  } else throw new Error('Unexpected command: ' + command);
} else throw new Error('Unexpected Docker operation');
save();
`;

function fixture(app = 'RUNNING') {
  const root = mkdtempSync(join(tmpdir(), 'tuesday-backup-test-'));
  roots.push(root);
  mkdirSync(join(root, 'bin'));
  mkdirSync(join(root, 'data/uploads'), { recursive: true });
  writeFileSync(join(root, 'data/uploads/old.txt'), 'old upload');
  writeFileSync(join(root, 'state.json'), JSON.stringify({ app, db: { tuesday: 'old' }, calls: [] }));
  writeFileSync(join(root, 'bin/docker'), dockerMock, { mode: 0o755 });
  writeFileSync(join(root, 'bin/sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const snapshot = join(root, 'snapshot');
  mkdirSync(join(snapshot, 'uploads'), { recursive: true });
  writeFileSync(join(snapshot, 'database.sql'), 'SELECT 1;');
  writeFileSync(join(snapshot, 'metadata.env'), 'FORMAT=tuesday-backup-v2\n');
  writeFileSync(join(snapshot, 'uploads/new.txt'), 'new upload');
  const archive = join(root, 'snapshot.tar.gz');
  expect(spawnSync('tar', ['-czf', archive, '-C', snapshot, '.']).status).toBe(0);
  return {
    root,
    archive,
    state: () => JSON.parse(readFileSync(join(root, 'state.json'), 'utf8')),
    run: (script: string, scenario = '', extra: Record<string, string> = {}) => spawnSync('bash', [
      join(scripts, script), ...(script === 'restore.sh' ? ['--yes', archive] : script === 'backup-verify.sh' ? [archive] : []),
    ], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${root}/bin:${process.env.PATH}`,
        MOCK_ROOT: root,
        MOCK_SCENARIO: scenario,
        CONTAINER_NAME: 'mock',
        BACKUP_DIR: join(root, 'backups'),
        BACKUP_UPLOAD_CMD: '',
        ...extra,
      },
      encoding: 'utf8',
      timeout: 30_000,
    }),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('backup accepts Supervisor STOPPED exit code and restarts before upload', () => {
  const f = fixture();
  const result = f.run('backup.sh', '', { BACKUP_UPLOAD_CMD: 'docker exec mock curl /ready' });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(f.state().app).toBe('RUNNING');
  expect(existsSync(join(f.root, 'data/.maintenance-lock'))).toBe(false);
  const archives = readdirSync(join(f.root, 'backups'));
  expect(archives).toHaveLength(1);
  expect(archives[0]).toEndWith('.tar.gz');
  expect(statSync(join(f.root, 'backups', archives[0])).mode & 0o777).toBe(0o600);
});

test('backup leaves an already-stopped application stopped', () => {
  const f = fixture('STOPPED');
  expect(f.run('backup.sh').status).toBe(0);
  expect(f.state().app).toBe('STOPPED');
});

test('two backups with the same timestamp never overwrite each other', () => {
  const f = fixture('STOPPED');
  writeFileSync(join(f.root, 'bin/date'), '#!/bin/sh\nprintf "20260908_120000\\n"\n', { mode: 0o755 });
  expect(f.run('backup.sh').status).toBe(0);
  expect(f.run('backup.sh').status).toBe(0);
  expect(readdirSync(join(f.root, 'backups'))).toHaveLength(2);
});

for (const scenario of ['dump_fail', 'copy_fail']) {
  test(`backup ${scenario} restarts the app without publishing an archive`, () => {
    const f = fixture();
    expect(f.run('backup.sh', scenario).status).not.toBe(0);
    expect(f.state().app).toBe('RUNNING');
    expect(readdirSync(join(f.root, 'backups'))).toHaveLength(0);
    expect(existsSync(join(f.root, 'data/.maintenance-lock'))).toBe(false);
  });
}

test('failed compression cannot publish a partial archive', () => {
  const f = fixture();
  writeFileSync(join(f.root, 'bin/tar'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  expect(f.run('backup.sh').status).not.toBe(0);
  expect(readdirSync(join(f.root, 'backups'))).toHaveLength(0);
  expect(f.state().app).toBe('RUNNING');
});

test('restore commits both snapshot parts after readiness', () => {
  const f = fixture();
  const result = f.run('restore.sh');
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(f.state().db).toEqual({ tuesday: 'new' });
  expect(readdirSync(join(f.root, 'data/uploads'))).toEqual(['new.txt']);
  expect(readdirSync(join(f.root, 'data'))).toEqual(['uploads']);
});

for (const scenario of ['sql_fail', 'promote_fail', 'upload_swap_fail', 'ready_fail', 'signal_after_upload_swap']) {
  test(`restore ${scenario} recovers the previous database and uploads`, () => {
    const f = fixture();
    const result = f.run('restore.sh', scenario);
    expect(result.status).not.toBe(0);
    expect(f.state().db).toEqual({ tuesday: 'old' });
    expect(f.state().app).toBe('RUNNING');
    expect(readdirSync(join(f.root, 'data/uploads'))).toEqual(['old.txt']);
    expect(readdirSync(join(f.root, 'data'))).toEqual(['uploads']);
  });
}

test('failed rollback stop preserves both snapshots and the lock instead of swapping live data', () => {
  const f = fixture();
  const result = f.run('restore.sh', 'rollback_stop_fail');
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('rollback was NOT attempted');
  expect(f.state().db.tuesday).toBe('new');
  expect(Object.values(f.state().db)).toContain('old');
  expect(readdirSync(join(f.root, 'data/uploads'))).toEqual(['new.txt']);
  expect(readdirSync(join(f.root, 'data')).some(name => name.startsWith('.uploads-previous-'))).toBe(true);
  expect(existsSync(join(f.root, 'data/.maintenance-lock'))).toBe(true);
});

test('invalid restore archive never interrupts the application', () => {
  const f = fixture();
  writeFileSync(f.archive, 'not an archive');
  expect(f.run('restore.sh').status).not.toBe(0);
  expect(f.state().calls).toEqual([]);
});

for (const script of ['backup.sh', 'restore.sh']) {
  test(`${script} respects an existing maintenance lock`, () => {
    const f = fixture();
    mkdirSync(join(f.root, 'data/.maintenance-lock'));
    writeFileSync(join(f.root, 'data/.maintenance-lock/owner'), 'someone-else');
    expect(f.run(script).status).not.toBe(0);
    expect(f.state().app).toBe('RUNNING');
    expect(readFileSync(join(f.root, 'data/.maintenance-lock/owner'), 'utf8')).toBe('someone-else');
  });
}

test('verifier waits for the final TCP listener and cleans up only its own container ID', () => {
  const f = fixture();
  const result = f.run('backup-verify.sh');
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(f.state().calls.at(-1)).toEqual(['rm', '-f', 'mock']);
  expect(f.state().calls.some((args: string[]) => args.includes('--single-transaction'))).toBe(true);
});

test('verifier name collision never deletes the existing container', () => {
  const f = fixture();
  expect(f.run('backup-verify.sh', 'container_collision').status).not.toBe(0);
  expect(f.state().calls.some((args: string[]) => args[0] === 'rm')).toBe(false);
});
