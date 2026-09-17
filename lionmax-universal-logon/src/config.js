import { existsSync,readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { randomBytes,generateKeyPairSync } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
export const dataDir=process.env.LIONMAX_DATA_DIR||join(process.env.LOCALAPPDATA||homedir(),'LionMax','data');
export const port=Number(process.env.PORT||4545);
export const issuer=process.env.LIONMAX_ISSUER||`http://127.0.0.1:${port}`;
export const production=process.env.NODE_ENV==='production';
const origin=new URL(issuer);
if(origin.pathname!=='/'||origin.search||origin.hash)throw Error('LIONMAX_ISSUER must be an origin without a path.');
if(origin.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw Error('Non-loopback issuers require HTTPS.');
if(production&&origin.protocol!=='https:')throw Error('Production requires an HTTPS issuer.');
export function secrets(){
 mkdirSync(dataDir,{recursive:true,mode:0o700});const path=join(dataDir,'server-secrets.json');
 if(!existsSync(path)){const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});const key={...privateKey.export({format:'jwk'}),kid:randomBytes(12).toString('hex'),use:'sig',alg:'RS256'};writeFileSync(path,JSON.stringify({cookies:[randomBytes(48).toString('base64url')],jwks:{keys:[key]}}),{flag:'wx',mode:0o600,flush:true});}
 const saved=JSON.parse(readFileSync(path,'utf8'));if(!saved.cookies?.length||!saved.jwks?.keys?.length)throw Error('Signing configuration is invalid. Original files were preserved.');return saved;
}
