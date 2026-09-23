const search=document.getElementById('app-search');
search?.addEventListener('input',()=>{let visible=0;for(const card of document.querySelectorAll('[data-app-search]')){card.hidden=!card.dataset.appSearch.includes(search.value.trim().toLowerCase());if(!card.hidden)visible++;}document.getElementById('app-empty').hidden=visible>0;});
if(document.getElementById('update-panel')&&window.lionmaxUpdates){
 const api=window.lionmaxUpdates,status=document.getElementById('update-status'),auto=document.getElementById('update-auto'),check=document.getElementById('update-check'),download=document.getElementById('update-download'),install=document.getElementById('update-install');
 const render=s=>{status.textContent=s.message;document.getElementById('update-version').textContent='Installed: '+s.currentVersion+(s.availableVersion?' ? Available: '+s.availableVersion:'');auto.checked=s.automatic;auto.disabled=false;check.disabled=s.busy;download.hidden=!s.availableVersion||s.ready;download.disabled=s.busy;install.hidden=!s.ready;install.disabled=s.busy;};
 const run=async fn=>{check.disabled=true;download.disabled=true;install.disabled=true;try{render(await fn());}catch{status.textContent='The update operation could not be completed. Your installed copy is unchanged.';check.disabled=false;}};
 auto.addEventListener('change',()=>run(()=>api.automatic(auto.checked)));check.addEventListener('click',()=>run(()=>api.check()));download.addEventListener('click',()=>run(()=>api.download()));install.addEventListener('click',()=>run(()=>api.install()));
 run(()=>api.status());setInterval(()=>api.status().then(render).catch(()=>{}),2000);
}
