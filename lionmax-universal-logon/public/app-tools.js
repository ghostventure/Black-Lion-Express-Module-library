const search=document.getElementById('app-search');
search?.addEventListener('input',()=>{let visible=0;for(const card of document.querySelectorAll('[data-app-search]')){card.hidden=!card.dataset.appSearch.includes(search.value.trim().toLowerCase());if(!card.hidden)visible++;}document.getElementById('app-empty').hidden=visible>0;});
if(document.getElementById('update-panel')&&window.lionmaxUpdates){
 const api=window.lionmaxUpdates,status=document.getElementById('update-status'),auto=document.getElementById('update-auto'),check=document.getElementById('update-check'),download=document.getElementById('update-download'),install=document.getElementById('update-install');
 const render=s=>{status.textContent=s.message;document.getElementById('update-version').textContent='Installed: '+s.currentVersion+(s.availableVersion?' ? Available: '+s.availableVersion:'');auto.checked=s.automatic;auto.disabled=false;check.disabled=s.busy;download.hidden=!s.availableVersion||s.ready;download.disabled=s.busy;install.hidden=!s.ready;install.disabled=s.busy;};
 const run=async fn=>{check.disabled=true;download.disabled=true;install.disabled=true;try{render(await fn());}catch{status.textContent='The update operation could not be completed. Your installed copy is unchanged.';check.disabled=false;}};
 auto.addEventListener('change',()=>run(()=>api.automatic(auto.checked)));check.addEventListener('click',()=>run(()=>api.check()));download.addEventListener('click',()=>run(()=>api.download()));install.addEventListener('click',()=>run(()=>api.install()));
 run(()=>api.status());setInterval(()=>api.status().then(render).catch(()=>{}),2000);
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
