const { app, BrowserWindow, Menu, ipcMain, dialog, shell, screen } = require('electron');
const path = require('path');
const { Settings } = require('./settings');
const { Spotify } = require('./spotify');
const { StatusBar } = require('./status-bar');

const LINKS = {
  repo: 'https://github.com/DerpyLab/Snowflake',
};
const POPOVER_SIZE = { width: 272, height: 350 };
const MINI_PLAYER_SIZE = { width: 320, height: 72 };
const RENDERER = path.join(__dirname, '..', 'renderer');
const ICON = path.join(RENDERER, 'assets', 'icon.png');

let settings;
let spotify;
let statusBar;
let popover;
let miniPlayer;
let preferencesWindow;
let onboardingWindow;
let popoverHiddenAt = 0;

if (!app.requestSingleInstanceLock()) app.quit();

// MARK: - Windows

function createWindow(file, options) {
  const win = new BrowserWindow({
    show: false,
    fullscreenable: false,
    maximizable: false,
    resizable: false,
    ...options,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(RENDERER, file));
  return win;
}

function createPopover() {
  popover = createWindow('popover.html', {
    ...POPOVER_SIZE,
    frame: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: 'popover',
    visualEffectState: 'active',
  });
  popover.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  popover.on('blur', hidePopover);
}

function showPopover() {
  const tray = statusBar.getBounds();
  const { workArea } = screen.getDisplayMatching(tray);
  const x = Math.round(tray.x + tray.width / 2 - POPOVER_SIZE.width / 2);
  popover.setPosition(
    Math.min(Math.max(x, workArea.x + 8), workArea.x + workArea.width - POPOVER_SIZE.width - 8),
    Math.round(tray.y + tray.height + 4),
  );
  popover.show();
  popover.focus();
  popover.webContents.send('popover:visibility', true);
  spotify.refresh();
}

function hidePopover() {
  if (!popover.isVisible()) return;
  popover.hide();
  popoverHiddenAt = Date.now();
  popover.webContents.send('popover:visibility', false);
}

function togglePopover() {
  // Clicking the tray while the popover is open blurs it first; don't reopen it immediately.
  if (popover.isVisible()) hidePopover();
  else if (Date.now() - popoverHiddenAt > 250) showPopover();
}

function showPreferences() {
  if (!preferencesWindow || preferencesWindow.isDestroyed()) {
    preferencesWindow = createWindow('preferences.html', {
      width: 400,
      height: 274,
      title: 'Preferences',
      titleBarStyle: 'hiddenInset',
      minimizable: false,
    });
    preferencesWindow.once('ready-to-show', () => preferencesWindow.show());
  } else {
    preferencesWindow.show();
  }
  preferencesWindow.center();
  app.focus({ steal: true });
}

function showOnboarding() {
  onboardingWindow = createWindow('onboarding.html', {
    width: 500,
    height: 200,
    titleBarStyle: 'hidden',
    closable: false,
    minimizable: false,
    alwaysOnTop: true,
  });
  onboardingWindow.once('ready-to-show', () => {
    onboardingWindow.center();
    onboardingWindow.show();
    app.focus({ steal: true });
  });
}

// MARK: - Mini player

function miniPlayerPosition() {
  const saved = settings.get('miniPlayerPosition');
  const fits = (display) => {
    const { x, y, width, height } = display.workArea;
    return saved.x >= x && saved.y >= y && saved.x + MINI_PLAYER_SIZE.width <= x + width && saved.y + MINI_PLAYER_SIZE.height <= y + height;
  };
  if (saved && screen.getAllDisplays().some(fits)) return saved;
  // Default: top right corner of the primary display
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - MINI_PLAYER_SIZE.width - 16, y: workArea.y + 16 };
}

function showMiniPlayer() {
  if (miniPlayer && !miniPlayer.isDestroyed()) return;
  miniPlayer = createWindow('miniplayer.html', {
    ...MINI_PLAYER_SIZE,
    ...miniPlayerPosition(),
    type: 'panel', // NSPanel: floats without activating the app
    frame: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    acceptFirstMouse: true,
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: 'popover',
    visualEffectState: 'active',
  });
  miniPlayer.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  miniPlayer.on('moved', () => {
    const [x, y] = miniPlayer.getPosition();
    settings.set('miniPlayerPosition', { x, y });
  });
  miniPlayer.once('ready-to-show', () => miniPlayer.showInactive());
}

function syncMiniPlayer() {
  if (settings.get('miniPlayer')) showMiniPlayer();
  else if (miniPlayer && !miniPlayer.isDestroyed()) miniPlayer.destroy();
}

// MARK: - Status bar

function statusBarMenu() {
  return Menu.buildFromTemplate([
    { label: 'About Snowflake', role: 'about' },
    { type: 'separator' },
    {
      label: 'Show Mini Player',
      type: 'checkbox',
      checked: settings.get('miniPlayer'),
      click: (item) => settings.set('miniPlayer', item.checked),
    },
    { label: 'Preferences...', click: showPreferences },
    { label: 'Quit Snowflake', click: () => app.quit() },
  ]);
}

function setupStatusBar() {
  statusBar = new StatusBar({
    onClick: togglePopover,
    onRightClick: () => statusBar.popUpMenu(statusBarMenu()),
  });
  createPopover();
  spotify.on('state', (state) => {
    statusBar.update(state);
    for (const win of [popover, miniPlayer]) {
      if (win && !win.isDestroyed()) win.webContents.send('player:state', state);
    }
  });
  settings.on('changed', syncMiniPlayer);
  syncMiniPlayer();
  spotify.start();
}

// MARK: - Permissions

const PERMISSION_MESSAGES = {
  closed: ['Spotify is not open', 'Please open Spotify to enable permissions'],
  granted: ['Permission granted for Spotify', 'Start playing a song!'],
  denied: [
    'Permission denied',
    'Please go to System Settings > Privacy & Security > Automation, and check Spotify under Snowflake',
  ],
};

async function checkPermission(event, { alertOnGranted = true } = {}) {
  const status = await spotify.checkPermission();
  if (status !== 'granted' || alertOnGranted) {
    const [message, detail] = PERMISSION_MESSAGES[status];
    const win = BrowserWindow.fromWebContents(event.sender);
    await dialog.showMessageBox(win, { message, detail, buttons: ['Got it!'] });
  }
  return status;
}

// MARK: - IPC

function setupIPC() {
  ipcMain.handle('app:info', () => ({ version: app.getVersion() }));
  ipcMain.on('app:quit', () => app.quit());
  ipcMain.on('app:open-link', (_e, name) => LINKS[name] && shell.openExternal(LINKS[name]));

  ipcMain.handle('settings:get', () => settings.all());
  ipcMain.handle('settings:set', (_e, key, value) => settings.set(key, value));
  settings.on('changed', (values) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('settings:changed', values);
  });

  ipcMain.handle('login:get', () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle('login:set', (_e, openAtLogin) => app.setLoginItemSettings({ openAtLogin: Boolean(openAtLogin) }));

  ipcMain.handle('permission:check', checkPermission);

  ipcMain.handle('player:get', () => spotify.state);
  ipcMain.on('player:command', (_e, name) => spotify.command(name));
  ipcMain.on('player:open-spotify', () => {
    hidePopover();
    spotify.open();
  });

  ipcMain.on('onboarding:finish', () => {
    if (!onboardingWindow) return;
    settings.set('viewedOnboarding', true);
    onboardingWindow.destroy();
    onboardingWindow = null;
    setupStatusBar();
  });
}

// MARK: - Lifecycle

app.whenReady().then(() => {
  app.dock.hide();
  app.setAboutPanelOptions({
    applicationName: 'Snowflake',
    applicationVersion: app.getVersion(),
    iconPath: ICON,
    website: LINKS.repo,
  });

  settings = new Settings();
  spotify = new Spotify();
  setupIPC();

  if (settings.get('viewedOnboarding')) setupStatusBar();
  else showOnboarding();
});

// Menu bar app: keep running with no windows open
app.on('window-all-closed', () => {});

app.on('before-quit', () => spotify && spotify.stop());
