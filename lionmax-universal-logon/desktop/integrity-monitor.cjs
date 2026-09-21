const { watch } = require('node:fs');
const { dirname, basename } = require('node:path');

// Native notifications do no hashing at idle. Coalesce bursts, serialize scans,
// and retain an occasional full scan because filesystem events can be lost.
function watchIntegrity(root, check, onError, { intervalMs = 600000, delayMs = 750 } = {}) {
  let closed = false, running = false, queued = false, pending, periodic;
  const watchers = [];
  function stop() {
    closed = true; clearTimeout(pending); clearInterval(periodic);
    for (const watcher of watchers) watcher.close();
  }
  function fail(error) { if (!closed) { stop(); onError(error); } }
  function schedule() {
    if (closed) return;
    queued = true;
    if (running || pending) return;
    pending = setTimeout(async () => {
      pending = undefined; queued = false; running = true;
      try { if (await check() === false) queued = true; }
      catch (error) { fail(error); }
      finally { running = false; if (queued) schedule(); }
    }, delayMs);
    pending.unref();
  }
  try {
    watchers.push(watch(root, { recursive: true, persistent: false }, schedule));
    watchers.push(watch(dirname(root), { persistent: false }, (_event, name) => {
      if (!name || String(name).toLowerCase() === basename(root).toLowerCase()) schedule();
    }));
    for (const watcher of watchers) watcher.on('error', fail);
    periodic = setInterval(schedule, intervalMs); periodic.unref();
  } catch (error) { stop(); throw error; }
  return { stop };
}
module.exports = { watchIntegrity };
