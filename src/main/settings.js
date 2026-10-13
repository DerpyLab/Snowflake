const { app } = require('electron');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  viewedOnboarding: false,
  visualizerStyle: 'albumArt', // 'albumArt' | 'none'
  miniPlayer: true,
  miniPlayerPosition: null, // { x, y } once the user moves the window
};

class Settings extends EventEmitter {
  constructor() {
    super();
    this.file = path.join(app.getPath('userData'), 'settings.json');
    this.values = { ...DEFAULTS };
    try {
      Object.assign(this.values, JSON.parse(fs.readFileSync(this.file, 'utf8')));
    } catch {
      // First launch or unreadable file: keep defaults
    }
  }

  get(key) {
    return this.values[key];
  }

  all() {
    return { ...this.values };
  }

  set(key, value) {
    if (!(key in DEFAULTS) || this.values[key] === value) return;
    this.values[key] = value;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.values, null, 2));
    this.emit('changed', this.all());
  }
}

module.exports = { Settings };
