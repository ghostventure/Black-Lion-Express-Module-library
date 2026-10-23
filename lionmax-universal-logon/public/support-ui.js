const workspaceSearch=document.getElementById('workspace-search');
workspaceSearch?.addEventListener('input',()=>{
 const q=workspaceSearch.value.trim().toLowerCase();let count=0;
 for(const result of document.querySelectorAll('[data-global-search]')){
  const match=!q||result.dataset.globalSearch.includes(q);result.hidden=!match;if(match)count++;
 }
 const empty=document.getElementById('workspace-search-empty');if(empty)empty.hidden=count!==0;
});

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
