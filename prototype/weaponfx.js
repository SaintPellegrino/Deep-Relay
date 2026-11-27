/* Cosmetic weapon sprites and bounded effects. Never changes shots or simulation time. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.DeepRelayWeaponFX=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const assets={sheet:'art/runtime/weapon07-effects.png'},diagnostics={loaded:[],failed:[],status:'loading'};
  const FRAMES={bolt:[0,0],muzzle:[1,0],armor:[2,0],dust:[3,0],orb:[0,1],chargedMuzzle:[1,1],chargedImpact:[2,1],burst:[3,1],enemyBolt:[0,2],hit:[1,2],spark:[2,2],smoke:[3,2]};
  let sheet=null;const crops={};
  function prepare(){
    const sw=sheet.naturalWidth/4,sh=sheet.naturalHeight/3;
    for(const [name,[column,row]]of Object.entries(FRAMES))crops[name]={x:column*sw,y:row*sh,w:sw,h:sh};
    try{const c=document.createElement('canvas');c.width=sheet.naturalWidth;c.height=sheet.naturalHeight;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(sheet,0,0);const pixels=x.getImageData(0,0,c.width,c.height).data;
      for(const [name,[column,row]]of Object.entries(FRAMES)){let minX=sw,minY=sh,maxX=0,maxY=0;
        for(let y=0;y<sh;y++)for(let xx=0;xx<sw;xx++){const i=((row*sh+y)*c.width+column*sw+xx)*4;if(pixels[i+3]>=100){minX=Math.min(minX,xx);minY=Math.min(minY,y);maxX=Math.max(maxX,xx);maxY=Math.max(maxY,y);}}
        if(maxX>=minX&&maxY>=minY)crops[name]={x:column*sw+minX,y:row*sh+minY,w:maxX-minX+1,h:maxY-minY+1};
      }
    }catch(_){/* file: previews may disallow canvas pixel reads; whole cells remain usable. */}
    diagnostics.frames=Object.fromEntries(Object.entries(crops).map(([name,r])=>[name,{...r}]));
  }
  const ready=typeof Image==='undefined'?Promise.resolve():new Promise(resolve=>{sheet=new Image();sheet.onload=()=>{prepare();diagnostics.loaded.push('sheet');diagnostics.status='ready';resolve();};sheet.onerror=()=>{diagnostics.failed.push(assets.sheet);diagnostics.status='fallback';resolve();};sheet.src=assets.sheet;});
  if(typeof Image==='undefined')diagnostics.status='fallback';
  const LIMITS=Object.freeze({particles:144,flashes:18,rings:6});
  const color={white:'#f3f5d6',amber:'#f2b25e',hot:'#fff7b5',cyan:'#99ecdf',blue:'#67bce9',pink:'#f18099',dust:'#99a28a',smoke:'#55716d',rust:'#d39461'};
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function sprite(ctx,name,x,y,w,h,angle=0,alpha=1){
    if(!sheet||!sheet.complete||!sheet.naturalWidth)return false;const frame=FRAMES[name];if(!frame)return false;
    const source=crops[name]||{x:frame[0]*sheet.naturalWidth/4,y:frame[1]*sheet.naturalHeight/3,w:sheet.naturalWidth/4,h:sheet.naturalHeight/3},scale=Math.min(w/source.w,h/source.h),dw=source.w*scale,dh=source.h*scale;
    ctx.save();ctx.translate(Math.round(x*2)/2,Math.round(y*2)/2);ctx.rotate(angle);ctx.globalAlpha*=alpha;ctx.imageSmoothingEnabled=false;ctx.drawImage(sheet,source.x,source.y,source.w,source.h,-dw/2,-dh/2,dw,dh);ctx.restore();return true;
  }
  function create({chargeTime=()=>.6}={}){
    const particles=[],flashes=[],rings=[];let time=0,serial=0;
    function trim(list,limit){if(list.length>limit)list.splice(0,list.length-limit);}
    function random(){serial=(Math.imul(serial+0x6d2b79f5,1664525)+1013904223)|0;return(serial>>>0)/4294967296;}
    function plume(x,y,count,kind,speed,dx=0,dy=0){
      for(let i=0;i<count;i++){const angle=random()*Math.PI*2,v=speed*(.3+random()*.7),life=(kind==='dust'?.3:.14)+random()*.22;
        particles.push({x,y,vx:Math.cos(angle)*v+dx*speed*.5,vy:Math.sin(angle)*v+dy*speed*.5,life,total:life,kind,size:kind==='smoke'?3:kind==='dust'?1+random():1,gravity:kind==='dust'?50:kind==='smoke'?-14:30});}
      trim(particles,LIMITS.particles);
    }
    function flash(name,x,y,w,h,duration,angle=0){flashes.push({name,x,y,w,h,life:duration,total:duration,angle});trim(flashes,LIMITS.flashes);}
    function splash(x,y,count,side,reach,pool){
      // Each bead ends when it touches the same sheet of water it came from.
      for(let i=0;i<count;i++){
        const life=.46,vx=side*(10+random()*reach),vy=-(17+random()*reach);
        particles.push({x,y:y-1,vx,vy,gravity:210,waterline:y,life,total:life,kind:'water',size:1});
      }
      trim(particles,LIMITS.particles);
      rings.push({x,y:y-1,water:true,lo:pool.left,hi:pool.right,radius:reach*.36,life:.24,total:.24});trim(rings,LIMITS.rings);
    }
    function emit(e,state={}){
      const x=Number.isFinite(e.x)?e.x:0,y=Number.isFinite(e.y)?e.y:0,dx=e.dx===undefined?1:e.dx,dy=e.dy||0,angle=Math.atan2(dy,dx);
      switch(e.type){
        case'shot':case'charge-shot':{const charged=e.type==='charge-shot';flash(charged?'chargedMuzzle':'muzzle',x+dx*(charged?7:4),y+dy*(charged?7:4),charged?26:17,charged?18:11,charged?.13:.065,angle);plume(x,y,charged?9:3,charged?'blue':'spark',charged?55:35,dx,dy);break;}
        case'impact':if(e.material==='metal'){flash('armor',x,y,15,15,.12,angle);plume(x,y,e.charged?14:7,'spark',65,-dx,-dy);}else{flash('dust',x,y,18,15,.17);plume(x,y,e.charged?12:6,'dust',35,-dx,-dy);plume(x,y,2,'smoke',11);}if(e.charged)flash('chargedImpact',x,y,23,23,.16);break;
        case'hit':{if(e.material==='organic'){plume(x,y,e.damage>1?10:6,'droplet',e.damage>1?45:30,-dx,-dy);flash('hit',x,y,8,8,.065,angle);break;}const armor=e.armor||e.material==='metal';flash(armor?'armor':'hit',x,y,e.damage>1?23:15,e.damage>1?23:15,.11,angle);if(armor)flash('hit',x,y,e.damage>1?13:9,e.damage>1?13:9,.07);plume(x,y,e.damage>1?10:5,armor?'spark':'blue',e.damage>1?68:44,-dx,-dy);break;}
        case'destroy':flash('burst',x,y,e.kind==='boss'||e.kind==='crusher'?39:28,e.kind==='boss'||e.kind==='crusher'?39:28,.23);plume(x,y,19,'spark',75);plume(x,y,8,'smoke',21);rings.push({x,y,radius:17,life:.22,total:.22});trim(rings,LIMITS.rings);break;
        case'bell-break':case'yard-break':plume(x,y,10,'spark',59);plume(x,y,7,'dust',37);flash('armor',x,y,20,17,.12);break;
        case'shockwave':rings.push({x,y,radius:e.radius||26,life:.32,total:.32,coil:true});trim(rings,LIMITS.rings);plume(x,y,9,'blue',58);break;
        case'jump':case'land':{
          const width=e.pilot?3:12,land=e.type==='land';
          for(const side of [-1,1]){
            const contact=x+side*width;
            if(e.pool&&contact>=e.pool.left&&contact<=e.pool.right)splash(contact,y,land?4:2,side,land?38:22,e.pool);
            else if(!e.metal)plume(contact,y-1,land?3:2,'dust',land?25:17,side,-.8);
          }
          break;
        }
        case'tire-spray':if(e.pool)splash(x,y,2,dx,24,e.pool);break;
        case'exhaust':plume(x,y,1,'smoke',7,0,-.4);break;
        case'hurt':flash('hit',x,y,22,22,.1);plume(x,y,7,'rust',46);break;
        case'upgrade':case'health-upgrade':case'win':case'signal':case'relay':case'repair':plume(x,y,e.type==='upgrade'?15:8,'blue',34);break;
        case'board':plume(x,y,4,'dust',15);break;
        case'room':case'death':clear();break;
      }
    }
    function clear(){particles.length=0;flashes.length=0;rings.length=0;}
    function update(dt,paused=false){
      if(paused)return;dt=clamp(Number(dt)||0,0,.1);time+=dt;
      for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.gravity*dt;p.vx*=Math.exp(-dt*2);p.life-=dt;
        if(p.kind==='water'&&p.y>=p.waterline)p.life=0;
      }
      for(const list of [particles,flashes,rings]){for(let i=list.length-1;i>=0;i--){if(list!==particles)list[i].life-=dt;if(list[i].life<=0)list.splice(i,1);}}
    }
    function drawShot(ctx,shot,state={}){
      const x=shot.x+shot.w/2,y=shot.y+shot.h/2,angle=Math.atan2(shot.vy,shot.vx),charged=!!shot.charged,enemy=!!shot.enemy;
      ctx.save();ctx.translate(Math.round(x*2)/2,Math.round(y*2)/2);ctx.rotate(angle);
      // The short trail follows velocity; its length never resembles another projectile.
      ctx.globalAlpha=.5;ctx.fillStyle=enemy?color.pink:charged?color.blue:color.amber;ctx.fillRect(charged?-16:-10,-1,charged?12:8,2);ctx.globalAlpha=1;
      if(enemy){
        // A split dart reads differently from the player's single straight tracer at any hue.
        ctx.fillStyle='#342743';ctx.fillRect(-6,-2,9,4);
        ctx.beginPath();
        for(const lead of [-3,2]){ctx.moveTo(lead-3,-3);ctx.lineTo(lead,0);ctx.lineTo(lead-3,3);}
        ctx.lineJoin='round';ctx.lineWidth=2.5;ctx.strokeStyle='#462a46';ctx.stroke();
        ctx.lineWidth=1;ctx.strokeStyle='#ffd49e';ctx.stroke();
        ctx.restore();return;
      }
      const name=charged?'orb':'bolt';
      if(!sprite(ctx,name,0,0,charged?15:enemy?10:12,charged?12:enemy?9:7)){
        ctx.fillStyle=enemy?'#a63f72':charged?'#358aaf':'#c8793e';ctx.fillRect(charged?-6:-5,charged?-4:-2,charged?12:10,charged?8:4);
        ctx.fillStyle=enemy?color.pink:charged?color.cyan:color.hot;ctx.fillRect(charged?-4:-4,-1,charged?8:8,2);
      }
      ctx.fillStyle=enemy?color.pink:color.white;ctx.fillRect(charged?-2:0,-.5,charged?4:3,1);
      if(charged){ctx.strokeStyle=state.flags&&state.flags.pulseCoil?color.blue:color.cyan;ctx.globalAlpha=.65;ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,6+(Math.floor(time*24)%2),-.9,.9);ctx.stroke();}
      ctx.restore();
    }
    function draw(ctx,state={},muzzle){
      ctx.save();
      for(const p of particles){const age=1-p.life/p.total;ctx.globalAlpha=Math.min(1,p.life/.1)*(p.kind==='smoke'?.38:.85);ctx.fillStyle=p.kind==='blue'?color.cyan:p.kind==='dust'?color.dust:p.kind==='smoke'?color.smoke:p.kind==='rust'?color.rust:age<.35?color.hot:color.amber;
        if(p.kind==='droplet'){
          ctx.fillStyle=age<.42?'#e8ae9f':'#ac7789';ctx.fillRect(Math.round(p.x),Math.round(p.y),age<.4?3:2,age<.4?2:1);
        }else if(p.kind==='water'){
          ctx.fillStyle=age<.45?'#94c9ca':'#629da7';
          ctx.fillRect(Math.round(p.x),Math.round(p.y),1,p.vy< -15?2:1);
        }else if(p.kind==='smoke'){const size=p.size+age*2;if(!sprite(ctx,'smoke',p.x,p.y,size,size,0,.6))ctx.fillRect(Math.round(p.x),Math.round(p.y),size,size);}else if(p.kind==='spark'){ctx.fillRect(Math.round(p.x),Math.round(p.y),Math.abs(p.vx)>Math.abs(p.vy)?2:1,Math.abs(p.vy)>Math.abs(p.vx)?2:1);}else ctx.fillRect(Math.round(p.x),Math.round(p.y),p.size,p.size);
      }
      for(const f of flashes){const life=f.life/f.total;ctx.globalAlpha=1;if(!sprite(ctx,f.name,f.x,f.y,f.w*(.85+life*.15),f.h*(.85+life*.15),f.angle,Math.min(1,life*2))){ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.angle);ctx.globalAlpha=Math.min(1,life*2);ctx.fillStyle=f.name==='dust'?color.dust:f.name==='chargedMuzzle'||f.name==='chargedImpact'?color.cyan:color.hot;
          if(f.name==='muzzle'||f.name==='chargedMuzzle'){ctx.beginPath();ctx.moveTo(-f.w*.35,0);ctx.lineTo(f.w*.45,0);ctx.lineTo(-f.w*.1,-f.h*.35);ctx.lineTo(0,0);ctx.lineTo(-f.w*.1,f.h*.35);ctx.closePath();ctx.fill();}else{ctx.fillRect(-f.w*.18,-1,f.w*.36,2);ctx.fillRect(-1,-f.h*.18,2,f.h*.36);}ctx.restore();}}
      for(const wave of rings){const progress=1-wave.life/wave.total;ctx.globalAlpha=(1-progress)*.75;
        if(wave.water){
          ctx.fillStyle='#92c7c7';
          const spread=Math.round(wave.radius*progress);
          for(const side of [-1,1]){
            const start=Math.round(wave.x)+side*spread;
            const left=Math.max(start,wave.lo),right=Math.min(start+2,wave.hi);
            if(right>left)ctx.fillRect(left,Math.round(wave.y),right-left,1);
          }
        }else{ctx.strokeStyle=wave.coil?color.blue:color.amber;ctx.lineWidth=1;ctx.beginPath();ctx.arc(wave.x,wave.y,Math.max(1,wave.radius*progress),0,Math.PI*2);ctx.stroke();}
      }
      if(muzzle&&state.charging&&state.charge>0){const charge=clamp(state.charge/chargeTime(state),0,1),pulse=.55+Math.sin(time*32)*.2;ctx.globalAlpha=pulse;ctx.strokeStyle=charge>=1?color.white:color.cyan;ctx.lineWidth=1;ctx.beginPath();ctx.arc(muzzle.x,muzzle.y,2+charge*3,-time*12,-time*12+4.6);ctx.stroke();ctx.fillStyle=color.white;ctx.fillRect(muzzle.x-1,muzzle.y-1,2,2);}
      ctx.restore();
    }
    return{emit,update,clear,draw,drawShot,get diagnostics(){return{particles:particles.length,flashes:flashes.length,rings:rings.length,time,limits:LIMITS};},get snapshot(){return{particles:particles.map(p=>({...p})),flashes:flashes.map(f=>({...f})),rings:rings.map(r=>({...r}))};}};
  }
  return{version:21,create,ready,assets,frames:FRAMES,diagnostics,LIMITS};
});
