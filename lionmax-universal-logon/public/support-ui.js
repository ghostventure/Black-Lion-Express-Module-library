const workspaceSearch=document.getElementById('workspace-search');
const dashboardDensity=document.getElementById('dashboard-density');
if(dashboardDensity){
 const applyDensity=value=>{const density=value==='compact'?'compact':'comfortable';document.querySelector('main')?.setAttribute('data-dashboard-density',density);dashboardDensity.value=density;};
 let saved='comfortable';try{saved=localStorage.getItem('lionmax-dashboard-density')||saved;}catch{}
 applyDensity(saved);
 dashboardDensity.addEventListener('change',()=>{applyDensity(dashboardDensity.value);try{localStorage.setItem('lionmax-dashboard-density',dashboardDensity.value);}catch{}});
}
workspaceSearch?.addEventListener('input',()=>{
 const q=workspaceSearch.value.trim().toLowerCase();let count=0;
 for(const result of document.querySelectorAll('[data-global-search]')){
  const match=!q||result.dataset.globalSearch.includes(q);result.hidden=!match;if(match)count++;
 }
 const empty=document.getElementById('workspace-search-empty');if(empty)empty.hidden=count!==0;
});

const helpSearch=document.getElementById('support-help-search');
helpSearch?.addEventListener('input',()=>{
 const query=helpSearch.value.trim().toLowerCase();let count=0;
 for(const topic of document.querySelectorAll('[data-help-topic]')){
  const text=(topic.dataset.helpTopic+' '+topic.textContent).toLowerCase(),match=!query||text.includes(query);
  topic.hidden=!match;if(match)count++;
 }
 const empty=document.getElementById('support-help-empty');if(empty)empty.hidden=count!==0;
});

const tour=document.getElementById('home-tour');
if(tour){
 const steps=[
  ['Your workspace at a glance','The overview cards summarize your connected identities, saved websites, and apps ready to launch.','overview'],
  ['Finish setup at your pace','The getting-started list tracks your account, provider, connection, and saved-website setup.','checklist'],
  ['Check connections and open apps','See provider status here. Your apps section lists shortcuts you can launch.','connections'],
  ['Find pages and help','Search LionMax for apps, providers, and sections, or open Updates and help for support links.','search']
 ];
 let step=0;
 const progress=document.getElementById('home-tour-progress'),title=document.getElementById('home-tour-title'),copy=document.getElementById('home-tour-copy'),back=document.getElementById('home-tour-back'),next=document.getElementById('home-tour-next');
 const render=()=>{const [heading,message,target]=steps[step];progress.textContent=`HOME TOUR · STEP ${step+1} OF ${steps.length}`;title.textContent=heading;copy.textContent=message;back.disabled=step===0;next.textContent=step===steps.length-1?'Finish tour':'Next';document.querySelectorAll('[data-dashboard-section]').forEach(section=>section.classList.toggle('tour-focus',section.id===target));};
 const close=()=>{tour.hidden=true;document.querySelectorAll('.tour-focus').forEach(section=>section.classList.remove('tour-focus'));try{localStorage.setItem('lionmax-home-tour-complete','1');}catch{}};
 const start=()=>{step=0;tour.hidden=false;render();tour.scrollIntoView({behavior:'smooth',block:'nearest'});};
 document.getElementById('home-tour-start')?.addEventListener('click',start);
 document.getElementById('home-tour-close')?.addEventListener('click',close);
 back?.addEventListener('click',()=>{if(step>0){step--;render();}});
 next?.addEventListener('click',()=>{if(step===steps.length-1)close();else{step++;render();}});
 let complete=false;try{complete=localStorage.getItem('lionmax-home-tour-complete')==='1';}catch{complete=true;}
 if(!complete)start();
}

document.getElementById('copy-support')?.addEventListener('click',async()=>{
 const status=document.getElementById('support-copy-status');
 try{await navigator.clipboard.writeText(document.getElementById('support-preview').value);status.textContent='Reviewed support details copied.';}
 catch{status.textContent='Copy is unavailable here. Select the preview text and copy it manually.';}
});

document.getElementById('feedback-draft')?.addEventListener('click',async()=>{
 const status=document.getElementById('feedback-status'),message=document.getElementById('feedback-message').value.trim();
 if(!message){status.textContent='Write a short note first.';return;}
 try{await navigator.clipboard.writeText(`LionMax feedback\n\n${message}`);status.textContent='Feedback note copied. Review it and send it to your LionMax support contact.';}
 catch{status.textContent='Select your note and copy it, then send it to your LionMax support contact.';}
});
