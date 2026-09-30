import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, copyFileSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const version = JSON.parse(readFileSync('package.json')).version;
const data = join(process.env.LOCALAPPDATA, 'LionMax', 'data');
const target = join(data, 'backups', `before-${version}-${Date.now()}`);
mkdirSync(target, { recursive: true });
const db = new DatabaseSync(join(data, 'lionmax.sqlite'), { readOnly: true });
try {
  await backup(db, join(target, 'lionmax.sqlite'));
  for (const name of ['server-secrets.json', 'plugins.json']) if (existsSync(join(data, name))) copyFileSync(join(data, name), join(target, name));
  const verified = new DatabaseSync(join(target, 'lionmax.sqlite'), { readOnly: true });
  try { if (verified.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw Error('Backup verification failed'); } finally { verified.close(); }
  writeFileSync(`artifacts/upgrade-backup-${version}.json`, JSON.stringify({ path: target, version }));
  console.log(`Verified account-data backup before ${version}.`);
} finally { db.close(); }
