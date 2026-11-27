/* Deep Relay rover and actors, plus CC0 Warped Caves animation. See credits.html. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.DeepRelaySprites=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const P={outline:'#09151d',shadow:'#19313b',steel:'#3a535d',steelLight:'#6f8b90',ochre:'#daa34e',sun:'#ffe39a',rust:'#995246',teal:'#267f84',mint:'#98f1d2',cream:'#e8e1c4',magenta:'#d56caa',darkPink:'#733f78',green:'#789c4d',lime:'#bed46f'};
  const cache=new Map();
  // Source art is kept as bitmap cutouts. The procedural drawings below remain a load-failure fallback.
  const sourceScript=typeof document!=='undefined'&&document.currentScript?document.currentScript.src:'';
  const assetBase=sourceScript?new URL('../art/runtime/',sourceScript).href:'art/runtime/';
  const bitmaps={},assetStatus={loaded:0,failed:[]};
  function loadBitmap(key,file){return new Promise(resolve=>{
    if(typeof Image==='undefined'){resolve(false);return;}
    const bitmap=new Image();bitmap.onload=()=>{bitmaps[key]=bitmap;assetStatus.loaded++;resolve(true);};
    bitmap.onerror=()=>{assetStatus.failed.push(file);resolve(false);};bitmap.src=assetBase+file;
  });}
  const ASSET_FILES={nativeTurret:'snes20-turret.png',nativeCrusher:'snes20-crusher.png',nativeBoss:'snes20-guardian.png',nativeDrone:'snes20-drone.png',nativeRepair:'snes20-repair.png',nativeSignal:'snes20-signal.png',nativeHull:'snes20-rover-hull.png',nativeWheel:'snes20-rover-wheel.png',nativeCannon:'snes20-rover-cannon.png',nativePilot:'relay21-pilot.png',nativeFauna:'relay21-fauna.png',roverHull:'profile08-rover-hull.png',roverWheel:'profile08-rover-wheel.png',roverCannon:'profile08-rover-cannon.png',pilotSide:'profile-actor-pilot-side.png',pilotWalk:'profile-actor-pilot-walk.png',pilotFront:'profile-actor-pilot-front.png',pilotBack:'profile-actor-pilot-back.png',beetle:'profile-actor-beetle.png',jelly:'profile-actor-jelly.png',turret:'profile-actor-turret.png',skimmer:'profile-actor-skimmer.png',crusher:'profile-actor-crusher.png',boss:'profile-actor-guardian.png',repair:'profile-actor-repair.png',signal:'profile-actor-signal.png',warpedCrabIdle:'warped14-beetle-idle.png',warpedCrabWalk:'warped14-beetle-walk.png',warpedOctopus:'warped14-jelly-float.png'};
  const ANIMATIONS={warpedCrabIdle:{w:48,h:32,frames:4,fps:5},warpedCrabWalk:{w:48,h:32,frames:4,fps:9},warpedOctopus:{w:28,h:37,frames:4,fps:7}};
  const assets=Object.fromEntries(Object.entries(ASSET_FILES).map(([key,file])=>[key,'art/runtime/'+file]));
  const ready=Promise.all(Object.entries(ASSET_FILES).map(([key,file])=>loadBitmap(key,file)));
  const hasNativeRover=()=>!!(bitmaps.nativeHull&&bitmaps.nativeWheel&&bitmaps.nativeCannon);
  const hasProfileRover=()=>!!(bitmaps.roverHull&&bitmaps.roverWheel&&bitmaps.roverCannon);
  const hasRover=()=>hasProfileRover()||hasNativeRover();
  const hasPilot=()=>!!(bitmaps.pilotSide&&bitmaps.pilotWalk&&bitmaps.pilotFront&&bitmaps.pilotBack);
  const RIG={wheelCenters:[[-15,-8],[13,-8]],wheelRadii:[8,8],wheelBaseline:0,wheelInstances:2,cannonInstances:1,hull:{x:-24,y:-29.7440585009,w:38,h:21.7440585009},cannon:{x:-1,y:-19.3800298063,w:28,h:6.7600596125},cannonPivot:{x:-1,y:-16},muzzle:{x:26,y:-16},upMuzzle:{x:-1,y:-43},sourceFacing:'right'};
  const MAGNET_GLOW=Object.freeze({maxOutset:1,rim:'cyan-blue',hub:'red-preserving energy arcs',idle:'steady',climbing:'moving rim highlight'});
  const pixel=(ctx,x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h);};
  function steppedCircle(ctx,x,y,r,c){
    for(let row=-r;row<=r;row++){const half=Math.floor(Math.sqrt(r*r-row*row));pixel(ctx,x-half,y+row,half*2+1,1,c);}
  }
  function line(ctx,x,y,x2,y2,c){
    let dx=Math.abs(x2-x),sx=x<x2?1:-1,dy=-Math.abs(y2-y),sy=y<y2?1:-1,error=dx+dy;
    for(;;){pixel(ctx,x,y,1,1,c);if(x===x2&&y===y2)break;const twice=error*2;if(twice>=dy){error+=dy;x+=sx;}if(twice<=dx){error+=dx;y+=sy;}}
  }
  function image(key,w,h,paint){
    if(cache.has(key))return cache.get(key);
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    paint(canvas.getContext('2d'));cache.set(key,canvas);return canvas;
  }
  function wheel(ctx,x,y,phase,magnet,radius=6){
    steppedCircle(ctx,x,y,radius,P.outline);steppedCircle(ctx,x,y,radius-1,'#1c292d');
    pixel(ctx,x-radius+1,y-1,1,3,'#53605a');pixel(ctx,x-radius+3,y-radius+1,radius,1,'#637064');
    steppedCircle(ctx,x,y,radius-3,'#ad353d');
    steppedCircle(ctx,x,y,1,'#929d88');pixel(ctx,x,y,1,1,'#d3d6b8');
    const spokes=[[[-3,0],[3,0]],[[2,-2],[-2,2]],[[0,-3],[0,3]],[[-2,-2],[2,2]]][Math.abs(phase)%4];
    for(const [dx,dy] of spokes)pixel(ctx,x+dx,y+dy,1,1,'#d78b83');
  }
  function rigState(p,options={}){
    const wall=p.climbing&&p.wallSide?Math.sign(p.wallSide):0,face=wall||p.face||1;
    const aimUp=!wall&&(p.aimY||0)<0;
    const travel=wall?-p.y*wall:p.x,moving=Math.abs(p.vx||0)>5||!!wall;
    const landing=Math.min(1,Math.max(0,(options.landing||0)/.12));
    const suspension=(moving?Math.sin(travel*.44)*.22:0)+landing*1.15+(!wall&&!p.grounded&&Math.abs(p.vy||0)>8?-.35:0);
    return{root:{x:Math.round(p.x+(wall?(wall>0?p.w:0):p.w/2)),y:Math.round(p.y+(wall?p.h/2:p.h)),angle:wall>0?-Math.PI/2:wall<0?Math.PI/2:0,face},
      wheels:RIG.wheelCenters.map(([x,y],i)=>({x,y,radius:RIG.wheelRadii[i],angle:travel/8*face})),
      hull:{...RIG.hull,y:RIG.hull.y+suspension,angle:moving?Math.sin(travel*.26)*.007:0},
      cannon:{...RIG.cannon,x:RIG.cannon.x-Math.min(1,Math.max(0,(options.recoil||0)/.12))*1.5,y:RIG.cannon.y+landing*.22,angle:aimUp?-Math.PI/2:0,pivot:{x:aimUp?-face:RIG.cannonPivot.x,y:RIG.cannonPivot.y}},
      muzzle:aimUp?{x:-face,y:RIG.upMuzzle.y}:{...RIG.muzzle},aimUp,suspension};
  }
  function cannonAim(ctx,pose,paint){
    // Only the weapon pivots. Compensate its mirrored mount so upward fire has
    // one common world origin on both facings; wall-climbing keeps its old rig.
    ctx.save();
    if(pose.aimUp){ctx.translate(pose.cannon.pivot.x,pose.cannon.pivot.y);ctx.rotate(pose.cannon.angle);ctx.translate(-RIG.cannonPivot.x,-RIG.cannonPivot.y);}
    paint();ctx.restore();
  }
  function chargeMuzzle(ctx,pose,options){
    if(!(options.charge>0))return;
    ctx.strokeStyle=Math.floor((options.time||0)*18)%2?'#50a9bf':'#a4f0ea';ctx.lineWidth=.8;ctx.beginPath();
    ctx.arc(pose.muzzle.x,pose.muzzle.y,options.charge>=.6?3.4:2.5,pose.aimUp?-Math.PI:-Math.PI/2,pose.aimUp?0:Math.PI/2);ctx.stroke();
  }
  function magneticWheel(ctx,part,p,options){
    const r=part.radius,active=!!p.climbing&&!options.parked;
    ctx.save();ctx.translate(part.x,part.y);
    // The halo stays within one logical pixel of the tire, including against a wall.
    ctx.beginPath();ctx.arc(0,0,r+MAGNET_GLOW.maxOutset,0,Math.PI*2);ctx.clip();
    const halo=ctx.createRadialGradient(0,0,r-1,0,0,r+MAGNET_GLOW.maxOutset);
    halo.addColorStop(0,'#318bff00');halo.addColorStop(.5,'#49baff2b');halo.addColorStop(1,'#318bff00');
    ctx.fillStyle=halo;ctx.fillRect(-r-1,-r-1,(r+1)*2,(r+1)*2);
    ctx.strokeStyle='#2589ef';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(0,0,r-.8,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='#7cecff';ctx.lineWidth=.65;ctx.beginPath();ctx.arc(0,0,r-.75,0,Math.PI*2);ctx.stroke();
    // Four short energy marks leave the red hub and its rotating source detail visible.
    ctx.save();ctx.rotate(part.angle);ctx.strokeStyle='#82e9ff';ctx.lineWidth=.8;
    for(let i=0;i<4;i++){const angle=i*Math.PI/2;ctx.beginPath();ctx.arc(0,0,3.1,angle-.13,angle+.13);ctx.stroke();}
    ctx.restore();
    if(active){const angle=(options.time||0)*4+part.angle*.1;ctx.strokeStyle='#d7fbff';ctx.lineWidth=.9;ctx.beginPath();ctx.arc(0,0,r-.7,angle,angle+.65);ctx.stroke();}
    ctx.restore();
  }

  function roverDetails(ctx,pose,p,o){
    const speed=Math.min(1,Math.abs(p.vx||0)/105);
    const bend=o.parked?0:Math.round(Math.sin((o.time||0)*9)*speed);
    ctx.save();ctx.translate(0,Math.round(pose.suspension*2)/2);
    pixel(ctx,-16,-31,2,4,'#24333d');pixel(ctx,-16+bend,-34,1,4,'#92a6a2');
    pixel(ctx,-16+bend,-35,2,1,'#edb475');
    pixel(ctx,-23,-23,6,7,'#273942');
    for(let k=0;k<3;k++)pixel(ctx,-23,-22+k*2,5,1,'#87968e');
    pixel(ctx,-12,-24,8,1,'#cf6255');pixel(ctx,-12,-23,5,1,'#983e40');
    pixel(ctx,7,-23,4,2,'#263943');pixel(ctx,8,-23,2,1,p.climbing?'#f4c581':'#9edbc9');
    ctx.restore();
  }
  function drawBitmapRover(ctx,p,options){
    // The Build 19 spoiler rover is the primary silhouette. Keep the compact
    // native components only as a fallback if any profile component fails.
    const pose=rigState(p,options),native=!hasProfileRover()&&hasNativeRover();
    const hull=native?bitmaps.nativeHull:bitmaps.roverHull,cannon=native?bitmaps.nativeCannon:bitmaps.roverCannon;
    const tire=native?bitmaps.nativeWheel:bitmaps.roverWheel;
    ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(pose.root.x,pose.root.y);ctx.rotate(pose.root.angle);if(pose.root.face<0)ctx.scale(-1,1);
    // The only wheel bitmap is rendered twice, in a single side plane, at equal circular size.
    ctx.save();ctx.translate(-3,-14);ctx.rotate(pose.hull.angle);ctx.drawImage(hull,pose.hull.x+3,pose.hull.y+14,pose.hull.w,pose.hull.h);ctx.restore();
    cannonAim(ctx,pose,()=>ctx.drawImage(cannon,pose.cannon.x,pose.cannon.y,pose.cannon.w,pose.cannon.h));
    for(const wheel of pose.wheels){
      ctx.save();ctx.translate(wheel.x,wheel.y);ctx.rotate(wheel.angle);ctx.beginPath();ctx.arc(0,0,wheel.radius,0,Math.PI*2);ctx.clip();ctx.drawImage(tire,-wheel.radius,-wheel.radius,wheel.radius*2,wheel.radius*2);ctx.restore();
      if(options.magnet)magneticWheel(ctx,wheel,p,options);
    }
    if(native)roverDetails(ctx,pose,p,options);
    chargeMuzzle(ctx,pose,options);
    ctx.restore();
  }
  function drawRover(ctx,p,options={}){
    if(hasRover()){drawBitmapRover(ctx,p,options);return;}
    const pose=rigState(p,options);ctx.save();ctx.translate(pose.root.x,pose.root.y);ctx.rotate(pose.root.angle);if(pose.root.face<0)ctx.scale(-1,1);
    // A load failure keeps the same profile contract, never the rejected three-wheel body.
    const dy=pose.suspension;ctx.fillStyle=P.outline;ctx.beginPath();ctx.moveTo(-22,-25+dy);ctx.lineTo(5,-28+dy);ctx.lineTo(13,-21+dy);ctx.lineTo(12,-8+dy);ctx.lineTo(-20,-8+dy);ctx.closePath();ctx.fill();
    pixel(ctx,-20,-24+dy,24,12,'#e3ddc5');pixel(ctx,-19,-24+dy,22,1,'#fff6da');pixel(ctx,3,-23+dy,8,10,'#bec5bb');pixel(ctx,-18,-12+dy,29,4,'#253c42');pixel(ctx,-3,-24+dy,12,6,'#1674a6');pixel(ctx,-2,-24+dy,8,2,'#8fd8f0');pixel(ctx,-21,-24+dy,6,3,'#cf3b44');
    const gun=pose.cannon;cannonAim(ctx,pose,()=>{pixel(ctx,gun.x,gun.y,28,gun.h,P.outline);pixel(ctx,gun.x+1,gun.y+1,25,gun.h-2,'#eee4cc');pixel(ctx,gun.x+3,gun.y+1,3,gun.h-2,'#cf3b44');pixel(ctx,gun.x+23,gun.y+1,2,gun.h-2,'#cf3b44');pixel(ctx,gun.x+26,-18+dy*.2,1,4,P.outline);});
    for(const part of pose.wheels){wheel(ctx,part.x,part.y,Math.floor(part.angle*4/Math.PI),options.magnet,part.radius);if(options.magnet)magneticWheel(ctx,part,p,options);}
    roverDetails(ctx,pose,p,options);
    chargeMuzzle(ctx,pose,options);
    ctx.restore();
  }
  function drawPilotFallback(ctx,p,options={}){
    const t=options.time||0,walking=Math.abs(p.vx||0)+Math.abs(p.vy||0)>4,phase=walking?Math.floor(t*10)%6:0;
    const steps=[[-1,1],[-2,2],[-1,1],[1,-1],[2,-2],[1,-1]][phase],breathe=0,recoil=options.recoil>0?1:0;
    const vault=!!options.vault,ax=vault?(p.aimX||0):(p.face||1),ay=vault?(p.aimY||0):0;
    ctx.save();ctx.translate(Math.round(p.x+5),Math.round(p.y));
    // Boots, teal suit and an ochre life-support pack retain a readable silhouette.
    pixel(ctx,-4,6,8,9,P.outline);const packX=ax<0?3:-6;
    pixel(ctx,packX,5,4,8,P.outline);pixel(ctx,packX+1,6,2,6,'#9f6035');
    pixel(ctx,-3,7+breathe,6,6,'#26535d');pixel(ctx,-3,7+breathe,6,2,'#57787d');pixel(ctx,-2,10+breathe,2,3,'#29464d');pixel(ctx,2,8+breathe,2,4,P.shadow);pixel(ctx,-1,9,3,1,P.ochre);
    pixel(ctx,-3+steps[0],12,3,4,P.shadow);pixel(ctx,1+steps[1],12,3,4,P.steelLight);
    pixel(ctx,-4+steps[0],15,4,1,P.outline);pixel(ctx,1+steps[1],15,4,1,P.outline);
    pixel(ctx,-4,-2+breathe,8,9,P.outline);pixel(ctx,-3,-1+breathe,7,7,'#d4c8a4');pixel(ctx,-2,-1+breathe,4,1,'#f2e6c2');pixel(ctx,-3,5,6,2,'#756b54');
    if(ay<0){pixel(ctx,-2,-1+breathe,5,4,'#aab4ac');pixel(ctx,-2,3+breathe,5,2,P.steel);}
    else{const face=ax<0?-3:0;pixel(ctx,face,-1+breathe,5,5,P.shadow);pixel(ctx,face+2,0,1,3,'#ffa43d');}
    if(ay<0){pixel(ctx,-3,5,6,7,'#754128');pixel(ctx,-2,6,4,1,'#b87641');pixel(ctx,0,8,1,2,P.sun);}
    const gx=Math.round(ax*6),gy=vault?Math.round(ay*7)+7:2;
    pixel(ctx,gx-(ay?1:3)-ax*recoil,gy-(ay?3:1),ay?3:7,ay?7:3,P.outline);
    pixel(ctx,gx-(ay?0:2)-ax*recoil,gy-(ay?2:0),ay?1:5,ay?5:1,P.ochre);
    pixel(ctx,ax*4-1,8+ay*3,3,2,'#70c9b1');
    ctx.restore();
  }
  function drawEnemyFallback(ctx,e,options={}){
    const t=options.time||0,x=Math.round(e.x),y=Math.round(e.y),flash=(e.hitTimer||0)>0&&Math.floor(t*30)%2===0;
    ctx.save();ctx.translate(x,y);if(flash)ctx.globalAlpha=.5;
    if(e.kind==='beetle'||e.kind==='drone'){
      const stride=Math.floor(t*9)%4,body=Math.max(10,(e.h||18)-5),leg=body-2;
      for(let i=0;i<3;i++){const shift=[0,1,0,-1][(stride+i)%4];pixel(ctx,i*5-1,leg,3,6,P.outline);pixel(ctx,i*5+shift-2,leg+5,4,1,'#976e4b');}
      pixel(ctx,0,3,e.w,body-1,P.outline);pixel(ctx,2,0,e.w-4,body,P.outline);pixel(ctx,3,1,e.w-6,body-3,'#718254');pixel(ctx,4,1,e.w-8,2,'#bac182');
      pixel(ctx,Math.floor(e.w/2),2,1,body-4,'#465e42');pixel(ctx,1,body-2,e.w-2,3,P.shadow);pixel(ctx,e.vx<0?0:e.w-3,body-4,3,3,e.phase==='tell'?P.cream:'#c99c60');pixel(ctx,3,4,1,2,'#d6d6a1');
    }else if(e.kind==='jelly'){
      const pulse=Math.sin(t*4),contract=pulse>.4?1:0;
      for(let i=0;i<3;i++){const tx=2+i*5,tail=5+Math.round(Math.sin(t*5+i)*2);line(ctx,tx,9,tx+Math.round(Math.sin(t*4+i)*2),9+tail,P.magenta);pixel(ctx,tx,9+tail,2,1,P.cream);}
      pixel(ctx,0,3+contract,14,6,P.outline);pixel(ctx,2,1+contract,10,8,P.darkPink);pixel(ctx,4,contract,6,2,P.magenta);pixel(ctx,1,4+contract,12,2,P.magenta);pixel(ctx,3,2+contract,2,1,'#eda0c8');
      pixel(ctx,5,5+contract,4,4,P.mint);pixel(ctx,6,5+contract,2,2,P.cream);pixel(ctx,2,8+contract,10,1,P.outline);
    }else if(e.kind==='skimmer'){
      const tell=e.phase==='tell',attack=e.phase==='attack',wing=attack?2:Math.round(Math.sin(t*8)*2);
      pixel(ctx,2,4+wing,20,7,P.outline);pixel(ctx,0,6+wing,24,3,'#667b70');pixel(ctx,3,5+wing,18,2,'#a0a98a');
      pixel(ctx,7,2,10,11,P.outline);pixel(ctx,8,3,8,7,'#526c60');pixel(ctx,9,3,6,1,'#95a68b');
      pixel(ctx,9,7,6,3,tell?P.sun:P.magenta);pixel(ctx,11,8,2,2,tell?P.cream:'#e0a3b7');
      pixel(ctx,2,9+wing,4,2,P.outline);pixel(ctx,18,9+wing,4,2,P.outline);
      for(const x of [3,19])pixel(ctx,x,11+wing,2,attack?4:2,attack?P.magenta:'#4a9d9a');
      if(tell){pixel(ctx,11,-5,2,3,P.sun);pixel(ctx,11,0,2,1,P.sun);}
    }else if(e.kind==='crusher'){
      const tell=e.phase==='tell',attack=e.phase==='attack',ram=tell?-3:attack?7:0;
      if(attack&&e.h===16)ctx.scale(1,16/44);
      if(e.face>0){ctx.translate(e.w||52,0);ctx.scale(-1,1);}
      // A powered slag press: wide black caterpillar feet and one exposed hot flywheel.
      pixel(ctx,2,31,48,13,P.outline);pixel(ctx,4,33,44,9,'#243437');
      for(let i=0;i<6;i++){const x=7+i*7;steppedCircle(ctx,x,37,4,'#51635a');steppedCircle(ctx,x,37,2,'#172b30');pixel(ctx,x-2,33,4,1,'#8b9580');}
      pixel(ctx,9,5,34,29,P.outline);pixel(ctx,12,3,28,30,'#715a48');pixel(ctx,13,4,26,2,'#af8a5c');
      pixel(ctx,14,8,23,21,'#3a4b47');pixel(ctx,34,5,8,26,'#4c5c4e');
      for(let y=9;y<28;y+=5)pixel(ctx,36,y,4,2,'#1a2c2e');
      steppedCircle(ctx,24,18,11,P.outline);steppedCircle(ctx,24,18,8,tell?'#bf7543':'#865842');
      steppedCircle(ctx,24,18,5,'#21383a');steppedCircle(ctx,24,18,2,tell?P.sun:P.magenta);
      const a=Math.floor(t*(attack?19:4))%4;for(const d of [a,a+2]){const dx=Math.round(Math.cos(d*Math.PI/2)*7),dy=Math.round(Math.sin(d*Math.PI/2)*7);line(ctx,24,18,24+dx,18+dy,'#bf9a65');}
      pixel(ctx,-4-ram,17,18,7,P.outline);pixel(ctx,-3-ram,18,17,4,'#83917b');pixel(ctx,-1-ram,19,13,1,'#b9baa1');
      pixel(ctx,-8-ram,9,8,24,P.outline);pixel(ctx,-7-ram,11,6,20,'#7e7760');pixel(ctx,-7-ram,12,2,18,tell?P.sun:'#bc8b4a');
      for(let y=13;y<29;y+=6){pixel(ctx,-5-ram,y,4,2,'#283a39');}
      pixel(ctx,12,29,25,4,'#a26a42');pixel(ctx,15,29,3,3,'#223738');pixel(ctx,25,29,3,3,'#223738');
      if(tell){pixel(ctx,22,-8,3,5,P.sun);pixel(ctx,22,-1,3,2,P.sun);}
      if(e.fireTell){pixel(ctx,13,26,18,2,P.sun);pixel(ctx,18,24,8,2,P.rust);}
      if(attack){pixel(ctx,44,15,5,4,P.sun);pixel(ctx,48,16,4,2,P.rust);}
    }else if(e.kind==='turret'){
      pixel(ctx,0,2,18,14,P.outline);pixel(ctx,2,1,14,3,P.rust);pixel(ctx,3,4,12,10,'#743e3b');pixel(ctx,4,5,10,8,P.shadow);
      pixel(ctx,-5,7,11,4,P.outline);pixel(ctx,-4,8,9,2,P.steelLight);pixel(ctx,3,14,12,3,P.steel);pixel(ctx,7,7,4,4,e.phase==='tell'?P.sun:P.ochre);
      if(e.phase==='tell'){pixel(ctx,8,4,2,2,P.cream);pixel(ctx,5,8,1,2,P.rust);}
      pixel(ctx,1,16,3,2,P.sun);pixel(ctx,14,16,3,2,P.sun);
    }else if(e.kind==='boss'){
      const lift=e.phase==='tell'?-3:e.phase==='attack'?2:Math.round(Math.sin(t*3));
      for(let i=0;i<4;i++){const swing=Math.round(Math.sin(t*7+i)*2);line(ctx,7+i*10,26,5+i*10+swing,39,P.outline);pixel(ctx,3+i*10+swing,37,5,3,P.steelLight);}
      pixel(ctx,4,5,40,26,P.outline);pixel(ctx,8,1,32,30,P.green);pixel(ctx,10,0,28,3,P.lime);pixel(ctx,7,9,34,18,'#5a6c4b');
      steppedCircle(ctx,24,15,13,P.outline);steppedCircle(ctx,24,15,10,P.rust);steppedCircle(ctx,24,15,7,e.enraged?P.magenta:'#b97850');steppedCircle(ctx,24,15,3,P.shadow);
      const a=Math.floor(t*(e.phase==='tell'?18:4))%8,dx=Math.round(Math.cos(a*Math.PI/4)*7),dy=Math.round(Math.sin(a*Math.PI/4)*7);
      line(ctx,24-dx,15-dy,24+dx,15+dy,P.shadow);line(ctx,24+dy,15-dx,24-dy,15+dx,P.shadow);pixel(ctx,23,14,3,3,P.sun);
      pixel(ctx,-5,21+lift,13,14,P.outline);pixel(ctx,-3,23+lift,10,10,P.ochre);pixel(ctx,-3,23+lift,4,3,P.sun);pixel(ctx,-4,31+lift,7,3,P.shadow);
      pixel(ctx,40,21+lift,13,14,P.outline);pixel(ctx,41,23+lift,10,10,P.ochre);pixel(ctx,47,23+lift,4,3,P.sun);pixel(ctx,46,31+lift,7,3,P.shadow);
      pixel(ctx,8,27,5,3,P.magenta);pixel(ctx,34,27,5,3,P.magenta);if(e.phase==='tell'){pixel(ctx,23,-8,2,4,P.sun);pixel(ctx,23,-2,2,1,P.sun);}
    }
    ctx.restore();
  }
  function drawPickupFallback(ctx,item,time=0){
    const x=Math.round(item.x),y=Math.round(item.y+Math.sin(time*4)*.6);
    pixel(ctx,x-1,y,10,8,P.outline);pixel(ctx,x,y,8,7,P.teal);pixel(ctx,x+1,y,6,1,P.mint);pixel(ctx,x+3,y+1,2,5,P.cream);pixel(ctx,x+1,y+3,6,1,P.cream);
  }
  function drawSignalFallback(ctx,item,time=0){
    const x=Math.round(item.x),y=Math.round(item.y+Math.sin(time*3)*1.5),pulse=Math.floor(time*5)%2;
    pixel(ctx,x+3,y-1,4,12,P.outline);pixel(ctx,x,y+3,10,4,P.outline);pixel(ctx,x+3,y,4,10,P.mint);pixel(ctx,x+1,y+3,8,4,P.teal);pixel(ctx,x+4,y+2,2,6,P.cream);pixel(ctx,x+2,y+4,6,2,P.mint);
    if(pulse){pixel(ctx,x-3,y+4,1,2,P.mint);pixel(ctx,x+12,y+4,1,2,P.mint);}
  }
  function pilotAnimation(p,options={}){
    const time=options.time||0;
    if((p.inv||0)>.85)return{key:'hurt',frame:Math.floor(time*9)%2};
    if(p.grounded===false){
      const vy=p.vy||0;
      return{key:'jump',frame:vy<-85?0:vy<-20?1:vy<30?2:vy<95?3:4};
    }
    if(Math.abs(p.vx||0)>4)return{key:options.recoil>0?'runShot':'run',frame:Math.floor(time*12)%8};
    return{key:options.recoil>0?'fire':'idle',frame:Math.floor(time*3)%4};
  }
  // Native-pixel cuts from the same original suit used for the interior and HUD.
  // The cut lines overlap at the hip, knee and cuff so the suit stays closed in motion.
  const SUIT_PARTS={
    upper:{source:'pilotSide',shape:[[0,0],[157,0],[157,115],[115,115],[99,122],[91,136],[91,155],[106,164],[98,180],[55,180],[50,196],[0,196]]},
    arm:{source:'pilotSide',shape:[[52,118],[71,116],[85,127],[96,128],[99,119],[112,116],[125,124],[153,127],[187,132],[187,158],[148,159],[132,166],[109,161],[95,156],[88,167],[73,164],[59,155],[48,143]]},
    thigh:{source:'pilotWalk',shape:[[101,154],[125,156],[143,165],[161,183],[170,207],[159,222],[140,221],[128,205],[106,192],[92,180]]},
    shin:{source:'pilotWalk',shape:[[138,201],[153,196],[165,204],[175,218],[172,237],[166,249],[144,255],[139,245],[141,228],[136,217]]},
    boot:{source:'pilotWalk',shape:[[140,238],[168,234],[174,239],[181,245],[201,246],[210,253],[204,264],[190,271],[155,274],[139,263],[136,249]]}
  };
  function suitPart(name,shadow=false){
    const spec=SUIT_PARTS[name],bitmap=bitmaps[spec.source];
    return image('suit16-'+name+shadow,bitmap.width,bitmap.height,c=>{
      c.beginPath();
      for(const [i,[x,y]] of spec.shape.entries())i?c.lineTo(x,y):c.moveTo(x,y);
      c.closePath();c.clip();c.drawImage(bitmap,0,0);
      if(shadow){c.globalCompositeOperation='source-atop';c.fillStyle='#0d242e70';c.fillRect(0,0,bitmap.width,bitmap.height);}
    });
  }
  // Project two attachment points in the source image onto their animated counterparts.
  function suitBone(c,name,sx,sy,ex,ey,x,y,u,v,shadow=false){
    const dx=ex-sx,dy=ey-sy,length2=dx*dx+dy*dy;
    const a=((u-x)*dx+(v-y)*dy)/length2,b=((v-y)*dx-(u-x)*dy)/length2;
    c.save();c.transform(a,b,-b,a,x-a*sx+b*sy,y-b*sx-a*sy);
    c.drawImage(suitPart(name,shadow),0,0);c.restore();
  }
  function suitLeg(c,hipX,hipY,foot,shadow){
    const [x,y,tilt]=foot,dx=x-hipX,dy=y-hipY,span=Math.max(.01,Math.hypot(dx,dy));
    // Bend the knee forward; the lifted boot clears the other shin in side profile.
    const bend=Math.sqrt(Math.max(0,3.9*3.9-span*span/4));
    const kx=(hipX+x)/2+dy/span*bend,ky=(hipY+y)/2-dx/span*bend;
    suitBone(c,'thigh',111,168,151,209,hipX,hipY,kx,ky,shadow);
    suitBone(c,'shin',151,209,154,246,kx,ky,x,y,shadow);
    c.save();c.translate(x,y);c.rotate(tilt);c.scale(.062,.062);
    c.drawImage(suitPart('boot',shadow),-154,-246);c.restore();
  }
  const RUN_FEET=[[3.2,-1.7,-.18],[2.2,-1.6,-.08],[.5,-1.6,.02],[-1.8,-1.7,.13],[-3.6,-2.3,.45],[-3.5,-4.5,.75],[-.5,-5.5,.2],[2.4,-3.5,-.24]];
  const JUMP_FEET=[
    [[-2,-1.7,.55],[2,-4.5,-.25]], [[-3,-3.8,.7],[2,-5.3,-.24]],
    [[-2,-4.8,.48],[2.8,-4,.06]], [[-2.5,-3,.24],[2.5,-2.4,-.18]], [[-1.8,-1.5,.12],[2.2,-1.5,-.14]]
  ];
  function sidePilot(ctx,p,options){
    const {key,frame}=pilotAnimation(p,options);
    const running=key==='run'||key==='runShot',hurt=key==='hurt';
    let feet=[[-1.8,-1.7,.06],[1.15,-1.7,-.04]];
    let hipY=-8,lean=0;
    if(running){
      feet=[RUN_FEET[(frame+4)%8],RUN_FEET[frame]];
      hipY+=.6*Math.cos(frame*Math.PI/2);lean=.09;
    }else if(key==='jump'){
      feet=JUMP_FEET[frame];hipY-=.2;lean=.08-frame*.038;
    }else if(hurt){
      feet=[[-2.4,-1.8,.12],[1.7,-1.7,-.13]];hipY+=1.4+frame*.4;lean=-.14;
    }else hipY-=frame===2?.6:.95;
    ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.translate(Math.round(p.x+p.w/2),Math.round(p.y+p.h));if(p.face<0)ctx.scale(-1,1);
    suitLeg(ctx,-.75,hipY,feet[0],true);
    suitLeg(ctx,.1,hipY,feet[1],false);
    ctx.save();ctx.translate(0,hipY);ctx.rotate(lean);ctx.scale(.069,.069);
    ctx.drawImage(suitPart('upper'),-84,-170);ctx.restore();
    // The muzzle stays five pixels ahead and fourteen above the sole while firing.
    const firing=options.recoil>0,carry=running&&!firing?1.8+Math.sin(frame*Math.PI/4)*.6:0;
    const gripX=-2.35+lean*5-(firing?.25:0),gripY=hipY-3.7;
    suitBone(ctx,'arm',65,136,183,144,gripX,gripY,5,hurt?-11:carry-14);
    ctx.restore();
  }
  function animationImage(ctx,key,frame,x,y,scale,flash=false){
    const clip=ANIMATIONS[key],bitmap=bitmaps[key],sx=frame*clip.w;
    ctx.drawImage(bitmap,sx,0,clip.w,clip.h,x,y,clip.w*scale,clip.h*scale);
    if(flash){const white=image('white-'+key,bitmap.width,bitmap.height,c=>{c.drawImage(bitmap,0,0);c.globalCompositeOperation='source-in';c.fillStyle='#fff2ce';c.fillRect(0,0,bitmap.width,bitmap.height);});ctx.save();ctx.globalAlpha=.72;ctx.drawImage(white,sx,0,clip.w,clip.h,x,y,clip.w*scale,clip.h*scale);ctx.restore();}
  }
  const PILOT_ROWS={idle:0,fire:1,run:2,runShot:3,jump:4,hurt:5,front:6,back:7};
  function drawNativePilot(ctx,p,options){
    let pose=pilotAnimation(p,options),face=p.face||1;
    const time=options.time||0;
    if(options.vault){
      const walking=Math.abs(p.vx||0)+Math.abs(p.vy||0)>4;
      const firing=options.recoil>0,aimY=p.aimY||0;
      face=aimY?1:p.aimX||face;
      const key=aimY<0?'back':aimY>0?'front':walking?(firing?'runShot':'run'):(firing?'fire':'idle');
      pose={key,frame:walking?Math.floor(time*12)%8:0};
    }
    ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.translate(Math.round(p.x+p.w/2),Math.round(p.y+p.h));if(face<0)ctx.scale(-1,1);
    // The same 2:1 atlas and sole anchor serve both views and the HUD portrait.
    ctx.drawImage(bitmaps.nativePilot,pose.frame*36,PILOT_ROWS[pose.key]*44,36,44,-9,-20,18,22);
    if(options.vault&&options.recoil>0&&p.aimY){
      ctx.fillStyle='#fff0b8';ctx.globalAlpha=Math.min(1,options.recoil*10);
      ctx.fillRect(0,p.aimY<0?-20:-4.5,1,1.5);
    }
    ctx.restore();
  }
  function drawPilot(ctx,p,options={}){
    if(bitmaps.nativePilot){drawNativePilot(ctx,p,options);return;}
    if(!hasPilot()){drawPilotFallback(ctx,p,options);return;}
    if(!options.vault){sidePilot(ctx,p,options);return;}
    const t=options.time||0,walking=Math.abs(p.vx||0)+Math.abs(p.vy||0)>4;
    const ax=p.aimX||0,ay=p.aimY||0;
    const key=ay<0?'pilotBack':ay>0?'pilotFront':walking&&Math.floor(t*9)%2?'pilotWalk':'pilotSide';
    const bitmap=bitmaps[key],height=key==='pilotWalk'?18:19,width=height*bitmap.width/bitmap.height;
    const x=Math.round(p.x+p.w/2),y=Math.round(p.y+p.h);
    ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(x,y);if(!ay&&ax<0)ctx.scale(-1,1);
    if(ay&&walking){
      const split=Math.floor(bitmap.height*.72),bodyHeight=split/bitmap.height*height,step=Math.sin(t*11)*.55;
      ctx.drawImage(bitmap,0,0,bitmap.width,split,-width/2,-height,width,bodyHeight);
      const half=bitmap.width/2,legsHeight=height-bodyHeight;
      ctx.drawImage(bitmap,0,split,half,bitmap.height-split,-width/2,-legsHeight+step,width/2,legsHeight);
      ctx.drawImage(bitmap,half,split,half,bitmap.height-split,0,-legsHeight-step,width/2,legsHeight);
    }else ctx.drawImage(bitmap,-width/2,-height,width,height);
    if(options.recoil>0){ctx.fillStyle='#fff0b8';ctx.globalAlpha=Math.min(1,options.recoil*10);ctx.fillRect(ay?-.5:width/2-1,ay<0?-height-1:ay>0?-2:-9,ay?1:2,ay?2:1);}
    ctx.restore();
  }
  function enemyDimensions(e){
    if(e.visualKind)e={...e,kind:e.visualKind};
    if(e.kind==='beetle')return{w:30,h:20};
    if(e.kind==='drone')return{w:14*350/225,h:14};
    if(e.kind==='jelly')return{w:17.5,h:23.125};
    if(e.kind==='turret')return{w:18*318/315,h:18};
    if(e.kind==='skimmer')return{w:16*271/226,h:16};
    if(e.kind==='boss')return{w:40*468/333,h:40};
    if(e.kind==='crusher')return{w:60,h:60*308/516};
    return{w:e.w,h:e.h};
  }
  const PROFILE_KEYS={turret:'nativeTurret',crusher:'nativeCrusher',boss:'nativeBoss',beetle:'nativeDrone'};
  function profileBitmap(key){return bitmaps[PROFILE_KEYS[key]]||bitmaps[key];}
  function actorImage(ctx,key,w,h,flash){
    const bitmap=profileBitmap(key);ctx.drawImage(bitmap,-w/2,-h,w,h);
    if(flash){const white=image('white-'+key,bitmap.width,bitmap.height,c=>{c.drawImage(bitmap,0,0);c.globalCompositeOperation='source-in';c.fillStyle='#fff2ce';c.fillRect(0,0,bitmap.width,bitmap.height);});ctx.save();ctx.globalAlpha=.72;ctx.drawImage(white,-w/2,-h,w,h);ctx.restore();}
  }
  function encounterCue(e){
    // Heights are projectile centers, relative to the fixed 40-pixel encounter body.
    // Core shots start at y=166/150 for the guardian and 170/144 for the Warden,
    // with a five-pixel projectile. Keep these cues on the actual outgoing lanes.
    if(e.kind==='boss'&&!e.relay&&e.fireTell){
      const lanes=[{height:'low',y:e.y+24.5}];
      const upcoming=Math.floor((e.t||0)/1.5)+1;
      if(e.enraged&&upcoming%2===0)lanes.push({height:'high',y:e.y+8.5});
      return{kind:'volley',lanes};
    }
    if(e.kind==='warden'){
      if(e.fireTell){const high=e.volley==='high';return{kind:'volley',lanes:[{height:high?'high':'low',y:e.y+(high?2.5:28.5)}]};}
      if(e.venting)return{kind:'vent',lanes:[]};
    }
    return null;
  }
  function drawEncounterCue(ctx,e,options){
    if(e.kind==='crusher'&&e.phase==='stunned'){
      const left=e.face>0,x=Math.round(left?e.x:e.x+e.w-6),y=Math.round(e.y+21);
      // The raised cover and exposed contacts sit on the side vulnerable to shots.
      pixel(ctx,x-1,y-2,9,15,P.outline);pixel(ctx,x,y-4,7,2,'#c6c5a4');
      for(let i=0;i<3;i++){pixel(ctx,x,y+i*4,7,2,'#65c8bc');pixel(ctx,x+(left?0:5),y+i*4,2,2,'#e4ffcb');}
    }
    if(e.kind==='warden'&&!e.venting){
      const x=Math.round(e.x),y=Math.round(e.y+18);
      pixel(ctx,x,y,5,14,P.outline);
      for(let i=0;i<3;i++)pixel(ctx,x,y+i*4,5,2,e.interrupted?'#75c6bd':'#92a3a0');
    }
    const cue=encounterCue(e);if(!cue)return;
    ctx.save();ctx.imageSmoothingEnabled=false;
    if(cue.kind==='volley'){
      for(const lane of cue.lanes){
        const x=Math.round(e.x)-3,y=Math.round(lane.y),high=lane.height==='high',color=high?'#b3dded':'#ffcf7d';
        // A short left-pointing aperture sits beside the enemy, not across the arena.
        pixel(ctx,x-11,y-3,12,7,P.outline);pixel(ctx,x-7,y,8,1,color);
        pixel(ctx,x-10,y,1,1,P.cream);pixel(ctx,x-9,y-1,1,3,color);pixel(ctx,x-8,y-2,1,1,color);pixel(ctx,x-8,y+2,1,1,color);
        // A lower cradle means a low shot; an overhead cap means a high shot.
        // Their silhouettes remain different even when color is unavailable.
        const cap=y+(high?-5:5);pixel(ctx,x-8,cap,8,1,color);
        pixel(ctx,x-8,high?cap:cap-2,1,3,color);pixel(ctx,x-1,high?cap:cap-2,1,3,color);
        pixel(ctx,x-1,y-1,2,3,'#fff0c0');
      }
    }else{
      const x=Math.round(e.x)+1,y=Math.round(e.y)+18,t=options.time||0;
      pixel(ctx,x-2,y-2,11,17,P.outline);
      pixel(ctx,x-3,y-4,11,2,'#b1c6ba');
      for(let i=0;i<3;i++){pixel(ctx,x,y+i*4,7,3,'#53a9a6');pixel(ctx,x,y+i*4+1,5,1,'#dcffbd');}
      for(let i=0;i<2;i++){
        const rise=((t*10+i*4)%8),sx=x+1+i*4+Math.round(Math.sin(t*5+i));
        pixel(ctx,sx,y-3-rise,2,2,'#b2cbc580');pixel(ctx,sx+1,y-4-rise,2,1,'#d1e0d57a');
      }
    }
    ctx.restore();
  }
  const FAUNA_ROWS={beetle:0,jelly:1,skimmer:2};
  function drawNativeFauna(ctx,e,options){
    const time=options.time||0,row=FAUNA_ROWS[e.kind],flying=e.kind==='skimmer';
    const fps=e.kind==='beetle'?(Math.abs(e.vx||0)>1?9:3):flying?9:6;
    const frame=Math.floor(time*fps)%6,flash=(e.hitTimer||0)>0&&Math.floor(time*30)%2===0;
    const alt=flying?Math.round(e.y+e.h/2):Math.round(e.y+e.h);
    const source=bitmaps.nativeFauna,y=flying?-11.5:-20.5;
    ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.translate(Math.round(e.x+e.w/2),alt);
    if((e.kind==='beetle'||flying)&&(e.vx||e.face||1)<0)ctx.scale(-1,1);
    if(flying&&e.phase==='attack')ctx.rotate(-.12);
    if(e.phase==='tell'){
      if(e.kind==='beetle'){ctx.scale(1.04,.91);ctx.rotate(-.04);}
      if(e.kind==='jelly')ctx.scale(.9,1.06);
      if(flying)ctx.rotate(.08);
    }
    ctx.drawImage(source,frame*64,row*48,64,48,-16,y,32,24);
    if(e.phase==='tell' && e.kind==='jelly'){
      ctx.fillStyle='#ffe3a4';ctx.fillRect(-1,-12,3,2);
      ctx.fillStyle='#8ee5d3';ctx.fillRect(-4,-11,2,1);ctx.fillRect(3,-11,2,1);
    }
    if(flash){
      const lit=image('native-fauna-hit',source.width,source.height,c=>{
        c.drawImage(source,0,0);c.globalCompositeOperation='source-in';c.fillStyle='#fff2ce';c.fillRect(0,0,source.width,source.height);
      });
      ctx.globalAlpha=.72;ctx.drawImage(lit,frame*64,row*48,64,48,-16,y,32,24);ctx.globalAlpha=1;
    }
    if(flying&&e.phase==='tell'){
      ctx.fillStyle='#ffdf8d';ctx.fillRect(-.75,-13.5,1.5,3.5);ctx.fillRect(-.75,-8.5,1.5,1);
    }
    ctx.restore();
  }
  function drawEnemy(ctx,e,options={}){
    if(bitmaps.nativeFauna&&Object.hasOwn(FAUNA_ROWS,e.kind)){drawNativeFauna(ctx,e,options);return;}
    if(e.kind==='ceiling-turret'){drawCeilingTurret(ctx,e,options);return;}
    const animation=e.kind==='beetle'?(Math.abs(e.vx||0)>1?'warpedCrabWalk':'warpedCrabIdle'):e.kind==='jelly'?'warpedOctopus':null;
    if(animation&&bitmaps[animation]){
      const clip=ANIMATIONS[animation],time=options.time||0,frame=Math.floor(time*clip.fps)%clip.frames;
      ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(Math.round(e.x+e.w/2),Math.round(e.y+e.h));if(e.kind==='beetle'&&e.vx<0)ctx.scale(-1,1);
      animationImage(ctx,animation,frame,-clip.w*.625/2,-(e.kind==='jelly'?34:32)*.625,.625,(e.hitTimer||0)>0&&Math.floor(time*30)%2===0);
      ctx.restore();return;
    }
    const encounter=e;
    if(e.visualKind)e={...e,kind:e.visualKind};
    const key=e.kind==='drone'?'beetle':e.kind;if(!profileBitmap(key)){drawEnemyFallback(ctx,e,options);drawEncounterCue(ctx,encounter,options);return;}
    const t=options.time||0,tell=e.phase==='tell',attack=e.phase==='attack',flash=(e.hitTimer||0)>0&&Math.floor(t*30)%2===0;
    const size=enemyDimensions(e);let w=size.w,h=size.h,dy=0,angle=0,dx=0;
    if(e.kind==='beetle'||e.kind==='drone'){dy=Math.sin(t*9)*.25;angle=Math.sin(t*9)*.013;}
    if(e.kind==='jelly'){const pulse=Math.sin(t*4);w*=1+pulse*.025;h*=1-pulse*.035;}
    if(e.kind==='skimmer'){angle=attack?-.08:tell?.025:Math.sin(t*4)*.02;}
    if(e.kind==='boss'){dy=tell?-1.5:attack?1:0;angle=attack?-.015:0;}
    if(e.kind==='crusher'){dx=tell?1.5:attack?-2:0;angle=attack?-.012:0;if(attack&&e.h===16)h=16;}
    const centerY=e.kind==='skimmer'||e.kind==='drone'?e.y+e.h/2+h/2:e.y+e.h;
    ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(Math.round(e.x+e.w/2),Math.round(centerY+dy));
    if(e.kind==='crusher'&&e.face>0||e.kind==='beetle'&&e.vx<0)ctx.scale(-1,1);
    ctx.translate(dx,0);ctx.rotate(angle);actorImage(ctx,key,w,h,flash);
    // Telegraphs use the same luminous signal language, independent of source pose availability.
    if(tell){ctx.fillStyle='#ffdf8d';ctx.fillRect(-.75,-h-6,1.5,3.5);ctx.fillRect(-.75,-h-1,1.5,1);}
    if(e.kind==='turret'&&tell){ctx.strokeStyle='#ffcf75';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(2,-h*.5,3,0,Math.PI*2);ctx.stroke();}
    if(e.kind==='boss'&&(tell||e.enraged)){ctx.strokeStyle=e.enraged?'#f994b7':'#ffd28a';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(0,-h*.46,tell?5:3.5,0,Math.PI*2);ctx.stroke();}
    if(e.kind==='crusher'&&e.fireTell){ctx.fillStyle='#ffda8d';ctx.globalAlpha=.8;ctx.fillRect(-2,-h*.45,4,1);}
    ctx.restore();
    drawEncounterCue(ctx,encounter,options);
  }
  function drawCeilingTurret(ctx,e,options={}){
    const x=e.x+e.w/2,y=e.y+e.h/2,t=options.time||0,flash=(e.hitTimer||0)>0&&Math.floor(t*30)%2===0;
    ctx.save();ctx.imageSmoothingEnabled=false;
    if(profileBitmap('turret')){
      // The source clamp is on the right and its barrel points left. Rotate
      // around the body so the clamp hangs from the ceiling and fires down.
      // Source bore center is Y114 in the prepared 315-pixel crop. Half a pixel
      // of visual overhang joins that tip to shots spawned at the body boundary.
      const h=18.5,boreOffset=(315/2-114)*h/315;
      ctx.translate(x+boreOffset,y);ctx.rotate(-Math.PI/2);ctx.translate(0,h/2);actorImage(ctx,'turret',h*318/315,h,flash);
    }else{
      ctx.translate(x,y);pixel(ctx,-9,-9,18,4,P.outline);pixel(ctx,-7,-8,14,2,P.steelLight);
      pixel(ctx,-7,-5,14,10,P.outline);pixel(ctx,-5,-4,10,8,P.rust);pixel(ctx,-3,2,6,8,P.outline);pixel(ctx,-2,3,4,5,P.steelLight);pixel(ctx,-2,8,4,2,P.outline);
      pixel(ctx,-1,-3,2,3,flash?P.cream:P.sun);
    }
    ctx.restore();
    if(e.fireTell||e.phase==='tell'){
      // A compact downward aperture shares the actual projectile center line.
      const tip=e.y+e.h+3;ctx.save();pixel(ctx,x-4,tip-1,9,2,P.outline);pixel(ctx,x-3,tip,7,1,P.sun);
      pixel(ctx,x-2,tip+2,1,1,P.sun);pixel(ctx,x+2,tip+2,1,1,P.sun);pixel(ctx,x-1,tip+3,1,1,P.sun);pixel(ctx,x+1,tip+3,1,1,P.sun);pixel(ctx,x,tip+4,1,2,P.cream);ctx.restore();
    }
  }
  function drawPickup(ctx,item,time=0){
    const bitmap=bitmaps.nativeRepair||bitmaps.repair;
    if(!bitmap){drawPickupFallback(ctx,item,time);return;}
    const w=7,h=7*177/108;ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(bitmap,Math.round(item.x+4-w/2),Math.round(item.y+8-h+Math.sin(time*4)*.6),w,h);ctx.restore();
  }
  function drawSignal(ctx,item,time=0){
    const bitmap=bitmaps.nativeSignal||bitmaps.signal;
    if(!bitmap){drawSignalFallback(ctx,item,time);return;}
    const h=12,w=12*165/247;ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(bitmap,Math.round(item.x+5-w/2),Math.round(item.y+10-h+Math.sin(time*3)),w,h);ctx.restore();
  }
  return{version:22,palette:P,assets,animations:ANIMATIONS,pilotAnimation,rig:RIG,rigState,enemyDimensions,encounterCue,ready,magneticGlow:MAGNET_GLOW,get diagnostics(){const actorKeys=['beetle','jelly','turret','skimmer','crusher','boss'];return{source:'art/runtime/profile08-rover-hull.png',sources:['art/runtime/profile08-rover-hull.png','art/runtime/snes20-rover-hull.png','art/runtime/relay21-pilot.png','art/runtime/relay21-fauna.png','art/runtime/sprites08-rover-source.png','art/runtime/sprites06-actors-source.png','art/runtime/warped14-manifest.json'],rover:hasProfileRover()?'profile-components':hasNativeRover()?'native-components':'code-fallback',pilot:bitmaps.nativePilot?'salvage-atlas':hasPilot()?'salvage-rig':'code-fallback',overheadPilot:bitmaps.nativePilot?'salvage-atlas':hasPilot()?'profile-bitmap':'code-fallback',actors:Object.fromEntries(actorKeys.map(key=>[key,bitmaps.nativeFauna&&Object.hasOwn(FAUNA_ROWS,key)?'native-animation':bitmaps[PROFILE_KEYS[key]]?'native-profile':key==='beetle'&&bitmaps.warpedCrabWalk||key==='jelly'&&bitmaps.warpedOctopus?'warped-animation':bitmaps[key]?'profile-bitmap':'code-fallback'])),requested:Object.keys(ASSET_FILES).length,loaded:assetStatus.loaded,loadedAssets:Object.keys(bitmaps),failed:[...assetStatus.failed],magneticGlow:MAGNET_GLOW};},drawRover,drawPilot,drawEnemy,drawPickup,drawSignal};
});
