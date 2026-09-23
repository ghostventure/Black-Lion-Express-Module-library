import { hash } from './store.js';
import { tokenPage } from './views.js';
import { recoveryPage, recoveryCodesPage, securityPage, appearancePage } from './security-views.js';
export function installSecurity(app,{store,connections,form,csrf,checkForm,signedIn,limited,cookie}) {
 const security=store.security;
 const dashboard=(req,res,message='',status=200)=>res.status(status).send(securityPage(req.user,security.dashboard(req.user.id),connections,csrf(req,res),hash(req.cookies.lionmax_session),message));
 app.get('/security',signedIn,(req,res)=>dashboard(req,res));
 app.get('/appearance',(_req,res)=>res.send(appearancePage()));
 app.get('/recover',(req,res)=>res.send(recoveryPage(csrf(req,res))));
 app.post('/recover',form,checkForm,limited,async(req,res)=>{
  try {
   const user=await security.recover(req.body.username,req.body.recovery,req.body.password,req.body.confirmation);
   store.logout(req.cookies.lionmax_session);res.clearCookie('lionmax_session',cookie);
   res.send(tokenPage(user.token,user.username,user.recoveryCodes));
  } catch(error) { if(error.status) throw error;res.status(400).send(recoveryPage(csrf(req,res),error.message)); }
 });
 app.post('/security/recovery',form,checkForm,signedIn,limited,async(req,res)=>{
  try { const codes=await security.replaceCodes(req.user.id,req.body.password,req.body.token,req.ip);res.send(recoveryCodesPage(req.user.username,codes)); }
  catch(error) { if(error.status)throw error;dashboard(req,res,error.message,400); }
 });
 app.post('/security/settings',form,checkForm,signedIn,(req,res)=>{
  try {security.saveSettings(req.user.id,req.body.idle_minutes);dashboard(req,res,'Auto-lock settings saved.');}
  catch(error){dashboard(req,res,error.message,400);}
 });
 app.post('/security/sessions/revoke',form,checkForm,signedIn,(req,res)=>{
  security.revokeSession(req.user.id,req.body.id);
  if(!store.session(req.cookies.lionmax_session)){res.clearCookie('lionmax_session',cookie);return res.redirect(303,'/login?locked=1');}
  res.redirect(303,'/security');
 });
 app.post('/security/sessions/revoke-all',form,checkForm,signedIn,(req,res)=>{
  store.db.exec('BEGIN IMMEDIATE');
  try{security.revokeAll(req.user.id);store.audit('sessions.revoked',req.user.id);store.db.exec('COMMIT');}
  catch(error){store.db.exec('ROLLBACK');throw error;}
  res.clearCookie('lionmax_session',cookie);res.redirect(303,'/login?locked=1');
 });
 app.post('/security/grants/revoke',form,checkForm,signedIn,(req,res)=>{
  try{connections.revokeGrant(req.user.id,req.body.id);res.redirect(303,'/security');}
  catch(error){dashboard(req,res,error.message,400);}
 });
 app.get('/api/session',(req,res)=>{
  const row=security.sessionRow(req.cookies.lionmax_session);
  if(!row)return res.status(401).json({authenticated:false});
  res.json({authenticated:true,csrf:csrf(req,res),deadline:Math.min(row.expires,row.last_seen+row.idle_minutes*60000),idleMinutes:row.idle_minutes});
 });
 app.post('/api/activity',form,checkForm,(req,res)=>{
  if(!security.touch(req.cookies.lionmax_session))return res.status(401).json({authenticated:false});
  const row=security.sessionRow(req.cookies.lionmax_session);
  res.json({deadline:Math.min(row.expires,row.last_seen+row.idle_minutes*60000)});
 });
 app.post('/lock',form,checkForm,(req,res)=>{
  const user=store.session(req.cookies.lionmax_session);
  store.logout(req.cookies.lionmax_session);if(user)store.audit('session.auto_locked',user.id);
  res.clearCookie('lionmax_session',cookie);res.redirect(303,'/login?locked=1');
 });
}
