import { Channels } from "@/main/preload";
import { CONSTANTS } from "../../../constants"

type ApiChannel = (typeof CONSTANTS.API)[keyof typeof CONSTANTS.API];

type MessageBusHandler = (data: unknown) => void;

type MessageBusHandlers = Partial<Record<ApiChannel, MessageBusHandler>>;

export const initializeMessageBus = (messageBusHandlers: MessageBusHandlers) => {
  const channels = Object.values(CONSTANTS.API) as ApiChannel[];

  channels.forEach((channel) => {
    window.electron?.ipcRenderer.on(channel, (data) => {
      const handler = messageBusHandlers[channel];
      if (typeof handler === 'function') {
        handler(data);
      }
    });
  });
}

export const initializeMessageBuss = initializeMessageBus;

export const sendMessage = (channel: Channels, data?: unknown) => {
  window.electron?.ipcRenderer.sendMessage(channel, data);
}
