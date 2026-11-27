/* Deterministic game simulation. Browser input, rendering and storage live in game.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DeepRelayCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const W=384, H=216, FLOOR=184, VERSION=2, ROVER_W=36, ROVER_H=22, GROUND_Y=FLOOR-ROVER_H, ROVER_MUZZLE_X=26, ROVER_MUZZLE_HEIGHT=16;
  const NAMES=[
    'SERVICE DOCK','FLOODED APPROACH','DRAIN CHANNEL','MAGNETIC RISE','UPPER GANTRY','RELAY CROWN',
    'SERVICE ACCESS','PUMP CONTROL','CONVEYOR GALLERY','RUSTLUNG DEPOT','COIL CHAMBER',
    'MOSSWORKS BYPASS','CONDENSER BRIDGE','COOLANT HEART','CANOPY LANDING','LANTERN SHAFT',
    'BRAMBLE RISER','GLASSROOT SPAN','THORNWATCH GALLERY','SIGNAL ORCHARD',
    'SWITCHYARD THROAT','DISPATCH BOOTH','SHUNT VIADUCT','ARC KILN','COUNTERWEIGHT RUN','NIGHT EXCHANGE',
    'LISTENING CUT','BELL FOUNDRY','SOUNDING WELL'
  ];
  const ROOM_COUNT=NAMES.length;
  const ROOM_LINKS=[{a:0,b:1,kind:'drop'},{a:1,b:2},{a:2,b:0,kind:'return'},{a:0,b:3,kind:'magnet'},{a:3,b:4,kind:'magnet'},{a:4,b:5,kind:'magnet'},{a:1,b:6,kind:'hatch'},{a:6,b:7,kind:'hatch'},{a:2,b:8,kind:'gate'},{a:8,b:9},{a:9,b:10,kind:'hatch'},{a:8,b:11,kind:'gate'},{a:11,b:12,kind:'magnet'},{a:12,b:13,kind:'jump'},{a:4,b:14,kind:'gate'},{a:14,b:15},{a:15,b:16,kind:'combat'},{a:16,b:17,kind:'magnet'},{a:17,b:18,kind:'jump'},{a:18,b:19,kind:'combat'},{a:19,b:11,kind:'relay'}];
  ROOM_LINKS.push({a:2,b:20,kind:'gate'},{a:20,b:21,kind:'hatch'},{a:20,b:22},{a:22,b:23},{a:23,b:24,kind:'coupler'},{a:24,b:25,kind:'jump'},{a:25,b:3,kind:'yard-power'});
  ROOM_LINKS.push({a:0,b:26,kind:'gate'},{a:26,b:27},{a:27,b:28,kind:'bell-wall'},{a:28,b:0,kind:'echo-lift'});
  const isInterior=room=>room===6||room===7||room===10||room===21;
  const HATCH={x:166,y:160,w:24,h:24};
  const APPROACH_PUDDLE={left:226,right:318,warning:0.45,afterglow:0.25};
  const CONSOLE={x:318,y:58,w:20,h:24};
  const DOOR={x:24,y:156,w:24,h:28};
  const INNER_DOOR={x:336,y:44,w:28,h:28};
  const CHASSIS={x:300,y:48,w:12,h:12};
  const DRAIN_CACHE={x:100,y:68,w:12,h:12};
  const DEPOT_GATE={x:110,y:158,w:28,h:26};
  const DEPOT_HATCH={x:318,y:160,w:24,h:24};
  const COIL_NODES=[{id:'west',x:68,y:142,w:18,h:18},{id:'north',x:170,y:58,w:18,h:18},{id:'east',x:300,y:142,w:18,h:18}];
  const COIL_CONSOLE={x:184,y:104,w:24,h:24};
  // One cable lights at a time. The quiet gap separates the end from the next cycle.
  function coilPulse(s){
    if(s.room!==10||s.coilSequence===3)return null;
    const elapsed=(s.t-s.coilTraceStartedAt)%4.6;
    const node=Math.floor(elapsed/1.15);
    return node<3?{node,travel:Math.min(1,(elapsed-node*1.15)/.8)}:null;
  }
  const MOSS_GATE={x:86,y:158,w:26,h:26};
  const COOLING_CONSOLE={x:326,y:154,w:22,h:30};
  const CONDENSER_GAP={x:168,y:FLOOR,w:64,h:32};
  const CANOPY_GATE={x:250,y:70,w:26,h:26};
  const CANOPY_MOSS_GATE={x:8,y:158,w:24,h:26};
  const CANOPY_RELAY={x:278,y:152,w:24,h:32};
  const CANOPY_GAP={x:160,y:FLOOR,w:72,h:32};
  const SOUNDING={
    entry:{x:96,y:158,w:24,h:26},track:{x:114,y:122,w:166,h:9,metal:true},
    bell:{x:282,y:149,w:16,h:20},wall:{x:323,y:84,w:20,h:100},
    lens:{x:251,y:149,w:26,h:35},lift:{x:329,y:150,w:28,h:34}
  };
  const YARD={
    entry:{x:180,y:158,w:24,h:26}, hatch:{x:180,y:160,w:24,h:24},
    rack:{x:299,y:58,w:22,h:24}, emitter:{x:104,y:76}, coupler:{x:244,y:143,w:16,h:24},
    exchange:{x:288,y:153,w:22,h:31}, returnGate:{x:82,y:158,w:24,h:26}, gap:{x:170,y:FLOOR,w:54,h:32},
    cabinets:[{x:100,y:64,w:74,h:22},{x:112,y:135,w:88,h:20},{x:233,y:112,w:74,h:20}]
  };
  const CANOPY_RELAY_REQUIRED=['lantern-turret','thornwatch-left-turret','thornwatch-right-turret','thornwatch-beetle'];
  const DOCK_RECEIVER={x:277,y:137,w:12,h:16};
  const DOCK_GRATE={x:316,y:162,w:8,h:22};
  const DOCK_RECORDER={x:356,y:157,w:16,h:27};
  const DEFAULT_SIGNAL_RHYTHM=Object.freeze([0,0.28,0.76]);
  const RECEIVER_QUIET=0.85;
  function newReceiver(){return {shots:[],lastShot:0,playAt:null,nextPulse:0,dockFlash:0,grateFlash:0,wakeIn:2.4};}
  function listenToShot(s){
    if(s.room!==0||!s.flags.drained||s.mode!=='rover'||s.receiver.playAt!==null)return;
    const rx=s.receiver;
    if(rx.shots.length<3)rx.shots.push(s.t);
    rx.lastShot=s.t;
  }
  function updateReceiver(s,dt){
    if(s.room!==0||!s.flags.drained)return;
    const rx=s.receiver;
    rx.dockFlash=Math.max(0,rx.dockFlash-dt);
    rx.grateFlash=Math.max(0,rx.grateFlash-dt);
    if(!s.flags.dockAnswered&&!rx.shots.length){
      rx.wakeIn-=dt;
      if(rx.wakeIn<=0){rx.dockFlash=0.22;rx.wakeIn=2.4;}
    }
    if(rx.playAt===null){
      if(!rx.shots.length||s.t-rx.lastShot+1e-8<RECEIVER_QUIET)return;
      rx.playAt=s.t;
    }
    const count=rx.shots.length;
    const index=rx.nextPulse%count;
    const atGrate=rx.nextPulse>=count;
    const duration=rx.shots[count-1]-rx.shots[0];
    const offset=rx.shots[index]-rx.shots[0]+(atGrate?duration+0.48:0);
    if(s.t-rx.playAt+1e-8<offset)return;
    const source=atGrate?'grate':'dock';
    const box=atGrate?DOCK_GRATE:DOCK_RECEIVER;
    rx[source+'Flash']=0.14;
    s.events.push({type:'receiver-pulse',source,index,x:box.x+box.w/2,y:box.y+box.h/2});
    rx.nextPulse++;
    if(rx.nextPulse===count*2){
      if(count>=2&&!s.flags.dockRecorder){
        const first=!s.flags.dockAnswered;
        const rhythm=rx.shots.map(t=>Math.round((t-rx.shots[0])*1000)/1000);
        if(first||rhythm.length!==s.signalRhythm.length||rhythm.some((v,i)=>v!==s.signalRhythm[i])){
          s.flags.dockAnswered=true;s.signalRhythm=rhythm;s.events.push({type:'receiver-recorded'});
        }
        if(first)say(s,'Your shots came back from behind the grate.',5);
      }else if(!s.flags.dockAnswered)say(s,'One flash for one shot. Try two or three.',4);
      rx.shots=[];rx.playAt=null;rx.nextPulse=0;
    }
  }
  const SIGNALS=[
    {id:'dock-signal',room:0,x:14,y:168,w:10,h:10,text:'The pumps are keeping something asleep.'},
    {id:'drain-signal',room:2,x:268,y:50,w:10,h:10,text:'We sealed the upper relay. It learned our signal.'},
    {id:'gantry-signal',room:4,x:48,y:154,w:10,h:10,text:'If you hear us, bring the beacon home.'}
  ];
  const VAULT_WALLS=[{x:144,y:68,w:16,h:68},{x:224,y:120,w:16,h:64}];
  const CHECKPOINTS={0:{x:48,y:GROUND_Y},1:{x:110,y:GROUND_Y},4:{x:266,y:96-ROVER_H},9:{x:100,y:GROUND_Y},11:{x:44,y:GROUND_Y},14:{x:44,y:GROUND_Y},17:{x:44,y:GROUND_Y}};
  const BEACONS={0:{x:33,y:144,w:12,h:40},1:{x:106,y:146,w:10,h:38},4:{x:318,y:60,w:6,h:36},9:{x:100,y:146,w:10,h:38},11:{x:44,y:146,w:10,h:38},14:{x:44,y:146,w:10,h:38},17:{x:44,y:146,w:10,h:38}};
  for(const room of [20,24,26]){
    CHECKPOINTS[room]={x:42,y:GROUND_Y};
    BEACONS[room]={x:42,y:146,w:10,h:38};
  }
  const overlap=(a,b)=>a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
  const near=(a,b,d=34)=>Math.hypot(a.x+a.w/2-b.x-b.w/2,a.y+a.h/2-b.y-b.h/2)<d;
  function actor(mode,x=48,y=GROUND_Y){return{x,y,w:mode==='rover'?ROVER_W:10,h:mode==='rover'?ROVER_H:16,vx:0,vy:0,face:1,aimX:1,aimY:0,grounded:false,coyote:0,jumpBuffer:0,climbing:false,wallSide:0,inv:0};}
  function maxHealth(s){return s.flags.chassis?8:6;}
  function chargeTime(s){return s.mode==='rover'&&s.flags.cooling?0.4:0.6;}
  const canopyReady=s=>CANOPY_RELAY_REQUIRED.every(id=>s.defeated.includes(id));
  function cancelCharge(s){
    // Input loss is cancellation, never the release gesture that fires a shot.
    s.charge=0;s.charging=false;
  }
  function say(s,message,time=5){s.message=message;s.messageTime=time;s.events.push({type:'message',message});}
  function roomEnemies(room,s){
    let list=[];
    if(room===0)list=[{id:'dock-beetle',kind:'beetle',x:194,y:166,w:16,h:18,hp:2,vx:-20,min:188,max:210,t:0}];
    if(room===1)list=[{id:'approach-beetle',kind:'beetle',x:268,y:166,w:16,h:18,hp:2,vx:26,min:220,max:302,t:0},{id:'approach-jelly',kind:'jelly',x:302,y:104,baseY:104,w:14,h:17,hp:2,vx:0,t:0}];
    if(room===4)list=[{id:'gantry-beetle',kind:'beetle',x:92,y:166,w:16,h:18,hp:2,vx:22,min:70,max:140,t:0},{id:'gantry-jelly',kind:'jelly',x:296,y:84,baseY:84,w:14,h:17,hp:2,vx:0,t:0}];
    if(room===5&&!s.flags.boss)list=[{id:'guardian',kind:'boss',x:278,y:144,w:48,h:40,hp:14,maxHp:14,t:0,cycle:0,phase:'idle',relay:{x:140,y:52,w:32,h:16},relayOpen:false,sweep:null,enraged:false}];
    if(room===6&&!s.flags.accessClear&&!s.flags.drained)list=[{id:'access-beetle',kind:'drone',x:186,y:158,w:14,h:14,hp:2,vx:0,t:0},{id:'access-turret',kind:'turret',x:288,y:72,w:18,h:18,hp:3,t:0,phase:'idle'}];
    if(room===8)list=[{id:'gallery-skimmer',kind:'skimmer',x:230,y:100,baseX:230,baseY:100,w:24,h:14,hp:4,t:0,phase:'float'}];
    if(room===9&&!s.flags.depotClear)list=[{id:'depot-crusher',kind:'crusher',x:250,y:140,w:52,h:44,hp:18,maxHp:18,t:0,face:-1,phase:'idle'}];
    if(room===11)list=[{id:'bypass-beetle',kind:'beetle',x:90,y:166,w:16,h:18,hp:2,vx:14,min:84,max:110,t:0},{id:'bypass-jelly',kind:'jelly',x:276,y:82,baseY:82,w:14,h:17,hp:2,t:0}];
    if(room===12)list=[{id:'bridge-skimmer',kind:'skimmer',x:278,y:100,baseX:278,baseY:100,w:24,h:14,hp:4,t:0,phase:'float'}];
    if(room===13&&!s.flags.wardenClear)list=[{id:'coolant-warden',kind:'warden',visualKind:'boss',x:278,y:144,w:48,h:40,hp:20,maxHp:20,t:0,phase:'idle',volley:'low'}];
    if(room===14)list=[{id:'canopy-beetle',kind:'beetle',x:316,y:166,w:16,h:18,hp:2,vx:18,min:300,max:334,t:0}];
    if(room===15)list=[{id:'lantern-turret',kind:'ceiling-turret',visualKind:'turret',mount:'ceiling',x:174,y:78,w:22,h:18,hp:3,t:0,phase:'idle',fireTell:false}];
    if(room===18)list=[{id:'thornwatch-left-turret',kind:'ceiling-turret',visualKind:'turret',mount:'ceiling',x:138,y:78,w:22,h:18,hp:3,t:0,phase:'idle',fireTell:false},{id:'thornwatch-right-turret',kind:'ceiling-turret',visualKind:'turret',mount:'ceiling',x:278,y:96,w:22,h:18,hp:3,t:0,phase:'idle',fireTell:false},{id:'thornwatch-beetle',kind:'beetle',x:86,y:166,w:16,h:18,hp:2,vx:16,min:76,max:106,t:0}];
    if(room===22)list=[{id:'viaduct-beetle',kind:'beetle',x:223,y:166,w:16,h:18,hp:3,vx:33,min:170,max:306,t:0}];
    if(room===24)list=[{id:'counterweight-skimmer',kind:'skimmer',x:288,y:97,baseX:288,baseY:97,w:24,h:14,hp:4,t:0,phase:'float'}];
    if(room===26||room===27&&!s.flags.bellWall){
      const elevated=room===26,feet=elevated?SOUNDING.track.y:FLOOR;
      list=[{id:elevated?'cut-bellback':'foundry-bellback',kind:'bellback',x:elevated?184:167,y:feet-13,
        w:32,h:13,hp:1,feet,face:-1,phase:'listen',phaseTime:0,targetX:null,alarm:false,t:0}];
    }
    return list.filter(e=>!s.defeated.includes(e.id));
  }
  function createGame(){
    const s={version:VERSION,mode:'rover',room:0,p:actor('rover'),parked:null,outside:null,flags:{magnet:false,drained:false,boss:false,chassis:false,accessClear:false,depotClear:false,pulseCoil:false,wardenClear:false,cooling:false,canopyRelay:false},coilSequence:0,hp:{rover:6,pilot:4},enemies:[],shots:[],pickups:[],signals:[],charge:0,charging:false,events:[],t:0,shootCooldown:0,paused:false,map:false,won:false,deaths:0,message:'Right to the lower works. For Listening Cut, take the brass gate [E] before the first block.',messageTime:8,checkpoint:0,visited:[0],defeated:[]};
    s.flags.dockAnswered=false;s.flags.dockRecorder=false;s.flags.drainCache=false;
    s.flags.repeater=false;s.flags.yardCoupler=false;s.flags.yardPower=false;s.repeater=null;s.arc=null;
    s.flags.bellWall=false;s.flags.echoLens=false;s.bellFlash=0;
    s.signalRhythm=DEFAULT_SIGNAL_RHYTHM.slice();s.receiver=newReceiver();s.puddle=null;
    s.enemies=roomEnemies(0,s);return s;
  }
  function solids(s){
    if(isInterior(s.room)){
      const walls=[{x:0,y:24,w:384,h:16},{x:0,y:200,w:384,h:16},{x:0,y:24,w:16,h:192},{x:368,y:24,w:16,h:192}];
      if(s.room===21)return walls.concat(YARD.cabinets);
      return s.room===6?walls.concat(VAULT_WALLS):walls;
    }
    const gap=s.room===12?CONDENSER_GAP:s.room===17?CANOPY_GAP:s.room===24?YARD.gap:null;
    const blocks=s.room===0?[{x:0,y:FLOOR,w:228,h:32},{x:276,y:FLOOR,w:108,h:32}]:gap?[{x:0,y:FLOOR,w:gap.x,h:32},{x:gap.x+gap.w,y:FLOOR,w:W-gap.x-gap.w,h:32}]:[{x:0,y:FLOOR,w:384,h:32}];
    if(s.room===0)blocks.push({x:136,y:160,w:48,h:24},{x:320,y:56,w:16,h:128,metal:true},{x:336,y:56,w:48,h:12,metal:true});
    if(s.room===1&&!s.flags.drained)blocks.push({x:334,y:104,w:16,h:80});
    if(s.room===2)blocks.push({x:236,y:64,w:16,h:88,metal:true},{x:252,y:64,w:80,h:10,metal:true},{x:91,y:80,w:42,h:7,metal:true});
    if(s.room===3)blocks.push({x:216,y:104,w:16,h:80,metal:true},{x:232,y:104,w:152,h:12,metal:true});
    if(s.room===4)blocks.push({x:184,y:96,w:16,h:88,metal:true},{x:200,y:96,w:184,h:12,metal:true});
    if(s.room===5)blocks.push({x:112,y:112,w:16,h:72,metal:true},{x:128,y:112,w:112,h:10,metal:true});
    if(s.room===8)blocks.push({x:120,y:146,w:48,h:10},{x:248,y:122,w:56,h:10});
    if(s.room===11)blocks.push({x:144,y:112,w:16,h:72,metal:true},{x:160,y:112,w:224,h:12,metal:true});
    if(s.room===14)blocks.push({x:168,y:160,w:44,h:24});
    if(s.room===15){blocks.push({x:154,y:66,w:62,h:12,metal:true});if(!s.defeated.includes('lantern-turret'))blocks.push({x:336,y:96,w:16,h:88});}
    if(s.room===16)blocks.push({x:156,y:108,w:16,h:76,metal:true},{x:172,y:108,w:212,h:12,metal:true});
    if(s.room===18){blocks.push({x:118,y:66,w:62,h:12,metal:true},{x:258,y:84,w:62,h:12,metal:true},{x:208,y:160,w:32,h:24});if(CANOPY_RELAY_REQUIRED.slice(1).some(id=>!s.defeated.includes(id)))blocks.push({x:336,y:96,w:16,h:88});}
    if(s.room===19&&!s.flags.canopyRelay)blocks.push({x:356,y:96,w:16,h:88});
    if(s.room===22)blocks.push({x:148,y:102,w:16,h:54,metal:true},{x:164,y:102,w:146,h:10,metal:true});
    if(s.room===23&&!s.flags.yardCoupler)blocks.push({x:342,y:92,w:16,h:92});
    if(s.room===25&&!s.flags.yardPower)blocks.push({x:350,y:92,w:16,h:92});
    if(s.room===26)blocks.push(SOUNDING.track);
    if(s.room===27&&!s.flags.bellWall)blocks.push(SOUNDING.wall);
    return blocks;
  }
  function shift(s,axis,delta,blocks){
    if(delta===0)return;
    const p=s.p;p[axis]+=delta;
    for(const b of blocks)if(overlap(p,b)){
      if(axis==='x'){p.x=delta>0?b.x-p.w:b.x+b.w;p.vx=0;}
      else if(delta>0){p.y=b.y-p.h;p.vy=0;p.grounded=true;}
      else{p.y=b.y+b.h;p.vy=0;}
    }
  }
  function activateBeacon(s,room){
    if(room===9&&!s.flags.depotClear)return;
    if(s.checkpoint===room)return;
    s.checkpoint=room;s.hp.rover=maxHealth(s);s.hp.pilot=4;
    s.events.push({type:'checkpoint'});say(s,'Service beacon active. Progress and upgrades secured.',4);
  }
  function enterRoom(s,room,x=48,y=isInterior(room)?160:GROUND_Y,mode){
    if(!Number.isInteger(room)||room<0||room>=NAMES.length)throw new Error('Unknown room');
    s.room=room;s.mode=mode||(isInterior(room)?'vault':'rover');s.p=actor(s.mode,x,y);s.enemies=roomEnemies(room,s);s.shots=[];s.pickups=[];s.charge=0;s.charging=false;
    s.receiver=newReceiver();
    s.puddle=null;
    s.bellFlash=0;
    s.repeater=null;
    s.arc=room===23&&!s.flags.yardCoupler?{phase:'idle',t:0,targetX:x,targetY:FLOOR-13,lured:false,locked:false}:null;
    if(!s.visited.includes(room))s.visited.push(room);
    s.events.push({type:'room',room});
    if(room===1){activateBeacon(s,1);say(s,s.flags.magnet?'The sump is drained. Drive right into Drain Channel.':'Cyan hatch: exit rover [E], then enter on foot [E].',7);}
    if(room===2)say(s,'Dock right. Depot and Switchyard gates [E] on the channel floor.',6);
    if(room===0&&s.flags.magnet){
      s.receiver.dockFlash=0.5;
      say(s,s.flags.dockAnswered?'The grate glows beside the striped wall.':'The receiver wakes. Try a short burst.',6);
    }
    if(room===3)say(s,'Magnetic Rise. Hold UP against striped steel; crest to the right.',6);
    if(room===4)say(s,'Upper Gantry. Climb to the beacon; optional Canopy gate [E] on the ledge.',7);
    if(room===5&&!s.flags.boss)say(s,'The Crown answers. Climb the striped steel. Watch the overhead relay.',7);
    if(room===6)say(s,s.flags.accessClear?'Service passage clear. Upper-right door leads to Pump Control.':'Face a target. Hold Fire to strafe. Clear the room to open the upper-right door.',8);
    if(room===7)say(s,'Pump Control. Use the upper-right console [E].',6);
    if(room===8)say(s,'Conveyor Gallery. Depot right; Mossworks gate [E] beneath the first belt.',7);
    if(room===9)say(s,s.flags.depotClear?'Depot secure. Cyan hatch leads to the Coil Chamber [E].':'The ram locks its direction. Jump past it, then turn on the exposed rear.',7);
    if(room===10){
      s.coilTraceStartedAt=s.t;s.coilFaultUntil=0;
      say(s,s.flags.pulseCoil?'Pulse Coil installed. Lower-left hatch returns to the depot.':'A pulse is moving through the floor cables. Latch the relays with [E].',8);
    }
    if(room===11){activateBeacon(s,11);say(s,'Mossworks beacon secured. Hold UP against the striped wall; follow its upper ledge.',7);}
    if(room===12)say(s,'Condenser Bridge: broken span ahead. Jump the gap [SPACE]; the Heart is right.',7);
    if(room===13)say(s,s.flags.cooling?'Cooling Jacket online. Return left across the broken span.':s.flags.wardenClear?'Warden silent. Install the Cooling Jacket at the right console [E].':'Jump low pulses. Release a charged shot into the open vent to interrupt the high volley.',8);
    if(room===14){activateBeacon(s,14);say(s,'Canopy beacon secured. Jump the low root [SPACE]. Lantern Shaft is right; Gantry is left.',8);}
    if(room===15)say(s,s.defeated.includes('lantern-turret')?'Lantern shutter open. Bramble Riser is right.':'Hold UP and fire to silence the ceiling clamp. Its downward flash warns a shot.',8);
    if(room===16)say(s,'Bramble Riser. Hold UP at the striped trunk; crest right onto Glassroot Span.',8);
    if(room===17){activateBeacon(s,17);say(s,'Glassroot beacon secured. Jump the broken span [SPACE] in either direction.',7);}
    if(room===18)say(s,'Thornwatch: clear the ground patrol, aim UP beneath both clamps, then cross the root.',8);
    if(room===19)say(s,s.flags.canopyRelay?'Canopy relay online. The open right passage loops to Mossworks.':'Signal Orchard. Use the relay [E] after silencing the Lantern and Thornwatch interlocks.',8);
    if(room===20){activateBeacon(s,20);say(s,s.flags.repeater?'Dispatch closed your ticket. Shunt Viaduct is right.':'Dispatch left a repeater in the booth. Park by the hatch and enter on foot [E].',7);}
    if(room===21)say(s,s.flags.repeater?'Repeater fitted. Lower-left hatch returns to your rover.':'A handset is blinking on the northeast rack. Take it [E].',7);
    if(room===22)say(s,'Patrol under the viaduct. Jump onto the striped column and hold UP to take the high road.',7);
    if(room===23)say(s,s.flags.yardCoupler?'Coupler blown. The right shutter is open.':s.flags.repeater?'Plant the repeater [Q] under the striped coupler. Drive clear before the clamp fires.':'The clamp listens for a repeater. Check the Dispatch Booth two rooms west.',8);
    if(room===24){activateBeacon(s,24);say(s,'Counterweight span is out. Drop a decoy to draw the skimmer, then jump the gap.',7);}
    if(room===25)say(s,s.flags.yardPower?'Exchange online. Right passage leads to Magnetic Rise.':'Power came back with the coupler. Throw the exchange lever [E].',7);
    if(room===26){activateBeacon(s,26);say(s,'A bellback sleeps on the rail. Fire beneath it and watch which way it runs. Foundry right.',8);}
    if(room===27)say(s,s.flags.bellWall?'The cracked wall is down. Sounding Well is east.':'It listens for your gun. From here, shoot the bronze gong beyond the sleeping bellback.',8);
    if(room===28)say(s,s.flags.echoLens?'The lift on the right returns to Service Dock [E].':'A survey lens hangs in the well. Fit it to the rover [E].',7);
    return s;
  }
  function leaveVault(s){
    const outside=s.outside;
    if(!outside){recover(s);return;}
    // Return beside the parked vehicle's center so the next E boards it,
    // rather than choosing the nearby hatch again after a large-rover dismount.
    const x=s.parked?s.parked.x+s.parked.w/2-5:Math.max(2,outside.x-18);
    const y=s.parked?s.parked.y+s.parked.h-16:outside.y;
    enterRoom(s,outside.room,x,y,'pilot');s.outside=null;
    say(s,'Back outside. Board your parked rover [E].',5);
  }
  function interact(s){
    const p=s.p;
    s.charge=0;s.charging=false;
    if(s.mode==='vault'){
      if(near(p,DOOR,29)){
        if(s.room===7)enterRoom(s,6,310,50,'vault');else leaveVault(s);
        return;
      }
      if(s.room===6&&near(p,INNER_DOOR,35)){
        if(!s.flags.accessClear&&!s.flags.drained){say(s,'Door interlock: clear Service Access first.');return;}
        enterRoom(s,7,44,160,'vault');return;
      }
      if(s.room===7&&near(p,CONSOLE,35)){
        if(!s.flags.magnet||!s.flags.drained){
          s.flags.magnet=true;s.flags.drained=true;s.flags.accessClear=true;s.hp.pilot=4;
          s.events.push({type:'upgrade'});say(s,'MAGNETIC WHEELS installed. Sump drained. Return through both rooms.',8);
        }else say(s,'Pumps online. Lower-left door returns to Service Access.');
      }
      if(s.room===21&&near(p,YARD.rack,30)){
        if(!s.flags.repeater){
          s.flags.repeater=true;
          s.events.push({type:'upgrade',id:'repeater',x:YARD.rack.x+11,y:YARD.rack.y+12});
          say(s,'SIGNAL REPEATER fitted. Tap [Q] to leave a six-second decoy. The kiln clamp follows its call.',9);
        }else say(s,'Handset paired. Try the repeater [Q]. Lower-left hatch returns to the rover.');
        return;
      }
      if(s.room===10){
        const node=COIL_NODES.find(n=>near(p,n,29));
        if(node){
          if(s.coilSequence===3){say(s,'Relays aligned. Use the central console [E].');return;}
          if(node.id===COIL_NODES[s.coilSequence].id){
            s.coilSequence++;s.events.push({type:'relay',x:node.x+node.w/2,y:node.y+node.h/2,index:s.coilSequence});
            s.coilFaultUntil=0;
            say(s,s.coilSequence===3?'All three relays aligned. Use the central console [E].':'Relay latched. '+s.coilSequence+'/3 holding.');
          }else{
            s.coilFaultUntil=s.t+.8;s.coilFaultNode=COIL_NODES.indexOf(node);s.coilTraceStartedAt=s.t;
            say(s,'Open circuit. Follow the pulse from the socket. Latched relays hold.');
          }
          return;
        }
        if(near(p,COIL_CONSOLE,32)){
          if(s.coilSequence<3){s.coilTraceStartedAt=s.t;s.coilFaultUntil=0;say(s,'Test cycle restarted. Follow the current to each relay.');return;}
          if(!s.flags.pulseCoil){s.flags.pulseCoil=true;s.events.push({type:'upgrade'});say(s,'PULSE COIL installed. Charged shots deal four damage and burst on impact.',8);}
          else say(s,'Pulse Coil installed. Return through the lower-left hatch.');
        }
      }
      return;
    }
    if(s.mode==='pilot'){
      if(s.room===0&&s.flags.dockAnswered&&p.y+p.h>160){
        const center=p.x+p.w/2;
        if(p.x>=336){
          if(center>=352){
            if(!s.flags.dockRecorder){
              s.flags.dockRecorder=true;s.hp.rover=maxHealth(s);s.hp.pilot=4;
              s.events.push({type:'upgrade',id:'dock-recorder',x:DOCK_RECORDER.x+8,y:DOCK_RECORDER.y+8});
              say(s,'Hull repaired. Tape: "The Crown warns in your rhythm."',8);
            }else say(s,'Tape recovered. Return through the left grate.',5);
          }else{
            s.p=actor('pilot',297,FLOOR-16);
            say(s,'Back outside. Board your rover [E].',5);
          }
          return;
        }
        if(center>=307&&p.x+p.w<=320){
          s.p=actor('pilot',337,FLOOR-16);
          say(s,'Inside the wall. Check the tape deck on the right [E].',5);
          return;
        }
      }
      const hatch=s.room===20?YARD.hatch:s.room===9?DEPOT_HATCH:HATCH;
      const roverIsCloser=s.parked&&near(p,s.parked,46)&&Math.abs(p.x+p.w/2-s.parked.x-s.parked.w/2)<Math.abs(p.x+p.w/2-hatch.x-hatch.w/2);
      if((s.room===1||s.room===9||s.room===20)&&near(p,hatch,32)&&!roverIsCloser){
        if(s.room===9&&!s.flags.depotClear){say(s,'Depot hatch sealed. Defeat the Rustlung Crusher first.');return;}
        s.outside={room:s.room,x:p.x,y:p.y};enterRoom(s,s.room===20?21:s.room===9?10:6,44,160,'vault');return;
      }
      if(s.parked&&near(p,s.parked,46)){
        const parked=s.parked;s.parked=null;s.mode='rover';s.p=actor('rover',parked.x,parked.y);
        s.events.push({type:'board'});say(s,s.room===9?'Rover online. Left through the gallery returns to Drain Channel.':s.room===0&&s.flags.magnet?'Rover online. Climb the striped wall to reach the upper route.':s.flags.magnet?'Rover online. Take the drained route right to Dock.':'Rover online.');
      }
      return;
    }
    if(!p.grounded){say(s,'Park on solid ground before exiting.');return;}
    if(s.room===0&&near(p,SOUNDING.entry,22)){
      enterRoom(s,26,16,GROUND_Y);return;
    }
    if(s.room===27&&near(p,SOUNDING.bell,34)){ringBell(s);return;}
    if(s.room===28&&near(p,SOUNDING.lens,32)){
      if(!s.flags.echoLens&&s.flags.bellWall){
        s.flags.echoLens=true;s.hp.rover=maxHealth(s);
        s.events.push({type:'upgrade',id:'echo-lens',x:264,y:157});
        say(s,'ECHO LENS fitted. Watch for echoes at unexplored gates and missing caches. Lift right.',9);
      }else say(s,'The lift at the east wall returns to Service Dock.',5);
      return;
    }
    if(s.room===28&&near(p,SOUNDING.lift,28)){
      if(!s.flags.echoLens){say(s,'Fit the lens at the well first [E].');return;}
      enterRoom(s,0,85,GROUND_Y);activateBeacon(s,0);
      say(s,'Back at Service Dock. Your lens picks up the lower shaft.',6);return;
    }
    if(s.room===2&&near(p,YARD.entry,30)){
      if(!s.flags.drained||!s.flags.magnet){say(s,'Switchyard track is flooded. Restart the pumps.');return;}
      enterRoom(s,20,20,GROUND_Y);return;
    }
    if(s.room===3&&near(p,YARD.returnGate,30)){
      if(!s.flags.yardPower){say(s,'Switchyard shutter locked. Turn on the Night Exchange from Drain Channel.');return;}
      enterRoom(s,25,W-ROVER_W-4,GROUND_Y);return;
    }
    if(s.room===25&&near(p,YARD.exchange,35)){
      if(!s.flags.yardCoupler){say(s,'Break the Arc Kiln coupler to power the exchange.');return;}
      if(!s.flags.yardPower){
        s.flags.yardPower=true;s.hp.rover=maxHealth(s);s.hp.pilot=4;
        s.events.push({type:'upgrade',id:'yard-power',x:YARD.exchange.x+11,y:YARD.exchange.y+15});
        say(s,'NIGHT EXCHANGE online. Hull repaired. Six-second decoy boosted to ten. Magnetic Rise is right.',9);
      }else say(s,'Exchange online. Magnetic Rise is right.');
      return;
    }
    if(s.room===4&&near(p,CANOPY_GATE,31)){
      if(!s.flags.magnet||!s.flags.drained){say(s,'The Canopy lift needs restored pumps and magnetic wheels.');return;}
      enterRoom(s,14,24,GROUND_Y);return;
    }
    if(s.room===11&&near(p,CANOPY_MOSS_GATE,31)){
      if(!s.flags.canopyRelay){say(s,'Canopy shutter offline. Restore its relay from the Upper Gantry route.');return;}
      enterRoom(s,19,W-ROVER_W-4,GROUND_Y);return;
    }
    if(s.room===19&&near(p,CANOPY_RELAY,35)){
      if(!canopyReady(s)){say(s,'Relay interlock: silence the Lantern clamp and the Thornwatch patrol first.');return;}
      if(!s.flags.canopyRelay){s.flags.canopyRelay=true;s.hp.rover=maxHealth(s);s.hp.pilot=4;s.events.push({type:'upgrade',id:'canopy-relay',x:CANOPY_RELAY.x+CANOPY_RELAY.w/2,y:CANOPY_RELAY.y+CANOPY_RELAY.h/2});say(s,'CANOPY RELAY online. Hull repaired. Right passage now loops to Mossworks and back.',9);}
      else say(s,'Canopy shortcut online. Mossworks is right; the Gantry route is left.');
      return;
    }
    if(s.room===2&&near(p,DEPOT_GATE,32)){
      if(!s.flags.drained){say(s,'Depot access needs the restored pumps.');return;}
      enterRoom(s,8,24,GROUND_Y);return;
    }
    if(s.room===8&&near(p,MOSS_GATE,32)){
      if(!s.flags.magnet||!s.flags.drained){say(s,'Mossworks access requires restored pumps and magnetic wheels.');return;}
      enterRoom(s,11,24,GROUND_Y);return;
    }
    if(s.room===13&&near(p,COOLING_CONSOLE,34)){
      if(!s.flags.wardenClear){say(s,'Cooling console sealed. Silence the Condenser Warden first.');return;}
      if(!s.flags.cooling){s.flags.cooling=true;s.hp.rover=maxHealth(s);s.events.push({type:'upgrade'});say(s,'COOLING JACKET installed. Charge in 0.4 seconds; rover cannon cycles faster.',8);}
      else say(s,'Cooling Jacket online. Return left across the broken span.');
      return;
    }
    const parked={x:p.x,y:p.y,w:p.w,h:p.h};
    if(s.room===0&&s.flags.drained&&p.x>=276&&p.x+p.w<=320&&p.y===GROUND_Y){
      s.parked=parked;s.mode='pilot';s.p=actor('pilot',304,FLOOR-16);
      s.events.push({type:'board'});say(s,s.flags.dockAnswered?'The grate is just wide enough. Enter on foot [E].':'The grate is quiet. Try your rover cannon.',5);
      return;
    }
    const candidates=[p.x+p.w+4,p.x-14].map(x=>actor('pilot',x,p.y+p.h-16));
    const spawn=candidates.find(c=>c.x>=2&&c.x+c.w<=W-2&&!solids(s).some(b=>overlap(c,b)));
    if(!spawn){say(s,'Not enough room to exit here.');return;}
    s.parked=parked;s.mode='pilot';s.p=spawn;s.events.push({type:'board'});say(s,'On foot. [E] enters hatches or boards your rover.');
  }
  function recover(s){
    if(s.checkpoint===24&&!s.flags.yardCoupler)s.checkpoint=20;
    if((s.checkpoint===20||s.checkpoint===24)&&(!s.flags.magnet||!s.flags.drained))s.checkpoint=1;
    if((s.checkpoint===14||s.checkpoint===17)&&(!s.flags.magnet||!s.flags.drained))s.checkpoint=1;
    if(s.checkpoint===17&&!s.defeated.includes('lantern-turret'))s.checkpoint=14;
    if(s.checkpoint===11&&(!s.flags.magnet||!s.flags.drained))s.checkpoint=1;
    if(s.checkpoint===9&&!s.flags.depotClear)s.checkpoint=s.flags.magnet&&s.flags.drained?4:1;
    if(s.checkpoint===4&&(!s.flags.magnet||!s.flags.drained))s.checkpoint=1;
    const position=CHECKPOINTS[s.checkpoint]||CHECKPOINTS[0];
    s.parked=null;s.outside=null;s.hp={rover:maxHealth(s),pilot:4};s.won=false;s.paused=false;s.map=false;s.shootCooldown=0;
    enterRoom(s,CHECKPOINTS[s.checkpoint]?s.checkpoint:0,position.x,position.y,'rover');s.p.inv=1.2;
    say(s,'Recovered at service beacon. Installed upgrades retained.',5);return s;
  }
  function damage(s,amount=1){
    if(s.p.inv>0||s.won)return false;
    const key=s.mode==='rover'?'rover':'pilot';s.hp[key]-=amount;s.p.inv=1.1;s.charge=0;s.charging=false;s.events.push({type:'hurt',x:s.p.x+s.p.w/2,y:s.p.y+s.p.h/2,amount});
    if(s.hp[key]<=0){s.deaths++;recover(s);s.events.push({type:'death'});return true;}
    return false;
  }
  function muzzle(s){
    const p=s.p;
    if(s.mode==='rover'&&p.climbing){
      const right=p.wallSide>0;
      return{x:p.x+(right?p.w-ROVER_MUZZLE_HEIGHT:ROVER_MUZZLE_HEIGHT),y:p.y+p.h/2-ROVER_MUZZLE_X,dx:0,dy:-1};
    }
    if(s.mode==='rover'&&p.aimY<0)return{x:p.x+17,y:p.y-21,dx:0,dy:-1};
    if(s.mode==='rover')return{x:p.x+p.w/2+p.face*ROVER_MUZZLE_X,y:p.y+p.h-ROVER_MUZZLE_HEIGHT,dx:p.face,dy:0};
    const dx=s.mode==='vault'?p.aimX:p.face,dy=s.mode==='vault'?p.aimY:0;
    // The side-view Warped Caves weapon sits fourteen pixels above the feet.
    // Overhead firing retains its four-direction center/edge origins.
    return{x:p.x+p.w/2+dx*p.w/2,y:s.mode==='pilot'?p.y+p.h-14:p.y+p.h/2+dy*p.h/2,dx,dy};
  }
  function fire(s,charged=false){
    listenToShot(s);
    const origin=muzzle(s),{dx,dy}=origin;
    const w=charged?8:4,h=charged?6:4,speed=charged?260:225;
    const x=origin.x-w/2,y=origin.y-h/2;
    s.shots.push({x,y,w,h,vx:dx*speed,vy:dy*speed,life:1.7,enemy:false,charged,damage:charged?(s.flags.pulseCoil?4:3):1,shockwave:charged&&s.flags.pulseCoil});
    s.shootCooldown=charged?(s.flags.cooling&&s.mode==='rover'?0.32:0.42):s.mode==='rover'?(s.flags.cooling?0.14:0.18):0.23;s.events.push({type:charged?'charge-shot':'shot',x:x+w/2,y:y+h/2,dx,dy});
  }
  function enemyShot(s,e,dx,dy,speed=90,conductive=false){const x=e.x+e.w/2,y=e.y+e.h/2;s.shots.push({x,y,w:5,h:5,vx:dx*speed,vy:dy*speed,life:4,enemy:true,conductive});s.events.push({type:'enemy-shot',x,y});}
  function updateRepeater(s,dt,deploy){
    if(deploy&&s.flags.repeater){
      const p=s.p;
      if(s.mode==='vault'||p.grounded){
        s.repeater={x:p.x+p.w/2,y:p.y+p.h-4,life:s.flags.yardPower?10:6,flash:0,next:0,cycleAt:s.t};
      }else say(s,'Place the repeater on solid ground.',2);
    }
    const unit=s.repeater;
    if(!unit)return;
    unit.life-=dt;
    if(unit.life<=0){s.repeater=null;return;}
    unit.flash=Math.max(0,unit.flash-dt);
    const rhythm=s.signalRhythm;
    if(s.t-unit.cycleAt+1e-8<rhythm[unit.next])return;
    unit.flash=.16;
    s.events.push({type:'repeater-pulse',x:unit.x,y:unit.y,index:unit.next});
    if(++unit.next===rhythm.length){
      unit.next=0;unit.cycleAt+=rhythm[rhythm.length-1]+1.12;
    }
  }
  function updateKiln(s,dt){
    const arc=s.arc;
    if(!arc)return;
    arc.t+=dt;
    if(arc.phase!=='tell'){
      if(arc.t<(arc.phase==='idle'?.75:1.35))return;
      arc.phase='tell';arc.t=0;arc.locked=false;
    }
    if(!arc.locked){
      arc.lured=!!s.repeater;
      arc.targetX=s.repeater?s.repeater.x:s.p.x+s.p.w/2;
      arc.targetY=s.repeater?s.repeater.y-18:s.p.y+s.p.h/2;
      if(arc.t>=.55){
        arc.locked=true;
        s.events.push({type:'arc-lock',x:arc.targetX,y:arc.targetY,lured:arc.lured});
      }
    }
    if(arc.t<1.1)return;
    const {x,y}=YARD.emitter,dx=arc.targetX-x,dy=arc.targetY-y,length=Math.hypot(dx,dy)||1;
    s.shots.push({x:x-2.5,y:y-2.5,w:5,h:5,vx:205*dx/length,vy:205*dy/length,life:3,enemy:true,arc:true,lured:arc.lured});
    s.events.push({type:'arc-fire',x,y,lured:arc.lured});
    arc.phase='cooldown';arc.t=0;
  }
  function fireJellyBolt(s,e){
    const conductive=s.room===1&&!s.flags.drained;
    let dx=s.p.x-e.x,dy=s.p.y-e.y;
    if(s.repeater){
      dx=s.repeater.x-(e.x+e.w/2+2.5);
      dy=s.repeater.y-(e.y+e.h/2+2.5);
    }else if(conductive){
      // When the pilot hangs back by the hatch, the jelly feeds into the water.
      // In range it aims at the player's feet. A dodge lets the bolt reach the water.
      const feet=s.p.x+s.p.w/2;
      const target=feet<APPROACH_PUDDLE.left?(APPROACH_PUDDLE.left+APPROACH_PUDDLE.right)/2:feet;
      dx=target-(e.x+e.w/2+2.5);
      dy=(feet<APPROACH_PUDDLE.left?FLOOR:s.p.y+s.p.h)-(e.y+e.h/2+2.5);
    }
    const length=Math.hypot(dx,dy)||1;
    enemyShot(s,e,dx/length,dy/length,68,conductive);
  }
  function inPuddle(actor){
    const feet=actor.x+actor.w/2;
    return actor.y+actor.h>=FLOOR-1&&feet>=APPROACH_PUDDLE.left&&feet<=APPROACH_PUDDLE.right;
  }
  function updatePuddle(s,dt){
    if(!s.puddle)return;
    if(s.flags.drained){s.puddle=null;return;}
    const pool=s.puddle,previous=pool.age;
    pool.age+=dt;
    if(previous<APPROACH_PUDDLE.warning&&pool.age>=APPROACH_PUDDLE.warning){
      for(const e of s.enemies){
        if(e.kind==='beetle'&&inPuddle(e))e.stunUntil=s.t+1.35;
      }
      if(inPuddle(s.p)&&s.p.grounded){
        s.p.stunUntil=s.t+0.38;s.p.vx=0;s.p.jumpBuffer=0;cancelCharge(s);
      }
      s.events.push({type:'puddle-surge',x:(APPROACH_PUDDLE.left+APPROACH_PUDDLE.right)/2,y:FLOOR});
    }
    if(pool.age>=APPROACH_PUDDLE.warning+APPROACH_PUDDLE.afterglow)s.puddle=null;
  }
  function ringBell(s,charged=false){
    // A struck bell rings across the room. Automatic fire can't retrigger its attack every frame.
    if(s.bellFlash>.96)return;
    s.bellFlash=1.25;
    s.events.push({type:'bell-ring',x:SOUNDING.bell.x+8,y:SOUNDING.bell.y+10,charged});
  }
  function updateBellback(s,e,dt){
    e.phaseTime+=dt;
    if(e.phase==='listen'){
      const gong=s.room===27&&s.bellFlash>0;
      const noise=s.events.find(v=>v.type==='repeater-pulse')||
        s.events.find(v=>(v.type==='shot'||v.type==='charge-shot')&&Math.abs(v.x-e.x-e.w/2)<106);
      if(!gong&&!noise||s.room===27&&s.flags.bellWall)return;
      e.targetX=gong?SOUNDING.bell.x+8:noise.x;
      e.face=Math.sign(e.targetX-e.x-e.w/2)||e.face;
      e.phase='tell';e.phaseTime=0;e.alarm=true;e.h=24;e.y=e.feet-e.h;
      s.events.push({type:'bell-lock',x:e.x+e.w/2,y:e.y+5,dir:e.face,targetX:e.targetX});
      return;
    }
    if(e.phase==='tell'){
      if(e.phaseTime<.70)return;
      e.phase='rush';e.phaseTime=0;
    }
    if(e.phase==='rush'){
      const raised=s.room===26;
      const min=raised?SOUNDING.track.x+2:12,max=raised?SOUNDING.track.x+SOUNDING.track.w-e.w-2:W-e.w-12;
      const stop=Math.max(min,Math.min(max,e.targetX-e.w/2+e.face*55));
      const next=e.x+e.face*218*dt;
      e.x=e.face>0?Math.min(stop,next):Math.max(stop,next);
      const smash=!raised&&!s.flags.bellWall&&e.face>0&&e.x+e.w>=SOUNDING.wall.x;
      if(smash){
        e.x=SOUNDING.wall.x-e.w;s.flags.bellWall=true;
        s.events.push({type:'bell-break',x:SOUNDING.wall.x+6,y:FLOOR-16});
        say(s,'The bellback broke the casting. Sounding Well is through the breach.',6);
      }
      if(smash||e.x===stop){e.phase='stun';e.phaseTime=0;e.alarm=false;e.h=13;e.y=e.feet-e.h;}
      return;
    }
    if(e.phaseTime>=1.25){e.phase='listen';e.phaseTime=0;e.targetX=null;}
  }
  function hitOptionalBoss(s,e,shot){
    // A shot travelling in the ram's direction reaches its rear first.
    const rear=e.kind==='crusher'&&e.phase==='stunned'&&Math.sign(shot.vx)===e.face&&shot.y+shot.h>=e.y+21&&shot.y<e.y+36;
    if(rear){shot.damage=(shot.damage||1)*2;return true;}
    if(e.kind==='warden'&&e.venting&&shot.charged&&shot.vx>0&&shot.y+shot.h>=e.y+18&&shot.y<e.y+32){
      shot.damage*=2;e.interrupted=true;e.venting=false;
      s.events.push({type:'relay',x:e.x,y:e.y+24,interrupted:'warden'});return true;
    }
    s.events.push({type:'impact',material:'metal',armor:true,charged:!!shot.charged,x:shot.x+shot.w/2,y:shot.y+shot.h/2,dx:Math.sign(shot.vx),dy:Math.sign(shot.vy)});
    return false;
  }
  function updateGuardian(s,e,dt){
    const rhythm=s.signalRhythm;
    const warningStart=0.65;
    const sweepStart=warningStart+rhythm[rhythm.length-1]+0.72;
    const openStart=sweepStart+1.6,closeTime=openStart+1.7;
    const period=closeTime+0.7;
    const cycle=Math.floor(e.t/period),time=e.t-cycle*period,previous=time-dt;
    if(cycle!==e.cycle){
      e.cycle=cycle;
      e.relay.x=cycle%2===0?140:198;
      // A mid-window hit cannot introduce a second attack without its warning.
      e.enraged=e.hp<=e.maxHp/2;
    }
    e.relayOpen=time>=openStart&&time<closeTime;
    e.phase=e.relayOpen?'exposed':time>=sweepStart&&time<openStart?'attack':time>=warningStart&&time<sweepStart?'tell':'idle';
    e.fireTell=false;
    for(const offset of rhythm){
      const onset=warningStart+offset;
      if(time>=onset&&time<onset+0.14)e.fireTell=true;
      if(previous<onset&&time>=onset)s.events.push({type:'guardian-pulse',x:e.relay.x+e.relay.w/2,y:e.relay.y+e.relay.h/2});
    }
    if(previous<openStart&&time>=openStart)s.events.push({type:'guardian-open',x:e.relay.x+e.relay.w/2,y:e.relay.y+e.relay.h/2});
    if(previous<sweepStart&&time>=sweepStart)s.events.push({type:'guardian-sweep',x:W,y:FLOOR-12,high:false});
    if(e.enraged&&previous<openStart&&time>=openStart)s.events.push({type:'guardian-sweep',x:0,y:104,high:true});
    e.returnTell=e.enraged&&time>=openStart-0.85&&time<openStart;
    e.sweep=null;
    if(time>=sweepStart&&time<openStart){
      e.sweep={x:W-(W+20)*(time-sweepStart)/1.6,y:FLOOR-22,w:20,h:22,high:false};
    }else if(e.enraged&&time>=openStart&&time<openStart+1.6){
      e.sweep={x:-20+(W+20)*(time-openStart)/1.6,y:100,w:20,h:12,high:true};
    }
    return e.sweep&&overlap(e.sweep,s.p)&&damage(s);
  }
  function updateEnemies(s,dt){
    for(const e of s.enemies){
      e.t+=dt;e.hitTimer=Math.max(0,(e.hitTimer||0)-dt);
      if(e.kind==='bellback'){
        updateBellback(s,e,dt);
        if(e.phase==='rush'&&overlap(s.p,e)&&damage(s))return true;
        continue;
      }
      if(e.stunUntil>s.t){e.phase='stunned';continue;}
      if(e.kind==='beetle'){e.phase=e.t%2.8>2.3?'tell':'patrol';e.x+=e.vx*dt;if(e.x<e.min||e.x>e.max){e.x=Math.max(e.min,Math.min(e.max,e.x));e.vx*=-1;}}
      if(e.kind==='jelly'){
        e.phase=e.t%2.8>2.25?'tell':'float';
        e.y=(e.baseY||104)+Math.sin(e.t*2)*13;
        if(Math.floor((e.t-dt)/2.8)!==Math.floor(e.t/2.8))fireJellyBolt(s,e);
      }
      if(e.kind==='skimmer'){
        const cycle=e.t%3.6,previous=(e.t-dt)%3.6;
        e.phase=cycle<1.8?'float':cycle<2.45?'tell':'attack';
        if(cycle<1.8){e.x+=(e.baseX-e.x)*Math.min(1,dt*3);e.y=e.baseY+Math.sin(e.t*2.5)*8;}
        else if(cycle<2.45){
          e.y=e.baseY;
          if(previous<1.8){
            const target=s.repeater?s.repeater.x-e.w/2:s.p.x;
            const leftLimit=s.room===24&&!s.repeater?YARD.gap.x:35;
            e.targetX=Math.max(leftLimit,Math.min(330,target));
          }
        }
        else if(cycle<3.05){e.x+=(e.targetX-e.x)*Math.min(1,dt*4);e.y=Math.min(FLOOR-e.h,e.y+125*dt);}
        else e.y=Math.max(e.baseY,e.y-145*dt);
      }
      if(e.kind==='drone'){
        e.phase='chase';
        const target=s.repeater||s.p;
        const dx=target.x-e.x,dy=target.y-e.y,n=Math.hypot(dx,dy)||1,ox=e.x,oy=e.y;
        e.x+=dx/n*21*dt;if(solids(s).some(b=>overlap(e,b)))e.x=ox;
        e.y+=dy/n*21*dt;if(solids(s).some(b=>overlap(e,b)))e.y=oy;
      }
      if(e.kind==='turret'){
        const cycle=e.t%2.4;e.phase=cycle>1.7?'tell':'idle';
        if(Math.floor((e.t-dt)/2.4)!==Math.floor(e.t/2.4))enemyShot(s,e,-1,0,85);
      }
      if(e.kind==='ceiling-turret'){
        const cycle=e.t%2.8;e.fireTell=cycle>=2.1;e.phase=e.fireTell?'tell':'idle';
        if(Math.floor((e.t-dt)/2.8)!==Math.floor(e.t/2.8))enemyShot(s,{x:e.x+e.w/2-2.5,y:e.y+e.h,w:0,h:0},0,1,92);
      }
      if(e.kind==='boss'&&updateGuardian(s,e,dt))return true;
      if(e.kind==='crusher'){
        const cycle=e.t%7.8,previous=(e.t-dt)%7.8;
        e.fireTell=cycle>=1.3&&cycle<1.9;
        if(cycle<2.3||cycle>=6.5){
          e.phase='idle';e.x+=Math.max(-70*dt,Math.min(70*dt,232-e.x));
          e.face=s.p.x+s.p.w/2<e.x+e.w/2?-1:1;
        }else if(cycle<3){
          // Commit the direction before the ram drops its nose.
          e.phase='tell';
        }else{
          const stop=e.face<0?12:W-e.w-12,atWall=e.x===stop;
          e.x+=Math.max(-315*dt,Math.min(315*dt,stop-e.x));
          e.phase=e.x===stop?'stunned':'attack';
          if(!atWall&&e.phase==='stunned')s.events.push({type:'impact',material:'metal',x:e.face<0?e.x:e.x+e.w,y:FLOOR-10,dx:e.face,dy:0,ram:true});
        }
        e.h=e.phase==='attack'?16:44;e.y=FLOOR-e.h;
        if(previous<1.9&&cycle>=1.9)enemyShot(s,{...e,y:158,h:20},e.face,0,100);
      }
      if(e.kind==='warden'){
        const cycle=e.t%4.8,previous=(e.t-dt)%4.8;
        e.enraged=e.hp<=10;e.volley=cycle<3.2?'low':'high';
        if(cycle<previous)e.interrupted=false;
        e.fireTell=cycle>=1.2&&cycle<1.9||!e.interrupted&&cycle>=3.2&&cycle<3.8;
        e.phase=e.fireTell?'tell':cycle>=1.9&&cycle<2.25||cycle>=3.8&&cycle<4.15?'attack':'idle';
        e.venting=!e.interrupted&&cycle>=2.25&&cycle<3.2;
        if(previous<1.9&&cycle>=1.9)enemyShot(s,{...e,y:160,h:20},-1,0,112);
        if(!e.interrupted&&previous<3.8&&cycle>=3.8)enemyShot(s,{...e,y:134,h:20},-1,0,100);
        if(e.enraged&&!e.interrupted&&previous<4.0&&cycle>=4.0)enemyShot(s,{...e,y:134,h:20},-1,0,112);
      }
      if(overlap(s.p,e)&&damage(s))return true;
    }
    return false;
  }
  function updateShots(s,dt){
    const blocks=solids(s);
    function burst(shot,target){
      if(!shot.shockwave)return;
      const x=shot.x+shot.w/2,y=shot.y+shot.h/2,radius=26;
      s.events.push({type:'shockwave',x,y,radius});
      for(const e of s.enemies)if(e!==target&&e.kind!=='boss'&&e.kind!=='crusher'&&e.kind!=='warden'&&e.kind!=='bellback'&&e.hp>0&&Math.hypot(e.x+e.w/2-x,e.y+e.h/2-y)<=radius){
        e.hp-=2;e.hitTimer=0.12;s.events.push({type:'hit',x:e.x+e.w/2,y:e.y+e.h/2,damage:2,kind:e.kind,material:e.kind==='jelly'?'organic':'metal',charged:true,splash:true});
      }
    }
    for(const shot of s.shots){
      shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;shot.life-=dt;
      if(s.room===27&&!shot.enemy&&overlap(shot,SOUNDING.bell)){shot.life=0;ringBell(s,!!shot.charged);continue;}
      if(s.arc&&overlap(shot,YARD.coupler)){
        shot.life=0;
        if(shot.arc&&shot.lured){
          s.flags.yardCoupler=true;s.arc=null;
          const x=YARD.coupler.x+8,y=YARD.coupler.y+12;
          s.events.push({type:'yard-break',x,y},{type:'upgrade',id:'yard-coupler',x,y});
          say(s,'Coupler blown. The right shutter just lifted.',6);
        }else s.events.push({type:'impact',material:'metal',x:shot.x+2,y:shot.y+2,dx:Math.sign(shot.vx),dy:Math.sign(shot.vy),enemy:!!shot.enemy});
        continue;
      }
      const surface=shot.life>0?blocks.find(b=>overlap(shot,b)):null;
      if(surface){
        shot.life=0;
        const strikeX=shot.x+shot.w/2;
        if(shot.conductive&&s.room===1&&!s.flags.drained&&surface.y===FLOOR&&strikeX>=APPROACH_PUDDLE.left&&strikeX<=APPROACH_PUDDLE.right){
          if(!s.puddle){s.puddle={x:strikeX,age:0};s.events.push({type:'puddle-charge',x:strikeX,y:FLOOR});}
          continue;
        }
        s.events.push({type:'impact',x:shot.x+shot.w/2,y:shot.y+shot.h/2,dx:Math.sign(shot.vx),dy:Math.sign(shot.vy),material:surface.metal||isInterior(s.room)?'metal':'masonry',charged:!!shot.charged,enemy:!!shot.enemy});
        burst(shot);
      }
      if(shot.life<=0)continue;
      if(shot.enemy){if(overlap(shot,s.p)){shot.life=0;if(damage(s))return;}}
      else for(const e of s.enemies){
        const relayContact=e.kind==='boss'&&overlap(shot,e.relay);
        if(e.hp<=0||!relayContact&&!overlap(shot,e))continue;
        shot.life=0;
        const x=shot.x+shot.w/2,y=shot.y+shot.h/2,dx=Math.sign(shot.vx),dy=Math.sign(shot.vy);
        if(e.kind==='bellback'||e.kind==='boss'&&!(relayContact&&e.relayOpen)){
          s.events.push({type:'impact',x,y,dx,dy,material:'metal',charged:!!shot.charged,enemy:false});
          burst(shot,e);break;
        }
        if((e.kind==='crusher'||e.kind==='warden')&&!hitOptionalBoss(s,e,shot)){burst(shot,e);break;}
        e.hp-=shot.damage||1;e.hitTimer=0.12;
        s.events.push({type:'hit',x,y,dx,dy,damage:shot.damage||1,kind:e.kind,material:e.kind==='jelly'?'organic':'metal',charged:!!shot.charged});
        burst(shot,e);break;
      }
    }
    for(const e of s.enemies)if(e.hp<=0){
      if(e.id&&!s.defeated.includes(e.id))s.defeated.push(e.id);
      s.events.push({type:'destroy',x:e.x+e.w/2,y:e.y+e.h/2,kind:e.kind,material:e.kind==='jelly'?'organic':'metal',size:Math.max(e.w,e.h)});
      if(e.kind!=='boss')s.pickups.push({id:'repair-'+(e.id||s.t),kind:'repair',room:s.room,x:e.x+e.w/2-4,y:e.kind==='ceiling-turret'?FLOOR-8:e.y+e.h/2-4,w:8,h:8,amount:1,life:14});
      if(e.kind==='boss'){s.flags.boss=true;s.won=true;say(s,'RELAY RESTORED. Press E to keep exploring.',12);s.events.push({type:'win'});}
      if(e.kind==='crusher'){s.flags.depotClear=true;activateBeacon(s,9);s.events.push({type:'upgrade'});say(s,'CRUSHER SILENCED. Depot beacon secured. Park by the cyan hatch and enter [E].',9);}
      if(e.kind==='warden'){s.flags.wardenClear=true;s.events.push({type:'upgrade'});say(s,'CONDENSER WARDEN silent. Cooling Jacket console unlocked on the right [E].',8);}
    }
    // Upward aiming can put a real muzzle above the original fixed HUD line.
    // Retain that shot through the camera's upper margin, then cull it off-world.
    s.enemies=s.enemies.filter(e=>e.hp>0);s.shots=s.shots.filter(q=>q.life>0&&q.x>-20&&q.x<404&&q.y>-96&&q.y<216);
    if(s.room===6&&!s.flags.accessClear&&s.enemies.length===0){s.flags.accessClear=true;s.events.push({type:'upgrade'});say(s,'Service Access clear. Upper-right door [E] leads to Pump Control.',7);}
  }
  function updateCollectibles(s,dt){
    if(s.mode==='rover')for(const signal of SIGNALS)if(signal.room===s.room&&!s.signals.includes(signal.id)&&overlap(s.p,signal)){
      s.signals.push(signal.id);s.events.push({type:'signal',x:signal.x+signal.w/2,y:signal.y+signal.h/2,id:signal.id,count:s.signals.length});
      say(s,'SIGNAL '+s.signals.length+'/3: '+signal.text,7);
    }
    const key=s.mode==='rover'?'rover':'pilot',max=key==='rover'?maxHealth(s):4;
    for(const item of s.pickups){
      item.life-=dt;
      if(item.room===s.room&&s.hp[key]<max&&overlap(s.p,item)){
        const restored=Math.min(item.amount,max-s.hp[key]);s.hp[key]+=restored;item.life=0;
        s.events.push({type:'repair',x:item.x+item.w/2,y:item.y+item.h/2,amount:restored});
      }
    }
    s.pickups=s.pickups.filter(item=>item.life>0);
  }
  function sideTransitions(s,dx){
    const p=s.p;
    if(p.y>202){
      if(s.mode==='rover'&&s.room===0){enterRoom(s,1,42,GROUND_Y);return true;}
      if(s.room===12||s.room===17||s.room===24){s.deaths++;recover(s);s.events.push({type:'death'});return true;}
      recover(s);return true;
    }
    if(p.x<0){
      if(s.mode==='rover'){
        if(s.room===26){enterRoom(s,0,85,GROUND_Y);activateBeacon(s,0);return true;}
        if(s.room===27||s.room===28){enterRoom(s,s.room-1,W-ROVER_W-4,GROUND_Y);return true;}
        if(s.room===20){enterRoom(s,2,197,GROUND_Y);return true;}
        if(s.room>=22&&s.room<=25){enterRoom(s,s.room===22?20:s.room-1,W-ROVER_W-4,GROUND_Y);return true;}
        if(s.room===2){enterRoom(s,1,W-ROVER_W-4,GROUND_Y);return true;}
        if(s.room===3){enterRoom(s,0,W-ROVER_W-4,56-ROVER_H);return true;}
        if(s.room===4){enterRoom(s,3,W-ROVER_W-4,104-ROVER_H);return true;}
        if(s.room===5){enterRoom(s,4,W-ROVER_W-4,96-ROVER_H);return true;}
        if(s.room===8){enterRoom(s,2,140,GROUND_Y);return true;}
        if(s.room===9){enterRoom(s,8,W-ROVER_W-4,GROUND_Y);return true;}
        if(s.room===11){enterRoom(s,8,116,GROUND_Y);return true;}
        if(s.room===12){enterRoom(s,11,W-ROVER_W-4,112-ROVER_H);return true;}
        if(s.room===13){enterRoom(s,12,W-ROVER_W-4,GROUND_Y);return true;}
        if(s.room===14){enterRoom(s,4,236,96-ROVER_H);return true;}
        if(s.room===15){enterRoom(s,14,W-ROVER_W-4,GROUND_Y);return true;}
        if(s.room===16){enterRoom(s,15,W-ROVER_W-4,GROUND_Y);return true;}
        if(s.room===17){enterRoom(s,16,W-ROVER_W-4,108-ROVER_H);return true;}
        if(s.room===18){enterRoom(s,17,W-ROVER_W-4,GROUND_Y);return true;}
        if(s.room===19){enterRoom(s,18,CANOPY_RELAY_REQUIRED.slice(1).every(id=>s.defeated.includes(id))?W-ROVER_W-4:294,GROUND_Y);return true;}
      }
      p.x=0;
    }
    if(p.x+p.w>W){
      if(s.mode!=='rover'){p.x=W-p.w;say(s,'Bring your rover to cross into the next room.');return false;}
      if(s.room===26||s.room===27&&s.flags.bellWall){enterRoom(s,s.room+1,8,GROUND_Y);return true;}
      if(s.room===20||s.room===22||s.room===23&&s.flags.yardCoupler||s.room===24){
        enterRoom(s,s.room===20?22:s.room+1,8,GROUND_Y);return true;
      }
      if(s.room===25&&s.flags.yardPower){enterRoom(s,3,77,GROUND_Y);return true;}
      if(s.room===0){
        if(s.flags.magnet&&s.flags.drained&&p.y+p.h<=60){enterRoom(s,3,8,GROUND_Y);return true;}
        p.x=W-p.w;say(s,'The upper route needs magnetic wheels. Explore the lower works.');
      }else if(s.room===1){
        if(s.flags.drained){enterRoom(s,2,8,GROUND_Y);return true;}
        p.x=W-p.w;
      }else if(s.room===2){enterRoom(s,0,280,GROUND_Y);return true;}
      else if(s.room===3){if(p.y+p.h<=108){enterRoom(s,4,8,GROUND_Y);return true;}p.x=W-p.w;}
      else if(s.room===4){if(p.y+p.h<=100){enterRoom(s,5,8,GROUND_Y);return true;}p.x=W-p.w;}
      else if(s.room===8){enterRoom(s,9,8,GROUND_Y);return true;}
      else if(s.room===11){if(p.y+p.h<=116){enterRoom(s,12,8,GROUND_Y);return true;}p.x=W-p.w;say(s,'Climb the striped wall to the upper condenser exit.',3);}
      else if(s.room===12){enterRoom(s,13,8,GROUND_Y);return true;}
      else if(s.room===14){enterRoom(s,15,8,GROUND_Y);return true;}
      else if(s.room===15){if(s.defeated.includes('lantern-turret')){enterRoom(s,16,8,GROUND_Y);return true;}p.x=W-p.w;}
      else if(s.room===16){if(p.y+p.h<=112){enterRoom(s,17,8,GROUND_Y);return true;}p.x=W-p.w;say(s,'Use magnetic wheels on the striped trunk to reach Glassroot Span.',3);}
      else if(s.room===17){enterRoom(s,18,8,GROUND_Y);return true;}
      else if(s.room===18){if(CANOPY_RELAY_REQUIRED.slice(1).every(id=>s.defeated.includes(id))){enterRoom(s,19,8,GROUND_Y);return true;}p.x=W-p.w;}
      else if(s.room===19){if(s.flags.canopyRelay){enterRoom(s,11,8,GROUND_Y);return true;}p.x=W-p.w;say(s,'The Mossworks shutter needs the Canopy relay [E].',3);}
      else p.x=W-p.w;
    }
    if(s.room===1&&!s.flags.drained&&p.x+p.w>=333&&dx>0)say(s,'Pump gate locked. Restore power through the cyan hatch.',2);
    return false;
  }
  function step(s,input={},dt=1/60){
    dt=Math.max(0,Math.min(dt,1/30));s.events=[];
    if(input.pausePressed)s.paused=!s.paused;
    if(input.mapPressed)s.map=!s.map;
    if(input.recoverPressed){recover(s);return s;}
    if(s.won){
      if(input.interactPressed){s.won=false;say(s,'Relay restored. Explore the optional Depot gate in Drain Channel.',8);}
      return s;
    }
    if(s.paused||s.map)return s;
    s.t+=dt;s.messageTime=Math.max(0,s.messageTime-dt);s.shootCooldown=Math.max(0,s.shootCooldown-dt);
    s.bellFlash=Math.max(0,s.bellFlash-dt);
    updateReceiver(s,dt);
    const p=s.p;p.inv=Math.max(0,p.inv-dt);
    if(p.stunUntil>s.t)input={};
    const dx=(input.right?1:0)-(input.left?1:0),dy=(input.down?1:0)-(input.up?1:0);
    if(s.mode==='vault'){
      const n=Math.hypot(dx,dy)||1;p.vx=dx/n*75;p.vy=dy/n*75;
      if(!input.fire&&(dx||dy)){
        p.aimX=dx;p.aimY=dx?0:dy;
        if(dx)p.face=dx;
      }
      shift(s,'x',p.vx*dt,solids(s));shift(s,'y',p.vy*dt,solids(s));
    }else{
      if(dx)p.face=dx;
      if(s.mode==='rover'){p.aimX=input.up?0:p.face;p.aimY=input.up?-1:0;}
      const speed=s.mode==='rover'?105:69,accel=s.mode==='rover'?650:900,target=dx*speed;
      p.kickTime=Math.max(0,(p.kickTime||0)-dt);
      if(p.kickTime===0)p.vx+=Math.max(-accel*dt,Math.min(accel*dt,target-p.vx));
      p.coyote=p.grounded?0.09:Math.max(0,p.coyote-dt);p.jumpBuffer=input.jumpPressed?0.11:Math.max(0,p.jumpBuffer-dt);
      const wall=solids(s).find(b=>b.metal&&b.h>50&&p.y+p.h>b.y&&p.y<b.y+b.h&&(Math.abs(p.x+p.w-b.x)<4||Math.abs(p.x-b.x-b.w)<4));
      const wasClimbing=p.climbing;
      p.climbing=s.mode==='rover'&&s.flags.magnet&&!!input.up&&!!wall&&p.kickTime===0;
      p.wallSide=wall?(wall.x+wall.w/2>p.x+p.w/2?1:-1):0;
      if(wasClimbing&&wall&&input.jumpPressed&&s.mode==='rover'&&s.flags.magnet){
        // Preserve the launch even when the player is still holding into the wall.
        p.climbing=false;p.face=-p.wallSide;p.vx=p.face*200;p.vy=-255;p.kickTime=.28;
        p.jumpBuffer=0;p.coyote=0;p.grounded=false;
        s.events.push({type:'jump',magnetic:true,x:p.wallSide>0?p.x+p.w:p.x,y:p.y+p.h/2});
      }else if(p.jumpBuffer>0&&p.coyote>0){
        p.vy=-245;p.jumpBuffer=0;p.coyote=0;p.grounded=false;s.events.push({type:'jump',x:p.x+p.w/2,y:p.y+p.h});
      }
      p.vy=p.climbing?-78:Math.min(360,p.vy+850*dt);
      p.grounded=false;shift(s,'x',p.vx*dt,solids(s));shift(s,'y',p.vy*dt,solids(s));
      if(sideTransitions(s,dx))return s;
      if(s.mode==='rover'&&BEACONS[s.room]&&near(p,BEACONS[s.room],35))activateBeacon(s,s.room);
      if(s.mode==='rover'&&s.room===2&&!s.flags.chassis&&overlap(p,CHASSIS)){
        s.flags.chassis=true;s.hp.rover=maxHealth(s);s.events.push({type:'health-upgrade'});say(s,'CHASSIS EXPANSION. Rover integrity increased to eight.',6);
      }
      if(s.mode==='rover'&&s.room===2&&s.flags.magnet&&!s.flags.drainCache&&overlap(p,DRAIN_CACHE)){
        s.flags.drainCache=true;s.hp.rover=maxHealth(s);
        s.events.push({type:'upgrade',id:'drain-cache',x:DRAIN_CACHE.x+6,y:DRAIN_CACHE.y+6});
        say(s,'SHIFT CACHE / hull repaired. Last entry: “It counted our test pulses.”',8);
      }
    }
    if(input.interactPressed){interact(s);return s;}
    updateRepeater(s,dt,input.repeaterPressed);
    updateKiln(s,dt);
    let chargeReleased=false;
    if(input.charge){s.charging=true;s.charge=Math.min(1,s.charge+dt);}
    else if(s.charging){
      chargeReleased=true;
      if(s.charge>=chargeTime(s)-1e-9)fire(s,true);else if(s.shootCooldown<=0)fire(s);
      s.charging=false;s.charge=0;
    }
    if(input.fire&&!input.charge&&!chargeReleased&&s.shootCooldown<=0)fire(s);
    updatePuddle(s,dt);
    if(updateEnemies(s,dt))return s;
    updateShots(s,dt);updateCollectibles(s,dt);return s;
  }
  function objective(s){
    if(s.won)return 'Relay restored. Main route complete.';
    if(s.mode==='vault'){
      if(s.room===21)return s.flags.repeater?'Return to your rover through the lower-left hatch [E]':'Take the signal repeater from the northeast rack [E]';
      if(s.room===10)return s.flags.pulseCoil?'Return through lower-left hatch [E]':s.coilSequence===3?'Collect Pulse Coil at central console [E]':'Trace the cables | '+s.coilSequence+'/3 latched | Socket [E] replays';
      if(s.room===7)return s.flags.drained?'Return through lower-left door [E]':'Use the upper-right pump console [E]';
      return s.flags.drained?'Return to lower-left hatch [E]':s.flags.accessClear?'Use upper-right door [E]':'Clear Service Access, then use upper-right door [E]';
    }
    if(s.mode==='pilot'&&s.room===0&&s.flags.dockAnswered){
      if(s.p.x>=336&&s.p.y+s.p.h>160)return s.flags.dockRecorder?'Return through the left grate [E]':'Check the tape deck on the right [E]';
      if(s.p.x+5>=307&&s.p.x+10<=320&&s.p.y+s.p.h>160)return 'Enter the receiver grate [E]';
      return 'Board your rover [E]';
    }
    if(s.mode==='pilot')return 'Return to rover [E] or enter the cyan hatch [E]';
    if(s.room===26)return 'Test a shot under the overhead rail. Bell Foundry is right';
    if(s.room===27)return s.flags.bellWall?'Follow the breach into Sounding Well':'Ring the bronze gong. A bellback runs past the sound';
    if(s.room===28)return s.flags.echoLens?'Return lift to Service Dock [E]':'Fit the Echo Lens at the well [E]';
    if(s.room===0&&near(s.p,SOUNDING.entry,25))return 'Listening Cut gate [E]. Main route continues right';
    if(s.room===20)return s.flags.repeater?'Take the right track to Shunt Viaduct':'Park beside the Dispatch hatch and enter on foot [E]';
    if(s.room===22)return 'Patrol below, magnetic viaduct above. Arc Kiln right';
    if(s.room===23)return s.flags.yardCoupler?'Coupler blown. Take the right shutter':s.flags.repeater?'Drop repeater [Q] under the striped coupler, then drive clear':'Recover the repeater from Dispatch Booth to the west';
    if(s.room===24)return 'Draw the skimmer with [Q] and jump the broken span';
    if(s.room===25)return s.flags.yardPower?'Shortcut to Magnetic Rise open on the right':'Throw the Night Exchange lever [E]';
    if(s.room===8)return 'Depot right; Mossworks gate [E] under the first belt; Drain Channel left';
    if(s.room===9)return s.flags.depotClear?'Park by the cyan hatch. Exit and enter [E]':'Optional: defeat the Rustlung Crusher';
    if(s.room===11)return s.flags.canopyRelay?'Canopy shortcut [E] on the left bank; condenser route up/right':'Climb striped steel [UP] and follow the upper Mossworks ledge';
    if(s.room===12)return 'Jump the broken span [SPACE]; Coolant Heart right, Mossworks left';
    if(s.room===13)return s.flags.cooling?'Cooling Jacket fitted. Return left across the broken span':s.flags.wardenClear?'Install Cooling Jacket at the right console [E]':'Silence the Condenser Warden; read low and high volley tells';
    if(s.room===4)return 'Canopy gate [E] on the ledge; Relay Crown is right';
    if(s.room===14)return 'Jump the low root [SPACE]; Lantern Shaft right, Upper Gantry left';
    if(s.room===15)return s.defeated.includes('lantern-turret')?'Lantern shutter open. Bramble Riser right':'Aim UP beneath the ceiling clamp and fire; watch its downward tell';
    if(s.room===16)return 'Climb striped steel [UP] and crest right to Glassroot Span';
    if(s.room===17)return 'Jump the broken Glassroot span [SPACE]; Thornwatch right, Riser left';
    if(s.room===18)return 'Clear the ground patrol and both ceiling clamps to open the orchard shutter';
    if(s.room===19)return s.flags.canopyRelay?'Mossworks shortcut open to the right; Gantry route left':'Use the Canopy relay [E] after clearing its combat interlocks';
    if(s.flags.boss&&!s.flags.pulseCoil)return 'Relay restored. Optional Depot gate [E] is in Drain Channel';
    if(s.flags.boss&&!s.flags.cooling)return 'Relay restored. Mossworks gate [E] in Conveyor Gallery leads to a Cooling Jacket';
    if(s.flags.boss)return 'Relay restored. Explore for signal caches and chassis upgrades';
    if(!s.flags.magnet)return s.room===0?'Drive right and drop into the lower works':'Find the cyan hatch and restore the pumps';
    if(s.room===2)return 'Dock right. Optional Depot and Switchyard gates [E] below';
    if(s.room===1)return 'Drive right through Drain Channel back to Dock';
    if(s.room===0)return 'Back at Dock: climb the tall striped wall [UP]';
    if(s.room===5)return 'Climb the steel; fire UP into the open Crown relay';
    return 'Climb striped steel [UP] and follow the upper route';
  }
  function serialize(s){return{version:VERSION,flags:{...s.flags},coilSequence:s.coilSequence,checkpoint:s.checkpoint,visited:s.visited.slice(),defeated:s.defeated.slice(),signals:s.signals.slice(),signalRhythm:s.signalRhythm.slice(),deaths:s.deaths};}
  // Most linked rooms meet at the east and west edges. Special mounts use the
  // actual door, gap or high ledge instead. Gravity drops have no return door.
  const echoDoors={
    '0:1':{x:252,y:179},'1:0':null,'0:2':null,'0:3':{x:365,y:51},
    '1:6':HATCH,'6:1':DOOR,'6:7':INNER_DOOR,'7:6':DOOR,
    '2:8':DEPOT_GATE,'9:10':DEPOT_HATCH,'10:9':DOOR,'8:11':MOSS_GATE,
    '4:14':CANOPY_GATE,'19:11':{x:371,y:169},'11:19':CANOPY_MOSS_GATE,
    '2:20':YARD.entry,'20:21':YARD.hatch,'21:20':DOOR,
    '25:3':{x:369,y:169},'3:25':YARD.returnGate,
    '3:4':{x:366,y:97},'4:5':{x:366,y:89},'11:12':{x:366,y:105},'16:17':{x:366,y:101},
    '0:26':SOUNDING.entry,'28:0':SOUNDING.lift,'0:28':null
  };
  function echoTargets(s){
    if(!s.flags.echoLens)return [];
    const targets=[];
    const mark=(box,kind,to)=>{
      const point={kind,x:box.x+(box.w||0)/2,y:box.y+(box.h||0)/2};
      if(to!==undefined)point.to=to;
      targets.push(point);
    };
    for(const {a,b} of ROOM_LINKS){
      if(s.room!==a&&s.room!==b)continue;
      const to=s.room===a?b:a;
      if(s.visited.includes(to))continue;
      const door=echoDoors[s.room+':'+to];
      if(door!==null)mark(door||{x:s.room===a?370:13,y:170},'gate',to);
    }
    for(const item of SIGNALS)if(item.room===s.room&&!s.signals.includes(item.id))mark(item,'cache');
    if(s.room===0&&!s.flags.dockRecorder)mark(DOCK_RECORDER,'cache');
    if(s.room===2){
      if(!s.flags.chassis)mark(CHASSIS,'cache');
      if(!s.flags.drainCache)mark(DRAIN_CACHE,'cache');
    }
    if(s.room===21&&!s.flags.repeater)mark(YARD.rack,'cache');
    return targets;
  }
  function restore(data){
    if(!data||data.version!==VERSION||!data.flags||typeof data.flags!=='object')return null;
    const names=['magnet','drained','boss','chassis','accessClear'];
    if(names.some(k=>typeof data.flags[k]!=='boolean')||!Object.hasOwn(CHECKPOINTS,data.checkpoint))return null;
    const optional=['depotClear','pulseCoil','wardenClear','cooling','canopyRelay','dockAnswered','dockRecorder','drainCache','repeater','yardCoupler','yardPower','bellWall','echoLens'];
    if(optional.some(k=>data.flags[k]!==undefined&&typeof data.flags[k]!=='boolean'))return null;
    if(data.flags.magnet!==data.flags.drained||data.flags.boss&&!data.flags.magnet)return null;
    const s=createGame();for(const name of names)s.flags[name]=data.flags[name];
    for(const name of optional)s.flags[name]=data.flags[name]===true;
    if(s.flags.repeater&&!s.flags.drained||s.flags.yardCoupler&&!s.flags.repeater||s.flags.yardPower&&!s.flags.yardCoupler)return null;
    if(s.flags.echoLens&&!s.flags.bellWall)return null;
    if(s.flags.dockRecorder&&!s.flags.dockAnswered||s.flags.dockAnswered&&!s.flags.drained)return null;
    const rhythm=data.signalRhythm;
    if(s.flags.dockAnswered&&Array.isArray(rhythm)&&rhythm.length>=2&&rhythm.length<=3&&rhythm[0]===0&&
      rhythm.slice(1).every((v,i)=>Number.isFinite(v)&&v-rhythm[i]>=0.12&&v-rhythm[i]<=RECEIVER_QUIET+0.001))s.signalRhythm=rhythm.slice();
    s.coilSequence=Number.isInteger(data.coilSequence)&&data.coilSequence>=0&&data.coilSequence<=3?data.coilSequence:0;
    if(s.flags.pulseCoil)s.coilSequence=3;
    s.checkpoint=data.checkpoint;
    s.visited=Array.isArray(data.visited)?[...new Set(data.visited.filter(n=>Number.isInteger(n)&&n>=0&&n<ROOM_COUNT))]:[0];
    if(!s.visited.includes(0))s.visited.unshift(0);
    const enemyIds=['dock-beetle','approach-beetle','approach-jelly','gantry-beetle','gantry-jelly','guardian','access-beetle','access-turret','gallery-skimmer','depot-crusher','bypass-beetle','bypass-jelly','bridge-skimmer','coolant-warden','canopy-beetle','viaduct-beetle','counterweight-skimmer',...CANOPY_RELAY_REQUIRED];
    s.defeated=Array.isArray(data.defeated)?[...new Set(data.defeated.filter(id=>enemyIds.includes(id)))]:[];
    if(s.flags.canopyRelay&&(!s.flags.magnet||!s.flags.drained||!canopyReady(s)))return null;
    s.signals=Array.isArray(data.signals)?[...new Set(data.signals.filter(id=>SIGNALS.some(signal=>signal.id===id)))]:[];
    s.deaths=Number.isInteger(data.deaths)&&data.deaths>=0?data.deaths:0;
    recover(s);s.events=[];return s;
  }
  return{SOUNDING,echoTargets,YARD,DOCK_RECEIVER,DOCK_GRATE,DOCK_RECORDER,DEFAULT_SIGNAL_RHYTHM,APPROACH_PUDDLE,
    DRAIN_CACHE,coilPulse,W,H,FLOOR,VERSION,ROVER_W,ROVER_H,GROUND_Y,ROVER_MUZZLE_X,ROVER_MUZZLE_HEIGHT,NAMES,ROOM_COUNT,ROOM_LINKS,isInterior,HATCH,CONSOLE,DOOR,INNER_DOOR,CHASSIS,DEPOT_GATE,DEPOT_HATCH,COIL_NODES,COIL_CONSOLE,MOSS_GATE,COOLING_CONSOLE,CONDENSER_GAP,CANOPY_GATE,CANOPY_MOSS_GATE,CANOPY_RELAY,CANOPY_GAP,CANOPY_RELAY_REQUIRED,canopyReady,SIGNALS,BEACONS,VAULT_WALLS,overlap,near,muzzle,chargeTime,cancelCharge,createGame,step,solids,interact,recover,damage,objective,enterRoom,maxHealth,serialize,restore};
});
