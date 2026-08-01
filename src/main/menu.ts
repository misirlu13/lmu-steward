import {
  app,
  Menu,
  shell,
  BrowserWindow,
  MenuItemConstructorOptions,
} from 'electron';
import path from 'path';
import {
  getLegacyLocalDataPaths,
  getPrimaryLocalDataPath,
} from './storage/local-data-store';

export default class MenuBuilder {
  mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  buildMenu(): Menu {
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.DEBUG_PROD === 'true'
    ) {
      this.setupDevelopmentEnvironment();
    }

    const template = this.buildDefaultTemplate();

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    return menu;
  }

  setupDevelopmentEnvironment(): void {
    this.mainWindow.webContents.on('context-menu', (_, props) => {
      const { x, y } = props;

      Menu.buildFromTemplate([
        {
          label: 'Inspect element',
          click: () => {
            this.mainWindow.webContents.inspectElement(x, y);
          },
        },
      ]).popup({ window: this.mainWindow });
    });
  }

  buildDefaultTemplate(): MenuItemConstructorOptions[] {
    const templateDefault: MenuItemConstructorOptions[] = [
      {
        label: '&File',
        submenu: [
          {
            label: '&Close',
            accelerator: 'Ctrl+W',
            click: () => {
              this.mainWindow.close();
            },
          },
        ],
      },
      {
        label: '&View',
        submenu:
          process.env.NODE_ENV === 'development' ||
          process.env.DEBUG_PROD === 'true'
            ? [
                {
                  label: '&Reload',
                  accelerator: 'Ctrl+R',
                  click: () => {
                    this.mainWindow.webContents.reload();
                  },
                },
                {
                  label: 'Toggle &Full Screen',
                  accelerator: 'F11',
                  click: () => {
                    this.mainWindow.setFullScreen(
                      !this.mainWindow.isFullScreen(),
                    );
                  },
                },
                {
                  label: 'Toggle &Developer Tools',
                  accelerator: 'Alt+Ctrl+I',
                  click: () => {
                    this.mainWindow.webContents.toggleDevTools();
                  },
                },
              ]
            : [
                {
                  label: 'Toggle &Full Screen',
                  accelerator: 'F11',
                  click: () => {
                    this.mainWindow.setFullScreen(
                      !this.mainWindow.isFullScreen(),
                    );
                  },
                },
              ],
      },
      {
        label: 'About',
        submenu: [
          {
            label: 'Documentation',
            click() {
              shell.openExternal(
                'https://github.com/misirlu13/lmu-steward/blob/main/README.md',
              );
            },
          },
          {
            label: 'Community Discussions',
            click() {
              shell.openExternal(
                'https://github.com/misirlu13/lmu-steward/discussions',
              );
            },
          },
          {
            label: 'Search Issues',
            click() {
              shell.openExternal(
                'https://github.com/misirlu13/lmu-steward/issues',
              );
            },
          },
          {
            label: 'Support LMU Steward ❤️',
            click() {
              shell.openExternal('https://github.com/sponsors/misirlu13');
            },
          },
        ],
      },
      ...(process.env.NODE_ENV === 'development' ||
      process.env.DEBUG_PROD === 'true'
        ? ([
            {
              label: '&Debug',
              submenu: [
                {
                  label: 'Test Main Process Crash',
                  click: () => {
                    throw new Error('Test main process crash from menu');
                  },
                },
                {
                  label: 'Test Renderer Crash',
                  click: () => {
                    this.mainWindow.webContents.executeJavaScript(
                      'throw new Error("Test renderer crash from menu")',
                    );
                  },
                },
                {
                  label: 'Test Unhandled Rejection',
                  click: () => {
                    this.mainWindow.webContents.executeJavaScript(
                      'Promise.reject(new Error("Test unhandled rejection from menu"))',
                    );
                  },
                },
                {
                  type: 'separator',
                },
                {
                  label: 'Open Local Data Store',
                  click: async () => {
                    await shell.openPath(getPrimaryLocalDataPath());
                  },
                },
                {
                  label: 'Open Legacy Settings Store',
                  click: async () => {
                    await shell.openPath(getLegacyLocalDataPaths().main);
                  },
                },
                {
                  label: 'Open Log Store',
                  click: async () => {
                    const logStorePath = path.join(
                      app.getPath('userData'),
                      'lmu-steward-log-store.json',
                    );
                    await shell.openPath(logStorePath);
                  },
                },
              ],
            },
          ] as MenuItemConstructorOptions[])
        : []),
    ];

    return templateDefault;
  }
}
