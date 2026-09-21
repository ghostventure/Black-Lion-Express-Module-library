import { mkdirSync, cpSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { packager } from '@electron/packager';
import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses';
import integrity from '../desktop/integrity.cjs';
const root = resolve(import.meta.dirname, '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'))).version;
const testBuild = process.argv.includes('--test-build');
const stage = join(root, 'artifacts', `desktop-stage-${Date.now()}`);
const shell = join(stage, 'shell');
const service = join(stage, 'service');
mkdirSync(shell, { recursive: true });
mkdirSync(service, { recursive: true });
cpSync(join(root, 'desktop', 'main.cjs'), join(shell, 'main.cjs'));
for (const file of ['preload.cjs', 'desktop.css', 'integrity.cjs', 'integrity-monitor.cjs', 'supervisor.cjs', 'status.html', 'status.css', 'status.js']) cpSync(join(root, 'desktop', file), join(shell, file));
writeFileSync(join(shell, 'package.json'), JSON.stringify({ name: 'lionmax-desktop', productName: 'LionMax', version, main: 'main.cjs', lionmaxTestBuild: testBuild }));
for (const entry of ['src', 'public', 'examples', 'docs', 'package.json', 'package-lock.json']) cpSync(join(root, entry), join(service, entry), { recursive: true });
execFileSync('cmd.exe', ['/d', '/c', 'npm.cmd ci --omit=dev'], { cwd: service, stdio: 'inherit' });
mkdirSync(join(service, 'runtime'));
const runtimeCache = join(root, 'artifacts', 'node-v24.21.0.exe');
if (!existsSync(runtimeCache)) {
  const response = await fetch('https://nodejs.org/dist/v24.21.0/win-x64/node.exe');
  if (!response.ok) throw Error('Node runtime download failed');
  writeFileSync(runtimeCache, Buffer.from(await response.arrayBuffer()));
}
if (await integrity.digest(runtimeCache) !== 'ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32') throw Error('Node runtime checksum mismatch');
cpSync(runtimeCache, join(service, 'runtime', 'node.exe'));
const manifest = {};
for (const file of await integrity.filesIn(service)) manifest[file] = await integrity.digest(join(service, file));
writeFileSync(join(shell, 'service-integrity.json'), JSON.stringify(manifest));
const electronVersion = JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'))).version;
const paths = await packager({ dir: shell, name: 'LionMax', platform: 'win32', arch: 'x64', electronVersion,
  out: testBuild ? join(root, 'artifacts', 'desktop-test') : join(root, 'release', 'desktop'), overwrite: true, asar: true, extraResource: [service],
  icon: join(root, 'desktop', 'icon.ico'),
  win32metadata: { CompanyName: 'LionMax', FileDescription: 'LionMax Universal Logon Desktop', ProductName: 'LionMax' } });
for (const output of paths) {
  await flipFuses(join(output, 'LionMax.exe'), { version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: testBuild,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false });
  cpSync(join(root, 'README.md'), join(output, 'README.md'));
  cpSync(join(root, 'docs'), join(output, 'docs'), { recursive: true });
}
console.log(paths.join('\n'));
