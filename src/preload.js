const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel) => (callback) => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('snowflake', {
  getInfo: () => ipcRenderer.invoke('app:info'),
  quit: () => ipcRenderer.send('app:quit'),
  openLink: (name) => ipcRenderer.send('app:open-link', name),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  onSettings: subscribe('settings:changed'),

  getLaunchAtLogin: () => ipcRenderer.invoke('login:get'),
  setLaunchAtLogin: (value) => ipcRenderer.invoke('login:set', value),

  checkPermission: (options) => ipcRenderer.invoke('permission:check', options),
  finishOnboarding: () => ipcRenderer.send('onboarding:finish'),

  getPlayer: () => ipcRenderer.invoke('player:get'),
  onPlayer: subscribe('player:state'),
  command: (name) => ipcRenderer.send('player:command', name),
  openSpotify: () => ipcRenderer.send('player:open-spotify'),
  onVisibility: subscribe('popover:visibility'),
});
