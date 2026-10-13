const $ = (id) => document.getElementById(id);

let player = null;
let visualizerStyle = 'albumArt';

function renderProgress() {
  if (!player || !player.running || !player.duration) return;
  $('progress-bar').style.width = `${(currentPosition(player) / player.duration) * 100}%`;
  $('player').title = `${formatTime(currentPosition(player))} / ${formatTime(player.duration)}`;
}

function render() {
  if (!player) return;
  const running = player.running && Boolean(player.title);
  const showBackground = running && visualizerStyle === 'albumArt';

  $('idle').hidden = running;
  renderIdle(player);
  $('player').hidden = !running;
  document.body.classList.toggle('artwork-background', showBackground);
  setImage($('background'), showBackground ? player.artworkUrl : '');
  setImage($('artwork'), player.artworkUrl);

  $('title').textContent = player.title;
  $('artist').textContent = player.artist;
  setPlayPauseIcon(player.isPlaying);
  renderProgress();
}

bindCommandButtons();
bindOpenSpotifyButton();
bindOpenSpotifyOnDoubleClick(document.querySelector('.art'));

// Always visible, so update the progress bar continuously (only while something plays)
setInterval(() => player && player.isPlaying && renderProgress(), 500);

window.snowflake.onPlayer((state) => {
  player = state;
  render();
});

window.snowflake.onSettings((settings) => {
  visualizerStyle = settings.visualizerStyle;
  render();
});

Promise.all([window.snowflake.getPlayer(), window.snowflake.getSettings()]).then(([state, settings]) => {
  player = state;
  visualizerStyle = settings.visualizerStyle;
  render();
});
