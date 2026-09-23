import {launcherPage,wizardIndex,wizardPage,updatesPage} from './app-tools-ui.js';
import {testProvider} from './app-tools.js';
export function installAppTools(app,{tools,store,connections,form,csrf,checkForm,signedIn,limited,catalog}){
 const launcher=(req,res,message='',status=200)=>res.status(status).send(launcherPage(tools.cards(req.user.id),csrf(req,res),message));
 app.get('/launcher',signedIn,(req,res)=>launcher(req,res));
 for(const [path,action] of Object.entries({pin:req=>tools.pin(req.user.id,req.body.id),add:req=>connections.addWebsite(req.user.id,req.body.name,req.body.url),edit:req=>tools.updateWebsite(req.user.id,req.body.id,req.body.name,req.body.url),remove:req=>connections.removeWebsite(req.user.id,req.body.id)}))app.post('/launcher/'+path,form,checkForm,signedIn,(req,res)=>{try{action(req);res.redirect(303,'/launcher');}catch(error){launcher(req,res,error.message,400);}});
 app.get('/connections/setup',(_req,res)=>res.send(wizardIndex(catalog)));
 const wizard=(req,res,message='',status=200,tested=false)=>{const plugin=tools.plugins(req.user.id).find(p=>p.id===req.params.provider&&['microsoft','google','slack'].includes(p.id));if(!plugin)return res.sendStatus(404);res.status(status).send(wizardPage(plugin,tools.settings(req.user.id,plugin.id),csrf(req,res),message,tested));};
 app.get('/connections/setup/:provider',signedIn,(req,res)=>wizard(req,res));
 app.post('/connections/setup/:provider/save',form,checkForm,signedIn,limited,async(req,res)=>{
  try{const verified=await store.authenticate(req.user.username,req.body.password,req.body.token,req.ip);if(!verified.ok||!store.session(req.cookies.lionmax_session))throw Error('Credentials not accepted. Sign in again if your session expired.');tools.save(req.user.id,req.params.provider,req.body);wizard(req,res,'Configuration saved for your account. Continue with Test and connect.');}
  catch(error){if(error.status)throw error;wizard(req,res,error.message,400);}
 });
 app.post('/connections/setup/:provider/test',form,checkForm,signedIn,async(req,res)=>{
  if(!store.throttle('provider-test:'+req.user.id,10,60000))return wizard(req,res,'Please wait a minute before testing again.',429);
  try{const message=await testProvider(tools.plugins(req.user.id).find(p=>p.id===req.params.provider));wizard(req,res,message,200,true);}
  catch{wizard(req,res,'The provider test did not pass. Check the registration fields, required administrator setup, and your Internet connection. This test does not link an account.',400);}
 });
 app.get('/updates',(_req,res)=>res.send(updatesPage()));
}
