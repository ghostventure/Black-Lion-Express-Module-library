(() => {
 const defaults={accent:'cyan',size:'normal',contrast:false,motion:false,theme:'dark',density:'comfortable',hints:true,dashboard:{stats:true,attempts:true,events:true}};
 const clean=value=>({accent:['cyan','violet','amber'].includes(value?.accent)?value.accent:'cyan',size:['normal','large','largest','largest-plus'].includes(value?.size)?value.size:'normal',contrast:value?.contrast===true,motion:value?.motion===true,theme:['dark','light','system'].includes(value?.theme)?value.theme:'dark',density:['comfortable','compact'].includes(value?.density)?value.density:'comfortable',hints:value?.hints!==false,dashboard:{stats:value?.dashboard?.stats!==false,attempts:value?.dashboard?.attempts!==false,events:value?.dashboard?.events!==false}});
 const read=()=>{try{return clean(JSON.parse(localStorage.getItem('lionmax-appearance')))}catch{return {...defaults}}};
 const apply=value=>{const p=clean(value),root=document.documentElement;root.dataset.accent=p.accent;root.dataset.size=p.size;root.dataset.contrast=String(p.contrast);root.dataset.motion=String(p.motion);root.dataset.theme=p.theme;root.dataset.density=p.density;return p;};
 const save=value=>{const p=apply(value);localStorage.setItem('lionmax-appearance',JSON.stringify(p));return p;};
 window.LionMaxAppearance={read,apply,save,defaults};apply(read());
})();
