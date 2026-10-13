const $ = (id) => document.getElementById(id);
const api = window.snowflake;

startWarpShader($('warp'));

$('enable').addEventListener('click', async () => {
  const status = await api.checkPermission({ alertOnGranted: false });
  $('continue').disabled = status !== 'granted';
  if (status === 'granted') $('continue').focus();
});

$('quit').addEventListener('click', () => api.quit());
// Focused after permission is granted, so Enter triggers it like the default button
$('continue').addEventListener('click', () => api.finishOnboarding());
