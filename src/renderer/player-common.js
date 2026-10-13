// Helpers shared by the popover and the mini player

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${m}:${ss}` : `${m}:${ss}`;
}

// Spotify only reports the position on demand, so extrapolate it locally while playing.
function currentPosition(player) {
  if (!player.isPlaying) return player.position;
  const elapsed = (Date.now() - player.positionAt) / 1000;
  return Math.min(player.position + elapsed, player.duration);
}

function setImage(img, url) {
  if (!url) {
    img.hidden = true;
    img.removeAttribute('src');
  } else if (img.getAttribute('src') !== url) {
    img.src = url;
    img.hidden = false;
  }
}

function setPlayPauseIcon(isPlaying) {
  // SVG elements have no `hidden` property, so toggle the attribute directly
  document.getElementById('icon-play').toggleAttribute('hidden', isPlaying);
  document.getElementById('icon-pause').toggleAttribute('hidden', !isPlaying);
}

function bindOpenSpotifyOnDoubleClick(element) {
  element.addEventListener('dblclick', (e) => {
    // Rapid clicks on the playback buttons overlaid on the artwork must not open Spotify
    if (!e.target.closest('button')) window.snowflake.openSpotify();
  });
}

function bindCommandButtons() {
  for (const button of document.querySelectorAll('[data-command]')) {
    button.addEventListener('click', () => window.snowflake.command(button.dataset.command));
  }
}
