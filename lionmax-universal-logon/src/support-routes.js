import {homePage,supportPage} from './support-views.js';

function supportSummary({version,plugins,identities,websites}){
 const configured=plugins.filter(p=>p.ready).length;
 const linked=identities.length;
 const date=new Date().toISOString().slice(0,10);
 // Keep this an explicit allowlist. Do not add raw error data, account identifiers,
 // IP addresses, website URLs, tokens, client IDs, or connector settings here.
 return [
  'LionMax support summary',
  `Date: ${date} (UTC)`,
  `LionMax version: ${version}`,
  `Runtime: ${process.platform} / ${process.arch} / Node ${process.versions.node}`,
  `Configured providers: ${configured} of ${plugins.length}`,
  `Connected identities: ${linked}`,
  `Saved websites: ${websites.length}`
 ].join('\n');
}

export function installSupportRoutes(app,{tools,connections,signedIn,version}){
 app.get('/api/connection-status',signedIn,(req,res)=>{
  const plugins=tools.plugins(req.user.id),identities=connections.identities(req.user.id);
  res.json({linked:identities.length,ready:plugins.filter(p=>p.ready).length,setup:plugins.filter(p=>!p.ready).length});
 });
 app.get('/home',signedIn,(req,res)=>{
  const plugins=tools.plugins(req.user.id);
  const identities=connections.identities(req.user.id);
  const websites=connections.websites(req.user.id);
  res.send(homePage({user:req.user,plugins,identities,websites,cards:tools.cards(req.user.id),version}));
 });
 app.get('/support',signedIn,(req,res)=>{
  const plugins=tools.plugins(req.user.id);
  const identities=connections.identities(req.user.id);
  const websites=connections.websites(req.user.id);
  res.send(supportPage({details:supportSummary({version,plugins,identities,websites})}));
 });
}
