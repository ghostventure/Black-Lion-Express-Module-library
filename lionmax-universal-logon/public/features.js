(() => {
 const preferences=window.LionMaxAppearance, form=document.getElementById('appearance-form');
 if(form){
  const status=document.getElementById('appearance-status');
  const fill=p=>{form.elements.accent.value=p.accent;form.elements.size.value=p.size;form.elements.targetSize.value=p.targetSize;form.elements.contrast.checked=p.contrast;form.elements.motion.checked=p.motion;form.elements.theme.value=p.theme;form.elements.density.value=p.density;};
  const values=()=>({...preferences.read(),accent:form.elements.accent.value,size:form.elements.size.value,targetSize:form.elements.targetSize.value,contrast:form.elements.contrast.checked,motion:form.elements.motion.checked,theme:form.elements.theme.value,density:form.elements.density.value});
  fill(preferences.read());form.addEventListener('change',()=>{preferences.apply(values());status.textContent='Preview only. Save to keep these choices.';});
  form.addEventListener('submit',event=>{event.preventDefault();try{const p=preferences.save(values());status.textContent='Appearance saved on this device.';window.lionmaxDesktop?.setPreferences({theme:p.theme}).catch(()=>{status.textContent='Appearance saved. Windows theme integration could not be updated.';});}catch{status.textContent='Preview applied, but device storage is unavailable.';}});
  document.getElementById('reset-appearance').addEventListener('click',()=>{fill(preferences.defaults);try{preferences.save(preferences.defaults);window.lionmaxDesktop?.setPreferences({theme:preferences.defaults.theme}).catch(()=>{});status.textContent='Defaults restored.';}catch{preferences.apply(preferences.defaults);status.textContent='Defaults previewed. Device storage is unavailable.';}});
 }
 const desktopPrefs=document.getElementById('desktop-preferences'),desktop=window.lionmaxDesktop;
 if(desktopPrefs&&desktop){
  const startup=document.createElement('label');startup.className='check';startup.innerHTML='<input type="checkbox" id="launch-at-login"><span>Start LionMax when I sign in to Windows</span>';
  const minimized=document.createElement('label');minimized.className='check';minimized.innerHTML='<input type="checkbox" id="start-minimized"><span>Start minimized</span>';
  const hintToggle=document.createElement('label');hintToggle.className='check';hintToggle.innerHTML='<input type="checkbox" id="show-hints"><span>Show first-use tips</span>';
  const note=document.createElement('p');note.className='hint';note.id='desktop-settings-status';desktopPrefs.append(startup,minimized,hintToggle,note);
  const showHints=document.getElementById('show-hints');showHints.checked=preferences.read().hints;
  showHints.addEventListener('change',()=>{try{const p=preferences.read();p.hints=showHints.checked;preferences.save(p);if(p.hints)localStorage.removeItem('lionmax-first-tip-dismissed');note.textContent='Tip preference saved on this device.';}catch{note.textContent='Device storage is unavailable; the tip preference could not be saved.';}});
  desktop.getPreferences().then(p=>{document.getElementById('launch-at-login').checked=p.startAtLogin;document.getElementById('start-minimized').checked=p.startMinimized;}).catch(()=>{note.textContent='Desktop settings could not be loaded.';});
  for(const [id,key] of [['launch-at-login','startAtLogin'],['start-minimized','startMinimized']])document.getElementById(id).addEventListener('change',async event=>{try{const p=await desktop.setPreferences({[key]:event.target.checked});document.getElementById('launch-at-login').checked=p.startAtLogin;document.getElementById('start-minimized').checked=p.startMinimized;note.textContent='Desktop startup settings saved.';}catch{event.target.checked=!event.target.checked;note.textContent='Windows did not accept this startup setting.';}});
 }
 // Keyboard shortcuts are deliberately limited to navigation and search, and
 // do not intercept typing inside form controls or editable content.
 document.addEventListener('keydown',event=>{
  if(event.altKey&&!event.ctrlKey&&!event.shiftKey&&/^\d$/.test(event.key)&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){
   const links=[...document.querySelectorAll('.desktop-nav a')],link=links[Number(event.key)-1];if(link){event.preventDefault();location.href=link.href;}
  }
  if(event.key==='/'&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){
   const search=document.querySelector('input[type="search"],input[placeholder*="Search" i]');if(search){event.preventDefault();search.focus();}
  }
 });
 // Dismissible first-visit helper, stored locally and shown once per browser.
 const hints=preferences.read();
 let tipDismissed=false;try{tipDismissed=localStorage.getItem('lionmax-first-tip-dismissed')==='1';}catch{tipDismissed=true;}
 if(hints.hints&&!tipDismissed&&!['/login','/register'].includes(location.pathname)){
  const tip=document.createElement('aside');tip.className='first-use-tip';tip.setAttribute('role','note');tip.innerHTML='<strong>Quick tip</strong><span>Use the left navigation to move between LionMax sections. Open Access &amp; appearance to personalize the layout.</span><button type="button" aria-label="Dismiss tip">Dismiss</button>';
  tip.querySelector('button').addEventListener('click',()=>{try{localStorage.setItem('lionmax-first-tip-dismissed','1');}catch{}tip.remove();});document.querySelector('main')?.prepend(tip);
 }
 // Local dashboard layout preferences only affect optional summary panels.
 if(location.pathname==='/connections')for(const heading of document.querySelectorAll('h3'))if(heading.textContent.includes('Your software & websites'))heading.id='saved-sites';
 if(location.pathname==='/security'){
  const p=preferences.read(),stats=document.querySelector('.security-stats'),attempts=[...document.querySelectorAll('h3')].find(x=>x.textContent.includes('Recent sign-in attempts')),
   events=[...document.querySelectorAll('h3')].find(x=>x.textContent.includes('Security history'));
  if(stats){stats.hidden=!p.dashboard.stats;const controls=document.createElement('details');controls.className='dashboard-layout';controls.innerHTML='<summary>Customize dashboard</summary><label class="check"><input type="checkbox" data-dashboard="stats">Show summary cards</label><label class="check"><input type="checkbox" data-dashboard="attempts">Show recent sign-in attempts</label><label class="check"><input type="checkbox" data-dashboard="events">Show security history</label>';stats.after(controls);
   for(const box of controls.querySelectorAll('[data-dashboard]')){const key=box.dataset.dashboard;box.checked=p.dashboard[key];box.addEventListener('change',()=>{const next=preferences.read();next.dashboard[key]=box.checked;preferences.save(next);applyDashboard(next);});}
  }
  function applyDashboard(value){if(stats)stats.hidden=!value.dashboard.stats;if(attempts){attempts.hidden=!value.dashboard.attempts;attempts.nextElementSibling.hidden=!value.dashboard.attempts;attempts.nextElementSibling.nextElementSibling.hidden=!value.dashboard.attempts;}if(events){events.hidden=!value.dashboard.events;events.nextElementSibling.hidden=!value.dashboard.events;}}
  applyDashboard(p);
 }
 if(location.pathname==='/home'){
  const sections=[...document.querySelectorAll('[data-dashboard-section]')],holder=sections[0]?.parentElement;
  if(sections.length&&holder){
   const controls=document.createElement('details');controls.className='dashboard-layout';
   const summary=document.createElement('summary');summary.textContent='Customize Home layout';controls.append(summary);
   holder.insertBefore(controls,sections[0]);
   const applyHome=value=>{
    const byId=Object.fromEntries(sections.map(section=>[section.dataset.sectionKey,section]));
    for(const id of value.homeOrder){const section=byId[id];if(section){section.hidden=!value.home[id];holder.append(section);}}
    controls.querySelector('.home-layout-options')?.remove();
    const options=document.createElement('div');options.className='home-layout-options';
    for(let index=0;index<value.homeOrder.length;index++){
     const id=value.homeOrder[index],section=byId[id];if(!section)continue;
     const row=document.createElement('div');row.className='home-layout-row';
     const label=document.createElement('label');label.className='check';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=value.home[id];checkbox.addEventListener('change',()=>{const next=preferences.read();next.home[id]=checkbox.checked;preferences.save(next);applyHome(next);});label.append(checkbox,document.createTextNode(section.querySelector('h3')?.textContent||id));
     const up=document.createElement('button');up.type='button';up.className='text-button';up.textContent='Move up';up.disabled=index===0;up.setAttribute('aria-label','Move '+(section.querySelector('h3')?.textContent||id)+' up');up.addEventListener('click',()=>move(index,-1));
     const down=document.createElement('button');down.type='button';down.className='text-button';down.textContent='Move down';down.disabled=index===value.homeOrder.length-1;down.setAttribute('aria-label','Move '+(section.querySelector('h3')?.textContent||id)+' down');down.addEventListener('click',()=>move(index,1));
     row.append(label,up,down);options.append(row);
    }
    controls.append(options);
   };
   const move=(index,delta)=>{const next=preferences.read(),other=index+delta;if(other<0||other>=next.homeOrder.length)return;[next.homeOrder[index],next.homeOrder[other]]=[next.homeOrder[other],next.homeOrder[index]];preferences.save(next);applyHome(next);};
   applyHome(preferences.read());
  }
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
