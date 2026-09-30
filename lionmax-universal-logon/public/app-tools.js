const search=document.getElementById('app-search');
search?.addEventListener('input',()=>{let visible=0;for(const card of document.querySelectorAll('[data-app-search]')){card.hidden=!card.dataset.appSearch.includes(search.value.trim().toLowerCase());if(!card.hidden)visible++;}document.getElementById('app-empty').hidden=visible>0;});
if(document.getElementById('update-panel')&&window.lionmaxUpdates){
 const api=window.lionmaxUpdates,status=document.getElementById('update-status'),auto=document.getElementById('update-auto'),onExit=document.getElementById('update-on-exit'),check=document.getElementById('update-check'),download=document.getElementById('update-download'),install=document.getElementById('update-install');
 const render=s=>{
  status.textContent=s.message;document.getElementById('update-version').textContent='Installed: '+s.currentVersion+(s.availableVersion?' | Available: '+s.availableVersion:'');
  document.getElementById('update-last-check').textContent=s.lastCheck?'Last successful check: '+new Date(s.lastCheck).toLocaleString():'No successful update check yet.';
  const compatible=s.compatibility?.canUpdate!==false;
  document.getElementById('update-compatibility').textContent=!compatible?'Compatibility needs attention before updating.':s.compatibility?.installMode==='portable'?'Portable copy: use the Install button for a managed Windows installation.':'Compatibility checks passed for updates.';
  auto.checked=s.automatic;auto.disabled=false;onExit.checked=s.installOnExit;onExit.disabled=false;
  check.disabled=s.busy;download.hidden=!s.availableVersion||s.ready;download.disabled=s.busy||!compatible;install.hidden=!s.ready;install.disabled=s.busy||!compatible;
  const progress=document.getElementById('update-progress');progress.hidden=!s.busy||!s.downloadSize;progress.max=s.downloadSize||1;progress.value=s.downloadBytes||0;
  document.getElementById('update-progress-text').textContent=s.downloadSize&&s.downloadBytes?Math.round(s.downloadBytes/1048576)+' / '+Math.round(s.downloadSize/1048576)+' MB verified on completion':'';
 };
 const run=async fn=>{check.disabled=true;download.disabled=true;install.disabled=true;try{render(await fn());}catch{status.textContent='The update operation could not be completed. Your installed copy is unchanged.';check.disabled=false;}};
 auto.addEventListener('change',()=>run(()=>api.automatic(auto.checked)));onExit.addEventListener('change',()=>run(()=>api.installOnExit(onExit.checked)));check.addEventListener('click',()=>run(()=>api.check()));download.addEventListener('click',()=>run(()=>api.download()));install.addEventListener('click',()=>{if(window.confirm('Close LionMax and open the verified Windows installer? Save unfinished work first.'))run(()=>api.install());});
 run(()=>api.status());const timer=setInterval(()=>api.status().then(render).catch(()=>{}),1500);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
if(document.getElementById('compatibility-check')&&window.lionmaxCompatibility){
 const button=document.getElementById('compatibility-check'),status=document.getElementById('compatibility-status'),results=document.getElementById('compatibility-results');
 const run=async()=>{button.disabled=true;status.textContent='Checking this device...';try{const report=await window.lionmaxCompatibility.check();results.replaceChildren();for(const check of report.checks){const row=document.createElement('section'),heading=document.createElement('h3'),detail=document.createElement('p');row.className='compatibility-result '+check.state;heading.textContent=(check.state==='pass'?'Passed':check.state==='warning'?'Note':'Needs attention')+' | '+check.label;detail.textContent=check.detail;row.append(heading,detail);results.append(row);}status.textContent=report.canUpdate?'This device meets the requirements for LionMax updates.':report.canRun?'LionMax can run. Resolve the update checks below before installing.':'This device does not meet the requirements below.';}catch{status.textContent='The device check could not finish. Try again.';}finally{button.disabled=false;}};
 button.addEventListener('click',run);run();
}

const profileFile=document.getElementById('profile-file');
profileFile?.addEventListener('change',async()=>{
 const status=document.getElementById('profile-status'),contents=document.getElementById('profile');contents.value='';
 const file=profileFile.files[0];if(!file)return;
 if(file.size>4096){status.textContent='Choose a setup profile smaller than 4 KB.';return;}
 try{const text=await file.text();JSON.parse(text);contents.value=text;status.textContent='Profile loaded for review. Confirm your LionMax credentials to apply it.';}catch{status.textContent='This file is not valid JSON.';}
});
document.getElementById('copy-callback')?.addEventListener('click',async()=>{
 const status=document.getElementById('copy-status');try{await navigator.clipboard.writeText(document.querySelector('.callback-url').textContent);status.textContent='Callback copied.';}catch{status.textContent='Select the callback URL above and copy it manually.';}
});
