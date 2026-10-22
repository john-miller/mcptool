#!/usr/bin/env node
// mcptool tap: a transparent stdio shim.
//
// A host (Claude Desktop, Cursor, Claude Code, ...) runs this instead of the server:
//   node /path/to/mcptool/bin/tap.mjs [--name my-server] -- <command> [args...]
// It spawns the real server, passes every byte through untouched in both directions, and
// mirrors each JSON-RPC line plus stderr to a running mcptool (MCPTOOL_URL, default
// http://127.0.0.1:3737), where the session shows up as a live tap. If mcptool is not
// running, the mirror is dropped and the host never notices.

import spawn from 'cross-spawn';
import { basename } from 'node:path';

const API = (process.env.MCPTOOL_URL ?? 'http://127.0.0.1:3737').replace(/\/$/, '');

// ---- arguments: [--name <name>] -- <command> [args...]
const argv = process.argv.slice(2);
let name;
let sep = argv.indexOf('--');
if (sep === -1) sep = argv.length; // no "--": everything is the command
const own = argv.slice(0, sep);
for (let i = 0; i < own.length; i++) {
  if (own[i] === '--name') name = own[++i];
}
const command = sep < argv.length ? argv[sep + 1] : own.find((a) => !a.startsWith('--') && a !== name);
const args = sep < argv.length ? argv.slice(sep + 2) : [];
if (!command) {
  process.stderr.write('usage: tap.mjs [--name <name>] -- <command> [args...]\n');
  process.exit(2);
}
name ??= basename(command) === 'npx' || basename(command) === 'node' ? args.find((a) => !a.startsWith('-')) ?? command : basename(command);

// ---- the real server
const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });

child.on('error', (err) => {
  process.stderr.write(`mcptool tap: could not start ${command}: ${err.message}\n`);
  process.exit(1);
});

// Pass-through: the host's stdin to the server, the server's stdout/stderr back. Bytes untouched.
process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

// ---- the mirror: best effort, never blocking the pipe.
let tapId = null;
let queue = [];
let flushTimer = null;
let apiDown = false;
const MAX_QUEUE = 2000;

async function post(path, body) {
  const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

const registered = post('/api/taps', { name, command, args, pid: child.pid })
  .then((r) => {
    tapId = r.id;
    scheduleFlush();
  })
  .catch(() => {
    apiDown = true;
    queue = [];
  });

function enqueue(entry) {
  if (apiDown) return;
  queue.push(entry);
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer || !tapId) return;
  flushTimer = setTimeout(flush, 40);
}

async function flush() {
  flushTimer = null;
  if (!tapId || queue.length === 0) return;
  const batch = queue;
  queue = [];
  try {
    await post(`/api/taps/${tapId}/entries`, batch);
  } catch {
    // mcptool went away: stop mirroring, keep passing traffic through.
    apiDown = true;
    queue = [];
  }
  if (queue.length) scheduleFlush();
}

// JSON-RPC over stdio is newline-delimited: split each direction into lines and parse.
function lineSplitter(direction) {
  let buffer = '';
  return (chunk) => {
    buffer += chunk.toString('utf8');
    let i;
    while ((i = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      try {
        enqueue({ type: 'message', direction, message: JSON.parse(line) });
      } catch {
        // Not JSON: a server that writes junk to stdout; show it as stderr-like text.
        enqueue({ type: 'stderr', text: `[stdout] ${line}` });
      }
    }
  };
}
process.stdin.on('data', lineSplitter('out'));
child.stdout.on('data', lineSplitter('in'));
child.stderr.on('data', (chunk) => enqueue({ type: 'stderr', text: chunk.toString('utf8') }));

// ---- lifecycle: the shim lives exactly as long as the server.
async function finish(reason, code) {
  enqueue({ type: 'closed', reason });
  await registered;
  await flush().catch(() => {});
  process.exit(code);
}
child.on('exit', (code, signal) => void finish(signal ? `server killed by ${signal}` : `server exited with code ${code}`, code ?? 1));
process.stdin.on('end', () => child.stdin.end());
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
