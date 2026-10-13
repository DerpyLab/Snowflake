const $ = (id) => document.getElementById(id);

let player = null;
let visualizerStyle = 'albumArt';
let ticker = null;

function renderTime() {
  if (player && player.running) {
    $('time').textContent = `${formatTime(currentPosition(player))} / ${formatTime(player.duration)}`;
  }
}

function render() {
  if (!player) return;
  const running = player.running && Boolean(player.title);
  const showBackground = running && visualizerStyle === 'albumArt';

  $('idle').hidden = running;
  $('player').hidden = !running;
  document.body.classList.toggle('artwork-background', showBackground);
  setImage($('background'), showBackground ? player.artworkUrl : '');
  setImage($('artwork'), player.artworkUrl);

  $('title').textContent = player.title;
  $('artist').textContent = player.artist;
  setPlayPauseIcon(player.isPlaying);
  renderTime();
}

function setTicking(on) {
  if (on && !ticker) ticker = setInterval(renderTime, 100);
  if (!on && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

bindCommandButtons();
bindOpenSpotifyOnDoubleClick(document.querySelector('.artwork'));

window.snowflake.onPlayer((state) => {
  player = state;
  render();
});

window.snowflake.onSettings((settings) => {
  visualizerStyle = settings.visualizerStyle;
  render();
});

window.snowflake.onVisibility(setTicking);

Promise.all([window.snowflake.getPlayer(), window.snowflake.getSettings()]).then(([state, settings]) => {
  player = state;
  visualizerStyle = settings.visualizerStyle;
  render();
});
