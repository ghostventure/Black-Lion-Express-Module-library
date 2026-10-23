const search=document.getElementById('app-search');
const launcherCards=[...document.querySelectorAll('#launcher-grid [data-app-id]')],folderFilter=document.getElementById('app-folder-filter'),empty=document.getElementById('app-empty');
const filterLauncher=()=>{let visible=0;for(const card of launcherCards){const textMatch=card.dataset.appSearch.includes((search?.value||'').trim().toLowerCase()),folder=folderFilter?.value||'',folderMatch=!folder||(folder==='__unfiled'?!card.dataset.folder:card.dataset.folder===folder);card.hidden=!(textMatch&&folderMatch);if(!card.hidden)visible++;}if(empty){empty.hidden=visible>0;empty.textContent=launcherCards.length?'No apps match this search or folder.':'No launchable apps yet. Add a website below or connect an office provider to get started.';}};
search?.addEventListener('input',filterLauncher);folderFilter?.addEventListener('change',filterLauncher);
const selections=[...document.querySelectorAll('[data-launcher-select]')],selectedField=document.getElementById('launcher-selected'),selectionCount=document.getElementById('launcher-selection-count');
const updateSelection=()=>{const selected=selections.filter(input=>input.checked);if(selectedField)selectedField.value=selected.map(input=>input.value).join(',');if(selectionCount)selectionCount.textContent=selected.length?`${selected.length} app${selected.length===1?'':'s'} selected.`:'Select apps below to organize them.';};
selections.forEach(input=>input.addEventListener('change',updateSelection));
document.getElementById('launcher-organize')?.addEventListener('submit',event=>{updateSelection();if(!selectedField.value){event.preventDefault();if(selectionCount)selectionCount.textContent='Select at least one app first.';}});
const confirmLaunch=document.getElementById('launcher-confirm-launch');
if(confirmLaunch){try{confirmLaunch.checked=localStorage.getItem('lionmax-confirm-launch')==='true';}catch{}confirmLaunch.addEventListener('change',()=>{try{localStorage.setItem('lionmax-confirm-launch',String(confirmLaunch.checked));}catch{}});}
const grid=document.getElementById('launcher-grid'),orderForm=document.getElementById('launcher-order'),orderField=document.getElementById('launcher-order-value');let dragged=null;
grid?.addEventListener('dragstart',event=>{const card=event.target.closest('[data-app-id]');if(!card||event.target.closest('a,button,input,summary')){event.preventDefault();return;}dragged=card;card.classList.add('is-dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',card.dataset.appId);});
grid?.addEventListener('dragend',()=>{dragged?.classList.remove('is-dragging');dragged=null;});
grid?.addEventListener('dragover',event=>{if(!dragged)return;event.preventDefault();const target=event.target.closest('[data-app-id]');if(target&&target!==dragged){const box=target.getBoundingClientRect();grid.insertBefore(dragged,event.clientY<box.top+box.height/2?target:target.nextSibling);}});
grid?.addEventListener('drop',event=>{if(!dragged)return;event.preventDefault();orderField.value=[...grid.querySelectorAll('[data-app-id]')].map(card=>card.dataset.appId).join(',');orderForm?.requestSubmit();});
grid?.addEventListener('click',event=>{const button=event.target.closest('[data-order-move]');if(!button)return;const card=button.closest('[data-app-id]'),cards=[...grid.querySelectorAll('[data-app-id]')],index=cards.indexOf(card),next=index+Number(button.dataset.orderMove);if(index<0||next<0||next>=cards.length)return;grid.insertBefore(card,button.dataset.orderMove==='-1'?cards[next]:cards[next].nextSibling);orderField.value=[...grid.querySelectorAll('[data-app-id]')].map(item=>item.dataset.appId).join(',');orderForm?.requestSubmit();});
filterLauncher();
if(document.getElementById('update-panel')&&window.lionmaxUpdates){
 const api=window.lionmaxUpdates,status=document.getElementById('update-status'),auto=document.getElementById('update-auto'),onExit=document.getElementById('update-on-exit'),check=document.getElementById('update-check'),download=document.getElementById('update-download'),install=document.getElementById('update-install');
 const whatsNew=document.getElementById('update-whats-new');let currentVersion='';
 document.getElementById('whats-new-dismiss')?.addEventListener('click',()=>{try{localStorage.setItem('lionmax-whats-new-dismissed',currentVersion);}catch{}if(whatsNew)whatsNew.hidden=true;});
 const render=s=>{
  currentVersion=s.currentVersion||'';
  if(whatsNew&&currentVersion){let previous='',dismissed='';try{previous=localStorage.getItem('lionmax-last-seen-version')||'';dismissed=localStorage.getItem('lionmax-whats-new-dismissed')||'';localStorage.setItem('lionmax-last-seen-version',currentVersion);}catch{}const changed=Boolean(previous&&previous!==currentVersion);whatsNew.hidden=!changed||dismissed===currentVersion;if(changed&&dismissed!==currentVersion)document.getElementById('whats-new-version').textContent=`You are now using LionMax ${currentVersion}. Here are some recent improvements.`;}
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

const setupForm=document.querySelector('form[action^="/connections/setup/"][action$="/save"]');
if(setupForm){
 const provider=location.pathname.split('/')[3],status=document.getElementById('setup-validation'),fields=[...setupForm.querySelectorAll('[data-connection-field]')];
 const guid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const validate=()=>{
  const values=Object.fromEntries(fields.map(field=>[field.dataset.connectionField,field.value.trim()])),errors=[];
  if(values['client-id']){
   const valid=provider==='microsoft'?guid.test(values['client-id']):provider==='google'?/^[a-zA-Z0-9._-]{8,200}\.apps\.googleusercontent\.com$/.test(values['client-id']):/^\d+\.\d+$/.test(values['client-id']);
   if(!valid)errors.push(provider==='microsoft'?'Client ID must be a Microsoft application GUID.':provider==='google'?'Google client ID must end in .apps.googleusercontent.com.':'Slack client ID should look like 123456.123456.');
  }
  if(provider==='microsoft'&&values['tenant-id']&&!guid.test(values['tenant-id']))errors.push('Tenant ID must be a GUID.');
  if(values['secret-env']&&!/^[A-Z][A-Z0-9_]{0,79}$/.test(values['secret-env']))errors.push('Use an uppercase environment variable name for the secret.');
  if(values['callback-origin']){try{const url=new URL(values['callback-origin']);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)errors.push('Callback origin must be an HTTPS origin without a path.');}catch{errors.push('Enter a valid HTTPS callback origin.');}}
  if(errors.length)status.textContent=errors.join(' ');
  else if(values['client-id']&&(provider!=='microsoft'||values['tenant-id'])&&(provider!=='slack'||values['callback-origin']))status.textContent='Registration fields look correctly formatted. Save to check the provider registration.';
  else status.textContent='Enter your provider registration details. LionMax checks their format as you type.';
 };
 for(const field of fields)field.addEventListener('input',validate);validate();
}
