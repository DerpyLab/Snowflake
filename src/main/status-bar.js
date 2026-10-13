const { Tray, nativeImage } = require('electron');

// Menu bar icon geometry, in points (rendered at 2x). Mirrors StatusBarAnimation.swift.
const SCALE = 2;
const WIDTH = 14;
const HEIGHT = 16;
const BASELINE = 13;
const BAR_HEIGHTS = [7, 6, 9, 8];
const BAR_DURATIONS = [0.6, 0.3, 0.5, 0.7];
const FPS = 15;
const TITLE_LIMIT = 32;

function fillRoundRect(buf, x, y, w, h, r) {
  const W = WIDTH * SCALE;
  const H = HEIGHT * SCALE;
  [x, y, w, h, r] = [x, y, w, h, r].map((v) => v * SCALE);
  const SS = 4; // supersampling per axis for smooth edges

  const inside = (px, py) => {
    if (px < x || px > x + w || py < y || py > y + h) return false;
    const cx = Math.min(Math.max(px, x + r), x + w - r);
    const cy = Math.min(Math.max(py, y + r), y + h - r);
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
  };

  for (let py = Math.max(0, Math.floor(y)); py < Math.min(H, Math.ceil(y + h)); py++) {
    for (let px = Math.max(0, Math.floor(x)); px < Math.min(W, Math.ceil(x + w)); px++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          if (inside(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS)) hits++;
        }
      }
      if (!hits) continue;
      const i = (py * W + px) * 4 + 3; // BGRA, black: only alpha matters for template images
      buf[i] = Math.max(buf[i], Math.round((255 * hits) / (SS * SS)));
    }
  }
}

function toImage(buf) {
  const image = nativeImage.createFromBitmap(buf, {
    width: WIDTH * SCALE,
    height: HEIGHT * SCALE,
    scaleFactor: SCALE,
  });
  image.setTemplateImage(true);
  return image;
}

function pausedImage() {
  const buf = Buffer.alloc(WIDTH * SCALE * HEIGHT * SCALE * 4);
  fillRoundRect(buf, 0, BASELINE - 10, 6, 10, 2);
  fillRoundRect(buf, 8, BASELINE - 10, 6, 10, 2);
  return toImage(buf);
}

function playingImage(t) {
  const buf = Buffer.alloc(WIDTH * SCALE * HEIGHT * SCALE * 4);
  BAR_HEIGHTS.forEach((max, i) => {
    // Triangle wave between max and 2pt, like the autoreversing CABasicAnimation
    const d = BAR_DURATIONS[i];
    const p = ((t + i) % (2 * d)) / d;
    const h = max - (max - 2) * (p < 1 ? p : 2 - p);
    fillRoundRect(buf, i * 3.5, BASELINE - h, 2, h, 1);
  });
  return toImage(buf);
}

class StatusBar {
  constructor({ onClick, onRightClick }) {
    this.paused = pausedImage();
    this.tray = new Tray(this.paused);
    this.tray.setIgnoreDoubleClickEvents(true);
    this.tray.on('click', onClick);
    this.tray.on('right-click', onRightClick);
    this.timer = null;
  }

  update({ title, artist, isPlaying }) {
    let text = title || artist ? `${title} • ${artist}` : '';
    if (text.length > TITLE_LIMIT) text = `${text.slice(0, TITLE_LIMIT - 1).trimEnd()}…`;
    this.tray.setTitle(text ? ` ${text}` : '');
    this.setPlaying(Boolean(text) && isPlaying);
  }

  setPlaying(playing) {
    if (playing && !this.timer) {
      const start = Date.now();
      this.timer = setInterval(() => {
        this.tray.setImage(playingImage((Date.now() - start) / 1000));
      }, 1000 / FPS);
    } else if (!playing && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.tray.setImage(this.paused);
    }
  }

  popUpMenu(menu) {
    this.tray.popUpContextMenu(menu);
  }

  getBounds() {
    return this.tray.getBounds();
  }
}

module.exports = { StatusBar };
