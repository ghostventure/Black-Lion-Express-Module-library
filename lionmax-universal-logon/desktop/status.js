const params = new URLSearchParams(location.search);
if (params.has('error')) {
  document.getElementById('title').textContent = 'Let’s get LionMax running';
  document.getElementById('message').textContent = params.get('error');
  document.getElementById('retry').hidden = false;
  document.getElementById('progress').hidden = true;
}
document.getElementById('retry').addEventListener('click', () => { document.getElementById('retry').disabled = true; window.lionmaxRecovery.retry(); });
document.getElementById('logs').addEventListener('click', () => window.lionmaxRecovery.logs());
