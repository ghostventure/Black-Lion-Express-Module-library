(() => {
 const defaults={accent:'cyan',size:'normal',contrast:false,motion:false};
 const clean=value=>({accent:['cyan','violet','amber'].includes(value?.accent)?value.accent:'cyan',size:['normal','large','largest'].includes(value?.size)?value.size:'normal',contrast:value?.contrast===true,motion:value?.motion===true});
 const read=()=>{try{return clean(JSON.parse(localStorage.getItem('lionmax-appearance')))}catch{return {...defaults}}};
 const apply=value=>{const p=clean(value),root=document.documentElement;root.dataset.accent=p.accent;root.dataset.size=p.size;root.dataset.contrast=String(p.contrast);root.dataset.motion=String(p.motion);return p;};
 const save=value=>{const p=apply(value);localStorage.setItem('lionmax-appearance',JSON.stringify(p));return p;};
 window.LionMaxAppearance={read,apply,save,defaults};apply(read());
})();
