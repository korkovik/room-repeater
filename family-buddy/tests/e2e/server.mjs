#!/usr/bin/env node
// @ts-check
/**
 * Static e2e server (spec AC preamble, architect review 3). Serves the same dev/ build at
 *   /room-repeater/family-buddy/dev/  (DEV)
 *   /room-repeater/family-buddy/uat/  (UAT)
 *   /family-buddy/                    (PROD)
 * plus /__blank for seeding localStorage on the same origin. No compression, no caching.
 */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEV_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dev');
const PORT = Number(process.env.FB_E2E_PORT ?? 4173);
const MOUNTS = ['/room-repeater/family-buddy/dev/', '/room-repeater/family-buddy/uat/', '/family-buddy/'];
/** @type {Readonly<Record<string, string>>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

/**
 * @param {string} pathname
 * @returns {string | null} absolute file path inside dev/, or null
 */
export function resolveFile(pathname) {
  const mount = MOUNTS.find((m) => pathname.startsWith(m));
  if (!mount) return null;
  let rel = decodeURIComponent(pathname.slice(mount.length));
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const abs = path.resolve(DEV_DIR, rel);
  if (abs !== DEV_DIR && !abs.startsWith(DEV_DIR + path.sep)) return null;
  try {
    return statSync(abs).isFile() ? abs : null;
  } catch {
    return null;
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/__blank') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end('<!doctype html><title>blank</title>');
    return;
  }
  const mountRoot = MOUNTS.find((m) => m === `${url.pathname}/`);
  if (mountRoot) {
    res.writeHead(301, { location: mountRoot });
    res.end();
    return;
  }
  const file = resolveFile(url.pathname);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`family-buddy e2e server on http://127.0.0.1:${PORT}${MOUNTS[0]}\n`);
});
