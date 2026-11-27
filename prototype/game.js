(function () {
  'use strict';
  const C=window.DeepRelayCore, S=window.DeepRelaySprites, E=window.DeepRelayEnvironment, WFX=window.DeepRelayWeaponFX, HUD=window.DeepRelayHUD, canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
  // Double the backing resolution without changing the logical world, controls, or CSS size.
  canvas.width=768;canvas.height=432;ctx.setTransform(2,0,0,2,0,0);
  // Keep whole device-pixel multiples crisp and filter fractional scales, including fullscreen.
  if (typeof ResizeObserver === 'function') {
    function updateSampling() {
      const bounds = canvas.getBoundingClientRect();
      const scale = Math.min(bounds.width / canvas.width, bounds.height / canvas.height) * (window.devicePixelRatio || 1);
      const multiple = Math.round(scale);
      canvas.style.imageRendering = multiple > 0 && Math.abs(scale - multiple) < 0.001 ? 'pixelated' : 'auto';
    }
    const observer = new ResizeObserver(updateSampling);
    observer.observe(canvas);
    window.addEventListener('resize', updateSampling);
    updateSampling();
  }
  const audioEngine=window.DeepRelayAudio?window.DeepRelayAudio.create():null;
  const weaponFX=WFX?WFX.create({chargeTime:s=>C.chargeTime?C.chargeTime(s):.6}):null;
  const music=window.DeepRelayMusic?window.DeepRelayMusic.create(audioEngine?{context:()=>audioEngine.getContext(),destination:()=>audioEngine.musicInput}:{}):null;
  const titleArt=new Image();titleArt.src='art/runtime/dock21-title.png';
  const motionPreference=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const background=new Image();background.src='art/runtime/sump-background.png';
  const SAVE_KEY='deep-relay-save-v2';
  const AUDIO_SETTINGS_KEY='deep-relay-audio-settings';
  const preferences={music:true,effects:true,volume:30};
  try{
    const saved=JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY));
    if(saved){
      preferences.music=saved.music===true;
      preferences.effects=saved.effects===true;
      if(Number.isInteger(saved.volume)&&saved.volume>=0&&saved.volume<=100)preferences.volume=saved.volume;
    }
  }catch(_){}
  function savePreferences(){try{localStorage.setItem(AUDIO_SETTINGS_KEY,JSON.stringify(preferences));}catch(_){}}
  let state=C.createGame(),last=0,accumulator=0,focused=false,started=false,loadedSave=false,storageAvailable=true;
  try{const raw=localStorage.getItem(SAVE_KEY);if(raw&&typeof C.restore==='function'){const restored=C.restore(JSON.parse(raw));if(restored){state=restored;loadedSave=true;}}}catch(_){storageAvailable=false;}
  state.paused=true;
  function saveProgress(){if(typeof C.serialize!=='function')return;try{localStorage.setItem(SAVE_KEY,JSON.stringify(C.serialize(state)));storageAvailable=true;}catch(_){storageAvailable=false;}}
  const keys=new Set(),pressed=new Set();
  const gamepad=window.DeepRelayInput?window.DeepRelayInput.createGamepad():null;

  const touchDevice=(navigator.maxTouchPoints||0)>0||!!window.matchMedia?.('(any-pointer: coarse)').matches;
  if(touchDevice)document.documentElement.classList.add('touch-device');
  let lastInput=touchDevice?'touch':'keyboard',chargeBlocked=false,padStatus={connected:false,armed:false,reason:'unavailable'};
  const touchPanel=document.getElementById('touch-controls');
  const repeaterButton=touchPanel?.querySelector('[data-action="repeater"]');
  const touch=touchPanel&&window.DeepRelayTouch?window.DeepRelayTouch.create(touchPanel,{
    activate(actions){
      if(!started||state.paused||(state.map&&!actions.includes('map')))return false;
      lastInput='touch';canvas.focus({preventScroll:true});return true;
    },
    cancelCharge:()=>C.cancelCharge(state)
  }):null;

  function cancelInputCharge(){C.cancelCharge(state);chargeBlocked=true;if(audioEngine)audioEngine.setCharge(0,false);}
  function clearInput(){cancelInputCharge();touch?.clear();keys.clear();pressed.clear();if(gamepad)gamepad.invalidate();}
  function controlText(value){if(lastInput==='touch')return window.DeepRelayTouch.prompts(value);return lastInput==='gamepad'?value.replace(/\[E\]/g,'[B]').replace(/\[Q\]/g,'[LB]').replace(/\[SPACE\]/g,'[A]').replace(/CHARGE K/g,'CHARGE Y').replace(/HOLD K/g,'HOLD Y').replace(/PRESS E/g,'PRESS B'):value;}
  let recoil=0,landing=0,roomFade=0,shake=0,lastMusicScene=null,lastMusicPaused=null,emission=0,viewY=40;
  const palette={navy:'#101923',deep:'#102b34',teal:'#173d42',green:'#4f7764',mint:'#8fd8c5',ochre:'#e5ad55',rust:'#a95048',pink:'#d56491',white:'#e8e4d0'};
  const r=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h);};
  function text(str,x,y,color=palette.white,size=7) {
    const label=controlText(str),px=Math.round(x),py=Math.round(y);
    ctx.font=size+'px Consolas, "Courier New", monospace';ctx.textBaseline='top';
    ctx.fillStyle='#09161ee8';ctx.fillText(label,px+.5,py+1);
    ctx.fillStyle=color;ctx.fillText(label,px,py);
  }
  const line=(x,y,x2,y2,color)=>{ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(Math.round(x)+.5,Math.round(y)+.5);ctx.lineTo(Math.round(x2)+.5,Math.round(y2)+.5);ctx.stroke();};
  function circle(x,y,rad,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(Math.round(x),Math.round(y),rad,0,Math.PI*2);ctx.fill();}
  function input(){
    const held=(...k)=>k.some(x=>keys.has(x)),edge=(...k)=>k.some(x=>pressed.has(x));
    if((state.paused||state.map||!started)&&held('k'))chargeBlocked=true;
    const actions={left:held('arrowleft','a'),right:held('arrowright','d'),up:held('arrowup','w'),down:held('arrowdown','s'),fire:held('j','z'),charge:held('k')&&!chargeBlocked,jumpPressed:edge(' '),interactPressed:edge('e'),repeaterPressed:edge('q')&&started&&!state.map&&!state.paused,pausePressed:edge('p','escape'),mapPressed:edge('m'),recoverPressed:edge('r')};
    if(gamepad){
      padStatus=gamepad.poll({enabled:started,focused:!document.hidden&&document.activeElement===canvas,paused:state.paused,map:state.map});
      if(padStatus.cancelCharge){cancelInputCharge();actions.charge=false;}
      if(padStatus.inputLost&&lastInput==='gamepad'&&!padStatus.connected&&!state.paused){state.paused=true;cancelInputCharge();lastInput='keyboard';}
      if(padStatus.activity)lastInput='gamepad';
      for(const key of Object.keys(actions))actions[key]=actions[key]||!!padStatus.actions[key];
    }
    if(touch){const finger=touch.sample();for(const k of Object.keys(actions))actions[k]=actions[k]||!!finger[k];}
    return actions;
  }
  const gameKeys=new Set(['arrowleft','arrowright','arrowup','arrowdown','a','d','w','s','j','z','k',' ','e','q','p','escape','m','r']);
  canvas.addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();
    if(state.paused&&!state.won&&(k==='enter'||k==='p'||k==='escape')){
      e.preventDefault();lastInput='keyboard';
      if(!e.repeat)resumeGame();
      return;
    }
    if(gameKeys.has(k)){
      e.preventDefault();lastInput='keyboard';
      if(k==='k'&&chargeBlocked){if(e.repeat)return;chargeBlocked=false;}
      if(!e.repeat&&!keys.has(k))pressed.add(k);keys.add(k);
    }
  });
  window.addEventListener('keyup',e=>{const k=e.key.toLowerCase();keys.delete(k);if(k==='k')chargeBlocked=false;});
  let soundtrackPreview=null;
  function stopSoundtrackPreview(){
    const player=soundtrackPreview;
    soundtrackPreview=null;
    if(player&&!player.paused)player.pause();
  }
  // Media play events do not bubble. Capture them to give the soundtrack and game one turn each.
  document.addEventListener('play',event=>{
    const player=event.target;
    if(!player?.matches?.('#soundtrack audio')||player.paused)return;
    if(player!==soundtrackPreview)stopSoundtrackPreview();
    soundtrackPreview=player;
    if(!state.paused){clearInput();state.paused=true;}
    syncMusic();
  },true);
  function releaseSoundtrackPreview(event){
    if(event.target===soundtrackPreview&&event.target.paused)soundtrackPreview=null;
  }
  document.addEventListener('pause',releaseSoundtrackPreview,true);
  document.addEventListener('ended',releaseSoundtrackPreview,true);
  function resumeGame(){
    stopSoundtrackPreview();
    const firstPlay=!started;
    cancelInputCharge();touch?.clear();if(gamepad)gamepad.invalidate();
    started=true;state.paused=false;state.map=false;focused=true;
    canvas.focus({preventScroll:true});canvas.closest('.game-shell').scrollIntoView({block:'center',behavior:'instant'});syncMusic();
    if(firstPlay){
      if(preferences.music&&!music?.enabled)applyAudioSetting('music',true);
      if(preferences.effects&&!audioEngine?.effectsEnabled)applyAudioSetting('effects',true);
    }
  }
  document.addEventListener('keydown',event=>{
    // Enter starts the title screen even before the canvas has received focus.
    if(started || !state.paused || event.defaultPrevented || event.repeat || event.key!=='Enter')return;
    if(event.target!==document.body && event.target!==document.documentElement)return;
    event.preventDefault();lastInput='keyboard';resumeGame();
  });
  canvas.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')lastInput='touch';if(!started||state.paused||state.map)resumeGame();});
  canvas.addEventListener('blur',e=>{clearInput();const toolbarTarget=e.relatedTarget instanceof HTMLElement && e.relatedTarget.closest('.game-shell') && e.relatedTarget.matches('button,input,select');if(focused&&!state.won&&!toolbarTarget)state.paused=true;syncMusic();});
  window.addEventListener('blur',()=>{if(started){state.paused=true;clearInput();syncMusic();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){state.paused=true;clearInput();syncMusic();}});
  document.getElementById('pause').onclick=()=>{if(state.paused)resumeGame();else {clearInput();state.paused=true;canvas.focus({preventScroll:true});syncMusic();}};
  document.getElementById('restart').onclick=()=>{state=C.createGame();loadedSave=false;if(weaponFX)weaponFX.clear();if(audioEngine)audioEngine.clear();recoil=landing=roomFade=shake=contactDistance=0;keys.clear();pressed.clear();saveProgress();resumeGame();};

  const fullButton=document.getElementById('fullscreen'),shell=canvas.closest('.game-shell');
  function fullLabel(){fullButton.textContent=document.fullscreenElement===shell||shell.classList.contains('expanded-player')?'Exit fullscreen':'Fullscreen';}
  function expandShell(enabled){shell.classList.toggle('expanded-player',enabled);document.body.classList.toggle('player-expanded',enabled);fullLabel();}
  fullButton.onclick=async()=>{
    if(shell.classList.contains('expanded-player'))expandShell(false);
    else if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});
    else if(shell.requestFullscreen){try{await shell.requestFullscreen();}catch(_){expandShell(true);}}
    else expandShell(true);
    fullLabel();canvas.focus({preventScroll:true});
  };
  document.addEventListener('fullscreenchange',fullLabel);

  const recoverButton=document.getElementById('touch-recover');
  if(recoverButton)recoverButton.onclick=()=>{if(!started)return;clearInput();pressed.add('r');canvas.focus({preventScroll:true});};
  const interior=room=>typeof C.isInterior==='function'?C.isInterior(room):room===6||room===7||room===10;
  const renderViewY=room=>interior(room)?0:Math.round(viewY*2)/2;
  const roomCount=C.ROOM_COUNT||C.NAMES.length;
  function sceneFor(s){
    if(s.won)return 'victory';
    if(s.room===1&&!s.flags.drained)return 'flood';
    if(s.room===0)return 'harbor';
    if(s.room===1)return 'dock';
    if((s.room===5&&!s.flags.boss)||(s.room===9&&!s.flags.depotClear)||(s.room===13&&!s.flags.wardenClear))return 'boss';
    if(interior(s.room))return 'interior';
    if(s.room>=26&&s.room<=28)return 'foundry';
    if(s.room>=20&&s.room<=25)return 'switchyard';
    return s.room>=14?'canopy':'explore';
  }
  function syncMusic(){
    const scene=sceneFor(state),paused=!!(state.paused||state.map||document.hidden);
    if(!paused&&soundtrackPreview)stopSoundtrackPreview();
    if(scene!==lastMusicScene){if(music)music.setScene(scene);lastMusicScene=scene;}
    if(music?.setAlert)music.setAlert(scene==='foundry'&&state.enemies.some(e=>e.kind==='bellback'&&(e.phase==='tell'||e.phase==='rush')));
    if(paused!==lastMusicPaused){if(music)music.setPaused(paused);if(audioEngine)audioEngine.setPaused(paused);lastMusicPaused=paused;}
  }
  const audioButtons={music:document.getElementById('music'),effects:document.getElementById('sound')};
  const audioLabels={music:'Music',effects:'Effects'};
  function showAudioSetting(kind,enabled){
    const button=audioButtons[kind];if(!button)return;
    button.textContent=audioLabels[kind]+(enabled?' on':' off');button.setAttribute('aria-pressed',String(enabled));
  }
  async function applyAudioSetting(kind,enabled){
    const button=audioButtons[kind];if(!button||button.disabled)return;
    button.disabled=true;
    try{
      syncMusic();
      if(kind==='music'){
        if(!music)throw new Error('Music unavailable');
        if(enabled){if(audioEngine)await audioEngine.ensureContext();await music.start(sceneFor(state));}else music.stop();
      }else{
        if(!audioEngine)throw new Error('Effects unavailable');
        if(enabled)await audioEngine.enableEffects();else audioEngine.setEffectsEnabled(false);
      }
      preferences[kind]=kind==='music'?music.enabled:audioEngine.effectsEnabled;
      showAudioSetting(kind,preferences[kind]);savePreferences();
    }catch(_){
      preferences[kind]=false;showAudioSetting(kind,false);button.textContent=audioLabels[kind]+' unavailable';
    }finally{button.disabled=false;syncMusic();}
  }
  for(const [kind,button] of Object.entries(audioButtons)){
    if(!button)continue;
    showAudioSetting(kind,preferences[kind]);
    button.onclick=()=>{canvas.focus({preventScroll:true});return applyAudioSetting(kind,!preferences[kind]);};
  }
  const volumeSlider=document.getElementById('music-volume');
  if(volumeSlider){
    volumeSlider.value=String(preferences.volume);if(music)music.setVolume(preferences.volume/100);
    volumeSlider.oninput=()=>{preferences.volume=Number(volumeSlider.value);if(music)music.setVolume(preferences.volume/100);};
    volumeSlider.onchange=()=>{savePreferences();canvas.focus({preventScroll:true});};
  }
  function backdrop(s){
    if(E){E.drawBackground(ctx,s,{cameraY:renderViewY(s.room)});return;}
    const colors=({0:['#101f2a','#142f39'],1:['#102b32','#173e43'],2:['#142a30','#234148'],3:['#171f30','#263449'],4:['#20232d','#343f47'],5:['#171e31','#26344c'],8:['#1e2629','#333c39'],9:['#25272b','#423c37']})[s.room]||['#101f2a','#142f39'];
    r(0,24,384,192,colors[0]);
    if(background.complete&&background.naturalWidth>0){ctx.save();ctx.globalAlpha=s.room===1||s.room===2?.32:s.room>=8?.1:.2;ctx.drawImage(background,0,24,384,176);ctx.restore();r(0,24,384,176,'#10243133');}
    for(let i=0;i<9;i++){const x=(i*59+s.room*21)%410-15,h=44+(i*37)%70;r(x,184-h,25,h,colors[1]);r(x+4,180-h,17,6,'#1b3c43');for(let j=0;j<3;j++)r(x+8,190-h+j*23,3,9,'#1a4148');}
    const pumpX=s.room===1?256:245;
    if(s.room===1||s.room===2){circle(pumpX,115,62,'#1b3a43');circle(pumpX,115,52,'#102a34');circle(pumpX,115,39,'#21444b');circle(pumpX,115,32,'#142d36');for(let i=0;i<8;i++){const angle=i*Math.PI/4+s.t*(s.flags.drained?.12:.015);line(pumpX,115,pumpX+Math.cos(angle)*50,115+Math.sin(angle)*50,'#28515a');}}
    r(0,134,384,4,'#1c3c43');for(let x=0;x<384;x+=32){r(x,123,2,15,'#294952');line(x,124,x+32,124,'#294952');}
    for(let i=0;i<7;i++){const x=(i*71+s.room*17)%384;r(x,30,5,42+(i*19)%28,'#294148');r(x+1,30,1,40+(i*19)%28,'#3d5654');const y=75+(i*19)%28;r(x-2,y,10,3,'#a36c46');}
    for(let i=0;i<4&&s.room<8;i++){const x=18+i*96,len=16+(i*17)%40;for(let y=28;y<len+28;y+=4){r(x+Math.sin(y)*2,y,2,4,'#2a4d45');if(y%8===4)r(x-2,y,3,2,'#406553');}}
    for(let x=0;x<384;x+=16){r(x,24,16,5+(x*7)%13,'#0c1923');}
    for(let i=0;i<8;i++){const x=(i*47+s.t*(i%2?2:-1)+s.room*19)%384,y=44+(i*31)%126+Math.sin(s.t*.8+i)*3;r(x,y,1,1,s.room>=8?'#75664d':'#416b62');}
    r(0,184,384,32,'#0b1820');
  }
  function tile(b,metal=false){
    if(E){E.drawSolid(ctx,b,state);return;}
    // Continuous pale material edges identify collision surfaces against the quiet background.
    r(b.x,b.y,b.w,b.h,metal?'#3b4d49':'#263e40');r(b.x,b.y,b.w,2,metal?'#b0b29a':'#87a18a');
    if(b.h>3)r(b.x,b.y+2,b.w,2,metal?'#68796a':'#47675b');
    r(b.x,b.y+Math.max(4,b.h-2),b.w,2,'#0c2029');
    for(let x=b.x+24;x<b.x+b.w-1;x+=32){r(x,b.y+5,1,Math.max(1,b.h-7),'#172c32');if(b.h>12)r(x-2,b.y+7,1,2,'#62786a');}
    if(metal&&b.h>30){r(b.x+2,b.y+4,2,b.h-8,'#759386');for(let y=b.y+8;y<b.y+b.h-5;y+=24){r(b.x+5,y,Math.min(7,b.w-6),3,'#b57c48');r(b.x+5,y+3,3,3,'#1c3135');}}
  }
  function rover(p,magnet,parked=false){
    if(S)S.drawRover(ctx,p,{time:state.t,magnet,parked,recoil:parked?0:recoil,landing:parked?0:landing,charge:parked?0:(state.charge||0)/(C.chargeTime?C.chargeTime(state):.6)*.6});
    else {r(p.x,p.y+5,p.w,11,palette.ochre);r(p.x+4,p.y+1,15,8,palette.teal);}
  }
  function pilot(p,vault){if(S)S.drawPilot(ctx,p,{time:state.t,vault,recoil});else r(p.x,p.y,p.w,p.h,palette.mint);}
  // The Bellback carries a cracked bronze bell as a carapace. Cache the inked
  // shell once; legs, listening vanes and head move independently underneath.
  let bellShell;
  function shellSprite(){
    if(bellShell)return bellShell;
    bellShell=document.createElement('canvas');bellShell.width=48;bellShell.height=32;
    const d=bellShell.getContext('2d');
    const paint=(x,y,w,h,color)=>{d.fillStyle=color;d.fillRect(x,y,w,h);};
    const bronze=['#302d38','#504044','#705044','#946046','#b5794f','#ce955f','#e3b47c','#f0d2a3'];
    // Scan lines follow the cast dome. Its stepped highlights and engraved rim are drawn at display resolution.
    for(let y=2;y<=24;y++){
      const section=Math.sqrt(Math.max(0,1-((24-y)/23)**2));
      const left=Math.round(23-21*section),right=Math.round(23+20*section);
      for(let x=left;x<=right;x++){
        const u=(x-left)/Math.max(1,right-left),crown=(24-y)/22;
        let tone=Math.round(2.8+2.35*Math.cos((u-.34)*Math.PI*1.65)+crown*.6);
        if(x===left||x===right)tone=x===left?3:0;
        if(y===22||y===23)tone-=1;
        paint(x,y,1,1,bronze[Math.max(0,Math.min(7,tone))]);
      }
    }
    paint(19,1,8,2,'#59473e');paint(20,1,5,1,'#e6c897');paint(22,0,3,1,'#9c8371');
    // Fluting catches a narrow edge light on either side of each duller rib.
    for(let y=5;y<21;y++){
      const v=(y-5)/16;
      for(const rib of [-1.15,-.55,.68,1.25]){
        const x=Math.round(23+rib*(6+8*Math.sqrt(v)));
        paint(x,y,1,1,rib<0?'#c39161':'#8d634f');paint(x+1,y,1,1,rib<0?'#d7a46f':'#ac7d57');
      }
    }
    for(const [x,y] of [[23,5],[22,6],[22,7],[21,8],[22,9],[22,10],[23,11],[22,12],[21,13],[21,14],[20,15],[20,16],[21,17],[21,18],[22,19],[22,20],[23,21],[23,22]]){
      paint(x,y,1,1,'#3f4e4d');paint(x+1,y,1,1,'#7a9781');
    }
    for(const [x,y,w,h,color] of [[2,23,42,2,'#66483b'],[1,24,44,2,'#a87551'],[2,24,29,1,'#e7bb81'],[0,26,46,2,'#674a42'],[2,28,42,1,'#a07b59'],[4,29,37,1,'#46383b'],[6,30,30,1,'#26353b']])paint(x,y,w,h,color);
    for(let x=5;x<42;x+=7){paint(x,26,2,1,'#b29365');paint(x+1,27,1,1,'#334e51');}
    return bellShell;
  }
  function bellback(e){
    const face=e.face<0?-1:1,tell=e.phase==='tell',rush=e.phase==='rush',stun=e.phase==='stun';
    const tick=Math.floor(state.t*(rush?17:4)),load=tell||stun?2:0;
    const swing=rush?1+(tick%2):0;
    ctx.save();ctx.translate(Math.round(e.x)+(face<0?e.w:0),Math.round(e.y));ctx.scale(face,e.h/24);
    if(rush){
      for(let i=0;i<3;i++)r(-4-i*3-(tick+i)%3,19+(i%2)*2,4-i,1,'#b49673');
    }
    for(let i=0;i<3;i++){
      const x=5+i*8,dx=rush?((tick+i)%3-1)*3:stun?-2:0;
      line(x,15,x-2,19+load,'#263037');line(x+1,15,x-1,19+load,'#809289');
      line(x-2,19+load,x+dx-3,22,'#bd9f7b');
      r(x+dx-4,22,5,2,'#26373a');r(x+dx-4,22,2,1,'#a9ae97');
    }
    r(6,12+load,20,6,'#222829');r(9,17+load,14,2,'#678079');
    ctx.drawImage(shellSprite(),1,1+load+(rush?tick%2:0),24,16);
    // A visor and tapered hammer snout point along the locked charge.
    const headX=stun?19:tell?21:23+swing,headY=rush?15:tell?14:12+load;
    r(headX-3,headY+2,11,7,'#232a30');r(headX-1,headY,6,7,'#80918b');
    r(headX,headY+1,5,4,'#437576');r(headX+3,headY+3,5,3,'#907956');
    r(headX+2,headY+1,3,2,stun?'#456567':tell?'#ffec9b':'#adfff0');
    r(headX+7,headY+3,3,1,'#e9c58d');r(headX+7,headY+6,2,1,'#ae9780');
    for(let i=0;i<3;i++)r(9+i*3,15+load+(rush?tick%2:0),1,2,stun?'#547670':'#8eb5a2');
    const vaneY=stun?12:tell?0:4+Math.floor(tick/2)%2;
    line(18,11+load,20,vaneY+1,'#b08e69');r(18,vaneY,3,2,'#7da097');
    line(20,12+load,24,vaneY+3,'#745741');line(21,10+load,25,vaneY+2,'#d9b481');
    r(23,vaneY+1,5,2,'#6a8c83');r(24,vaneY,3,2,tell?'#ffde86':'#a9c2aa');
    if(tell){
      const offset=Math.floor(e.phaseTime*9)%4;
      for(let i=0;i<2;i++){const x=28+i*4+offset;line(x,-2+i,x+2,0+i,'#ffd993');line(x+2,0+i,x,2+i,'#ffd993');}
    }
    if(stun){
      r(8+(tick%3)*3,-1,2,1,'#eed8a5');r(18-(tick%3)*2,-3,1,2,'#a8d4bd');
    }
    ctx.restore();
  }
  function enemy(e){
    if(e.kind==='bellback'){bellback(e);return;}
    if(e.kind==='skimmer'&&e.phase==='tell'){const x=(e.targetX||e.x)+e.w/2;for(let y=e.y+e.h+4;y<181;y+=8)r(x,y,1,3,'#a38058');r(x-6,181,13,1,palette.ochre);}
    if(S)S.drawEnemy(ctx,e,{time:state.t});else r(e.x,e.y,e.w,e.h,palette.pink);
    if(e.stunUntil>state.t)stunSparks(e,state.t);
    if(e.kind==='boss'&&e.relay)receiverLamp(e.x+e.w/2,e.y+4,e.fireTell,true);
  }

  function beacon(x, y, active) {
    const lamp = active ? '#a4ead3' : '#e1a76b';
    r(x-6,y+35,15,3,'#162328');r(x-4,y+33,12,2,'#737d73');
    r(x-1,y+6,6,27,'#23353e');r(x,y+7,2,26,'#879489');
    for(let v=12;v<32;v+=7)r(x,y+v,4,1,'#445457');
    r(x-6,y-5,17,13,'#14232c');r(x-4,y-6,13,1,'#aeb6a2');
    r(x-6,y-4,17,2,'#78847b');r(x-5,y+5,15,2,'#394c51');
    r(x-4,y-1,12,5,'#26444a');r(x-3,y,7,2,lamp);r(x+6,y,1,3,lamp);
    if(active) {
      const sweep = Math.floor(state.t*4)%9;
      r(x-3+sweep,y-1,2,2,'#e0f7d9');
    }
    text('BEACON',x-11,y-14,active?palette.mint:'#c6ab87',6);
  }
  function arrow(label,x,y,color=palette.mint){text(label,x,y,color,6);}
  function hatch(x,y,label){
    if(S)S.drawSignal(ctx,{x:x+7,y:y+14},state.t);else r(x+9,y+10,6,14,palette.mint);
    // Quiet corner marks identify an interaction without covering the source architecture.
    for(const [dx,dy] of [[2,5],[21,5],[2,22],[21,22]]){r(x+dx,y+dy,3,1,'#729691');}
    text(label,x-1,y-8,palette.mint,6);
  }
  function serviceHatch(b){
    const x=b.x,y=b.y,w=b.w,h=b.h;
    // A recessed watertight door: its handle, sill and work light belong to the usable opening.
    r(x,y+h-3,w,3,'#162a31');
    r(x+1,y+3,w-2,h-4,'#819089');r(x+4,y+1,w-8,3,'#657b78');
    r(x+3,y+5,w-6,h-7,'#192f35');r(x+5,y+7,w-10,h-11,'#355155');
    r(x+6,y+8,w-12,1,'#627977');r(x+5,y+h-7,w-10,2,'#243b41');
    r(x+7,y+3,w-14,2,'#a3d9c4');r(x+8,y+3,w-16,1,'#e2f3ce');
    r(x+7,y+10,3,5,'#18363e');r(x+7,y+10,3,1,'#769da0');
    r(x+w-9,y+12,4,2,'#daaa63');r(x+w-7,y+13,2,3,'#a37f53');
    for(const side of [2,w-4]){r(x+side,y+6,2,1,'#adbaab');r(x+side,y+h-5,2,1,'#536967');}
    r(x+2,y+h-2,w-4,1,'#9ca895');
    text('SERVICE [E]',x-1,y-8,palette.mint,6);
  }
  function receiverLamp(x,y,lit,awake){
    r(x-4,y-3,9,7,'#101b27');
    r(x-3,y-2,7,5,awake?'#477872':'#364950');
    r(x-2,y-1,5,3,lit?'#ffefad':awake?palette.mint:'#607075');
    if(lit){
      r(x-1,y-1,3,2,'#fffbea');
      r(x-7,y-1,2,2,palette.ochre);r(x+6,y-1,2,2,palette.ochre);
    }
  }
  function dockReceiver(s){
    const radio=C.DOCK_RECEIVER,grate=C.DOCK_GRATE,cabinet=C.DOCK_RECORDER;
    const online=s.flags.drained,answered=s.flags.dockAnswered;
    const first=s.receiver.dockFlash>0,second=s.receiver.grateFlash>0;
    // Both ends sit on the same conduit. Each illuminates only on its own reply.
    const wire=answered?'#66958c':'#465958';
    line(radio.x+6,radio.y+6,grate.x+3,radio.y+6,wire);
    line(grate.x+3,radio.y+6,grate.x+3,grate.y,wire);
    r(radio.x,radio.y,radio.w,radio.h,'#0d2028');
    r(radio.x+1,radio.y+1,radio.w-2,radio.h-2,'#586c69');
    receiverLamp(radio.x+6,radio.y+5,first,online);
    for(let i=0;i<3;i++)r(radio.x+3,radio.y+10+i*2,6,1,'#263d40');
    r(grate.x-2,grate.y-2,grate.w+4,grate.h+2,'#697e75');
    r(grate.x,grate.y,grate.w,grate.h,'#10282d');
    for(let y=grate.y+4;y<grate.y+grate.h;y+=4)r(grate.x,y,grate.w,1,answered?'#78988b':'#485e60');
    receiverLamp(grate.x+3,grate.y-3,second,answered);
    if(answered||s.flags.dockRecorder){
      r(cabinet.x,cabinet.y,cabinet.w,cabinet.h,'#293b40');
      r(cabinet.x+1,cabinet.y+1,cabinet.w-2,8,'#546e68');
      for(const offset of [4,10])circle(cabinet.x+offset,cabinet.y+5,2,s.flags.dockRecorder?'#687b75':'#edce89');
      if(s.mode==='pilot'&&s.p.x>grate.x+grate.w)
        text(s.flags.dockRecorder?'< EXIT':'TAPE [E]',cabinet.x-5,cabinet.y-9,palette.mint,6);
    }
  }
  function crownRelay(e){
    const relay=e.relay,cx=relay.x+relay.w/2,cy=relay.y+relay.h/2;
    const lamp=e.fireTell||e.relayOpen,wire=lamp?'#82b8a4':'#506d70';
    // The moving contact carries the Guardian's answering signal over the deck.
    r(136,relay.y-8,99,4,'#273e48');r(136,relay.y-8,99,1,'#74968b');
    for(let x=137;x<235;x+=12)r(x,relay.y-7,2,2,'#8b9274');
    line(235,relay.y-7,e.x+e.w/2,relay.y-7,wire);
    line(e.x+e.w/2,relay.y-7,e.x+e.w/2,e.y+4,wire);
    r(cx-4,relay.y-6,8,7,wire);
    r(relay.x-1,relay.y+1,relay.w+2,relay.h-2,'#0b1925');
    r(relay.x+1,relay.y-1,relay.w-2,relay.h+2,'#0b1925');
    r(relay.x,relay.y+1,relay.w,relay.h-2,'#3f5658');
    r(relay.x+2,relay.y,relay.w-4,2,'#87988c');
    if(e.relayOpen){
      r(relay.x+3,relay.y+2,relay.w-6,relay.h-4,'#173a42');
      const bright=Math.floor(e.t*8)%2?'#e6fff1':'#b6f6df';
      for(let i=-2;i<=2;i++){
        const height=10-Math.abs(i)*2;
        r(cx+3*i-1,cy-height/2,2,height,i%2?palette.mint:bright);
      }
      for(const side of [-1,1]){
        const edge=cx+side*(relay.w/2+2);
        r(edge-2,relay.y+1,4,relay.h-2,'#8b6f4b');
        r(edge-1,relay.y+2,1,relay.h-5,'#ebc085');
      }
    }else{
      for(const side of [-1,1]){
        const x=cx+side*9-3;
        r(x,relay.y+2,6,relay.h-4,'#78877b');
        for(let y=relay.y+4;y<relay.y+relay.h-3;y+=4)r(x+1,y,4,1,'#455b58');
      }
      receiverLamp(cx,cy,e.fireTell,true);
    }
    if(e.returnTell){
      for(let x=8;x<78;x+=11){
        r(x,105,5,1,palette.ochre);r(x+3,104,1,3,palette.ochre);
      }
    }
    if(e.sweep){
      const b=e.sweep,high=!!b.high,dir=high?1:-1;
      const leading=dir>0?b.x+b.w-2:b.x+1;
      const color=high?'#a0e6ec':'#f7b564';
      r(b.x,b.y,b.w,b.h,'#723e55');r(b.x+2,b.y+2,b.w-4,b.h-4,color);
      r(leading,b.y+1,2,b.h-2,'#fff3c8');
      for(let i=0;i<3;i++){
        const y=b.y+3+i*(b.h-6)/3;
        r(dir>0?b.x-6-i:b.x+b.w,y,6+i,1,color);
      }
    }
  }
  function stunSparks(actor,time){
    const x=actor.x+actor.w/2,y=actor.y-4;
    const offset=Math.floor(time*8)%2;
    for(const sign of [-1,1]){
      const px=x+sign*(actor.w/2+2+offset);
      line(px,y,px+sign*2,y+2,'#e5f9ae');
      line(px+sign*2,y+2,px,y+4,'#9bf1e4');
    }
  }
  function approachPuddle(s){
    const {left,right,warning}=C.APPROACH_PUDDLE,y=C.FLOOR;
    // The ribbed drain remains on the return trip after the water has receded.
    r(left-2,y, right-left+4,5,'#1d363d');
    for(let x=left+3;x<right-1;x+=8)r(x,y+1,2,3,'#738279');
    if(s.flags.drained)return;

    // This shallow pool is conductive only inside these two grated ends.
    // Reflections stay inside that same interval as the electrical warning.
    ctx.save();
    ctx.beginPath();ctx.rect(left,y-5,right-left,12);ctx.clip();
    r(left,y-3,right-left,8,'#123b49');
    r(left,y+2,right-left,4,'#185364');
    for(let i=0;i<13;i++){
      const x=left+(i*19)%(right-left),level=y+1+(i%3);
      const sway=Math.round(Math.sin(s.t*1.9+i)*2);
      r(x+sway,level,3+(i%5),1,i%4===0?'#bc946a':'#518d92');
    }
    for(let x=left;x<right;x+=13){
      const crest=y-3+Math.round(Math.sin(s.t*2.2+x*.065));
      r(x,crest,13,1,'#8ecac4');
      r(x+2,crest+1,5,1,'#407b87');
    }
    ctx.restore();
    for(const lip of [left-2,right]) {
      r(lip,y-3,2,7,'#172c31');r(lip,y-3,2,1,'#b3ad8b');
    }
    if(!s.puddle)return;
    const pool=s.puddle;
    if(pool.age<warning){
      const spread=pool.age/warning*Math.max(pool.x-left,right-pool.x);
      const edgeL=Math.max(left,pool.x-spread),edgeR=Math.min(right,pool.x+spread);
      r(edgeL,y-2,Math.max(1,edgeR-edgeL),1,'#b3eee0');
      for(const edge of [edgeL,edgeR]){r(edge-1,y-5,3,4,'#d4f0bd');r(edge,y-7,1,2,'#f4e4a1');}
    }else{
      for(let x=left;x<right;x+=8){
        const peak=y-3-(Math.floor((x-left)/8)%3)*2;
        line(x,y-1,x+3,peak,'#eaf8b9');line(x+3,peak,x+7,y-1,'#9ce9dc');
      }
    }
  }
  // Railway equipment uses the same amber tally lamp in the booth and out on the line.
  function dispatchDoor(b,label,open){
    const x=b.x,y=b.y,w=b.w,h=b.h;
    r(x+1,y,w-2,h,'#15262c');r(x,y+3,3,h-3,'#61685f');r(x+w-3,y+3,3,h-3,'#808172');
    r(x+2,y+1,w-4,3,'#99917a');r(x+4,y+4,w-8,h-4,open?'#24383c':'#48464a');
    for(let i=8;i<h-3;i+=5)r(x+5,y+i,w-10,1,open?'#465454':'#826f59');
    r(x+4,y-4,10,4,'#272d30');r(x+5,y-3,8,2,open?'#87d6c2':'#db9b62');
    text(label,x-3,y-13,open?palette.mint:palette.ochre,6);
  }
  function radioBox(x,y,lit,raised=false){
    const tipY=y-(raised?18:8);
    line(x+3,y-2,x,tipY,'#b4c6bd');r(x-1,tipY-1,3,2,lit?'#fff1b2':'#ceb485');
    r(x-5,y-3,11,7,'#101d28');r(x-4,y-2,9,4,'#a08866');
    r(x-2,y-2,5,4,'#334a4b');r(x-1,y-1,3,2,lit?'#fff1b2':'#9ab9a6');
    r(x-4,y+3,2,1,'#788981');r(x+3,y+3,2,1,'#788981');
  }
  function repeaterDevice(s){
    const device=s.repeater;
    if(!device)return;
    const x=device.x,y=device.y;
    radioBox(x,y,device.flash>0,true);
    if(device.flash>0){
      const spread=8+Math.round(7*(1-Math.min(1,device.flash/.16)));
      for(const side of [-1,1]){
        line(x+side*(spread-2),y-22,x+side*spread,y-20,'#f0d286');
        r(x+side*spread,y-19,1,4,'#f0d286');
        line(x+side*spread,y-15,x+side*(spread-2),y-13,'#f0d286');
      }
    }
  }
  function dispatchBooth(s){
    interiorFloor(s);
    // Flush floor cable leads from the doorway to the physical radio cradle.
    const b=C.YARD.rack,cx=b.x+b.w/2,wire='#817657';
    line(40,183,cx,183,wire);line(cx,183,cx,b.y+b.h,wire);
    const blocks=C.solids(s);
    for(const wall of blocks){
      tile(wall,!!wall.metal);
      if(wall.y<=24||wall.x<=0||wall.x>=368||wall.y>=200)continue;
      const x=wall.x,y=wall.y,w=wall.w,h=wall.h;
      r(x+1,y+1,w-2,2,'#b5a68a');r(x+2,y+3,w-4,h-5,'#5a645f');
      for(let j=3;j<w-13;j+=17){
        r(x+j,y+5,14,h-9,'#374a4d');r(x+j+2,y+7,10,2,'#726f60');
        r(x+j+3,y+7,5,1,'#bdac83');r(x+j+8,y+h-8,4,1,'#1c333c');
        r(x+j+2,y+h-6,3,1,'#738176');
      }
    }
    // Recess the line instruments into the north wall above the passable floor.
    r(17,26,350,25,'#111f28');
    if(E&&E.version>=17){
      ctx.save();ctx.beginPath();ctx.rect(20,28,344,20);ctx.clip();
      ctx.translate(0,12);ctx.scale(1,.38);E.drawBackground(ctx,s,{cameraY:0});ctx.restore();
    }
    for(let x=20;x<=365;x+=43){r(x,27,2,22,'#5e6a66');r(x+2,27,1,22,'#26383e');}
    r(17,48,350,3,'#968b75');r(18,51,348,1,'#415152');
    r(b.x-3,b.y-2,b.w+6,b.h+3,'#202d30');r(b.x-1,b.y,b.w+2,b.h,'#8b806b');
    r(b.x+2,b.y+3,b.w-4,b.h-6,'#293b40');
    r(b.x+5,b.y+b.h-6,b.w-10,2,'#b69b69');
    if(!s.flags.repeater)radioBox(cx,b.y+b.h/2-3,true);
    text(s.flags.repeater?'CRADLE EMPTY':'REPEATER [E]',b.x-13,b.y-11,s.flags.repeater?'#acb6a6':palette.ochre,6);
    interiorDoor(C.DOOR,'THROAT [E]',true);
  }
  function kilnEquipment(s){
    const a=C.YARD.emitter,c=C.YARD.coupler,arc=s.arc;
    const x=a.x,y=a.y;
    const aiming=arc&&arc.phase==='tell';
    const tx=arc&&Number.isFinite(arc.targetX)?arc.targetX:c.x+c.w+13;
    const ty=arc&&Number.isFinite(arc.targetY)?arc.targetY:C.FLOOR-8;
    const angle=Math.atan2(ty-y,tx-x),vx=Math.cos(angle),vy=Math.sin(angle);
    const broken=s.flags.yardCoupler;
    // Segmented ceramic insulators, with their arm fixed to the bolt origin.
    line(x,y-18,x,y,'#617477');r(x-7,y-20,14,3,'#747c74');
    for(let i=0;i<3;i++)r(x-5+i,y-15+i*4,11-2*i,2,'#c6b69a');
    const bx=x-7*vx,by=y-7*vy;
    circle(bx,by,6,'#192c35');circle(bx,by,4,'#766c5e');
    line(bx,by,x,y,aiming?'#ffe1a6':'#b59570');
    r(x-2,y-1,4,3,broken?'#536665':aiming?'#ffeac1':'#c38760');
    if(aiming&&!broken){
      // The reticle contracts when the clamp commits to a direction.
      const spread=arc.locked?4:8,ink=arc.lured?'#b0f0dc':'#ffd5a3';
      ctx.save();ctx.setLineDash(arc.locked?[4,3]:[2,5]);ctx.lineDashOffset=-Math.floor(s.t*13)%7;
      line(x+2*vx,y+2*vy,tx,ty,arc.lured?'#75c8b9':'#d49269');ctx.restore();
      for(const side of [-1,1]){
        line(tx+side*spread,ty-3,tx+side*spread,ty+3,ink);
        line(tx+side*spread,ty-3,tx+side*(spread-2),ty-(arc.lured?5:3),ink);
        line(tx+side*spread,ty+3,tx+side*(spread-2),ty+(arc.lured?5:3),ink);
      }
    }
    for(const shot of s.shots){
      if(!shot.arc)continue;
      const sx=shot.x+shot.w/2,sy=shot.y+shot.h/2;
      const speed=Math.hypot(shot.vx,shot.vy),ux=shot.vx/speed,uy=shot.vy/speed;
      const length=Math.min(15,Math.hypot(sx-x,sy-y));
      line(sx,sy,sx-ux*length,sy-uy*length,shot.lured?'#76d5c7':'#f9b86e');
      line(sx,sy+1,sx-ux*length*.6,sy-uy*length*.6+1,'#fff1b6');
    }
    // The built-in test bay is floor paint. Its silhouette matches the portable receiver.
    const bayX=c.x+c.w+12;
    for(let i=0;i<3;i++)r(bayX-12+i*9,C.FLOOR-2,5,1,'#bda570');
    r(c.x-2,c.y-2,c.w+4,c.h+4,'#273439');
    r(c.x,c.y,c.w,3,'#a18d6c');r(c.x,c.y+c.h-3,c.w,3,'#a18d6c');
    const mid=c.x+c.w/2;
    if(!broken){
      r(mid-3,c.y+3,6,c.h-6,'#a7bac0');r(mid-1,c.y+4,2,c.h-8,'#fae19b');
      for(let i=0;i<3;i++)r(mid-4,c.y+5+3*i,8,1,'#b77d49');
    }else{
      line(mid-1,c.y+3,mid+2,c.y+6,'#cdc79c');
      line(mid+2,c.y+c.h-4,mid-2,c.y+c.h-8,'#685958');
    }
    line(c.x+c.w,c.y+1,344,c.y+1,broken?'#699b8f':'#756454');
    receiverLamp(344,c.y,broken,broken);
  }
  function switchyard(s){
    const yard=C.YARD;
    if(s.room===20){
      beacon(42,146,s.checkpoint===20);
      dispatchDoor(yard.hatch,'DISPATCH [E]',true);
      arrow('< DRAIN',6,170);arrow('VIADUCT >',322,170);
    }else if(s.room===22){
      arrow('< THROAT',6,171);arrow('KILN >',339,171);
    }else if(s.room===23){
      kilnEquipment(s);
    }else if(s.room===24){
      beacon(42,146,s.checkpoint===24);
      for(const x of [yard.gap.x-5,yard.gap.x+yard.gap.w+3]){
        r(x,172,2,12,'#6d7167');r(x-1,171,4,2,'#dcc080');
      }
    }else if(s.room===25){
      const b=yard.exchange,live=s.flags.yardPower;
      r(b.x,b.y,b.w,b.h,'#25353b');r(b.x+2,b.y+2,b.w-4,b.h-3,'#63706b');
      r(b.x+4,b.y+4,b.w-8,8,'#263d40');
      receiverLamp(b.x+b.w/2,b.y+8,false,live);
      const pivotX=b.x+b.w/2,pivotY=b.y+b.h-7,endX=pivotX+(live?6:-6);
      line(pivotX,pivotY,endX,pivotY-6,'#cdbf93');r(endX-2,pivotY-7,5,3,live?palette.mint:palette.ochre);
      text(live?'LINE LIVE':'POWER [E]',b.x-5,b.y-10,live?palette.mint:palette.ochre,6);
      if(live)arrow('RISE >',340,170);
    }
  }
  function listeningDoor(b,label,open){
    const cx=b.x+b.w/2,y=b.y;
    r(b.x,y+3,b.w,b.h-3,'#283236');r(b.x+3,y,b.w-6,b.h,'#766451');
    r(b.x+4,y+4,b.w-8,b.h-4,'#16262a');
    for(let i=0;i<3;i++){
      r(b.x+1+i*2,y+5-i*2,2,b.h-5+i*2,['#8f795d','#a28563','#766650'][i]);
      r(b.x+b.w-3-i*2,y+5-i*2,2,b.h-5+i*2,['#5b564c','#81735c','#615747'][i]);
    }
    r(cx-5,y+1,10,3,'#413d37');r(cx-1,y-3,3,5,open?'#92d2bb':'#817461');
    for(let x=b.x+7;x<b.x+b.w-6;x+=3)r(x,y+9,1,open?4:b.h-10,'#4e5c58');
    r(b.x+3,y+b.h-2,b.w-6,2,'#91816a');text(label,b.x-6,y-11,open?'#b5e4cf':'#b49e7f',6);
  }
  function foundryGong(s){
    const b=C.SOUNDING.bell,ring=Math.max(0,s.bellFlash||0),cx=Math.round(b.x+b.w/2),cy=Math.round(b.y+b.h/2);
    const sway=Math.round(3*ring*Math.sin((1.25-ring)*21));
    for(const side of [-1,1]){
      const post=cx+side*13;
      r(post-1,cy-19,3,C.FLOOR-cy+19,'#4c595a');r(post-1,cy-18,1,C.FLOOR-cy+18,'#9a856c');
      line(post,cy-19,cx+side*3+sway,cy-8,'#948c74');r(post-3,C.FLOOR-2,6,2,'#697472');
    }
    r(cx-15,cy-20,31,3,'#69533f');r(cx-14,cy-20,29,1,'#c3a177');
    const nearGong=Math.abs(s.p.x+s.p.w/2-cx)<49;
    text(nearGong?'RING [E]':'GONG',cx-(nearGong?14:8),cy-29,'#eed6a0',6);
    ctx.save();ctx.translate(cx+sway,cy);
    const widths=[3,5,6,7,7,8,8,8,8,8,7,7,6,5,3];
    widths.forEach((w,i)=>{
      const y=i-7;r(-w,y,2*w+1,1,'#453630');r(-w+1,y,2*w-1,1,i<7?'#bb8854':'#97623f');
      if(w>4){r(-w+1,y,2,1,i<8?'#e4b779':'#d49a5c');r(w-3,y,2,1,'#80573e');}
    });
    circle(0,0,5,'#68534b');circle(0,-1,4,'#bb895c');circle(-1,-1,2,ring>0?'#f8dfa2':'#deb27b');
    if(ring>0){
      const radius=11+Math.round((1.25-ring)*16)%16;
      for(const side of [-1,1]){
        line(side*(radius-2),-5,side*radius,-2,'#c7c5a1');r(side*radius,-2,1,5,'#e1c89c');
        line(side*radius,2,side*(radius-2),5,'#c7c5a1');
      }
    }
    ctx.restore();
  }
  function foundryWall(s){
    const b=C.SOUNDING.wall;
    if(s.flags.bellWall){
      for(const [dx,w,h] of [[0,6,3],[9,7,5],[19,4,2],[-5,3,2]]){r(b.x+dx,C.FLOOR-h,w,h,'#756961');r(b.x+dx+1,C.FLOOR-h,w-2,1,'#ab9582');}
      return;
    }
    // Hairline fractures cross a single casting; the two dark hoops keep the
    // broken material distinct from the striped climbable steel elsewhere.
    r(b.x+1,b.y+1,b.w-2,b.h-2,'#6c6159');r(b.x+2,b.y+1,3,b.h-2,'#8b7967');
    r(b.x+b.w-4,b.y+2,2,b.h-2,'#4d4946');
    for(let i=0;i<49;i++){
      const px=b.x+3+(i*11)%14,py=b.y+2+(i*19)%94;
      r(px,py,1+i%2,1,i%3===0?'#9c8874':'#574f4b');
    }
    const gap=[3,10,7,13,8,14,10,9];
    for(let i=0;i<gap.length-1;i++){
      const x=b.x+gap[i],y=b.y+7+12*i,x2=b.x+gap[i+1],y2=y+12;
      line(x-1,y,x2-1,y2,'#c7a988');line(x,y,x2,y2,'#2f3233');line(x+1,y,x2+1,y2,'#342f2f');
      if(i===2||i===5){line(x,y+1,b.x+b.w-3,y-5,'#312c2b');line(x,y+2,b.x+b.w-4,y-4,'#af8870');}
    }
    for(const yy of [b.y+4,C.FLOOR-10]){
      r(b.x-2,yy,b.w+4,3,'#655951');r(b.x-1,yy,b.w+2,1,'#bba181');
      r(b.x+2,yy+1,2,2,'#433c3a');r(b.x+b.w-4,yy+1,2,2,'#433c3a');
    }
  }
  function lensStand(s){
    const b=C.SOUNDING.lens,cx=b.x+b.w/2,y=b.y;
    r(cx-11,y+30,22,5,'#3e4c50');r(cx-9,y+29,18,2,'#b08e65');
    r(cx-4,y+18,8,11,'#425454');r(cx-2,y+18,2,11,'#859789');
    for(const side of [-1,1]){
      line(cx+side*2,y+22,cx+side*10,y+15,'#bc9870');line(cx+side*10,y+15,cx+side*10,y+8,'#716455');
      r(cx+side*10-1,y+7,3,4,'#bba77e');
    }
    if(!s.flags.echoLens){
      const cy=y+11+Math.round(Math.sin(s.t*3));
      for(const [dy,w,ink] of [[-6,2,'#ddefcc'],[-5,5,'#91d2bd'],[-3,7,'#8dd0bb'],[-1,8,'#527e82'],[1,8,'#578f94'],[3,6,'#537777'],[5,3,'#baab81']]){
        r(cx-w,cy+dy,w*2,2,ink);
      }
      r(cx-4,cy-4,3,3,'#e9ffe4');r(cx+3,cy-1,2,2,'#afd7c2');
      text('ECHO LENS [E]',b.x-9,y-7,'#ccead0',6);
    }
  }
  function soundingRooms(s){
    if(s.room===26){
      const b=C.SOUNDING.track;
      for(const x of [b.x,b.x+b.w-2]){
        r(x,b.y-9,2,9,'#766558');r(x-1,b.y-10,4,3,'#c5a97c');r(x-1,b.y-9,1,2,'#6d665e');
      }
      arrow('< DOCK',6,171);arrow('FOUNDRY >',331,171);
    }else if(s.room===27){
      foundryGong(s);foundryWall(s);
      if(s.flags.bellWall)arrow('WELL >',345,170);
    }else if(s.room===28){
      lensStand(s);listeningDoor(C.SOUNDING.lift,s.flags.echoLens?'DOCK LIFT [E]':'DOCK LIFT',s.flags.echoLens);
    }
  }
  function echoSurvey(s){
    if(!s.flags.echoLens)return;
    const opening=7+Math.round((1+Math.sin(s.t*3))*2);
    for(const {x,y,kind} of C.echoTargets(s)){
      const d=opening,ink=kind==='cache'?'#f4c97e':'#a6dfcb';
      if(kind==='cache'){
        for(const side of [-1,1]){line(x+side*d,y,x+side*(d-3),y-3,ink);line(x+side*d,y,x+side*(d-3),y+3,ink);}
      }else{
        for(const side of [-1,1]){r(x+side*d,y-d,1,5,ink);r(x+side*d-(side>0?3:0),y-d,4,1,ink);r(x+side*d,y+d-2,1,3,ink);}
      }
    }
  }
  function sideScene(s,blocks){
    backdrop(s);for(const b of blocks)tile(b,!!b.metal);
    if(s.room===0){
      // The backdrop supplies architecture; only real navigation markers are added.
      beacon(37,146,s.checkpoint===0);r(228,184,48,17,'#07121c');line(228,184,240,196,'#42606a');line(276,184,264,196,'#42606a');
      text('LOWER WORKS',225,152,palette.ochre,6);text('v  DROP  v',228,162,palette.ochre,6);
      text(s.flags.magnet?'HOLD UP TO CLIMB':'MAGNETIC WHEELS REQUIRED',s.flags.magnet?250:222,40,s.flags.magnet?palette.mint:'#c39057',6);
      arrow('UPPER ROUTE >',325,29);
      if(s.flags.drained){arrow('< RETURN CHANNEL',279,188);if(s.p.climbing)text('JUMP TO KICK',267,80,palette.mint,6);}
      dockReceiver(s);
      listeningDoor(C.SOUNDING.entry,'LISTENING CUT [E]',true);
    }
    if(s.room===1){
      approachPuddle(s);
      serviceHatch(C.HATCH);beacon(106,146,s.checkpoint===1);
      if(!s.flags.drained){text('PUMP GATE',307,93,'#ffd19b',6);}else{arrow('DRAIN CHANNEL >',280,171);text('PUMPS ONLINE',226,156,palette.mint,6);}
    }
    if(s.room===2){
      // Dry return route; the original backdrop supplies its machinery detail.
      arrow('RETURN TO DOCK >',271,174);arrow('< APPROACH',5,158);text('OPTIONAL: JUMP + UP',228,32,palette.ochre,6);
      const gate=C.DEPOT_GATE||{x:110,y:158,w:28,h:26};
      hatch(gate.x,gate.y,'DEPOT [E]');
      const trackOpen=s.flags.drained&&s.flags.magnet;
      dispatchDoor(C.YARD.entry,trackOpen?'YARD [E]':'FLOODED',trackOpen);
      if(!s.flags.chassis){const item=C.CHASSIS||{x:300,y:48,w:12,h:12};r(item.x,item.y,item.w,item.h,'#694e38');r(item.x+2,item.y+2,item.w-4,item.h-4,palette.ochre);r(item.x+5,item.y+3,2,6,palette.white);r(item.x+3,item.y+5,6,2,palette.white);}
      else text('CHASSIS FITTED',267,48,palette.mint,6);
      if(!s.flags.drainCache){
        const b=C.DRAIN_CACHE;
        r(b.x,b.y+3,b.w,b.h-3,'#2b383b');r(b.x+1,b.y+4,b.w-2,3,palette.ochre);
        r(b.x+4,b.y+7,4,3,palette.white);
        if(s.p.climbing&&s.p.wallSide===1)text('< KICK [SPACE]',157,89,palette.ochre,6);
      }
    }
    if(s.room===3){
      if (!s.p.climbing && s.p.x>145 && s.p.x<245) text('HOLD UP TO CLIMB',156,106,palette.ochre,6);
      arrow('< BACK TO DOCK',8,170);arrow('UPPER GANTRY >',313,91);
      dispatchDoor(C.YARD.returnGate,s.flags.yardPower?'EXCHANGE [E]':'LINE OFF',s.flags.yardPower);
    }
    if(s.room===4){
      beacon(318,62,s.checkpoint===4);arrow('RELAY CROWN >',315,39);text('UP + RIGHT',149,115,palette.mint,6);
      if(C.CANOPY_GATE)hatch(C.CANOPY_GATE.x,C.CANOPY_GATE.y,'CANOPY [E]');
    }
    if(s.room===5){
      if(s.flags.boss)text('SIGNAL RESTORED',255,91,palette.mint,6);
      const guardian=s.enemies.find(e=>e.kind==='boss');
      if(guardian&&guardian.relay)crownRelay(guardian);
    }
    if(s.room===8){
      // The optional industrial branch uses the source backdrop and actual terrain.
      text('CONVEYOR GALLERY',124,35,'#b29b6a',7);arrow('< DRAIN CHANNEL',8,169,palette.ochre);arrow('RUSTLUNG DEPOT >',281,169,palette.ochre);
      const gate=C.MOSS_GATE||{x:86,y:158,w:26,h:26};
      hatch(gate.x,gate.y,'MOSSWORKS [E]');
    }
    if(s.room===9){
      text('RUSTLUNG / SLAG PRESS',120,35,'#c49a66',7);arrow('< CONVEYORS',7,170,palette.ochre);
      const b=C.DEPOT_HATCH||{x:318,y:160,w:24,h:24};hatch(b.x,b.y,s.flags.depotClear?'COILS [E]':'PRESS LOCK');
      for(const x of [9,372]){
        r(x,150,3,34,'#3e4848');
        for(let y=152;y<182;y+=7)r(x,y,3,3,'#d5a361');
      }
      if(s.flags.depotClear)text('PRESS DISABLED',147,57,palette.mint,6);
    }
    if(s.room===11){
      beacon(44,146,s.checkpoint===11);text('MOSSWORKS BYPASS',173,45,'#b4cfa3',7);
      text('CLIMB THE STEEL FACE',164,88,'#c9d7b2',6);for(let y=126;y<177;y+=16)text('^',134,y,'#a4d1b1',8);
      arrow('< CONVEYORS',6,175,'#b4cfa3');arrow('CONDENSER >',302,101,'#b4cfa3');
      if(C.CANOPY_MOSS_GATE)hatch(C.CANOPY_MOSS_GATE.x,C.CANOPY_MOSS_GATE.y,s.flags.canopyRelay?'CANOPY [E]':'RELAY LOCK');
    }
    if(s.room===12){
      text('CONDENSER BRIDGE',140,37,'#b5d9e7',7);arrow('< MOSSWORKS',6,172);arrow('COOLANT HEART >',287,172);
      // End markers flank the physical gap. No cosmetic beam crosses the missing floor.
      for(const x of[157,238]){r(x,169,4,15,'#566b79');r(x-1,168,6,2,'#ddb973');}
      text('JUMP THE BREAK',166,159,'#ddca9e',6);
    }
    if(s.room===13){
      text('COOLANT HEART',148,37,'#b5d9e7',7);arrow('< CONDENSER',7,172);
      const b=C.COOLING_CONSOLE||{x:326,y:154,w:22,h:30};
      hatch(b.x,b.y,s.flags.cooling?'COOLING ONLINE':s.flags.wardenClear?'COOLING [E]':'WARDEN LOCK');
    }
    if(s.room>=14&&s.room<=19){
      if(s.room===14){beacon(44,146,s.checkpoint===14);arrow('< GANTRY',6,169);arrow('LANTERN >',313,169);}
      if(s.room===15){arrow('< CANOPY',6,169);arrow('BRAMBLE >',309,169);}
      if(s.room===16){arrow('< LANTERN',6,169);arrow('GLASSROOT >',297,91);}
      if(s.room===17){beacon(44,146,s.checkpoint===17);text('JUMP THE BREAK',155,159,palette.ochre,6);arrow('< BRAMBLE',6,169);arrow('THORNWATCH >',292,169);}
      if(s.room===18){arrow('< GLASSROOT',6,169);arrow('ORCHARD >',310,169);}
      if(s.room===19){const b=C.CANOPY_RELAY;hatch(b.x,b.y,s.flags.canopyRelay?'RELAY ONLINE':'RESTORE [E]');arrow('< THORNWATCH',6,169);arrow(s.flags.canopyRelay?'MOSSWORKS >':'RESTORE RELAY',294,128);}
    }
    if(s.room>=20&&s.room<=25)switchyard(s);
    if(s.room>=26)soundingRooms(s);
  }
  const interiorFloors = new Map();
  const deckPalettes = {
    6: ['#243940','#31494d','#3b5354','#182d34','#6f795f'],
    7: ['#2a4148','#38545c','#496267','#20353e','#748e86'],
    10:['#343542','#414451','#51515c','#262937','#8c7865'],
    21:['#313e41','#3c4a4c','#515c58','#233237','#8c7f66']
  };
  function paintCablePanel(d){
    const fill=(x,y,w,h,c)=>{d.fillStyle=c;d.fillRect(x,y,w,h);};
    // Insulated bundles disappear into floor glands. Each has a shadow, jacket and tracer.
    for(let i=0;i<4;i++){
      const x=66+i*13,end=68+i*14;
      for(const [offset,width,color] of [[1.5,3,'#17292e'],[0,2.5,'#283a3a'],[-.5,.6,i%2?'#967b63':'#648583']]){
        d.strokeStyle=color;d.lineWidth=width;d.beginPath();d.moveTo(x+offset,62);
        d.bezierCurveTo(x+offset,74,x-6+offset,77,x-5+offset,84);
        d.bezierCurveTo(x-4+offset,92,end+offset,88,end+offset,100+i%2*4);d.stroke();
      }
      const y=99+i%2*4;fill(end-3,y,6,3,'#1b2c32');fill(end-2,y,4,1,'#798582');fill(end-1,y+2,2,2,'#576967');
    }
    fill(55,54,73,9,'#192831');fill(57,52,69,8,'#756c59');fill(58,52,67,1,'#ab9880');
    for(let x=61;x<121;x+=11){
      fill(x,53.5,8,4.5,'#47545a');fill(x,54,7,.5,'#99a09a');fill(x+1,57,6,1,'#283c43');
    }
    for(const x of [56,85,123]){fill(x,52,3,9,'#445157');fill(x,52,1,7,'#a7a38f');}
    for(const x of [66,79,92,105]){fill(x-2,59,4,4,'#344650');fill(x-1.5,59,3,1,'#ac946f');}
    fill(105,49,14,14,'#192932');fill(105,48,13,13,'#7b796c');
    fill(106,49,11,11,'#495b5c');fill(107,50,9,.5,'#aea58a');
    for(let y=52;y<58;y+=1.5)fill(108,y,6,.5,'#263e45');
    fill(115,57,1,1,'#daaa72');
  }
  function paintPumpWindow(d,drained){
    const fill=(x,y,w,h,c)=>{d.fillStyle=c;d.fillRect(x,y,w,h);};
    const disk=(x,y,r,c)=>{d.fillStyle=c;d.beginPath();d.arc(x,y,r,0,Math.PI*2);d.fill();};
    const x=58,y=52,w=186,h=68;
    fill(x+2,y+2,w,h,'#172c34');fill(x,y,w,h,'#687875');fill(x+1,y+1,w-2,1,'#a3a994');
    fill(x+3,y+3,w-6,h-6,'#223742');
    d.save();d.beginPath();d.rect(64,57,174,57);d.clip();
    const shaft=d.createLinearGradient(0,57,0,114);
    shaft.addColorStop(0,'#152a33');shaft.addColorStop(.64,'#385259');shaft.addColorStop(1,'#233a42');fill(64,57,174,57,shaft);
    // The pump casing sits beyond the glass, behind the waterline and steel mullions.
    for(const px of [78,201,219]){
      fill(px-2,57,5,58,'#1f333e');fill(px-1,57,1,58,'#556c6e');
      for(let py=60;py<113;py+=16){fill(px-3,py,7,2,'#344c54');fill(px-3,py,7,.5,'#70817b');}
    }
    fill(128,78,47,8,'#243941');fill(128,78,47,1,'#667774');
    disk(144,83,22,'#172f39');disk(144,82,21,'#7a7d6c');disk(144,82,19,'#3d5d63');disk(144,82,16,'#173641');
    for(let i=0;i<8;i++){
      d.save();d.translate(144,82);d.rotate(i*Math.PI/4);
      d.fillStyle='#587575';d.beginPath();d.moveTo(3,-1);d.quadraticCurveTo(6,-6,12,-8);
      d.lineTo(14,-4);d.quadraticCurveTo(9,-4,4,1);d.closePath();d.fill();d.restore();
      const a=i*Math.PI/4;disk(144+18.5*Math.cos(a),82+18.5*Math.sin(a),.8,'#a19f82');
    }
    disk(144,82,4.5,'#808879');disk(144,82,2.5,'#34525b');
    const level=drained?106:91,water=d.createLinearGradient(0,level,0,115);
    water.addColorStop(0,'#589490a8');water.addColorStop(1,'#254f5bc9');fill(64,level,174,115-level,water);
    for(let strip=0;strip<3;strip++)for(let i=0;i<7;i++){
      const px=64+(i*29+strip*13)%169;fill(px,level+strip*2+(i%2)*.5,4+i%3*2,.5,strip?'#749c974d':'#a0bbb37a');
    }
    for(const px of [99,186]){
      fill(px,56,3.5,59,'#243a44');fill(px,56,.5,59,'#778783');
      d.fillStyle='#b4d4c411';d.beginPath();d.moveTo(px+4,56);d.lineTo(px+13,56);d.lineTo(px-8,114);d.lineTo(px-13,114);d.closePath();d.fill();
    }
    d.restore();
    fill(62,114,178,3,'#4b6369');fill(61,117,180,1,'#b3ac92');
    for(const px of [60,101,146,188,241])for(const py of [54,117.5]){
      fill(px,py,1.5,1.5,'#283c40');fill(px,py,.5,.5,'#c4c5ad');
    }
  }
  function interiorFloor(s){
    const key=s.room===7?'pump-'+Boolean(s.flags.drained):s.room;
    let floor=interiorFloors.get(key);
    if(!floor){
      const colors=deckPalettes[s.room];
      floor=document.createElement('canvas');floor.width=768;floor.height=432;
      const d=floor.getContext('2d');d.scale(2,2);
      const plate=(x,y,w,h,color)=>{d.fillStyle=color;d.fillRect(x,y,w,h);};
      const rivet=(x,y)=>{plate(x,y,1.5,1.5,colors[3]);plate(x,y,.5,.5,'#79807a');};
      const groove=(x,y,w,h)=>{
        plate(x,y,w,h,colors[3]);plate(x,y+h-.5,w,.5,colors[2]);
        for(let i=2;i<w-2;i+=3){plate(x+i,y+1,1.5,h-2,colors[1]);plate(x+i,y+1,.5,h-2,colors[2]);}
      };
      plate(0,24,384,192,colors[0]);
      // Laid in courses. Fine seams, screw heads and service grilles sit flush with the floor.
      for(let row=0;row<8;row++){
        const y=34+row*23;
        for(let col=-1;col<9;col++){
          const x=16+col*51+(row%2)*25,seam=(col+row+8)%3;
          const coating=d.createLinearGradient(x,y,x+28,y+23);
          coating.addColorStop(0,colors[seam===0?1:0]);coating.addColorStop(1,colors[seam===2?1:0]);
          plate(x+1,y+1,50,22,coating);plate(x,y,51,1,colors[3]);plate(x,y,.5,23,colors[3]);
          plate(x+1,y+1,49,.5,colors[2]);rivet(x+3,y+3);rivet(x+46,y+19);
          if((col+row*3+15)%5===0){
            plate(x+10,y+12,6,.5,'#52645e');plate(x+16,y+11.5,3,.5,'#4b5b58');
          }
        }
      }
      if(s.room===6){
        for(const y of [48,184])for(const x of [63,122,181,240,299])groove(x,y,35,5);
        // Breaks in the paint mark the two maintenance lanes around the dividing walls.
        for(const x of [133,247])for(let y=53;y<179;y+=13)plate(x,y,1.5,7,'#7c79604f');
      }else if(s.room===10){
        for(const rad of [32,34.5,51]){
          d.strokeStyle=rad===34.5?'#7d6c5e88':'#292d3b';d.lineWidth=rad===51?.5:1;
          d.beginPath();d.arc(196,116,rad,0,Math.PI*2);d.stroke();
        }
        for(const x of [55,284])groove(x,169,38,5);
      }else{
        for(const x of [68,127,186,245])groove(x,s.room===7?145:182,33,5);
      }
      // Soft light falls across the plating. The small contact shadows define the walls below.
      for(const x of [57,185,318]){
        const light=d.createRadialGradient(x,45,2,x,45,65);
        light.addColorStop(0,s.room===10?'#e6ae791c':'#b2dacb1c');light.addColorStop(1,'#9cd3cc00');
        plate(x-65,24,130,90,light);
      }
      const edge=d.createLinearGradient(0,40,0,51);edge.addColorStop(0,'#07141b99');edge.addColorStop(1,'#07141b00');
      plate(16,40,352,11,edge);plate(16,40,2,160,'#0c192244');
      if(s.room===6)paintCablePanel(d);
      if(s.room===7)paintPumpWindow(d,s.flags.drained);
      interiorFloors.set(key,floor);
    }
    ctx.drawImage(floor,0,0,384,216);
    E?.drawInteriorDetail?.(ctx,s);
  }
  function interiorDoor(b,label,open){
    const x=b.x,y=b.y,w=b.w,h=b.h,light=open?'#b0eddb':'#ffc393';
    const fill=(dx,dy,width,height,color)=>{ctx.fillStyle=color;ctx.fillRect(x+dx,y+dy,width,height);};
    fill(2,2,w-4,h-1,'#101e26');fill(0,4,w,h-7,'#485961');
    fill(2,1,w-4,h-3,'#73827e');fill(3,2,w-6,1,'#a3ada0');
    fill(3,4,w-6,h-7,'#182b34');fill(4,5,w-8,h-9,'#0c1c25');
    if(open){
      const depth=ctx.createLinearGradient(x,y+5,x,y+h-3);
      depth.addColorStop(0,'#0a141d');depth.addColorStop(.62,'#203a41');depth.addColorStop(1,'#3b5557');
      fill(5,6,w-10,h-10,depth);fill(5,6,1,h-10,'#41616a');fill(w-6,6,1,h-10,'#33434a');
      for(let i=0;i<3;i++)fill(6,h-7+i*1.5,w-12,.5,i%2?'#62706b':'#273739');
    }else{
      fill(5,6,w-10,h-10,'#4a5054');
      for(let v=8;v<h-5;v+=4){fill(5,v,w-10,1,'#25363e');fill(5,v+1,w-10,.5,'#778079');}
      fill(w/2-2,h/2-1,4,3,'#a07d61');
    }
    for(const dx of [1,w-3]){fill(dx,7,1.5,h-15,'#98a39a');fill(dx,h-6,1.5,1,'#b3aca0');}
    fill(w/2-4,1,8,2.5,'#1b272e');fill(w/2-3,1.5,6,1,light);

    // The open threshold points into the passage. Bolted crossbars mark an interlock.
    if(open) {
      const mid=Math.floor(w/2);
      for(let j=0;j<3;j++){
        fill(mid-1-j,h-11+j,2,1,'#a5d7c1');
        fill(mid+j,h-11+j,2,1,'#a5d7c1');
      }
      fill(-1,7,2,Math.max(2,h-14),'#58958b');
      fill(w-1,7,2,Math.max(2,h-14),'#58958b');
    }else{
      fill(4,Math.floor(h*.53)-1,w-8,3,'#27353b');
      for(let j=5;j<w-6;j+=5)fill(j,Math.floor(h*.53),3,1,'#e7ad69');
    }
    text(label,x-5,y-9,open?palette.mint:palette.ochre,6);
  }
  function vaultScene(s){
    if(s.room===21){dispatchBooth(s);return;}
    interiorFloor(s);
    for(const b of C.solids(s))tile(b,!!b.metal);
    interiorDoor(C.DOOR,s.room===7?'ACCESS [E]':s.room===10?'DEPOT [E]':'OUTSIDE [E]',true);
    if(s.room===6){
      // The panel pilot lamp shares the interlock state with the pressure door.
      r(116,51,1,2,s.flags.accessClear?palette.mint:palette.ochre);
      interiorDoor(C.INNER_DOOR||{x:336,y:44,w:28,h:28},s.flags.accessClear?'CONTROL [E]':'INTERLOCK',!!s.flags.accessClear);
      text(s.flags.accessClear?'INTERLOCK OPEN':'CLEAR THE MAINTENANCE ENCOUNTER',s.flags.accessClear?250:135,34,s.flags.accessClear?palette.mint:palette.ochre,6);
    }else if(s.room===7){
      const b=C.CONSOLE;r(b.x-2,b.y-3,24,25,'#5c7974');r(b.x+1,b.y+1,18,12,s.flags.magnet?palette.mint:palette.ochre);r(b.x+4,b.y+4,12,5,'#153d48');r(b.x+2,b.y+16,3,2,palette.white);text(s.flags.magnet?'PUMPS ONLINE':'CONSOLE [E]',b.x-16,b.y-13,palette.mint,6);
      text(s.flags.drained?'CHANNEL DRAINED':'RESTORE THE SUMP',94,127,s.flags.drained?palette.mint:palette.ochre,7);
    }else if(s.room===10){
      const nodes=C.COIL_NODES,sequence=s.coilSequence,b=C.COIL_CONSOLE,pulse=C.coilPulse(s);
      const cx=b.x+b.w/2,cy=b.y+b.h/2,showFault=s.t<s.coilFaultUntil;
      for(let i=0;i<nodes.length;i++){
        const n=nodes[i],nx=n.x+n.w/2,ny=n.y+n.h/2;
        // The socket has three separate leads. North rises first; the sides run outward.
        const bendX=i===1?cx:nx,bendY=i===1?ny:cy,active=sequence>i;
        const wire=active?'#5b8c81':'#526a65';
        line(cx,cy,bendX,bendY,wire);line(bendX,bendY,nx,ny,wire);
        if(pulse&&pulse.node===i){
          const first=Math.abs(bendX-cx)+Math.abs(bendY-cy);
          const second=Math.abs(nx-bendX)+Math.abs(ny-bendY);
          const distance=pulse.travel*(first+second);
          const x=cx+Math.sign(bendX-cx)*Math.min(first,distance)+Math.sign(nx-bendX)*Math.max(0,distance-first);
          const y=cy+Math.sign(bendY-cy)*Math.min(first,distance)+Math.sign(ny-bendY)*Math.max(0,distance-first);
          r(x-2,y-2,5,5,'#856948');r(x-1,y-1,3,3,palette.white);
        }
      }
      for(let i=0;i<nodes.length;i++){const n=nodes[i],done=sequence>i,lit=pulse&&pulse.node===i&&pulse.travel>=.9;
        r(n.x-2,n.y-2,n.w+4,n.h+4,'#081923');r(n.x,n.y,n.w,n.h,'#50665a');r(n.x+2,n.y+2,n.w-4,n.h-4,done?'#28645f':'#223e41');
        r(n.x+6,n.y+4,6,10,lit?palette.white:done?palette.mint:'#5c7668');r(n.x+4,n.y+8,10,2,lit?palette.ochre:done?palette.white:'#a8a57c');
        if(lit||showFault&&sequence>0&&i===sequence-1){r(n.x-3,n.y-3,n.w+6,2,lit?palette.ochre:palette.mint);r(n.x-3,n.y-2,2,n.h+4,lit?palette.ochre:palette.mint);}
        if(showFault&&s.coilFaultNode===i){line(n.x+3,n.y+3,n.x+15,n.y+15,palette.rust);line(n.x+15,n.y+3,n.x+3,n.y+15,palette.rust);}
        text(n.id.toUpperCase(),n.x-1,n.y+n.h+4,done?palette.mint:'#aabbb0',6);
      }
      r(b.x-4,b.y-4,b.w+8,b.h+8,'#0b202a');r(b.x,b.y,b.w,b.h,'#768675');r(b.x+3,b.y+3,b.w-6,b.h-6,'#193f43');
      circle(b.x+12,b.y+12,7,s.flags.pulseCoil?'#2f7774':sequence===3?'#a18249':'#3a5554');circle(b.x+12,b.y+12,3,s.flags.pulseCoil?palette.mint:sequence===3?palette.ochre:'#60776b');
      text(s.flags.pulseCoil?'PULSE COIL FITTED':sequence===3?'INSTALL [E]':'REPLAY [E]',b.x+b.w+5,b.y-2,s.flags.pulseCoil?palette.mint:palette.ochre,6);
      text(s.flags.pulseCoil?'CHARGED SHOTS RELEASE A SHOCKWAVE':'LATCH [E]',s.flags.pulseCoil?92:164,184,s.flags.pulseCoil?palette.mint:'#98a99a',6);
    }
  }
  function hud(s){if(HUD)HUD.draw(ctx,s,C,S,{controller:lastInput==='gamepad',touch:lastInput==='touch'});}
  // Hand-letter the opening wordmark on the logical pixel grid so it stays crisp at game scale.
  const titleGlyphs={
    D:[30,17,17,17,17,17,30],E:[31,16,16,30,16,16,31],
    P:[30,17,17,30,16,16,16],R:[30,17,17,30,20,18,17],
    L:[16,16,16,16,16,16,31],A:[14,17,17,31,17,17,17],
    Y:[17,17,10,4,4,4,4]
  };

  function titleWord(word, x, y, ink) {
    const size = 4;
    for (const letter of word) {
      const rows = titleGlyphs[letter];
      for (let row = 0; row < rows.length; row++) {
        for (let col = 0; col < 5; col++) {
          const bit = 16 >> col;
          if (!(rows[row] & bit)) continue;
          const px = x + col * size, py = y + row * size;
          r(px, py, size, size, ink);
          if (row === 0 || !(rows[row - 1] & bit)) r(px, py, size, .5, '#fff1d4');
          if (row === 6 || !(rows[row + 1] & bit)) r(px, py + size - .5, size, .5, '#634f48');
        }
      }
      x += 6 * size;
    }
  }
  function launchCard(s) {
    ctx.save();
    r(0, 0, C.W, C.H, '#081320');
    if (titleArt.complete && titleArt.naturalWidth) ctx.drawImage(titleArt, 0, 0, C.W, C.H);
    else if (background.complete && background.naturalWidth) {
      ctx.drawImage(background, 0, 0, C.W, C.H);
      r(0, 0, C.W, C.H, '#07132096');
    }
    const shade = ctx.createLinearGradient(0, 0, 190, 0);
    shade.addColorStop(0, '#06101ac9');
    shade.addColorStop(.65, '#07131b83');
    shade.addColorStop(1, '#06101a00');
    r(0, 0, 190, C.H, shade);
    titleWord('DEEP', 18, 44, '#e8e4ce');
    titleWord('RELAY', 18, 78, '#ef985e');
    r(19, 115, 117, 1, '#799892');
    r(19, 115, 21, 1, '#ffbd72');
    for (let i=0; i<3; i++) r(20+i*4,131+i,2,6-i*2,'#9fe9ce');
    text(loadedSave ? 'CONTINUE' : 'START ENGINE', 37, 130, '#f2edda', 9);
    text(touchDevice?'Tap to play':'Enter or click', 37, 144, '#b6d2cc', 7);
    if (loadedSave) text(C.NAMES[s.room], 37, 160, '#edba83', 7);
    ctx.restore();
  }

  function overlay(title, subtitle, detail='') {
    const complete=title==='RELAY RESTORED';
    const width=complete?210:162, x=(C.W-width)/2, y=79, h=detail?67:53;
    ctx.save();
    r(0,25,C.W,176,'#07131d80');
    r(x+3,y+4,width,h,'#06101bd4');
    r(x,y,width,h,'#11252f');
    r(x+1,y+1,width-2,h-2,'#0c1c27');
    const accent=complete?'#9de3c9':'#f0ae73';
    r(x,y,width,1,'#7a8f88');r(x,y,3,h,accent);
    r(x+7,y+h-4,width-14,.5,'#38515a');
    ctx.textBaseline='top';ctx.textAlign='left';ctx.fillStyle=accent;
    ctx.font='bold 11px Consolas, monospace';ctx.fillText(title,x+12,y+9);
    text(subtitle,x+12,y+28,'#e3e8da',7);
    if(detail)text(detail,x+12,y+44,'#9ec5be',6);
    ctx.restore();
  }
  function mapScene(s){if(HUD)HUD.drawMap(ctx,s,C,{controller:lastInput==='gamepad',touch:lastInput==='touch'});}
  function drawFootprint(cx,y,radius,strength,lo,hi){
    // Clip each ink band at the supporting ledge so a shadow cannot bridge a shaft.
    const band=(inset,dy,height,alpha)=>{
      const x=Math.max(lo,Math.round(cx-radius+inset));
      const end=Math.min(hi,Math.round(cx+radius-inset));
      if(end>x){ctx.globalAlpha=strength*alpha;ctx.fillRect(x,y+dy,end-x,height);}
    };
    band(0,1,1,.47);band(radius*.16,0,2,.53);band(radius*.38,0,1,.67);
  }
  function contactShadow(p,blocks,overhead,roverSize=false){
    if(p.climbing||p.mount==='ceiling')return;
    const cx=p.x+p.w/2,feet=p.y+p.h;
    if(overhead){drawFootprint(cx,Math.round(feet)-1,p.w*.58,.76,0,C.W);return;}
    const radius=roverSize?22:Math.max(4,p.w*.52);
    let top=Infinity;
    for(const b of blocks){
      if(b.y>=feet-.75&&b.x<cx+radius&&b.x+b.w>cx-radius)top=Math.min(top,b.y);
    }
    const distance=Math.max(0,top-feet);
    if(distance>=48)return;
    const strength=1-distance/48,spread=radius*(.68+.32*strength);
    for(const b of blocks)if(b.y===top){
      drawFootprint(cx,top,spread,strength,b.x,b.x+b.w);
      if(roverSize&&distance<2){
        const facing=p.face||1;
        for(const hub of [-15,13])drawFootprint(cx+hub*facing,top,4,.88,b.x,b.x+b.w);
      }
    }
  }
  function shallowWater(s,y){
    return s.room===1&&!s.flags.drained&&Math.abs(y-C.FLOOR)<2?C.APPROACH_PUDDLE:null;
  }

  function waterReflections(s) {
    if (s.room !== 1 || s.flags.drained) return;
    const {left, right} = C.APPROACH_PUDDLE;
    const surface = C.FLOOR - 2, view = renderViewY(s.room);
    ctx.save();
    ctx.beginPath();ctx.rect(left, surface, right-left, 6);ctx.clip();
    // Copy three narrow scanlines of the visible wheels or boots onto the water.
    // The source uses the backing canvas, so camera motion never offsets the reflection.
    function reflect(actor) {
      if (!actor || Math.abs(actor.y + actor.h - C.FLOOR) > 2) return;
      const x = Math.max(left, Math.floor(actor.x)-1);
      const w = Math.min(right, Math.ceil(actor.x+actor.w)+1) - x;
      if (w <= 0) return;
      for (let row=0; row<3; row++) {
        const drift=Math.round(Math.sin(s.t*3+row*.9));
        ctx.globalAlpha=.44-row*.1;
        ctx.drawImage(canvas,x*2,(surface-view-2-row)*2,w*2,2,x+drift,surface+row,w,1);
      }
      ctx.globalAlpha=.85;
      r(x+1,surface+1,Math.min(4,w),.5,'#a6d4c4');
    }
    reflect(s.parked);for(const actor of s.enemies)reflect(actor);reflect(s.p);
    ctx.restore();
  }
  function drawWorld(s){
    ctx.save();ctx.beginPath();ctx.rect(0,25,384,176);ctx.clip();ctx.translate(0,-renderViewY(s.room));
    if(shake>0&&!motionPreference?.matches){
      // Half-pixel offsets are whole pixels on the 2x canvas. HUD and menus stay still.
      const strength=Math.min(1.5,shake*10);
      ctx.translate(Math.round(Math.sin(s.t*67)*strength*2)/2,Math.round(Math.cos(s.t*82)*strength)/2);
    }
    const overhead=s.mode==='vault',blocks=C.solids(s);
    if(overhead)vaultScene(s);else sideScene(s,blocks);
    ctx.save();ctx.fillStyle='#051822';
    if(s.parked&&!overhead)contactShadow(s.parked,blocks,false,true);
    for(const e of s.enemies)contactShadow(e,blocks,overhead);
    contactShadow(s.p,blocks,overhead,s.mode==='rover');ctx.restore();
    if(s.parked&&!overhead)rover({...s.parked,face:s.parked.face||1},s.flags.magnet,true);
    echoSurvey(s);
    ctx.save();
    if(S){for(const signal of C.SIGNALS||[])if(signal.room===s.room&&!(s.signals||[]).includes(signal.id))S.drawSignal(ctx,signal,s.t);for(const item of s.pickups||[])if(item.room===undefined||item.room===s.room)S.drawPickup(ctx,item,s.t);}
    for(const e of s.enemies)enemy(e);
    for(const shot of s.shots){
      if(weaponFX)weaponFX.drawShot(ctx,shot,s);else r(shot.x,shot.y,shot.w,shot.h,shot.enemy?palette.pink:palette.ochre);
      if(shot.conductive){r(shot.x,shot.y+2,5,1,'#b4f0d8');r(shot.x+2,shot.y,1,5,'#eff9bc');}
    }
    if(s.paused||s.p.inv<=0||Math.floor(s.t*14)%2===0){if(s.mode==='rover')rover(s.p,s.flags.magnet);else pilot(s.p,s.mode==='vault');}
    repeaterDevice(s);
    if(s.p.stunUntil>s.t)stunSparks(s.p,s.t);
    if(weaponFX)weaponFX.draw(ctx,s,C.muzzle(s));ctx.restore();
    waterReflections(s);ctx.restore();
    if(roomFade>0)r(0,25,384,176,'#08121c'+Math.round(Math.min(.65,roomFade/.28)*255).toString(16).padStart(2,'0'));hud(s);
  }
  function draw(s){
    ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,C.W,C.H);
    if(!started && s.paused && !s.won)launchCard(s);
    else drawWorld(s);
    if(started&&s.paused&&!s.won){
      overlay('PAUSED',lastInput==='touch'?'Tap Resume to continue':lastInput==='gamepad'?'Press Start or click to resume':'Press Enter or click to resume');
    }
    if(s.map)mapScene(s);
    if(s.won)overlay('RELAY RESTORED','Press '+(lastInput==='touch'?'Use':lastInput==='gamepad'?'B':'E')+' to keep exploring',(s.visited||[]).length+'/'+roomCount+' rooms · '+(s.signals||[]).length+'/3 signals');
    document.getElementById('pause').textContent=s.paused?(started?'Resume':loadedSave?'Continue':'Play'):'Pause';
    if(repeaterButton)repeaterButton.hidden=!s.flags.repeater;
    const controller=lastInput==='gamepad';
    let status=controlText(s.messageTime>0?s.message:C.objective(s));
    if(s.map)status=lastInput==='touch'?'Map open. Tap Map to close.':controller?'Map open. Press View or click the game to close.':'Map open. Press M or click the game to close.';
    if(s.paused)status=started?'Paused. Choose Resume to continue.':loadedSave?'Saved checkpoint ready. Choose Continue.':'Choose Play to start the rover at Service Dock.';
    if(s.won)status='Relay restored. Press '+(lastInput==='touch'?'Use':controller?'B':'E')+' to keep exploring.';
    const caption=document.getElementById('status');if(caption.textContent!==status)caption.textContent=status;
    const saveLabel=document.getElementById('save-status');if(saveLabel){const label=storageAvailable?'Progress saves at beacons and upgrades.':'Storage unavailable. Progress lasts for this session.';if(saveLabel.textContent!==label)saveLabel.textContent=label;}
    const padLabel=document.getElementById('controller-status');if(padLabel){const label=lastInput==='touch'?'Touch controls active. Slide the direction pad while holding an action.':padStatus.connected?(!started?'Controller connected · Click Play or Continue first':document.activeElement!==canvas?'Controller connected · Click the game to control':padStatus.armed?'Controller ready · A jump · X fire · Y charge · B interact':'Controller connected · release controls to continue'):'Keyboard ready · Press a controller button to connect';if(padLabel.textContent!==label)padLabel.textContent=label;}
  }
  function events(s){
    let save=false;
    for(const e of s.events){
      if(['checkpoint','upgrade','health-upgrade','win','room','destroy','signal','relay','receiver-recorded','bell-break'].includes(e.type))save=true;
      const x=Number.isFinite(e.x)?e.x:s.p.x+s.p.w/2,y=Number.isFinite(e.y)?e.y:s.p.y+8;
      const effect={...e,x,y,coil:!!s.flags.pulseCoil,pilot:s.mode!=='rover'};
      if(e.type==='jump')effect.pool=shallowWater(s,y);
      if(e.type==='room'&&audioEngine)audioEngine.clear();
      if(weaponFX)weaponFX.emit(effect,s);
      const heard=audioEngine&&audioEngine.play(effect);
      if(heard&&music&&(e.type==='receiver-pulse'||e.type==='guardian-pulse'||e.type==='puddle-charge')){
        // Briefly clear room for the warning, then restore the groove between pulses.
        music.duck(.53,.15);
      }
      if(heard&&music&&e.type==='arc-lock')music.duck(.44,.28);
      if(heard&&music&&e.type==='bell-lock')music.duck(.52,.22);
      if(e.type==='shot'||e.type==='charge-shot')recoil=e.type==='charge-shot'?.15:.08;
      if(e.type==='hurt')shake=.14;
      if(e.type==='charge-shot'||e.type==='bell-break')shake=Math.max(shake,.08);
      if(e.type==='charge-shot'||e.type==='destroy'||e.type==='hurt'){if(music&&music.duck)music.duck(e.type==='destroy'?.55:.72,e.type==='destroy'?.24:.14);}
      if(e.type==='room'){roomFade=.28;shake=0;if(interior(s.room))viewY=0;}
    }
    if(save)saveProgress();
  }

  let contactDistance = 0;
  function movementSound(s, previous, x0, y0, room) {
    const p=s.p, overhead=s.mode==='vault';
    if(!audioEngine?.effectsEnabled || s.won || room!==s.room || previous!==p ||
       (!overhead && !p.grounded && !p.climbing)) {
      contactDistance=0;
      return;
    }
    const travel=Math.hypot(p.x-x0,p.y-y0);
    if(travel>5){contactDistance=0;return;}
    contactDistance+=travel;
    const pilot=s.mode!=='rover', interval=pilot?19:29;
    if(contactDistance<interval)return;
    contactDistance%=interval;
    const x=p.x+p.w/2,y=p.y+p.h,pool=shallowWater(s,y);
    const metal=overhead||p.climbing||C.solids(s).some(b=>b.metal && Math.abs(b.y-y)<1 && x>=b.x && x<=b.x+b.w);
    audioEngine.play({type:pilot?'step':'tread',x,y,metal,pilot,wet:!!pool&&x>=pool.left&&x<=pool.right,magnetic:!!p.climbing});
  }
  function tick(time){
    const elapsed=last?Math.min((time-last)/1000,.1):0;last=time;accumulator+=elapsed;
    while(accumulator>=1/60){
      const previous=state.p,x0=previous.x,y0=previous.y;
      const grounded=previous.grounded,fallSpeed=previous.vy,room=state.room,actions=input();
      if(actions.pausePressed&&!state.paused||actions.mapPressed&&!state.map){cancelInputCharge();touch?.clear();actions.charge=false;}
      C.step(state,actions,1/60);if(!state.paused)started=true;events(state);pressed.clear();
      if(!state.paused&&!state.map){
        movementSound(state,previous,x0,y0,room);
        const targetViewY=interior(state.room)?0:Math.max(-20,Math.min(40,(state.p.y-90)/72*40));viewY+=(targetViewY-viewY)*.12;if(Math.abs(targetViewY-viewY)<.02)viewY=targetViewY;
        if(state.room===5)viewY=Math.min(viewY,9);
        if(state.mode==='rover'){const aimMuzzle=C.muzzle(state);if(aimMuzzle.dy<0)viewY=Math.min(viewY,aimMuzzle.y-30);}
        if(state.mode!=='vault'&&!grounded&&state.p.grounded&&fallSpeed>30&&room===state.room){
          landing=.12;
          const x=state.p.x+state.p.w/2,y=state.p.y+state.p.h;
          const metal=C.solids(state).some(b=>b.metal&&b.y===y&&b.x<state.p.x+state.p.w&&b.x+b.w>state.p.x);
          const pool=shallowWater(state,y);
          const effect={type:'land',x,y,pool,wet:!!pool&&x>=pool.left&&x<=pool.right,metal,pilot:state.mode==='pilot'};
          if(weaponFX)weaponFX.emit(effect,state);if(audioEngine)audioEngine.play(effect);
        }
        recoil=Math.max(0,recoil-1/60);landing=Math.max(0,landing-1/60);roomFade=Math.max(0,roomFade-1/60);shake=Math.max(0,shake-1/60);
        emission+=1/60;if(emission>.12&&state.mode==='rover'&&!state.won){
          emission=0;
          if(weaponFX&&Math.abs(state.p.vx)>30&&state.p.grounded){
            const face=Math.sign(state.p.vx),x=state.p.x+state.p.w/2-face*14,y=state.p.y+state.p.h;
            const pool=shallowWater(state,y);
            if(pool&&x>=pool.left&&x<=pool.right)weaponFX.emit({type:'tire-spray',x,y,dx:-face,pool},state);
            else weaponFX.emit({type:'exhaust',x,y:y-2},state);
          }
        }
        if(weaponFX)weaponFX.update(1/60);if(audioEngine)audioEngine.setCharge((state.charge||0)/(C.chargeTime?C.chargeTime(state):.6),!!state.charging);
      }
      syncMusic();accumulator-=1/60;
    }
    draw(state);requestAnimationFrame(tick);
  }
  if(new URLSearchParams(location.search).has('test')) window.__deepRelay={get state(){return state;},get controls(){return{source:lastInput,chargeBlocked,...padStatus};},get viewY(){return renderViewY(state.room);},get camera(){return{x:0,y:renderViewY(state.room),zoom:2,viewport:{top:25,bottom:201}};},environment:E,hud:HUD,core:C,music,audio:audioEngine,weaponFX,weaponAssets:WFX,sprites:S,step:(i,dt)=>C.step(state,i,dt),draw:()=>draw(state),worldToScreen:(x,y)=>({x,y:y-renderViewY(state.room)})};
  requestAnimationFrame(tick);
})();
