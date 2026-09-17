import {join} from 'node:path';
import {Store} from '../src/store.js';
import {dataDir} from '../src/config.js';
const [id,name,...redirects]=process.argv.slice(2);
if(!id||!name||!redirects.length||!/^[a-zA-Z0-9._-]{3,80}$/.test(id))throw Error('Usage: npm run client:add -- client-id "App name" https://app.example/callback');
for(const value of redirects){const u=new URL(value);if(u.hash||u.username||u.password||u.protocol!=='https:'&&!(['127.0.0.1','localhost','[::1]'].includes(u.hostname)&&u.protocol==='http:'))throw Error('Use an exact HTTPS callback or a loopback HTTP callback.');}
const store=new Store(join(dataDir,'lionmax.sqlite'));
try{store.db.prepare('INSERT INTO clients VALUES(?,?)').run(id,JSON.stringify({client_id:id,client_name:name,redirect_uris:redirects,response_types:['code'],grant_types:['authorization_code'],token_endpoint_auth_method:'none',application_type:'web'}));console.log('Client registered. Restart LionMax to load it. Public clients must use PKCE; no client secret is issued.');}finally{store.close();}
