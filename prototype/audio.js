/* Kenney CC0 samples and original fallback/feedback synthesis. See credits.html. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.DeepRelayAudio=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MAX_VOICES=20,noiseCache=new WeakMap();
  const sourceScript=typeof document!=='undefined'&&document.currentScript?document.currentScript.src:'';
  const sampleBase=sourceScript?new URL('../audio/runtime/',sourceScript).href:'audio/runtime/';
  const SAMPLE_FILES={cannon:'laserLarge_000.ogg',charged:'laserLarge_003.ogg',pilot:'laserRetro_000.ogg',metal:'impactMetal_000.ogg',destroy:'explosionCrunch_000.ogg',board:'doorOpen_000.ogg',relay:'computerNoise_000.ogg'};
  const SAMPLE_CUES={cannon:{duration:.12,gain:.28},charged:{duration:.32,gain:.42},pilot:{duration:.105,gain:.18},metal:{duration:.105,gain:.24},destroy:{duration:.36,gain:.4},board:{duration:.22,gain:.2},relay:{duration:.18,gain:.18}};
  const assets=Object.fromEntries(Object.entries(SAMPLE_FILES).map(([key,file])=>[key,'audio/runtime/'+file]));
  function sampleFor(event){const e=typeof event==='string'?{type:event}:event||{};if(e.type==='shot')return e.pilot?'pilot':'cannon';if(e.type==='charge-shot')return'charged';if((e.type==='impact'||e.type==='hit')&&(e.material==='metal'||e.armor))return'metal';if(e.type==='destroy'||e.type==='death')return'destroy';return e.type==='board'||e.type==='relay'?e.type:null;}
  async function loadSamples(ctx,options={}){
    const buffers={},failed=[];
    const localFile=!options.sampleBase&&typeof location!=='undefined'&&location.protocol==='file:';
    await Promise.all(Object.entries(SAMPLE_FILES).map(async([key,file])=>{try{
      let data;
      if(localFile){
        const bytes=globalThis.DeepRelayOfflineSamples?.[key];
        if(!bytes)throw new Error('Bundled sample unavailable');
        data=Uint8Array.from(atob(bytes),ch=>ch.charCodeAt(0)).buffer;
      }else{
        const response=await fetch((options.sampleBase||sampleBase)+file);
        if(!response.ok)throw new Error('HTTP '+response.status);
        data=await response.arrayBuffer();
      }
      const buffer=await ctx.decodeAudioData(data);if(!buffer.length||!Number.isFinite(buffer.duration))throw new Error('Empty sample');buffers[key]=buffer;
    }catch(_){failed.push(file);}}));
    return{buffers,failed};
  }
  const PRIORITY={step:0,tread:0,room:2,'charge-start':2,shot:4,'charge-shot':5,'charge-ready':4,charge:3,'enemy-shot':3,impact:1,hit:2,destroy:3,death:6,shockwave:3,hurt:5,jump:2,land:1,upgrade:4,'health-upgrade':4,win:4,checkpoint:2,relay:2,signal:2,repair:2,board:2};
  Object.assign(PRIORITY,{'receiver-pulse':5,'guardian-pulse':5,'guardian-sweep':4,'guardian-open':4,'puddle-charge':4,'puddle-surge':4});
  Object.assign(PRIORITY,{'repeater-pulse':3,'arc-lock':6,'arc-fire':5,'yard-break':5});
  Object.assign(PRIORITY,{'bell-ring':4,'bell-lock':6,'bell-break':5});
  const PREVIEW=[{at:.15,type:'shot'},{at:.5,type:'shot',pilot:true},{at:1,type:'impact',material:'masonry'},{at:1.5,type:'impact',material:'metal'},{at:2,type:'hit',material:'organic'},{at:2.5,type:'enemy-shot'},{at:3,type:'charge'},{at:3.72,type:'charge-shot',coil:true},{at:4.35,type:'shockwave'},{at:4.95,type:'destroy'},{at:5.65,type:'hurt'},{at:6.1,type:'jump'},{at:6.55,type:'land'},{at:7,type:'checkpoint'},{at:7.55,type:'relay'},{at:8.05,type:'repair'},{at:8.55,type:'signal'},{at:8.85,type:'board'},{at:9.25,type:'upgrade'},{at:10.1,type:'health-upgrade'},{at:10.9,type:'win'}];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function noise(ctx){
    if(noiseCache.has(ctx))return noiseCache.get(ctx);
    const b=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),d=b.getChannelData(0);let seed=0x72e19a;
    for(let i=0;i<d.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;d[i]=(seed>>>0)/2147483648-1;}
    noiseCache.set(ctx,b);return b;
  }
  function createMaster(ctx,destination=ctx.destination){
    const music=ctx.createGain(),effects=ctx.createGain(),sum=ctx.createGain(),compressor=ctx.createDynamicsCompressor(),limiter=ctx.createWaveShaper(),output=ctx.createGain();
    music.gain.value=.88;effects.gain.value=.8;sum.gain.value=.8;
    compressor.threshold.value=-14;compressor.knee.value=16;compressor.ratio.value=8;compressor.attack.value=.003;compressor.release.value=.12;
    const curve=new Float32Array(2048);for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=Math.tanh(x*1.35)*.88;}
    limiter.curve=curve;limiter.oversample='2x';output.gain.value=.78;
    music.connect(sum);effects.connect(sum);sum.connect(compressor);compressor.connect(limiter);limiter.connect(output);output.connect(destination);
    return{music,effects,sum,compressor,limiter,output};
  }
  function scheduleEffect(ctx,destination,event,time=ctx.currentTime,active,sampleBuffers){
    if(!event||typeof event!=='string'&&typeof event.type!=='string')return null;
    const type=typeof event==='string'?event:event.type,e=typeof event==='string'?{type:event}:event;
    const start=Math.max(ctx.currentTime,time),sources=[],nodes=[],envelopes=[];
    let longest=.05,remaining=0,disposed=false;
    const pan=ctx.createStereoPanner?ctx.createStereoPanner():ctx.createGain();if(pan.pan)pan.pan.value=clamp(((Number.isFinite(e.x)?e.x:192)-192)/250,-.7,.7);pan.connect(destination);nodes.push(pan);
    const voice={sources,nodes,envelopes,stop(at=ctx.currentTime){for(const g of envelopes){try{g.gain.cancelScheduledValues(at);g.gain.setTargetAtTime(.00001,at,.005);}catch(_){}}for(const s of sources)try{s.stop(at+.025);}catch(_){}},type,priority:PRIORITY[type]||0,startedAt:start};
    function dispose(){if(disposed)return;disposed=true;for(const n of nodes)try{n.disconnect();}catch(_){}if(active)active.delete(voice);}
    function layer(kind,freq,end,duration,gain,delay=0,filterType='lowpass',cutoff=4000,rising=false){
      const at=start+delay,g=ctx.createGain(),source=kind==='noise'?ctx.createBufferSource():ctx.createOscillator();nodes.push(g,source);envelopes.push(g);
      if(kind==='noise')source.buffer=noise(ctx);else{source.type=kind;source.frequency.setValueAtTime(freq,at);source.frequency.exponentialRampToValueAtTime(Math.max(20,end),at+duration);}
      const filter=ctx.createBiquadFilter();filter.type=filterType;filter.frequency.value=cutoff;filter.Q.value=filterType==='bandpass'?.8:.65;source.connect(filter);filter.connect(g);nodes.push(filter);
      g.gain.setValueAtTime(.00001,at);g.gain.linearRampToValueAtTime(gain,at+(rising?duration-.03:.0015));g.gain.exponentialRampToValueAtTime(.00001,at+duration);g.connect(pan);
      sources.push(source);remaining++;source.onended=()=>{if(--remaining===0)dispose();};source.start(at);source.stop(at+duration+.01);longest=Math.max(longest,delay+duration);
    }
    const sample=sampleFor(e),buffer=sampleBuffers&&sampleBuffers[sample];
    if(buffer){
      const cue=SAMPLE_CUES[sample],duration=Math.min(cue.duration,buffer.duration),source=ctx.createBufferSource(),gain=ctx.createGain();
      source.buffer=buffer;source.connect(gain);gain.connect(pan);nodes.push(source,gain);sources.push(source);envelopes.push(gain);
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(cue.gain,start+Math.min(.003,duration/4));gain.gain.setValueAtTime(cue.gain,start+Math.max(duration/2,duration-.025));gain.gain.linearRampToValueAtTime(0,start+duration);
      remaining++;source.onended=()=>{if(--remaining===0)dispose();};source.start(start,0,duration);
      if(type==='shot'&&!e.pilot)layer('sine',115,50,.09,.12,0,'lowpass',450);
      if(type==='charge-shot')layer('triangle',155,44,.17,.16,.008,'lowpass',740);
      voice.duration=Math.max(duration,longest);voice.sample=sample;if(active)active.add(voice);return voice;
    }
    switch(type){
      case'shot':
        layer('noise',0,0,.018,.18,0,'bandpass',2200);layer('sine',158,68,.105,.34,0,'lowpass',650);
        layer('triangle',112,58,.085,.15,.004,'lowpass',850);layer('noise',0,0,.055,.09,.009,'lowpass',1500);layer('sine',330,285,.045,.055,.042,'lowpass',950);break;
      case'charge-shot':
        layer('noise',0,0,.038,.27,0,'bandpass',1900);layer('sine',124,39,.26,.54,0,'lowpass',540);
        layer('triangle',186,65,.18,.22,.006,'lowpass',1100);layer('noise',0,0,.17,.2,.012,'lowpass',1400);
        if(e.coil)layer('sine',440,165,.11,.08,.026,'lowpass',1500);break;
      case'charge':{
        const hum=createChargeHum(ctx,pan,start);for(let i=0;i<=12;i++)hum.set(i/12,start+i*.05);hum.stop(start+.67);
        sources.push(...hum.sources);nodes.push(...hum.nodes);envelopes.push(...hum.envelopes);remaining+=hum.sources.length;
        for(const source of hum.sources)source.addEventListener('ended',()=>{if(--remaining===0)dispose();});
        layer('sine',660,660,.065,.055,.6,'lowpass',1700);layer('noise',0,0,.018,.065,.6,'bandpass',1800);longest=.72;break;
      }
      case'charge-ready':layer('sine',660,660,.065,.055,0,'lowpass',1700);layer('sine',990,990,.045,.018,.012,'lowpass',1800);layer('noise',0,0,.018,.065,0,'bandpass',1800);break;
      case'enemy-shot':layer('triangle',265,170,.11,.09,0,'lowpass',1000);layer('sine',530,340,.075,.035,0,'lowpass',1500);layer('noise',0,0,.024,.055,0,'bandpass',1000);break;
      case'impact':
        if(e.material==='metal'){layer('noise',0,0,.022,.14,0,'bandpass',2400);layer('sine',1350,1220,.075,.055,0,'lowpass',2800);layer('sine',2080,1870,.048,.023,.003,'lowpass',3000);}
        else if(e.material==='organic'){layer('noise',0,0,.09,.17,0,'lowpass',650);layer('sine',145,88,.075,.12,0,'lowpass',500);}
        else{layer('noise',0,0,.105,.2,0,'bandpass',650);layer('triangle',88,42,.075,.12,0,'lowpass',500);layer('noise',0,0,.055,.07,.02,'lowpass',1900);}break;
      case'hit':{
        const armor=e.armor||e.material==='metal';
        if(armor){layer('noise',0,0,.024,.17,0,'bandpass',1850);layer('sine',1080,990,.075,.07,0,'lowpass',2400);layer('triangle',160,84,.07,.1,0,'lowpass',700);}
        else{layer('noise',0,0,.095,.21,0,'lowpass',680);layer('sine',158,83,.08,.16,0,'lowpass',500);layer('noise',0,0,.025,.08,.008,'bandpass',1250);}break;
      }
      case'destroy':case'death':layer('noise',0,0,.29,.35,0,'lowpass',1450);layer('sine',110,30,.32,.46,0,'lowpass',500);layer('noise',0,0,.13,.13,.03,'bandpass',2400);layer('triangle',210,62,.15,.09,.018,'lowpass',1100);break;
      case'shockwave':layer('sine',88,28,.235,.32,0,'lowpass',400);layer('noise',0,0,.17,.18,0,'bandpass',550);break;
      case'hurt':layer('triangle',138,70,.12,.15,0,'lowpass',900);layer('noise',0,0,.085,.16,0,'bandpass',800);layer('sine',76,57,.11,.13,.015,'lowpass',400);break;
      case'jump':layer('triangle',92,185,.095,.11,0,'lowpass',850);layer('noise',0,0,.048,.055,0,'lowpass',650);break;

      case 'step':
      case 'tread': {
        const stride=e.type==='step', variation=.94+.12*Math.abs(Math.sin(start*17.7));
        const surface=e.wet?1780:e.metal?2320:900;
        layer(stride?'sine':'triangle',(stride?145:97)*variation,stride?69:48,.056,stride?.07:.052,0,'lowpass',580);
        layer('noise',0,0,e.wet?.10:.036,e.wet?.105:.067,.004,'bandpass',surface*variation);
        if(!stride)layer('noise',0,0,.026,.042,.038,'bandpass',e.magnetic?2060:780);
        break;
      }
      case 'land':
        layer('sine',e.pilot?135:110,e.pilot?65:43,e.pilot?.10:.18,e.pilot?.1:.19,0,'lowpass',580);
        layer('noise',0,0,e.wet?.16:.08,e.wet?.165:.10,.008,e.wet?'bandpass':'lowpass',e.wet?1450:e.metal?1790:730);
        if(e.metal&&!e.wet)layer('triangle',440,320,.075,.052,.022,'lowpass',1300);
        if(e.wet)layer('noise',0,0,.083,.075,.052,'bandpass',2370);
        break;
      case 'charge-start':
        layer('triangle',125,370,.13,.045,0,'lowpass',1300);
        layer('sine',370,740,.15,.026,.058,'lowpass',2300);
        break;
      case 'room':
        layer('sine',294,294,.095,.047,0,'lowpass',1800);
        layer('triangle',440,440,.13,.035,.075,'lowpass',1600);
        break;
      case'upgrade':
        layer('noise',0,0,.04,.1,0,'bandpass',950);layer('triangle',146.83,146.83,.1,.08,0,'lowpass',850);
        for(let i=0;i<3;i++)layer('sine',[293.66,440,587.33][i],[293.66,440,587.33][i],.18,.075,.065+i*.075,'lowpass',1800);break;
      case'health-upgrade':layer('sine',98,98,.14,.11,0,'lowpass',500);layer('sine',146.83,146.83,.17,.095,.12,'lowpass',700);layer('triangle',293.66,293.66,.14,.045,.22,'lowpass',1100);break;
      case'win':for(let i=0;i<3;i++)layer('triangle',[293.66,349.23,440][i],[293.66,349.23,440][i],.21,.055,i*.065,'lowpass',1400);layer('sine',146.83,146.83,.32,.085);break;
      case'checkpoint':layer('sine',587.33,587.33,.075,.065,0,'lowpass',1200);layer('sine',440,440,.095,.055,.095,'lowpass',1200);layer('noise',0,0,.016,.04,0,'bandpass',1100);break;
      case'relay':layer('noise',0,0,.035,.11,0,'bandpass',1200);layer('triangle',165,220,.075,.075,0,'lowpass',750);layer('noise',0,0,.018,.055,.055,'bandpass',1850);break;
      case'signal':layer('noise',0,0,.14,.05,0,'bandpass',1450);layer('sine',440,440,.11,.045,.025,'lowpass',1400);layer('sine',293.66,293.66,.14,.045,.17,'lowpass',1100);break;
      case'receiver-pulse':
      case'repeater-pulse':
      case'guardian-pulse':{
        // The second Dock receiver and the Crown share a voice and cadence.
        const pitch=e.source==='dock'?587.33:392;
        layer('triangle',pitch,pitch,.115,.18,0,'lowpass',1850);
        layer('sine',pitch*2,pitch*2,.065,.065,0,'lowpass',2400);
        break;
      }
      case'guardian-sweep':
        layer('noise',0,0,.26,.19,0,'bandpass',e.high?1350:620);
        layer('triangle',e.high?252:132,e.high?90:50,.24,.14);break;
      case'guardian-open':
        layer('triangle',392,587.33,.16,.14,0,'lowpass',1800);break;
      case'puddle-charge':
        layer('triangle',265,515,.16,.205,0,'lowpass',2300);
        layer('noise',0,0,.12,.09,.055,'bandpass',1650);break;
      case'puddle-surge':
        layer('noise',0,0,.19,.21,0,'bandpass',1250);
        layer('triangle',205,67,.18,.16,0,'lowpass',1600);break;
      case'arc-lock':
        layer('triangle',540,755,.09,.22,0,'lowpass',2900);
        layer('sine',830,1140,.15,.21,.09,'lowpass',2800);break;
      case'arc-fire':
        layer('noise',0,0,.18,.33,0,'bandpass',1650);
        layer('sawtooth',245,52,.19,.17,0,'lowpass',1300);break;
      case'yard-break':
        layer('noise',0,0,.18,.28,0,'bandpass',2400);
        layer('triangle',145,52,.30,.26,0,'lowpass',850);
        layer('sine',920,720,.20,.10,.045,'lowpass',2200);break;
      case'bell-ring':{
        // The hanging gong blooms after the initial mallet tap. Its upper two
        // partials die out first, leaving the lower cast-metal note.
        const root=e.charged?207.65:196;
        layer('noise',0,0,.024,.15,0,'bandpass',2300);
        layer('sine',root*1.04,root,.69,.18,.006,'lowpass',900);
        layer('sine',root*2.48,root*2.43,.39,.16,0,'lowpass',2200);
        layer('sine',root*4.22,root*4.14,.21,.085,0,'lowpass',2800);break;
      }
      case'bell-lock':
        // Two short pawl clicks and a descending rasp cut across the ringing gong.
        layer('noise',0,0,.045,.34,0,'bandpass',2800);
        layer('triangle',1350,610,.085,.23,0,'lowpass',2850);
        layer('noise',0,0,.048,.25,.089,'bandpass',2100);
        layer('square',920,330,.13,.19,.089,'lowpass',2350);break;
      case'bell-break':
        layer('sine',132,39,.33,.43,0,'lowpass',720);
        layer('noise',0,0,.21,.38,0,'lowpass',1750);
        layer('triangle',294,128,.30,.16,.013,'lowpass',1000);
        for(const [at,pitch] of [[.075,985],[.14,684],[.241,516]]){
          layer('noise',0,0,.042,.12,at,'bandpass',pitch*1.9);
          layer('sine',pitch,pitch*.8,.085,.06,at,'lowpass',2000);
        }
        break;
      case'repair':layer('noise',0,0,.024,.07,0,'bandpass',1250);layer('sine',180,180,.07,.1,0,'lowpass',650);layer('sine',240,240,.075,.065,.075,'lowpass',800);break;
      case'board':layer('noise',0,0,.032,.1,0,'bandpass',1200);layer('triangle',130,92,.09,.095,0,'lowpass',650);layer('noise',0,0,.018,.07,.065,'bandpass',1800);break;
      default:dispose();return null;
    }
    voice.duration=longest;if(active)active.add(voice);return voice;
  }
  function createChargeHum(ctx,destination,start=ctx.currentTime){
    const low=ctx.createOscillator(),upper=ctx.createOscillator(),air=ctx.createBufferSource(),lowGain=ctx.createGain(),upperGain=ctx.createGain(),airGain=ctx.createGain(),filter=ctx.createBiquadFilter();
    low.type='triangle';upper.type='sine';air.buffer=noise(ctx);air.loop=true;filter.type='bandpass';filter.frequency.value=780;filter.Q.value=.7;
    low.frequency.value=92;upper.frequency.value=184;lowGain.gain.value=upperGain.gain.value=airGain.gain.value=0;
    low.connect(lowGain);upper.connect(upperGain);air.connect(filter);filter.connect(airGain);for(const gain of [lowGain,upperGain,airGain])gain.connect(destination);
    const sources=[low,upper,air],nodes=[...sources,lowGain,upperGain,airGain,filter];let stopped=false,remaining=sources.length;
    for(const source of sources){source.start(start);source.onended=()=>{if(--remaining===0)for(const node of nodes)try{node.disconnect();}catch(_){}};}
    return{sources,nodes,envelopes:[lowGain,upperGain,airGain],set(amount,at=ctx.currentTime){
      if(stopped)return;const level=clamp(amount,0,1),pitch=92+level*level*132;
      low.frequency.setTargetAtTime(pitch,at,.025);upper.frequency.setTargetAtTime(pitch*2.005,at,.025);
      lowGain.gain.setTargetAtTime(.014+level*.02,at,.018);upperGain.gain.setTargetAtTime(.004+level*.008,at,.018);airGain.gain.setTargetAtTime(.002+level*.003,at,.018);
    },stop(at=ctx.currentTime){if(stopped)return;stopped=true;for(const gain of [lowGain,upperGain,airGain]){gain.gain.cancelScheduledValues(at);gain.gain.setTargetAtTime(0,at,.008);}for(const source of sources)try{source.stop(at+.04);}catch(_){}}};
  }
  function create(options={}){
    let ctx=null,bus=null,effectsEnabled=false,paused=true,unlocked=false,suspendTimer=null,charge=null,disposed=false,played=0,dropped=0,stolen=0,readyCues=0,samplePlays=0,samplePromise=null,sampleBuffers={},sampleFailed=[],sampleState='unrequested';
    const voices=new Set();
    function getContext(){if(disposed)throw new Error('Audio session disposed');if(!ctx){const Context=options.Context||globalThis.AudioContext||globalThis.webkitAudioContext;if(!Context)throw new Error('Web Audio unavailable');ctx=new Context({latencyHint:'interactive'});bus=createMaster(ctx);bus.output.gain.value=paused?0:.78;}return ctx;}
    function stopCharge(){if(!charge)return;charge.voice.stop();charge=null;}
    function clear(){stopCharge();for(const v of voices)v.stop();voices.clear();}
    async function ensureContext(){getContext();await ctx.resume();unlocked=true;if(paused)setPaused(true);return ctx;}
    function preloadSamples(){if(!samplePromise){sampleState='loading';samplePromise=loadSamples(getContext(),options).then(result=>{sampleBuffers=result.buffers;sampleFailed=result.failed;sampleState=Object.keys(sampleBuffers).length===Object.keys(SAMPLE_FILES).length?'ready':'fallback';return result;});}return samplePromise;}
    function setPaused(value){
      paused=!!value;if(suspendTimer!==null)clearTimeout(suspendTimer);suspendTimer=null;if(!ctx)return;
      const now=ctx.currentTime;bus.output.gain.cancelScheduledValues(now);bus.output.gain.setTargetAtTime(paused?0:.78,now,.008);
      if(paused){clear();suspendTimer=setTimeout(()=>{suspendTimer=null;if(paused&&ctx&&ctx.state==='running')ctx.suspend().catch(()=>{});},80);}
      else if(unlocked&&ctx.state==='suspended')ctx.resume().catch(()=>{});
    }
    function play(event){if(!effectsEnabled||paused||!ctx||ctx.state!=='running')return false;
      const type=typeof event==='string'?event:event&&event.type;if(!Object.hasOwn(PRIORITY,type))return false;
      if(voices.size>=MAX_VOICES){const priority=PRIORITY[type],candidate=[...voices].filter(v=>v.priority<priority).sort((a,b)=>a.priority-b.priority||a.startedAt-b.startedAt)[0];
        if(!candidate){dropped++;return false;}candidate.stop();voices.delete(candidate);stolen++;
      }
      const voice=scheduleEffect(ctx,bus.effects,event,ctx.currentTime,voices,sampleBuffers);if(voice){played++;if(voice.sample)samplePlays++;return true;}return false;
    }
    function setCharge(amount,active){
      if(!active||!effectsEnabled||paused||!ctx||ctx.state!=='running'){stopCharge();return;}
      const level=clamp(Number(amount)||0,0,1),now=ctx.currentTime;
      if(!charge){play({type:'charge-start'});charge={voice:createChargeHum(ctx,bus.effects,now),ready:false};}
      charge.voice.set(level,now);if(level>=.999&&!charge.ready){charge.ready=true;if(play({type:'charge-ready'}))readyCues++;}
    }
    return{getContext,ensureContext,get musicInput(){return getContext()&&bus.music;},get effectsInput(){return getContext()&&bus.effects;},
      async enableEffects(){await ensureContext();effectsEnabled=true;await preloadSamples();return effectsEnabled;},
      setEffectsEnabled(value){effectsEnabled=!!value;if(!effectsEnabled)clear();else if(ctx)preloadSamples();},get effectsEnabled(){return effectsEnabled;},
      setPaused,play,setCharge,clear,
      get diagnostics(){return{version:21,initialized:!!ctx,contextState:ctx?ctx.state:'uninitialized',effectsEnabled,paused,unlocked,activeVoices:voices.size,chargeActive:!!charge,chargeReady:!!(charge&&charge.ready),maxVoices:MAX_VOICES,played,dropped,stolen,readyCues,sampleState,sampleLoaded:Object.keys(sampleBuffers).length,sampleFailed:[...sampleFailed],samplePlays,sharedContext:true,masterLimiter:!!bus};},
      dispose(){clear();if(suspendTimer!==null)clearTimeout(suspendTimer);disposed=true;if(ctx)ctx.close().catch(()=>{});}
    };
  }
  async function renderPreview(options={}){
    const sampleRate=options.sampleRate||44100,duration=12.2,Context=options.OfflineContext||globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
    if(!Context)throw new Error('OfflineAudioContext unavailable');const ctx=new Context(2,Math.ceil(duration*sampleRate),sampleRate),bus=createMaster(ctx);
    const samples=options.samples===false?null:await loadSamples(ctx,options);
    for(const event of PREVIEW)scheduleEffect(ctx,bus.effects,event,event.at,null,samples&&samples.buffers);
    return{buffer:await ctx.startRendering(),cues:PREVIEW.map(e=>({...e})),duration,sampleRate};
  }
  return{version:21,assets,sampleFor,loadSamples,create,scheduleEffect,createChargeHum,createMaster,renderPreview,PREVIEW,MAX_VOICES};
});
