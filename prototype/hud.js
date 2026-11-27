/* Instruments display actual game state. No cosmetic energy resource or invented weapons. */
(function(root){
  'use strict';
  const ink='#09131f',edge='#7897b1',white='#e6eef2',muted='#536b82';
  const face='Consolas, "Courier New", monospace';
  const nodes=[
    {id:21,x:0,y:0,label:'DISPATCH'},{id:20,x:1,y:0,label:'SWITCHYARD'},{id:22,x:2,y:0,label:'VIADUCT'},
    {id:23,x:3,y:0,label:'ARC KILN'},{id:24,x:4,y:0,label:'WEIGHTS'},{id:25,x:5,y:0,label:'EXCHANGE'},
    {id:1,x:0,y:1,label:'APPROACH'},{id:2,x:1,y:1,label:'DRAIN'},{id:0,x:2,y:1,label:'DOCK'},
    {id:3,x:3,y:1,label:'RISE'},{id:4,x:4,y:1,label:'GANTRY'},{id:5,x:5,y:1,label:'CROWN'},
    {id:6,x:0,y:2,label:'ACCESS'},{id:7,x:1,y:2,label:'CONTROL'},{id:26,x:2,y:2,label:'LISTENING'},
    {id:27,x:3,y:2,label:'FOUNDRY'},{id:28,x:4,y:2,label:'WELL'},{id:14,x:5,y:2,label:'CANOPY'},
    {id:8,x:0,y:3,label:'CONVEYOR'},{id:9,x:1,y:3,label:'DEPOT'},{id:10,x:2,y:3,label:'COILS'},
    {id:16,x:3,y:3,label:'BRAMBLE'},{id:15,x:4,y:3,label:'LANTERN'},
    {id:11,x:0,y:4,label:'MOSS'},{id:12,x:1,y:4,label:'BRIDGE'},{id:13,x:2,y:4,label:'HEART'},
    {id:17,x:3,y:4,label:'GLASSROOT'},{id:18,x:4,y:4,label:'THORNWATCH'},{id:19,x:5,y:4,label:'ORCHARD'}
  ];
  const fallbackLinks=[[0,1],[1,2],[2,0],[0,3],[3,4],[4,5],[1,6],[6,7],[2,8],[8,9],[9,10]];
  function model(s,C){
    const rover=s.mode==='rover',max=rover?(s.flags.chassis?8:6):4;
    return{health:Math.max(0,Math.min(max,s.hp[rover?'rover':'pilot'])),max,
      charge:Math.max(0,Math.min(1,(s.charge||0)/(C.chargeTime?C.chargeTime(s):.6))),
      ready:(s.charge||0)>=(C.chargeTime?C.chargeTime(s):.6),rover,room:s.room,
      visited:new Set(s.visited||[s.room]),count:C.ROOM_COUNT||C.NAMES.length,
      equipment:[true,!!s.flags.magnet,!!s.flags.chassis,!!s.flags.pulseCoil]};
  }
  function helpers(c){return{
    r(x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);},
    t(str,x,y,color=white,size=6){c.fillStyle=color;c.font=size+'px '+face;c.textBaseline='top';c.fillText(str,Math.round(x),Math.round(y));},
    line(x,y,x2,y2,color){c.strokeStyle=color;c.lineWidth=1;c.beginPath();c.moveTo(x+.5,y+.5);c.lineTo(x2+.5,y2+.5);c.stroke();}
  };}
  function frame(h,x,y,w,height){h.r(x,y,w,height,edge);h.r(x+1,y+1,w-2,height-2,ink);h.r(x+2,y+2,w-4,1,'#23364a');}
  function icon(h,id,x,y,active){
    const color=active?['#a9e5ff','#c5d6df','#efb953','#dca2fc'][id]:'#394b5d';
    frame(h,x,y,19,20);
    if(id===0){h.r(x+4,y+9,11,4,color);h.r(x+13,y+8,2,6,color);h.r(x+3,y+10,2,2,'#fff3c9');}
    if(id===1){h.r(x+4,y+6,3,9,color);h.r(x+12,y+6,3,9,color);h.r(x+7,y+12,5,4,color);h.r(x+4,y+5,3,3,active?'#d65c5d':color);h.r(x+12,y+5,3,3,active?'#63a8dd':color);}
    if(id===2){h.r(x+5,y+5,9,9,color);h.r(x+7,y+14,5,3,color);h.r(x+8,y+7,3,7,ink);h.r(x+6,y+9,7,3,ink);}
    if(id===3){h.r(x+7,y+4,5,2,color);h.r(x+4,y+7,3,7,color);h.r(x+12,y+7,3,7,color);h.r(x+7,y+15,5,2,color);h.r(x+8,y+8,3,6,active?'#f4d7ff':color);}
    if(!active){h.r(x+2,y+17,15,1,'#26384a');}else h.r(x+6,y+18,7,1,color);
  }
  function linksFor(C){return C.ROOM_LINKS||fallbackLinks;}
  function endpoints(link){return Array.isArray(link)?link:[link.a,link.b];}
  function navigation(c,s,C,{large=false}={}){
    const h=helpers(c),m=model(s,C),dx=large?61:10.6,dy=large?25:4;
    const ox=large?14:316,oy=large?51:4,w=large?50:8,height=large?17:2;
    const list=nodes.filter(n=>n.id<m.count),get=id=>list.find(n=>n.id===id);
    const echoes=large&&s.flags.echoLens?new Set(C.echoTargets(s).filter(target=>target.kind==='gate').map(target=>target.to)):null;
    for(const link of linksFor(C)){
      const[a,b]=endpoints(link),n=get(a),v=get(b);if(!n||!v)continue;
      const discovered=m.visited.has(a)||m.visited.has(b);
      const yardReturn=link.kind==='yard-power',wellLift=link.kind==='echo-lift';
      const open=wellLift?s.flags.echoLens:yardReturn?s.flags.yardPower:(link.kind==='shortcut'||link.kind==='relay')&&s.flags.canopyRelay;
      const color=open?'#80c3aa':discovered?'#52748b':'#213143';
      const ax=ox+n.x*dx+w/2,ay=oy+n.y*dy+height/2,bx=ox+v.x*dx+w/2,by=oy+v.y*dy+height/2;
      // Route long same-row links around intervening rooms, not through their boxes.
      if(large&&n.y===v.y&&Math.abs(n.x-v.x)>1){const channel=n.y===4?oy+4*dy+height+3:oy+n.y*dy-4;h.line(ax,ay,ax,channel,color);h.line(ax,channel,bx,channel,color);h.line(bx,channel,bx,by,color);}
      else if(large&&yardReturn){const channel=oy+height+4;h.line(ax,ay,ax,channel,color);h.line(ax,channel,bx,channel,color);h.line(bx,channel,bx,by,color);}
      else if(large&&wellLift){
        const channel=oy+dy+height+3,dockX=bx+w/4;
        h.line(ax,ay,ax,channel,color);h.line(ax,channel,dockX,channel,color);h.line(dockX,channel,dockX,by+height/2,color);
        if(open){h.line(dockX-2,channel+1,dockX,channel-1,color);h.line(dockX+2,channel+1,dockX,channel-1,color);}
      }
      else if(large&&a===2&&b===8){
        const lane=ox+(w+dx)/2;
        h.line(ax,ay,lane,ay,color);h.line(lane,ay,lane,by,color);h.line(lane,by,bx,by,color);
      }
      else h.line(ax,ay,bx,by,color);
    }
    for(const n of list){
      const x=ox+n.x*dx,y=oy+n.y*dy,current=n.id===s.room,seen=m.visited.has(n.id);
      const echo=echoes&&echoes.has(n.id)&&!seen;
      h.r(x,y,w,height,current?'#ffc879':seen?'#75b5df':echo?'#b6ead8':'#263a51');
      if(large){h.r(x+1,y+1,w-2,height-2,current?'#274d67':seen?'#172e43':'#0d1b2b');
        h.t(n.label,x+4,y+5,seen?white:echo?'#c6f6e6':muted,5.5);
        h.r(x+5,y+13,w-10,1,current?'#ffc879':seen?'#447da0':'#1c3045');
      }
    }
  }
  function controlText(value,controller){return controller?value.replace(/\[E\]/g,'[B]').replace(/\[Q\]/g,'[LB]').replace(/\[SPACE\]/g,'[A]').replace(/\bPress E\b/gi,'Press B').replace(/Hold Up/gi,'Hold D-pad Up'):value;}
  function draw(c,s,C,S,{controller=false,touch=false}={}){
    c.save();c.imageSmoothingEnabled=false;const h=helpers(c),m=model(s,C);

    h.r(0,0,384,25,'#101e26');h.r(0,24,384,1,'#67807e');
    h.r(0,0,2,24,'#d78363');
    h.r(4,2,29,20,'#192e36');
    if(S){
      c.save();c.beginPath();c.rect(5,3,27,18);c.clip();c.translate(18,20);c.scale(.49,.49);
      if(m.rover)S.drawRover(c,{x:-18,y:-22,w:36,h:22,face:1,vx:0,grounded:true},{parked:true});
      else S.drawPilot(c,{x:-5,y:-18,w:10,h:16,face:1,aimX:0,aimY:1},{vault:true,time:0});
      c.restore();
    }
    h.t(m.rover?'HULL':'SUIT',38,4,'#ede7d3',6);
    h.t('CHG',38,15,m.ready?'#b8f4df':'#8dafa9',5.5);
    const barX=59,barW=73;
    for(let i=0;i<m.max;i++){
      const x=Math.floor(barX+i*barW/m.max),w=Math.floor(barX+(i+1)*barW/m.max)-x-1;
      h.r(x,5,w,6,i<m.health?'#cb695a':'#37434a');if(i<m.health)h.r(x,5,w,1,'#f9c08a');
    }
    h.r(barX,16,barW-1,3,'#31494e');
    if(m.charge>0)h.r(barX,16,Math.max(1,Math.floor((barW-1)*m.charge)),3,m.ready?'#e1f7c9':'#71c9ba');
    h.r(140,4,1,16,'#38515a');
    h.t(C.NAMES[s.room],149,4,'#ede8d6',6.5);
    const action=m.ready?(touch?'RELEASE':controller?'RELEASE Y':'RELEASE K'):m.charge>0?'CHARGING':m.rover?'ROVER':'PILOT';
    h.t(action+'  /  '+m.visited.size+' OF '+m.count,149,15,m.ready?'#ade9d5':'#96aea8',5.5);
    // Show earned equipment only. A fired or collected upgrade has the same icon on the map.
    const fitted=[1,2,3].filter(i=>m.equipment[i]);
    fitted.forEach((id,i)=>icon(h,id,305-(fitted.length-i)*21,2,true));
    if(s.flags.repeater){const x=294-fitted.length*21;h.t(touch?'RPT':controller?'LB':'Q',x,9,s.repeater?'#f1bb7e':'#97cbb6',6);}
    h.r(311,2,70,21,'#0b1922');navigation(c,s,C);
    const boss=s.enemies.find(e=>e.kind==='boss'||e.kind==='crusher'||e.kind==='warden');
    if(boss){frame(h,135,27,114,8);h.r(138,30,Math.round(108*boss.hp/boss.maxHp),2,'#e77283');}
    h.r(0,201,384,15,'#0a1620');h.r(0,201,384,1,'#405765');
    c.font='6px '+face;
    const labelWidth=31;
    h.r(0,202,labelWidth-3,14,'#142833');h.r(3,205,1,7,'#dfae71');
    h.t('COMMS',7,205,'#c5d9cc',5.8);
    c.save();c.beginPath();c.rect(labelWidth,201,384-labelWidth,15);c.clip();
    const msg=s.messageTime>0?s.message:C.objective(s);const message=touch?root.DeepRelayTouch.prompts(msg):controlText(msg,controller),words=message.split(' '),rows=[''];
    c.font='6px '+face;
    for(const word of words){const last=rows.length-1,next=rows[last]?rows[last]+' '+word:word;
      if(c.measureText(next).width>377-labelWidth&&rows[last])rows.push(word);else rows[last]=next;
    }
    const firstY=rows.length===1?205:202;
    rows.slice(0,2).forEach((row,i)=>h.t(row,labelWidth,firstY+i*7,white,6));c.restore();
    c.restore();
  }
  function drawMap(c,s,C,{controller=false,touch=false}={}){
    c.save();const h=helpers(c),m=model(s,C);
    h.r(0,25,384,176,'#08121cf9');h.t('COLONY SURVEY',15,32,'#c2e0ee',9);
    h.t(m.visited.size+' / '+m.count+' ROOMS',258,34,'#9bbbd1',7);
    navigation(c,s,C,{large:true});
    h.t(s.flags.echoLens?'AMBER: YOU / BLUE: VISITED / MINT: LOCAL ECHO':'AMBER: YOU / BLUE: VISITED / DARK: UNKNOWN',16,177,'#94b4cc',5);
    h.t(s.flags.yardPower?'YARD LINK ON':'YARD LINK OFF',221,177,s.flags.yardPower?'#80c3aa':'#647889',5);
    h.t(s.flags.canopyRelay?'RELAY LINK ON':'RELAY LINK OFF',303,177,s.flags.canopyRelay?'#80c3aa':'#647889',5);
    h.t(touch?'TAP MAP':controller?'VIEW: CLOSE':'M: CLOSE',touch?310:controller?310:321,191,'#ffc879',6);
    h.t('PUMPS '+(s.flags.drained?'ON':'OFF')+' / COIL '+(s.flags.pulseCoil?'ON':'--')+' / COOLING '+(s.flags.cooling?'ON':'--'),16,191,'#94b4cc',6);
    c.restore();
  }
  const api={version:21,model,nodes,draw,drawMap};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DeepRelayHUD=api;
})(typeof window!=='undefined'?window:globalThis);
