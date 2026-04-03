import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow) {
  // Create a simple tray icon (16x16 template image for macOS)
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  let icon: Electron.NativeImage;

  try {
    icon = nativeImage.createFromPath(iconPath);
    // Resize for tray (16x16 on macOS, 16x16 on Windows)
    icon = icon.resize({ width: 16, height: 16 });
    if (process.platform === 'darwin') {
      icon.setTemplateImage(true);
    }
  } catch {
    // Fallback: create an empty icon if no file exists
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('DBCanvas - SQL Inspector');

  const updateMenu = (mcpRunning = true) => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: `DBCanvas v${app.getVersion()}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: mcpRunning ? 'MCP Server: Running' : 'MCP Server: Stopped',
        enabled: false,
        icon: undefined,
      },
      { type: 'separator' },
      {
        label: 'Show Window',
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
      },
      {
        label: 'Sync Database',
        click: () => {
          mainWindow.webContents.send('dbcanvas:menu-action', 'sync');
          mainWindow.show();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit DBCanvas',
        click: () => app.quit(),
      },
    ]);
    tray?.setContextMenu(contextMenu);
  };

  updateMenu(true);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
  });

  return { tray, updateMenu };
}

export function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
