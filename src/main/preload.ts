// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { CONSTANTS } from '@constants';

export type Channels = typeof CONSTANTS.API[keyof typeof CONSTANTS.API];

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => (void)) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
  },
  debug: {
    getStorageInfo() {
      return ipcRenderer.invoke(CONSTANTS.API.GET_STORAGE_DEBUG_INFO);
    },
  },
};

const reportRendererError = (payload: {
  source?: string;
  message?: string;
  stack?: string;
  url?: string;
  line?: number;
  column?: number;
  detail?: string;
}) => {
  ipcRenderer.send(CONSTANTS.API.POST_RENDERER_ERROR, payload);
};

window.addEventListener('error', (event: ErrorEvent) => {
  reportRendererError({
    source: 'window.onerror',
    message: event.message,
    stack: event.error?.stack,
    url: event.filename,
    line: event.lineno,
    column: event.colno,
  });
});

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const reason = event.reason;
  reportRendererError({
    source: 'unhandledRejection',
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    detail: reason instanceof Error ? undefined : String(reason),
  });
});

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
