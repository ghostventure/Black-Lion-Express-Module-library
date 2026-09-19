import { mkdirSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { packager } from '@electron/packager';
const root = resolve(import.meta.dirname, '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'))).version;
const stage = join(root, 'artifacts', `desktop-stage-${Date.now()}`);
const shell = join(stage, 'shell');
const service = join(stage, 'service');
mkdirSync(shell, { recursive: true });
mkdirSync(service, { recursive: true });
cpSync(join(root, 'desktop', 'main.cjs'), join(shell, 'main.cjs'));
for (const file of ['preload.cjs', 'desktop.css']) cpSync(join(root, 'desktop', file), join(shell, file));
writeFileSync(join(shell, 'package.json'), JSON.stringify({ name: 'lionmax-desktop', productName: 'LionMax', version, main: 'main.cjs' }));
for (const entry of ['src', 'public', 'examples', 'docs', 'package.json', 'package-lock.json']) cpSync(join(root, entry), join(service, entry), { recursive: true });
execFileSync('cmd.exe', ['/d', '/c', 'npm.cmd ci --omit=dev'], { cwd: service, stdio: 'inherit' });
mkdirSync(join(service, 'runtime'));
cpSync(process.execPath, join(service, 'runtime', 'node.exe'));
const electronVersion = JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'))).version;
const paths = await packager({ dir: shell, name: 'LionMax', platform: 'win32', arch: 'x64', electronVersion,
  out: join(root, 'release', 'desktop'), overwrite: true, asar: true, extraResource: [service],
  win32metadata: { CompanyName: 'LionMax', FileDescription: 'LionMax Universal Logon Desktop', ProductName: 'LionMax' } });
for (const output of paths) {
  cpSync(join(root, 'README.md'), join(output, 'README.md'));
  cpSync(join(root, 'docs'), join(output, 'docs'), { recursive: true });
}
console.log(paths.join('\n'));
