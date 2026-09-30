const os = require('node:os');
const fs = require('node:fs/promises');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const GiB = 1024 ** 3;
const requirements = Object.freeze({ platform: 'win32', arch: 'x64', minWindowsBuild: 19041, recommendedMemoryBytes: 4 * GiB, updateFreeBytes: 2 * GiB });

function evaluate(system, target = requirements) {
  target = target || requirements;
  const checks = [];
  const add = (id, label, state, detail, scope = 'run') => checks.push({ id, label, state, detail, scope });
  const build = Number(String(system.release).split('.')[2]);
  const windows = system.platform === 'win32' && Number(String(system.release).split('.')[0]) >= 10 && build >= (target.minWindowsBuild || requirements.minWindowsBuild);
  add('windows', 'Windows version', windows ? 'pass' : 'fail', windows ? `Windows build ${build} meets the required minimum.` : `Windows 10 build ${target.minWindowsBuild || requirements.minWindowsBuild} or later is required.`);
  const arch = system.arch === (target.arch || 'x64');
  add('processor', 'Processor and app architecture', arch ? 'pass' : 'fail', arch ? '64-bit x64 application supported.' : 'This release requires an x64 application environment.');
  if (/arm/i.test(system.machine || '')) add('emulation', 'Windows on ARM', 'warning', 'This x64 build runs under Windows emulation. Native ARM performance and compatibility are not verified.');
  add('memory', 'System memory', system.memory >= requirements.recommendedMemoryBytes ? 'pass' : 'warning', `${(system.memory / GiB).toFixed(1)} GB installed; 4 GB or more is recommended.`);
  add('data', 'Account data folder', system.dataWritable ? 'pass' : 'fail', system.dataWritable ? 'Your account data folder is writable.' : 'LionMax cannot write to its account data folder. Check Windows folder permissions.');
  add('cache', 'Update download folder', system.cacheWritable ? 'pass' : 'fail', system.cacheWritable ? 'Verified downloads can be saved.' : 'LionMax cannot save updates. Check Windows folder permissions.', 'update');
  add('install', 'Application folder', system.installWritable ? 'pass' : 'fail', system.installWritable ? 'Application files can be updated for your Windows user.' : 'The application folder is not writable. Use an authorized Windows installation.', 'update');
  const required = Math.max(requirements.updateFreeBytes, Number(target.size || 0) * 5);
  for (const [id, label, free] of [['download-space', 'Download disk space', system.cacheFree], ['install-space', 'Installation disk space', system.installFree]]) {
    add(id, label, Number.isFinite(free) && free >= required ? 'pass' : 'fail', Number.isFinite(free) ? `${(free / GiB).toFixed(1)} GB available; ${(required / GiB).toFixed(1)} GB required for update staging.` : 'Free disk space could not be checked. Retry before updating.', 'update');
  }
  if (!system.installed) add('portable', 'Installation type', 'warning', 'Portable copy: use Install verified update to create or upgrade the managed Windows installation. The portable folder is not replaced.', 'update');
  const canRun = !checks.some(c => c.state === 'fail' && c.scope === 'run');
  const canUpdate = canRun && !checks.some(c => c.state === 'fail');
  return { checkedAt: new Date().toISOString(), canRun, canUpdate, canAutoInstall: canUpdate && system.installed, installMode: system.installed ? 'installed' : 'portable', checks };
}

async function writable(directory) {
  let probe;
  try {
    await fs.mkdir(directory, { recursive: true });
    probe = join(directory, `.lionmax-check-${randomUUID()}`);
    await fs.writeFile(probe, '', { flag: 'wx' });
    return true;
  } catch { return false; }
  finally { if (probe) await fs.unlink(probe).catch(() => {}); }
}
async function freeSpace(directory) {
  try { const info = await fs.statfs(directory); return Number(info.bavail) * Number(info.bsize); } catch { return null; }
}
async function checkCompatibility({ dataDirectory, updateDirectory, installDirectory, installed = false, target = requirements }) {
  const [dataWritable, cacheWritable, installWritable] = await Promise.all([writable(dataDirectory), writable(updateDirectory), writable(installDirectory)]);
  const [cacheFree, installFree] = await Promise.all([freeSpace(updateDirectory), freeSpace(installDirectory)]);
  return evaluate({ platform: process.platform, arch: process.arch, release: os.release(), machine: os.machine(), memory: os.totalmem(), dataWritable, cacheWritable, installWritable, cacheFree, installFree, installed }, target);
}
module.exports = { requirements, evaluate, checkCompatibility };
