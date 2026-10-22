import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ConnectionConfig } from '../shared/types.js';

export const dataDir = process.env.MCPTOOL_DATA_DIR ?? join(homedir(), '.mcptool');
const connectionsFile = join(dataDir, 'connections.json');

export async function loadConnections(): Promise<ConnectionConfig[]> {
  try {
    return JSON.parse(await readFile(connectionsFile, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function saveConnections(connections: ConnectionConfig[]) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(connectionsFile, JSON.stringify(connections, null, 2));
}

export const storeLocation = connectionsFile;
