import {backup} from 'node:sqlite';
import {mkdirSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {Store} from '../src/store.js';
import {dataDir} from '../src/config.js';
const target=resolve(process.argv[2]||join(dataDir,'backups',new Date().toISOString().replace(/[:.]/g,'-')));mkdirSync(target,{recursive:true,mode:0o700});const store=new Store(join(dataDir,'lionmax.sqlite'));
try{await backup(store.db,join(target,'lionmax.sqlite'));copyFileSync(join(dataDir,'server-secrets.json'),join(target,'server-secrets.json'));console.log('Backup created at '+target+'. Protect it: it contains account hashes, IP history and signing keys.');}finally{store.close();}
