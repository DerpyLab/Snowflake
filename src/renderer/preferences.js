const $ = (id) => document.getElementById(id);
const api = window.snowflake;

api.getInfo().then(({ version }) => {
  $('version').textContent = `Version ${version}`;
});

api.getLaunchAtLogin().then((enabled) => {
  $('launch-at-login').checked = enabled;
});
$('launch-at-login').addEventListener('change', (e) => api.setLaunchAtLogin(e.target.checked));

const applySettings = (settings) => {
  $('visualizer-style').value = settings.visualizerStyle;
  $('mini-player').checked = settings.miniPlayer;
};
api.getSettings().then(applySettings);
api.onSettings(applySettings);
$('visualizer-style').addEventListener('change', (e) => api.setSetting('visualizerStyle', e.target.value));
$('mini-player').addEventListener('change', (e) => api.setSetting('miniPlayer', e.target.checked));

$('check-permission').addEventListener('click', () => api.checkPermission());

for (const link of document.querySelectorAll('[data-link]')) {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    api.openLink(link.dataset.link);
  });
}
