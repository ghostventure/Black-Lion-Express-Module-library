(() => {
 const preferences=window.LionMaxAppearance, form=document.getElementById('appearance-form');
 if(form){
  const status=document.getElementById('appearance-status');
  const fill=p=>{form.elements.accent.value=p.accent;form.elements.size.value=p.size;form.elements.contrast.checked=p.contrast;form.elements.motion.checked=p.motion;};
  const values=()=>({accent:form.elements.accent.value,size:form.elements.size.value,contrast:form.elements.contrast.checked,motion:form.elements.motion.checked});
  fill(preferences.read());form.addEventListener('change',()=>{preferences.apply(values());status.textContent='Preview only. Save to keep these choices.';});
  form.addEventListener('submit',event=>{event.preventDefault();try{preferences.save(values());status.textContent='Appearance saved on this device.';}catch{status.textContent='Preview applied, but device storage is unavailable.';}});
  document.getElementById('reset-appearance').addEventListener('click',()=>{fill(preferences.defaults);try{preferences.save(preferences.defaults);status.textContent='Defaults restored.';}catch{preferences.apply(preferences.defaults);status.textContent='Defaults previewed. Device storage is unavailable.';}});
 }
 document.getElementById('download-recovery')?.addEventListener('click',()=>{
  const username=document.getElementById('saved-username')?.textContent||'';
  const codes=[...document.querySelectorAll('#recovery-codes code')].map(el=>el.textContent);
  const text='LionMax recovery codes\nUsername: '+username+'\n\n'+codes.join('\n')+'\n\nKeep these private and separate from your device. Using one replaces the entire set.\n';
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain'})),link=document.createElement('a');link.href=url;link.download='LionMax-recovery-codes.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 if(new URLSearchParams(location.search).has('locked')){const note=document.createElement('p');note.className='notice';note.setAttribute('role','status');note.textContent='LionMax is locked. Sign in again to continue.';document.querySelector('.panel')?.prepend(note);}
 const protectedPage=/^\/(account|security|connections|launcher)(\/|$)/.test(location.pathname) && location.pathname!='/connections/setup' && !location.pathname.endsWith('/callback');
 let active=false,locking=false,csrf='',deadline=0,lastActivitySent=0,activityPending=false;
 const clearSensitive=()=>{for(const input of document.querySelectorAll('input'))input.value='';document.getElementById('recovery-codes')?.replaceChildren();document.getElementById('saved-token')?.replaceChildren();document.body.textContent='Locked. Returning to sign in...';};
 async function lock(){if(locking)return;locking=true;active=false;clearSensitive();try{if(csrf)await fetch('/lock',{method:'POST',body:new URLSearchParams({csrf}),signal:AbortSignal.timeout(3000)});}catch{}finally{location.replace('/login?locked=1');}}
 async function activity(){if(!active||locking||activityPending||Date.now()-lastActivitySent<15000)return;if(Date.now()>=deadline)return lock();activityPending=true;lastActivitySent=Date.now();try{const response=await fetch('/api/activity',{method:'POST',body:new URLSearchParams({csrf}),signal:AbortSignal.timeout(5000)});if(!response.ok)return lock();deadline=(await response.json()).deadline;}catch{lock();}finally{activityPending=false;}}
 for(const event of ['pointerdown','keydown','input','scroll'])document.addEventListener(event,()=>{activity();},{passive:true});
 async function check(){try{const response=await fetch('/api/session',{signal:AbortSignal.timeout(5000)});if(!response.ok){if(active||protectedPage)lock();return;}const state=await response.json();csrf=state.csrf;deadline=state.deadline;active=true;
  if(!document.getElementById('session-tools')){const tools=document.createElement('div');tools.id='session-tools';tools.className='section-links';const link=document.createElement('a');link.href='/security';link.textContent='Security dashboard';const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent='Lock LionMax';button.addEventListener('click',lock);tools.append(link,button);document.querySelector('main')?.prepend(tools);}
 }catch{if(protectedPage||active)lock();}}
 check();setInterval(()=>{if(active&&Date.now()>=deadline)lock();},1000);setInterval(()=>{if(active)check();},15000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active)check();});
 window.addEventListener('pageshow',event=>{if(event.persisted&&protectedPage){clearSensitive();location.reload();}});
 // One-time secret displays without a signed-in session also expire locally.
 if(document.getElementById('saved-token')||document.getElementById('recovery-codes'))setTimeout(lock,10*60*1000);
})();
