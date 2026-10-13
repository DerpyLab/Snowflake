const { EventEmitter } = require('events');
const { execFile, spawn } = require('child_process');

const BUNDLE_ID = 'com.spotify.client';
const NOTIFICATION = `${BUNDLE_ID}.PlaybackStateChanged`;

// Long-running JXA process, one JSON line per event:
// - Spotify's playback distributed notification (its userInfo), as in the Swift version
// - Spotify launching or quitting ({"app":"launched"|"terminated"}), which posts no playback notification
const LISTENER_SCRIPT = `
ObjC.import('Foundation');
ObjC.import('AppKit');
const out = $.NSFileHandle.fileHandleWithStandardOutput;
const write = (s) => out.writeData($(s + '\\n').dataUsingEncoding($.NSUTF8StringEncoding));
ObjC.registerSubclass({
  name: 'SnowflakeObserver',
  methods: {
    'onChange:': {
      types: ['void', ['id']],
      implementation: function (n) { write(JSON.stringify(ObjC.deepUnwrap(n.userInfo) || {})); }
    },
    'onApp:': {
      types: ['void', ['id']],
      implementation: function (n) {
        const app = n.userInfo.objectForKey('NSWorkspaceApplicationKey');
        if (ObjC.unwrap(app.bundleIdentifier) !== '${BUNDLE_ID}') return;
        const launched = ObjC.unwrap(n.name) === 'NSWorkspaceDidLaunchApplicationNotification';
        write(JSON.stringify({ app: launched ? 'launched' : 'terminated' }));
      }
    }
  }
});
const observer = $.SnowflakeObserver.alloc.init;
$.NSDistributedNotificationCenter.defaultCenter
  .addObserverSelectorNameObject(observer, 'onChange:', '${NOTIFICATION}', $());
const workspace = $.NSWorkspace.sharedWorkspace.notificationCenter;
workspace.addObserverSelectorNameObject(observer, 'onApp:', 'NSWorkspaceDidLaunchApplicationNotification', $());
workspace.addObserverSelectorNameObject(observer, 'onApp:', 'NSWorkspaceDidTerminateApplicationNotification', $());
write('{"ready":true}');
while (true) $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(60));
`;

// Application("Spotify").running() does not launch Spotify, so it is safe to poll.
const QUERY_SCRIPT = `(() => {
  const s = Application('Spotify');
  if (!s.running()) return JSON.stringify({ running: false });
  const state = s.playerState();
  if (state === 'stopped') return JSON.stringify({ running: true, state });
  const t = s.currentTrack;
  return JSON.stringify({
    running: true,
    state,
    position: s.playerPosition(),
    title: t.name(),
    artist: t.artist(),
    album: t.album(),
    duration: t.duration() / 1000,
    artworkUrl: t.artworkUrl(),
  });
})()`;

const COMMANDS = {
  playpause: 'playpause',
  next: 'nextTrack',
  previous: 'previousTrack',
};

const EMPTY_STATE = {
  running: false,
  isPlaying: false,
  title: '',
  artist: '',
  album: '',
  artworkUrl: '',
  duration: 0,
  position: 0,
  positionAt: 0,
};

function runJXA(script, timeout = 5000) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', script], { timeout }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        reject(err);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

class Spotify extends EventEmitter {
  constructor() {
    super();
    this.state = { ...EMPTY_STATE };
    this.listener = null;
    this.stopped = false;
    this.refreshing = false;
    this.refreshQueued = false;
  }

  start() {
    this.stopped = false;
    this.startListener();
    this.refresh();
  }

  stop() {
    this.stopped = true;
    if (this.listener) this.listener.kill();
    this.listener = null;
  }

  startListener() {
    const proc = spawn('osascript', ['-l', 'JavaScript', '-e', LISTENER_SCRIPT]);
    this.listener = proc;
    let buffer = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        this.handleNotification(line);
      }
    });
    proc.stderr.on('data', (d) => console.error('[spotify listener]', String(d).trim()));
    proc.on('exit', () => {
      if (this.listener === proc) this.listener = null;
      if (!this.stopped) setTimeout(() => this.startListener(), 2000);
    });
  }

  handleNotification(line) {
    let info;
    try {
      info = JSON.parse(line);
    } catch {
      return;
    }
    if (info.ready) return;
    if (info.app === 'terminated') {
      this.setState({ ...EMPTY_STATE });
    } else if (info.app === 'launched') {
      // Spotify ignores scripting for a moment after launch; show it as running, then query
      this.setState({ ...EMPTY_STATE, running: true });
      setTimeout(() => this.refresh(), 2000);
    } else if (info['Player State'] === 'Stopped') {
      // Spotify may still be open: clear the track but let the query decide
      this.setState({ ...EMPTY_STATE, running: this.state.running });
      this.refresh();
    } else {
      this.refresh();
    }
  }

  async refresh() {
    if (this.refreshing) {
      this.refreshQueued = true;
      return;
    }
    this.refreshing = true;
    try {
      const data = JSON.parse(await runJXA(QUERY_SCRIPT));
      if (!data.running || data.state === 'stopped') {
        this.setState({ ...EMPTY_STATE, running: data.running });
      } else {
        this.setState({
          running: true,
          isPlaying: data.state === 'playing',
          title: data.title || 'Unknown Title',
          artist: data.artist || 'Unknown Artist',
          album: data.album || 'Unknown Album',
          artworkUrl: data.artworkUrl || '',
          duration: data.duration || 0,
          position: data.position || 0,
          positionAt: Date.now(),
        });
      }
    } catch (err) {
      console.error('[spotify] query failed:', err.stderr || err.message);
    } finally {
      this.refreshing = false;
      if (this.refreshQueued) {
        this.refreshQueued = false;
        this.refresh();
      }
    }
  }

  setState(state) {
    this.state = state;
    this.emit('state', this.state);
  }

  async command(name) {
    const method = COMMANDS[name];
    if (!method || !this.state.running) return;
    try {
      await runJXA(`Application('Spotify').${method}()`);
    } catch (err) {
      console.error(`[spotify] ${name} failed:`, err.stderr || err.message);
    }
  }

  // Brings Spotify to the front (launching it if needed); needs no Automation permission.
  open() {
    execFile('open', ['-b', BUNDLE_ID], (err) => {
      if (err) console.error('[spotify] open failed:', err.message);
    });
  }

  // Equivalent of AEDeterminePermissionToAutomateTarget: sending a real Apple
  // event triggers the macOS consent prompt the first time.
  async checkPermission() {
    try {
      const running = await runJXA(`Application('Spotify').running()`);
      if (running !== 'true') return 'closed';
      await runJXA(`Application('Spotify').playerState()`, 120000);
      return 'granted';
    } catch (err) {
      const message = `${err.stderr || ''} ${err.message}`;
      if (message.includes('-600')) return 'closed';
      return 'denied';
    }
  }
}

module.exports = { Spotify };
