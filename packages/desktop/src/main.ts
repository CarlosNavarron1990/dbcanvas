import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc-handlers.js';
import { startServer } from './server.js';
import { createAppMenu } from './menu.js';
import { createTray, destroyTray } from './tray.js';
import { registerDeviceAuthHandlers } from './device-auth.js';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let expressServer: ReturnType<typeof startServer> | null = null;

// Single-instance lock: ensure only one DBCanvas window is active at a time
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

async function createWindow() {
  // Register IPC handlers before creating window
  registerIpcHandlers();
  registerDeviceAuthHandlers();

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

  // Auto-updater: check for updates on startup (only in packaged app)
  if (app.isPackaged) {
    autoUpdater.logger = console;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info.version);
      mainWindow?.webContents.send('dbcanvas:update-available', info);
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info.version);
      mainWindow?.webContents.send('dbcanvas:update-downloaded', info);
    });

    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
    });

    // Check after window is loaded (delay 3s)
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(console.error);
    }, 3000);

    // Check every 4 hours while running
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(console.error);
    }, 4 * 60 * 60 * 1000);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// IPC: Install update and restart
import { ipcMain } from 'electron';
ipcMain.handle('dbcanvas:install-update', () => {
  autoUpdater.quitAndInstall();
});

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
