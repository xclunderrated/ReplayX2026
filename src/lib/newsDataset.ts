import { existsSync } from 'node:fs';
import path from 'node:path';

function joinProjectPath(base: string, leaf: string): string {
  if (base.includes('/') && !base.includes('\\')) {
    return path.posix.join(base, leaf);
  }

  return path.join(base, leaf);
}

export function resolveNewsCsvPath(
  cwd: string,
  cachePath: string,
  fileExists: (candidate: string) => boolean = existsSync,
): string | null {
  const candidates = [
    joinProjectPath(cwd, 'forex_factory_cache.csv'),
    cachePath,
  ];

  for (const candidate of candidates) {
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}
