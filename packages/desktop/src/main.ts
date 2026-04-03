import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc-handlers.js';
import { startServer } from './server.js';
import { createAppMenu } from './menu.js';
import { createTray, destroyTray } from './tray.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let expressServer: ReturnType<typeof startServer> | null = null;

async function createWindow() {
  // Register IPC handlers before creating window
  registerIpcHandlers();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'DBCanvas',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
  });

  // Start Express for MCP bridge notifications (SSE) and as fallback
  try {
    expressServer = startServer(3000);
    console.log('Express server started on port 3000 (MCP bridge)');
  } catch (e) {
    console.error('Failed to start Express server:', e);
  }

  // In production, load from dashboard dist; in dev, load from vite dev server or dist
  const dashboardDist = path.join(__dirname, '..', 'dashboard', 'dist', 'index.html');
  const devUrl = process.env.VITE_DEV_SERVER_URL;

  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(dashboardDist);
  }

  // Native menu & tray
  createAppMenu(mainWindow);
  createTray(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Graceful shutdown
app.on('before-quit', () => {
  destroyTray();
  if (expressServer) {
    expressServer.close();
  }
});
