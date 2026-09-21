const params = new URLSearchParams(location.search);
if (params.has('error')) {
  document.getElementById('title').textContent = 'Let’s get LionMax running';
  document.getElementById('message').textContent = params.get('error');
  document.getElementById('retry').hidden = false;
  document.getElementById('progress').hidden = true;
}
document.getElementById('retry').addEventListener('click', async () => {
  const button = document.getElementById('retry'); button.disabled = true;
  try { await window.lionmaxRecovery.retry(); }
  catch { document.getElementById('message').textContent = 'Unable to retry. Close LionMax and reopen it, or check the diagnostic logs.'; }
  finally { button.disabled = false; }
});
document.getElementById('logs').addEventListener('click', () => window.lionmaxRecovery.logs());
