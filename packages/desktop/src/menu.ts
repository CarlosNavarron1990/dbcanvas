import { app, Menu, BrowserWindow, shell } from 'electron';

export function createAppMenu(mainWindow: BrowserWindow) {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.getName(),
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),

    // File
    {
      label: 'File',
      submenu: [
        {
          label: 'Sync Database',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('dbcanvas:menu-action', 'sync'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },

    // Edit
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },

    // View
    {
      label: 'View',
      submenu: [
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+K',
          click: () => mainWindow.webContents.send('dbcanvas:menu-action', 'command-palette'),
        },
        { type: 'separator' },
        {
          label: 'Graph View',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow.webContents.send('dbcanvas:menu-action', 'graph'),
        },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow.webContents.send('dbcanvas:menu-action', 'settings'),
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },

    // Window
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
        ] : [
          { role: 'close' as const },
        ]),
      ],
    },

    // Help
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/xmn-services/dbcanvas'),
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/xmn-services/dbcanvas/issues'),
        },
        { type: 'separator' },
        {
          label: `Version ${app.getVersion()}`,
          enabled: false,
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
