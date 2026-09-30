const { verify, createHash } = require('node:crypto');
const fs = require('node:fs');
const { join } = require('node:path');
const repo = 'ghostventure/Black-Lion-Express-Module-library';
const versionPattern = /^\d{1,5}\.\d{1,5}\.\d{1,5}$/;
const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
function manifest(envelope, key) {
  if (!envelope || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string' || envelope.payload.length > 16000 || envelope.signature.length > 256) throw Error('Invalid update metadata');
  const bytes = Buffer.from(envelope.payload, 'base64');
  if (!verify(null, bytes, key, Buffer.from(envelope.signature, 'base64'))) throw Error('Update signature rejected');
  const m = JSON.parse(bytes);
  if (!m || typeof m.version !== 'string' || !versionPattern.test(m.version) || typeof m.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(m.sha256) || !Number.isSafeInteger(m.size) || m.size < 1 || m.size > 536870912 || m.url !== `https://github.com/${repo}/releases/download/lionmax-v${m.version}/LionMax-Setup-${m.version}-win-x64.exe`) throw Error('Invalid signed update fields');
  if (m.platform !== undefined && m.platform !== 'win32' || m.arch !== undefined && m.arch !== 'x64' || m.minWindowsBuild !== undefined && (!Number.isInteger(m.minWindowsBuild) || m.minWindowsBuild < 19041 || m.minWindowsBuild > 999999)) throw Error('Unsupported signed update requirements');
  return m;
}
async function receive(url, limit, onChunk, { offset = 0, signal } = {}) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > limit) throw Error('Invalid download offset');
  for (let redirects = 0; redirects < 6; redirects++) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password || !['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(u.hostname)) throw Error('Untrusted update host');
    const headers = { 'User-Agent': 'LionMax-Updater', Accept: u.hostname === 'api.github.com' ? 'application/vnd.github+json' : 'application/octet-stream' };
    if (offset) headers.Range = `bytes=${offset}-`;
    const r = await fetch(u, { redirect: 'manual', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000), headers });
    if ([301, 302, 303, 307, 308].includes(r.status)) { await r.body?.cancel(); const location = r.headers.get('location'); if (!location) throw Error('Invalid redirect'); url = new URL(location, u).href; continue; }
    if (offset && r.status === 200) { await r.body?.cancel(); const error = Error('Server requires a fresh download'); error.code = 'RANGE_UNSUPPORTED'; throw error; }
    if (offset && (r.status !== 206 || !new RegExp(`^bytes ${offset}-\\d+/${limit}$`).test(r.headers.get('content-range') || ''))) { await r.body?.cancel(); throw Error('Invalid resumed download'); }
    if (!r.ok || !offset && r.status !== 200) { await r.body?.cancel(); throw Error('Update server unavailable'); }
    let size = offset;
    for await (const chunk of r.body) { size += chunk.length; if (size > limit) throw Error('Update size limit exceeded'); await onChunk(chunk); }
    return size;
  }
  throw Error('Too many update redirects');
}
async function json(url, signal) { const chunks = []; await receive(url, 1048576, c => chunks.push(c), { signal }); return JSON.parse(Buffer.concat(chunks)); }
async function hashFile(file) {
  const info = fs.lstatSync(file); if (!info.isFile() || info.isSymbolicLink()) throw Error('Invalid installer file');
  const hash = createHash('sha256'); let size = 0;
  for await (const chunk of fs.createReadStream(file)) { hash.update(chunk); size += chunk.length; }
  return { size, sha256: hash.digest('hex') };
}
class Updater {
  constructor({ directory, key, currentVersion, launch, fetchJSON = json, download = receive, compatibility = async () => ({ canRun: true, canUpdate: true, canAutoInstall: true, checks: [] }), now = Date.now }) {
    if (!versionPattern.test(currentVersion)) throw Error('Invalid installed version');
    Object.assign(this, { directory, key, currentVersion, launch, fetchJSON, receive: download, compatibility, now });
    fs.mkdirSync(directory, { recursive: true });
    if (fs.lstatSync(directory).isSymbolicLink()) throw Error('Update folder must not be a link');
    this.prefs = { automatic: true, installOnExit: true, lastCheck: 0, lastAttempt: 0 };
    try { const p = this.read('settings.json'); this.prefs = { automatic: p.automatic !== false, installOnExit: p.installOnExit !== false, lastCheck: this.timestamp(p.lastCheck), lastAttempt: this.timestamp(p.lastAttempt) }; } catch {}
    this.message = 'Ready to check for verified updates.'; this.busy = false; this.ready = false; this.stopped = false; this.progress = 0;
  }
  timestamp(value) { return Number.isFinite(value) && value >= 0 && value <= this.now() ? value : 0; }
  read(name) { const path = join(this.directory, name); const s = fs.lstatSync(path); if (!s.isFile() || s.isSymbolicLink() || s.size > 65536) throw Error('Invalid update state'); return JSON.parse(fs.readFileSync(path, 'utf8')); }
  write(name, value) { const path = join(this.directory, name); fs.writeFileSync(path + '.tmp', JSON.stringify(value), { flag: 'w' }); fs.renameSync(path + '.tmp', path); }
  remove(name) { fs.rmSync(join(this.directory, name), { force: true }); }
  save() { this.write('settings.json', this.prefs); }
  status() { return { currentVersion: this.currentVersion, availableVersion: this.candidate?.version, automatic: this.prefs.automatic, installOnExit: this.prefs.installOnExit, busy: this.busy, ready: this.ready, message: this.message, lastCheck: this.prefs.lastCheck, lastAttempt: this.prefs.lastAttempt, downloadBytes: this.progress, downloadSize: this.candidate?.size || 0, compatibility: this.report }; }
  automatic(value) { if (typeof value !== 'boolean') throw Error('Invalid preference'); this.prefs.automatic = value; this.save(); return this.status(); }
  installOnExit(value) { if (typeof value !== 'boolean') throw Error('Invalid preference'); this.prefs.installOnExit = value; this.save(); return this.status(); }
  async refreshCompatibility() { this.report = await this.compatibility(this.candidate); return this.status(); }
  async compatible(m) { this.report = await this.compatibility(m); if (!this.report.canUpdate) throw Error('Compatibility check failed'); }
  async verifyInstaller(m, path) { const result = await hashFile(path); if (result.size !== m.size || result.sha256 !== m.sha256) throw Error('Installer checksum rejected'); }
  async restore() {
    if (this.busy) return this.status(); this.busy = true;
    try {
      const envelope = this.read('ready.json'); const m = manifest(envelope, this.key);
      if (!newer(m.version, this.currentVersion)) { this.remove('ready.json'); return this.status(); }
      const path = join(this.directory, `LionMax-Setup-${m.version}-win-x64.exe`);
      await this.verifyInstaller(m, path);
      this.candidate = m; this.envelope = envelope; this.path = path; this.ready = true; this.progress = m.size;
      this.message = `Verified ${m.version} is ready. Choose Install now, or close LionMax to apply it if automatic installation is enabled.`;
    } catch (error) { if (error.code !== 'ENOENT') { this.remove('ready.json'); this.message = 'A saved update could not be verified. Check for updates again.'; } }
    finally { this.busy = false; await this.refreshCompatibility(); }
    return this.status();
  }
  async check() {
    if (this.busy || this.stopped) return this.status();
    this.busy = true; this.controller = new AbortController(); this.prefs.lastAttempt = this.now();
    try {
      this.save();
      const releases = await this.fetchJSON(`https://api.github.com/repos/${repo}/releases?per_page=30`, this.controller.signal);
      if (!Array.isArray(releases)) throw Error('Invalid release listing');
      const candidates = releases.filter(r => !r.draft && /^lionmax-v\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(r.tag_name) && newer(r.tag_name.slice(9), this.currentVersion)).sort((a, b) => newer(a.tag_name.slice(9), b.tag_name.slice(9)) ? -1 : 1);
      if (candidates.length) {
        const r = candidates[0]; const envelope = await this.fetchJSON(`https://github.com/${repo}/releases/download/${r.tag_name}/lionmax-update.json`, this.controller.signal); const m = manifest(envelope, this.key);
        if (`lionmax-v${m.version}` !== r.tag_name || !newer(m.version, this.currentVersion)) throw Error('Update version rejected');
        if (!this.candidate || this.candidate.sha256 !== m.sha256 || this.candidate.version !== m.version) { this.ready = false; this.progress = 0; this.remove('ready.json'); }
        this.candidate = m; this.envelope = envelope; await this.refreshCompatibility();
        this.message = !this.report.canUpdate ? `Release ${m.version} is available, but this device needs attention in Compatibility before updating.` : this.ready ? `Verified ${m.version} is ready to install.` : `Verified release ${m.version} is available.`;
      } else {
        this.ready = false; this.candidate = null; this.envelope = null; this.progress = 0; this.remove('ready.json');
        await this.refreshCompatibility(); this.message = 'LionMax is up to date.';
      }
      this.prefs.lastCheck = this.now(); this.save();
    } catch { this.message = this.ready ? 'The update server could not be reached. Your previously verified download is still available.' : 'Update check failed. Your installed copy is unchanged; automatic checks will retry.'; }
    finally { this.busy = false; this.controller = null; }
    return this.status();
  }
  async download() {
    if (this.busy || this.stopped || !this.candidate || this.ready) return this.status();
    this.busy = true; this.ready = false; this.controller = new AbortController();
    const part = join(this.directory, 'installer.part'); let fd; let invalid = false;
    try {
      const m = manifest(this.envelope, this.key); if (!newer(m.version, this.currentVersion)) throw Error('Downgrade rejected'); await this.compatible(m);
      let offset = 0;
      try { const previous = this.read('partial.json'); if (previous.payload === this.envelope.payload && previous.signature === this.envelope.signature) { const info = fs.lstatSync(part); if (info.isFile() && !info.isSymbolicLink() && info.size <= m.size) offset = info.size; } } catch {}
      if (!offset) this.remove('installer.part');
      this.write('partial.json', this.envelope); this.progress = offset;
      for (let attempt = 0; attempt < 2; attempt++) {
        fd = fs.openSync(part, offset ? 'a' : 'w');
        this.message = offset ? `Resuming verified ${m.version} download...` : `Downloading verified ${m.version}...`;
        try {
          if (offset < m.size) await this.receive(m.url, m.size, chunk => { if (this.progress + chunk.length > m.size) { invalid = true; throw Error('Update size limit exceeded'); } fs.writeSync(fd, chunk); this.progress += chunk.length; }, { offset, signal: this.controller.signal });
          fs.closeSync(fd); fd = undefined; break;
        } catch (error) {
          fs.closeSync(fd); fd = undefined;
          if (error.code === 'RANGE_UNSUPPORTED' && offset && attempt === 0) { offset = 0; this.progress = 0; this.remove('installer.part'); continue; }
          throw error;
        }
      }
      try { await this.verifyInstaller(m, part); } catch (error) { invalid = true; throw error; }
      this.path = join(this.directory, `LionMax-Setup-${m.version}-win-x64.exe`); fs.renameSync(part, this.path);
      this.write('ready.json', this.envelope); this.remove('partial.json'); this.ready = true;
      this.message = `Verified ${m.version} is ready. Choose Install now, or close LionMax to apply it if automatic installation is enabled.`;
    } catch {
      if (invalid) { this.remove('installer.part'); this.remove('partial.json'); this.progress = 0; }
      this.message = this.report && !this.report.canUpdate ? 'Update paused: resolve the Compatibility checks first.' : invalid ? 'Download verification failed. Nothing was installed. Download a fresh copy.' : 'Download paused. Retry to resume; the complete file must pass verification before installation.';
    } finally { if (fd !== undefined) fs.closeSync(fd); this.busy = false; this.controller = null; }
    return this.status();
  }
  async install({ onExit = false } = {}) {
    if (this.busy || !this.ready) throw Error('No verified installer ready'); this.busy = true;
    try {
      const m = manifest(this.envelope, this.key); if (!newer(m.version, this.currentVersion)) throw Error('Downgrade rejected');
      await this.compatible(m); if (onExit && !this.report.canAutoInstall) throw Error('Use the interactive installer for this copy');
      await this.verifyInstaller(m, this.path); await this.launch(this.path, { onExit }); this.ready = false; this.remove('ready.json');
    } catch { this.ready = false; this.remove('ready.json'); this.message = 'Installer verification, compatibility, or launch failed. Check for updates again.'; }
    finally { this.busy = false; }
    return this.status();
  }
  async background() {
    if (!this.prefs.automatic || this.busy || this.stopped) return;
    const now = this.now(); const successRecent = now - this.prefs.lastCheck < 86400000;
    if (now - this.prefs.lastAttempt < 900000) return;
    if (!successRecent) await this.check();
    if (!this.stopped && this.candidate && !this.ready && this.prefs.automatic && this.report?.canUpdate) { this.prefs.lastAttempt = this.now(); this.save(); await this.download(); }
  }
  async stop() {
    this.stopped = true; this.controller?.abort();
    const start = Date.now(); while (this.busy && Date.now() - start < 5000) await new Promise(resolve => setTimeout(resolve, 50));
  }
  async applyOnExit() { await this.stop(); if (!this.busy && this.ready && this.prefs.installOnExit) { await this.refreshCompatibility(); if (this.report.canAutoInstall) return this.install({ onExit: true }); } return this.status(); }
}
module.exports = { Updater, manifest, newer, receive };
