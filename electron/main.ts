// The desktop shell: the same server the CLI starts, inside Electron's main process, with the
// UI in a window. Everything the full runtime does (stdio, taps, OAuth, re-attach) works here.
// Electron's module is CommonJS: from ESM, only the default import resolves its exports.
import electron from 'electron';
import { join } from 'node:path';
import { startServer, type RunningServer } from '../server/index.js';

const { app, BrowserWindow, shell } = electron;

const appPath = app.getAppPath();
let running: RunningServer | undefined;

async function boot(): Promise<RunningServer> {
  const launch = {
    webDist: join(appPath, 'dist'),
    shimPath: join(appPath, 'bin', 'tap.mjs'),
    // The bundled demo server runs on Electron's own Node, so nothing else needs installing.
    demo: { command: process.execPath, args: [join(appPath, 'out', 'examples', 'demo-server.js')], env: { ELECTRON_RUN_AS_NODE: '1' } },
  };
  try {
    return await startServer({ port: 3737, ...launch });
  } catch {
    // 3737 is taken (another mcptool, probably): any free port, and the tap snippet says which.
    return startServer({ port: 0, ...launch });
  }
}

function createWindow(url: string) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: '#0f1216',
    autoHideMenuBar: true,
    title: 'mcptool',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // Links and the OAuth sign-in page open in the system browser; the callback lands on our port.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) void shell.openExternal(target);
    return { action: 'deny' };
  });
  void win.loadURL(url);
  return win;
}

app.whenReady().then(async () => {
  running = await boot();
  createWindow(running.url);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && running) createWindow(running.url);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  void running?.close();
});
