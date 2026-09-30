import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import integrity from '../desktop/integrity.cjs';
const version = JSON.parse(readFileSync('package.json')).version;
const source = resolve('release/desktop/LionMax-win32-x64');
const installed = join(process.env.LOCALAPPDATA, 'Programs', 'LionMax');
let count = 0;
for (const file of await integrity.filesIn(source)) {
  assert.equal(await integrity.digest(join(source, file)), await integrity.digest(join(installed, file)), `Installed mismatch: ${file}`);
  count++;
}
const data = join(process.env.LOCALAPPDATA, 'LionMax', 'data');
const backup = JSON.parse(readFileSync(`artifacts/upgrade-backup-${version}.json`)).path;
const before = new DatabaseSync(join(backup, 'lionmax.sqlite'), { readOnly: true });
const after = new DatabaseSync(join(data, 'lionmax.sqlite'), { readOnly: true });
try {
  for (const table of ['users', 'linked_identities', 'saved_websites', 'user_plugins', 'connector_settings', 'launcher_pins']) {
    if (before.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) assert.deepEqual(after.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(), before.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(), `Account-data mismatch: ${table}`);
  }
  for (const name of ['server-secrets.json', 'plugins.json']) if (existsSync(join(backup, name))) assert.deepEqual(readFileSync(join(data, name)), readFileSync(join(backup, name)), 'Preserved secret/configuration mismatch');
  assert.equal(after.prepare('PRAGMA quick_check').get().quick_check, 'ok');
} finally { before.close(); after.close(); }
const evidence = { passed: true, version, matchedFiles: count, accountsAndConnectionsPreserved: true, installed };
writeFileSync(`artifacts/installed-${version}-verification.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
