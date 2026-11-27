/* Standard gamepad input. This adapter never starts the game or changes its state. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.DeepRelayInput=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const emptyActions=()=>({left:false,right:false,up:false,down:false,fire:false,charge:false,jumpPressed:false,interactPressed:false,repeaterPressed:false,pausePressed:false,mapPressed:false,recoverPressed:false});
  const emptyControls=()=>({left:false,right:false,up:false,down:false,fire:false,charge:false,jump:false,interact:false,repeater:false,pause:false,map:false});
  const any=controls=>Object.values(controls).some(Boolean);
  function button(buttons,index){
    const b=buttons&&buttons[index];
    if(!b||typeof b!=='object'||typeof b.value==='number'&&!Number.isFinite(b.value))return false;
    return b.pressed===true||typeof b.value==='number'&&Number.isFinite(b.value)&&b.value>=.5;
  }
  function axis(axes,index){const n=axes&&axes[index];return typeof n==='number'&&Number.isFinite(n)?Math.max(-1,Math.min(1,n)):0;}
  function controls(pad,deadzone){
    const x=axis(pad.axes,0),y=axis(pad.axes,1),b=pad.buttons;
    const left=button(b,14)||x < -deadzone,right=button(b,15)||x > deadzone,up=button(b,12)||y < -deadzone,down=button(b,13)||y > deadzone;
    const values={left:left&&!right,right:right&&!left,up:up&&!down,down:down&&!up,fire:button(b,2),charge:button(b,3),jump:button(b,0),interact:button(b,1),repeater:button(b,4),pause:button(b,9),map:button(b,8)};
    return{values,neutral:!left&&!right&&!up&&!down&&!any(values)};
  }
  function createGamepad(options={}){
    const deadzone=Number.isFinite(options.deadzone)?Math.max(.1,Math.min(.9,options.deadzone)):.25;
    const getGamepads=options.getGamepads||(()=>typeof navigator!=='undefined'&&typeof navigator.getGamepads==='function'?navigator.getGamepads():null);
    const target=options.eventTarget===undefined?(typeof window!=='undefined'?window:null):options.eventTarget;
    let index=null,armed=false,previous=emptyControls(),lastMode='disabled',lastCharge=false,pendingLost=false,pendingCancel=false,destroyed=false;
    function disarm(){armed=false;previous=emptyControls();}
    function lose(){pendingLost=true;pendingCancel=pendingCancel||lastCharge;lastCharge=false;disarm();}
    function invalidate(changedIndex){if(changedIndex===undefined||changedIndex===index){if(index!==null)lose();index=null;disarm();}}
    const lifecycle=event=>invalidate(event&&event.gamepad?event.gamepad.index:undefined);
    if(target&&typeof target.addEventListener==='function'){
      target.addEventListener('gamepadconnected',lifecycle);target.addEventListener('gamepaddisconnected',lifecycle);
    }
    function read(){
      try{
        const pads=getGamepads();if(pads===null||pads===undefined)return{pads:[],reason:'unavailable'};
        const length=Number.isInteger(pads.length)&&pads.length>=0?Math.min(pads.length,32):0,result=[];let unsupported=false;
        for(let i=0;i<length;i++){
          const pad=pads[i];if(!pad||pad.connected!==true)continue;
          if(pad.mapping!=='standard'||!Number.isInteger(pad.index)||pad.index<0||pad.index>255){unsupported=true;continue;}
          if(!result.some(p=>p.index===pad.index)){const sample=controls(pad,deadzone);result.push({index:pad.index,controls:sample.values,neutral:sample.neutral});}
        }
        return{pads:result,reason:unsupported&&!result.length?'unsupported':'disconnected'};
      }catch(_){return{pads:[],reason:'unavailable'};}
    }
    function poll(gates={}){
      const snapshot=destroyed?{pads:[],reason:'destroyed'}:read();
      const pad=snapshot.pads.find(p=>p.index===index)||snapshot.pads.find(p=>!p.neutral)||snapshot.pads[0]||null;
      if((pad?pad.index:null)!==index){if(index!==null)lose();index=pad?pad.index:null;disarm();}
      const mode=destroyed?'destroyed':gates.enabled!==true?'disabled':gates.focused!==true?'unfocused':gates.paused||gates.map?'overlay':'playing';
      if(mode!==lastMode){
        if((lastMode==='playing'||lastMode==='overlay')&&mode!=='playing')lose();
        disarm();lastMode=mode;
      }
      const actions=emptyActions();let activity=false,reason=snapshot.reason;
      if(mode!=='playing'&&mode!=='overlay'){disarm();reason=mode;}
      else if(pad){
        const raw=pad.controls;
        if(!armed){armed=pad.neutral;previous=raw;reason=armed?'ready':'release-controls';}
        else{
          const edge=key=>raw[key]&&!previous[key];
          actions.pausePressed=edge('pause');actions.mapPressed=edge('map');
          if(mode==='playing'){
            for(const key of ['left','right','up','down','fire','charge'])actions[key]=raw[key];
            actions.jumpPressed=edge('jump');actions.interactPressed=edge('interact');actions.repeaterPressed=edge('repeater');
            activity=Object.keys(raw).some(edge)||previous.charge&&!raw.charge;
          }else activity=actions.pausePressed||actions.mapPressed;
          previous=raw;reason='ready';
        }
      }
      const result={actions,activity,connected:!!pad,index,armed,inputLost:pendingLost,cancelCharge:pendingCancel,reason};
      pendingLost=false;pendingCancel=false;lastCharge=actions.charge;
      return result;
    }
    function destroy(){
      if(target&&typeof target.removeEventListener==='function'){
        target.removeEventListener('gamepadconnected',lifecycle);target.removeEventListener('gamepaddisconnected',lifecycle);
      }
      invalidate();destroyed=true;
    }
    return{poll,invalidate,destroy};
  }
  return{version:17,createGamepad};
});
