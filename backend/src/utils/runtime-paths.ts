import { basename } from 'node:path';
import { dirname, join, resolve } from 'node:path';

function isCompiledRuntime() {
  return basename(process.execPath) !== 'bun';
}

export function getRuntimeBaseDir() {
  if (isCompiledRuntime()) {
    return dirname(process.execPath);
  }

  return resolve(import.meta.dir, '..');
}

export function getDefaultStaticDir() {
  return join(getRuntimeBaseDir(), 'static');
}

export function getDefaultMigrationsDir() {
  if (isCompiledRuntime()) {
    return join(getRuntimeBaseDir(), 'migrations');
  }

  return join(getRuntimeBaseDir(), 'db', 'migrations');
}

export function getMigrationsDir() {
  return process.env.MIGRATIONS_DIR || getDefaultMigrationsDir();
}
