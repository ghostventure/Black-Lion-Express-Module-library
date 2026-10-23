for(const button of document.querySelectorAll('[data-reveal]'))button.addEventListener('click',()=>{const input=document.getElementById(button.dataset.reveal);const visible=input.type==='password';input.type=visible?'text':'password';button.textContent=visible?'Hide':'Show';button.setAttribute('aria-label',(visible?'Hide ':'Show ')+input.name)});

for (const form of document.querySelectorAll('form:not([data-local-form])')) {
  form.addEventListener('submit', event => {
    if (form.dataset.submitting === 'yes') { event.preventDefault(); return; }
    form.dataset.submitting = 'yes';
    const button = event.submitter;
    if (!button) return;
    button.dataset.originalText = button.textContent;
    button.disabled = true; button.textContent = 'Working…';
    form.setAttribute('aria-busy', 'true');
    setTimeout(() => { button.disabled = false; button.textContent = button.dataset.originalText; delete form.dataset.submitting; form.removeAttribute('aria-busy'); }, 15000);
  });
}
window.addEventListener('pageshow', () => { for (const button of document.querySelectorAll('[data-original-text]')) { button.disabled = false; button.textContent = button.dataset.originalText; } for (const form of document.forms) { delete form.dataset.submitting; form.removeAttribute('aria-busy'); } });
const alert = document.querySelector('[role=alert]');
if (alert) { alert.tabIndex = -1; alert.focus(); }

const websiteUrl=document.getElementById('website-url'),websitePreview=document.getElementById('website-url-preview');
websiteUrl?.addEventListener('input',()=>{try{const url=new URL(websiteUrl.value);websitePreview.textContent=url.protocol==='https:'?url.href:'Use an HTTPS address';}catch{websitePreview.textContent='Enter a complete HTTPS address';}});
for(const form of document.querySelectorAll('form[action="/connections/websites/edit"]')){const input=form.querySelector('input[name="url"]'),preview=form.querySelector('.url-preview code');input?.addEventListener('input',()=>{try{preview.textContent=new URL(input.value).href;}catch{preview.textContent='Enter a complete HTTPS address';}});}
document.getElementById('download-token')?.addEventListener('click',()=>{const text='LionMax Universal Logon\nUsername: '+document.getElementById('saved-username').textContent+'\nPersonal token (case-sensitive): '+document.getElementById('saved-token').textContent+'\nKeep this file safe. Never share this code.\n';const url=URL.createObjectURL(new Blob([text],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='LionMax-personal-token.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
