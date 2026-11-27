/* Physical pointers are tracked separately so either thumb can lift independently. */
(function(root) {
  'use strict';
  const edges={jump:'jumpPressed',use:'interactPressed',map:'mapPressed',repeater:'repeaterPressed',recover:'recoverPressed'};
  function direction(x,y,b) {
    const dx=(x-b.left)/b.width*2-1,dy=(y-b.top)/b.height*2-1;
    if(Math.max(Math.abs(dx),Math.abs(dy))<.22 || Math.max(Math.abs(dx),Math.abs(dy))>1.25)return [];
    const result=[];
    if(Math.abs(dx)>.26&&Math.abs(dx)>=Math.abs(dy)*.53)result.push(dx<0?'left':'right');
    if(Math.abs(dy)>.26&&Math.abs(dy)>=Math.abs(dx)*.53)result.push(dy<0?'up':'down');
    return result;
  }
  function create(panel,{activate,cancelCharge}) {
    const contacts=new Map(),pending=new Set(),buttons=Array.from(panel.querySelectorAll('[data-action]'));
    const pad=panel.querySelector('.touch-dpad');
    function holds(key){for(const c of contacts.values())if(c.actions.includes(key))return true;return false;}
    function paint(){for(const b of buttons)b.classList.toggle('held',holds(b.dataset.action));}
    function start(e){
      const button=e.target.closest('[data-action]'),onPad=pad.contains(e.target);
      if((!button&&!onPad)||e.button>0)return;
      e.preventDefault();
      const actions=onPad?direction(e.clientX,e.clientY,pad.getBoundingClientRect()):[button.dataset.action];
      if(!activate(actions))return;
      for(const key of actions)if(!holds(key))pending.add(key);
      contacts.set(e.pointerId,{onPad,actions});
      try{panel.setPointerCapture(e.pointerId);}catch(_){}
      paint();
    }
    function move(e){
      const entry=contacts.get(e.pointerId);
      if(!entry?.onPad)return;
      e.preventDefault();entry.actions=direction(e.clientX,e.clientY,pad.getBoundingClientRect());paint();
    }
    function finish(e){
      const c=contacts.get(e.pointerId);if(!c)return;
      const cancelled=e.type!=='pointerup';
      contacts.delete(e.pointerId);
      if(cancelled)for(const key of c.actions)if(!holds(key)){pending.delete(key);if(key==='charge')cancelCharge();}
      paint();
    }
    function clear(){contacts.clear();pending.clear();paint();}
    function sample(){
      const actions={};
      for(const key of ['left','right','up','down','fire','charge'])actions[key]=holds(key)||pending.has(key);
      for(const [key,name] of Object.entries(edges))actions[name]=pending.has(key);
      pending.clear();return actions;
    }
    panel.addEventListener('pointerdown',start);
    panel.addEventListener('pointermove',move);
    for(const name of ['pointerup','pointercancel','lostpointercapture'])panel.addEventListener(name,finish);
    panel.addEventListener('contextmenu',e=>e.preventDefault());
    panel.addEventListener('click',e=>{
      if(e.detail!==0)return;
      const b=e.target.closest('[data-action]');if(b&&activate([b.dataset.action]))pending.add(b.dataset.action);
    });
    return {sample,clear};
  }
  function prompts(value){
    return value.replace(/\[E\]/g,'[USE]').replace(/\[Q\]/g,'[REPEATER]').replace(/\[SPACE\]/g,'[JUMP]').replace(/\bpress E\b/gi,'tap Use').replace(/\bhold K\b/gi,'hold Charge').replace(/\bCHARGE K\b/g,'CHARGE');
  }
  const api={create,direction,prompts};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.DeepRelayTouch=api;
})(typeof window==='undefined'?globalThis:window);
