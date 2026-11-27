/* Visual world materials and atmosphere. Collision remains entirely in core.js. */
(function(root){
  'use strict';
  const W=384,HUD=24,VIEW_BOTTOM=201;
  const assets={dock:'art/runtime/service-dock21.png',sump:'art/runtime/sump21.png',induction:'art/runtime/induction21.png',background:'art/runtime/world05-backdrop.png',mossworks:'art/runtime/mossworks08-backdrop.png',canopy:'art/runtime/canopy12-backdrop.png'};
  // Each room borrows a different architectural view from the same source world.
  // Crops maintain source aspect; no room repeats the complete backdrop by default.
  const roomFrames={
    0:{x:0,y:.08,w:1,mirror:false},
    1:{x:.32,y:.08,w:.56,mirror:true},
    2:{x:.16,y:.26,w:.84,mirror:true},
    3:{x:.45,y:.05,w:.5,mirror:false},
    4:{x:.44,y:.03,w:.56,mirror:false},
    5:{x:.5,y:.19,w:.5,mirror:true},
    8:{x:0,y:.4,w:.62,mirror:false},
    9:{x:.5,y:.43,w:.5,mirror:false},
    11:{x:0,y:.08,w:.82,mirror:false},
    12:{x:.12,y:.15,w:.88,mirror:false},
    13:{x:.48,y:.1,w:.52,mirror:false},
    14:{x:0,y:.22,w:.88,mirror:false,source:'canopy',grade:'#243e2916'},
    15:{x:.27,y:.12,w:.7,mirror:false,source:'canopy',grade:'#1d39351d'},
    16:{x:.48,y:.03,w:.5,mirror:false,source:'canopy',grade:'#28443818'},
    17:{x:.05,y:.3,w:.63,mirror:true,source:'canopy',grade:'#253b2a18'},
    18:{x:.3,y:.05,w:.68,mirror:true,source:'canopy',grade:'#233b461b'},
    19:{x:.53,y:.23,w:.47,mirror:false,source:'canopy',grade:'#36482b18'},
    20:{source:'switchyard',panel:0},21:{source:'switchyard',panel:1},22:{source:'switchyard',panel:2},
    23:{source:'switchyard',panel:3},24:{source:'switchyard',panel:4},25:{source:'switchyard',panel:5},
    26:{source:'sounding',panel:0},27:{source:'sounding',panel:1},28:{source:'sounding',panel:2}
  };
  const images={},status={loaded:[],failed:[]},surfaceCache=new Map();
  function rect(c,x,y,w,h,color){
    if(w<=0||h<=0)return;
    c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));
  }
  function noise(n){let x=(n|0)^0x45d9f3b;x=Math.imul(x^(x>>>16),0x45d9f3b);x=Math.imul(x^(x>>>16),0x45d9f3b);return((x^(x>>>16))>>>0)/4294967296;}
  function sampler(seed){let n=seed;return(max)=>Math.floor(noise(n++)*max);}
  const ready=Promise.allSettled(Object.entries(assets).map(([name,src])=>new Promise(resolve=>{
    const image=new Image();images[name]=image;image.onload=()=>{status.loaded.push(name);resolve(true);};image.onerror=()=>{status.failed.push(name);resolve(false);};image.src=src;
  })));
  function distantArchitecture(c,s,cameraY){
    const warm=s.room>=8,baseY=VIEW_BOTTOM+cameraY;
    c.save();c.globalAlpha=.68;
    for(let i=0;i<7;i++){
      const x=i*67-13+(s.room%3)*9,height=105+Math.floor(noise(i*41+s.room*11)*48),top=baseY-height;
      rect(c,x,top,22,height,warm?'#263938':'#183943');rect(c,x+3,top+5,3,height-5,warm?'#34453e':'#24434b');
      for(let y=top+16;y<baseY;y+=25){rect(c,x+8,y,8,12,'#102b35');rect(c,x+9,y+1,6,2,'#345059');}
      for(let y=top+10;y<baseY;y+=47)rect(c,x-3,y,28,3,'#2b494d');
    }
    // An offset aqueduct lives far above the active floor, with open arches beneath.
    const bridgeY=95+cameraY*.65;
    rect(c,0,bridgeY,384,3,'#26464d');for(let x=7;x<384;x+=48){rect(c,x,bridgeY+3,5,62,'#1d3e47');rect(c,x+6,bridgeY+7,8,5,'#1d3e47');rect(c,x+12,bridgeY+3,20,3,'#1d3e47');}
    c.restore();
  }
  const yardPlates=new Map();
  const yardPigment={
    black:'#13232f',deep:'#1b3240',under:'#243d48',steel:'#3a555c',edge:'#566e6c',
    copper:'#986e53',bronze:'#6e5548',light:'#c79a68',blue:'#87babb'
  };
  function stroke(c,x0,y0,x1,y1,color){
    x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
    const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;
    let error=dx+dy;c.fillStyle=color;
    for(;;){
      c.fillRect(x0,y0,1,1);
      if(x0===x1&&y0===y1)break;
      const step=2*error;
      if(step>=dy){error+=dy;x0+=sx;}
      if(step<=dx){error+=dx;y0+=sy;}
    }
  }
  function polygon(c,points,color){
    const ys=points.map(p=>p[1]),low=Math.floor(Math.min(...ys)),high=Math.ceil(Math.max(...ys));
    c.fillStyle=color;
    for(let y=low;y<high;y++){
      const line=y+.5,crossings=[];
      for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length];
        if((a[1]>line)===(b[1]>line))continue;
        crossings.push(a[0]+(line-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      crossings.sort((a,b)=>a-b);
      for(let i=0;i+1<crossings.length;i+=2){
        const x=Math.round(crossings[i]);c.fillRect(x,y,Math.round(crossings[i+1])-x,1);
      }
    }
  }
  function oval(c,x,y,rx,ry,color){
    for(let v=-ry;v<=ry;v++){
      const half=Math.round(rx*Math.sqrt(Math.max(0,1-v*v/(ry*ry))));
      rect(c,x-half,y+v,half*2+1,1,color);
    }
  }
  function cable(c,x1,y1,x2,y2,sag,color){
    const span=x2-x1;
    for(let i=0;i<=Math.abs(span);i++){
      const f=i/Math.abs(span);
      rect(c,x1+span*f,y1+(y2-y1)*f+4*sag*f*(1-f),1,1,color);
    }
  }
  // Correlated pigment makes broad patches of wear. The last small-scale sample
  // gives the scanner print grain without stamping a tile across neighboring blocks.
  function patina(c,w,h,seed,strength){
    const pixels=c.getImageData(0,0,w,h),rgba=pixels.data;
    function field(step){
      const cols=Math.ceil(w/step)+1,rows=Math.ceil(h/step)+1;
      const knots=Array.from({length:cols*rows},(_,i)=>noise(seed+i*13+step*641)-.5);
      return(x,y)=>{
        const a=Math.floor(y/step)*cols+Math.floor(x/step),u=(x%step)/step,v=(y%step)/step;
        return (knots[a]*(1-u)+knots[a+1]*u)*(1-v)+(knots[a+cols]*(1-u)+knots[a+cols+1]*u)*v;
      };
    }
    const bloom=field(9),grain=field(3);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4;
      if(!rgba[i+3])continue;
      const lift=(bloom(x,y)*1.25+grain(x,y)*.9+(noise(seed+i)-.5)*.7)*strength;
      rgba[i]+=lift;rgba[i+1]+=lift*.92;rgba[i+2]+=lift*.78;
    }
    c.putImageData(pixels,0,0);
  }
  function works(c,x,y,size,rand){
    const tone='#344e56',dark='#293f49',light='#486064',roof='#5b6e6c';
    // Brick engine room with dusty clerestories and a corrugated sawtooth roof.
    rect(c,x,y,size,46,dark);
    for(let dx=0;dx<size;dx+=12){
      const span=Math.min(12,size-dx);
      polygon(c,[[x+dx,y],[x+dx+span-2,y-6],[x+dx+span,y],[x+dx+span,y+4],[x+dx,y+4]],tone);
      stroke(c,x+dx,y,x+dx+span-2,y-6,light);
      rect(c,x+dx+span-3,y-4,2,4,'#867e64');
    }
    rect(c,x,y+5,size,1,tone);
    for(let dx=4;dx<size-3;dx+=8){
      rect(c,x+dx,y+8,4,8,tone);rect(c,x+dx+1,y+9,2,3,rand(6)===0?'#b08a5e':light);
      rect(c,x+dx+4,y+7,1,25,tone);
    }
    for(let yy=21;yy<36;yy+=4){
      rect(c,x,y+yy,size,1,tone);
      for(let xx=4+yy%7;xx<size;xx+=12)rect(c,x+xx,y+yy+1,1,3,tone);
    }
    for(const stack of [8,size-11]){
      const chimney=x+stack,height=19+rand(26);
      polygon(c,[[chimney,y-height],[chimney+3,y-height],[chimney+5,y],[chimney-1,y]],dark);
      rect(c,chimney,y-height,1,height,light);
      for(let yy=3;yy<height;yy+=7)rect(c,chimney-1,y-height+yy,5,1,roof);
      rect(c,chimney-1,y-height,5,2,tone);
      for(let n=0;n<4;n++){
        const dx=chimney-n*4,dy=y-height-3-n*2;
        oval(c,dx,dy,3+n,1+Math.floor(n/2),'#94b0a71a');
      }
    }
  }
  // These six camera windows look through the yard into machinery from the Sump.
  // Color and distance change by room, with the painted gantries in front.
  const industrialViews=[
    [.34,.02,.51], [.04,.05,.43], [.36,.01,.54],
    [.53,.21,.44], [.35,.13,.37], [.29,.01,.49]
  ];
  function sourceReady(){return images.background.complete&&images.background.naturalWidth>0;}
  function sky(c,panel){
    const colors=[
      ['#142836','#36585f'],['#152831','#33494c'],['#173747','#507277'],
      ['#302d36','#62504b'],['#192b40','#446173'],['#142738','#42566b']
    ][panel],rand=sampler(688+217*panel);
    const gradient=c.createLinearGradient(0,0,0,166);
    gradient.addColorStop(0,colors[0]);gradient.addColorStop(1,colors[1]);
    c.fillStyle=gradient;c.fillRect(0,0,W,186);
    patina(c,W,186,813+panel*17,5);
    if(sourceReady()){
      const img=images.background,[left,upper,scale]=industrialViews[panel];
      const width=img.naturalWidth*scale,height=width*186/W;
      c.save();c.globalAlpha=[.35,.24,.30,.26,.26,.31][panel];
      if(panel===2||panel===5){c.translate(W,0);c.scale(-1,1);}
      c.drawImage(img,img.naturalWidth*left,img.naturalHeight*upper,width,height,0,0,W,186);
      c.restore();
    }
    // Fog banks sit behind the power pylons and the horizon. Several small
    // drifting layers keep the upper half airy when a room has a low skyline.
    for(let i=0;i<26;i++){
      const x=rand(W),y=8+rand(82),radius=9+rand(39);
      oval(c,x,y,radius,2+rand(4),'#95a8ab0a');
      rect(c,x-radius+2,y+2,radius+5,1,'#a5b7b30a');
    }
    for(let i=0;i<32;i++){
      const x=rand(W),y=72+rand(67),w=3+rand(12);
      rect(c,x,y,w,1,'#91aba119');
    }
    // The far buildings belong to the skyline. Every roof edge shares its facade tone.
    for(let x=-8;x<W;){
      const w=6+rand(23),h=9+rand(24),base=123+rand(9);
      rect(c,x,base-h,w,185-base+h,'#29444c');
      rect(c,x+1,base-h+1,2,h,'#36545a');
      if(rand(3)===0){rect(c,x+3,base-h-9,2,9,'#29434e');rect(c,x+2,base-h-9,4,1,'#455b5d');}
      for(let j=3;j<w-1;j+=5)if(rand(3)===0)rect(c,x+j,base-h+5,2,2,'#897e65');
      x+=w+2+rand(7);
    }
    works(c,4+rand(18),114+rand(6),54+rand(22),rand);
    works(c,137+rand(24),104+rand(12),62+rand(22),rand);
    works(c,288+rand(24),114+rand(7),56+rand(24),rand);
    // Raised pipes run behind the foreground machinery. Dark footings pin
    // them to the engine house; only the playable steel has bright edge caps.
    for(let x=0;x<384;x+=33){rect(c,x,139,2,37,'#2b414a');stroke(c,x+1,143,x+12,132,'#324a50');}
    for(let y=131;y<=135;y+=4){rect(c,0,y,W,2,'#3c555a');rect(c,0,y+1,W,1,'#253b46');}
    for(let i=0;i<3;i++)cable(c,-10,15+i*4,393,30+7*i,12+7*i,'#213b46');
  }
  function insulator(c,x,y,size){
    const p=yardPigment,step=Math.max(2,Math.round(size/3));
    rect(c,x-1,y-size,3,size*2,p.under);
    for(let i=0;i<4;i++){
      const width=Math.max(3,size-i);
      rect(c,x-width,y+i*step,2*width,2,p.deep);
      rect(c,x-width+1,y+i*step,2*width-3,1,i<2?'#769095':'#597277');
    }
  }
  function throat(c){
    const p=yardPigment;
    // Converging bed and long feeds read as a receding railway, away from the player.
    const vanishing=[216,106];
    for(const x of [-112,-23,44,115,246,295,365,448]){
      stroke(c,...vanishing,x,185,'#3c5155');stroke(c,216,107,x+6,185,'#2c454b');
    }
    const poles=[[6,6,20],[76,28,13],[128,56,8],[163,73,5],[187,88,3]];
    for(let i=poles.length-1;i>=0;i--){
      const [x,y,d]=poles[i],head=y+8;
      polygon(c,[[x,head],[x+d,head+2],[x+d-3,147],[x+1,151]],p.deep);
      rect(c,x+2,head+5,2,132-head,p.steel);
      for(let j=-1;j<=1;j++){
        const xx=x+d/2+j*d;
        rect(c,xx-1,head+5,3,10,p.steel);insulator(c,Math.round(xx),head-d/2,Math.max(3,Math.floor(d/2)));
        if(i<poles.length-1){
          const next=poles[i+1];
          cable(c,xx,head-d/2,next[0]+next[2]/2+j*next[2],next[1]+8-next[2]/2,4+d/4,'#31464d');
        }
      }
      rect(c,x-d,head+10,d*3,3,p.under);rect(c,x-d+1,head+10,d*3-2,1,p.edge);
    }
    for(const [x,h] of [[306,69],[335,42],[358,25]]){
      rect(c,x,148-h,8,h,p.under);rect(c,x+1,148-h,1,h,p.edge);insulator(c,x+4,147-h,5);
    }
  }
  function instrument(c,x,y,w,h,rand){
    const p=yardPigment;
    rect(c,x,y,w,h,p.deep);rect(c,x+1,y+1,w-3,h-3,'#425456');
    rect(c,x+2,y+3,w-5,h-7,'#34464b');
    if(w>23){
      const cx=x+Math.round(w*.51),cy=y+Math.round(h*.39);
      oval(c,cx,cy,7,6,p.under);oval(c,cx,cy,5,4,'#938571');
      stroke(c,cx,cy+1,cx+rand(8)-4,cy-3,p.deep);rect(c,cx-1,cy,2,2,p.deep);
    }
    for(let i=3;i<w-4;i+=4)rect(c,x+i,y+h-6,2,2,rand(5)===0?'#a08669':p.steel);
  }
  function dispatch(c){
    const p=yardPigment,rand=sampler(803);
    rect(c,0,9,W,110,'#293a40');
    for(let x=5;x<W;x+=46){
      rect(c,x,11,43,82,'#374a4b');rect(c,x+1,12,41,1,'#56625d');
      instrument(c,x+4,19,33,23,rand);instrument(c,x+5,47,15,31,rand);instrument(c,x+22,47,15,31,rand);
      rect(c,x+2,84,38,3,'#4c534e');rect(c,x+3,87,36,1,'#6b6758');
    }
    for(let x=0;x<W;x+=32){
      rect(c,x,104,27,31,'#273b41');
      for(let y=108;y<125;y+=3)rect(c,x+3,y,20,1,'#425359');
    }
    for(const y of [2,6,94,98]){rect(c,0,y,W,2,p.bronze);rect(c,0,y,W,1,p.copper);}
  }
  function viaduct(c){
    const rand=sampler(3129),p=yardPigment;
    // Mask the arch openings by building voussoirs as a ring, so the fog shows through.
    rect(c,0,35,W,16,'#43585a');
    for(let x=-22;x<410;x+=63){
      const cx=x+28;
      for(let xx=x;xx<x+63;xx++){
        const dx=(xx-cx)/28,underside=Math.abs(dx)<1?86-36*Math.sqrt(1-dx*dx):139;
        rect(c,xx,49,1,Math.round(underside)-49,'#3a5154');
        if(Math.abs(dx)<1)rect(c,xx,Math.round(underside)-3,1,3,'#58706d');
      }
      for(let k=0;k<9;k++){
        const a=(k+.5)*Math.PI/9;
        stroke(c,cx+28*Math.cos(a),86-36*Math.sin(a),cx+32*Math.cos(a),86-40*Math.sin(a),'#34494d');
      }
      for(let y=57;y<133;y+=7)rect(c,x+56,y,4+rand(3),1,'#293f46');
      for(let j=0;j<4;j++)rect(c,x+2+j*14,32,1,5,p.steel);
    }
    for(let i=0;i<48;i++){
      const x=rand(W),y=37+rand(12);rect(c,x,y,3+rand(8),1,'#4b6262');
    }
    stroke(c,0,31,383,31,'#486161');
    cable(c,-18,0,117,34,14,p.deep);cable(c,117,34,393,2,18,p.deep);
  }
  function kiln(c){
    const p=yardPigment;
    for(let i=0;i<5;i++){
      const x=2+58*i;polygon(c,[[x,0],[x+7,0],[x+15,76],[x+8,94]],'#323741');
      stroke(c,x+8,2,x+14,76,'#625655');
      for(let y=12;y<78;y+=16)rect(c,x+Math.floor(y/11),y,7,2,'#514a49');
    }
    const cx=306,cy=75;
    oval(c,cx,cy,62,54,'#2b2f37');oval(c,cx,cy,57,50,'#5f514a');oval(c,cx,cy,51,45,'#76604f');
    oval(c,cx,cy,44,39,'#403c3e');oval(c,cx,cy,36,32,'#9b6c4e');
    oval(c,cx,cy,28,25,'#b87f52');oval(c,cx,cy,19,19,'#c58e5d');
    for(let n=0;n<16;n++){
      const a=n*Math.PI/8,cs=Math.cos(a),sn=Math.sin(a);
      stroke(c,cx+cs*42,cy+sn*38,cx+cs*51,cy+sn*45,'#443f40');
    }
    for(let i=0;i<7;i++){
      const y=48+i*9,fit=Math.sqrt(Math.max(0,1-((y-cy)/35)**2))*33;
      rect(c,cx-fit,y,fit*2,3,'#614b42');rect(c,cx-fit,y,fit*2,1,'#88624a');
    }
    for(const x of [235,239,369,375]){rect(c,x,48,3,96,'#4c4645');rect(c,x,49,1,91,p.copper);}
  }
  function counterweights(c){
    const p=yardPigment;
    for(const [cx,top,width,blocks] of [[69,97,31,5],[110,49,18,4],[303,51,38,6],[347,91,22,5]]){
      for(const side of [-1,1]){
        const x=cx+side*Math.floor(width*.25);
        rect(c,x,0,2,top,p.deep);for(let y=1;y<top;y+=5)rect(c,x,y,1,2,p.edge);
      }
      polygon(c,[[cx-width/2,top+4],[cx-width/2+6,top],[cx+width/2-4,top],[cx+width/2,top+4]],p.steel);
      for(let k=0;k<blocks;k++){
        const x=Math.round(cx-width/2),y=top+4+k*5;
        rect(c,x,y,width,5,p.under);rect(c,x,y,width-2,1,p.edge);rect(c,x+3,y+1,width-7,1,p.steel);
        rect(c,x+width-6,y+1,4,2,p.bronze);
      }
    }
    for(const [x,r] of [[72,12],[112,6],[307,14]]){
      oval(c,x,4,r,r,p.deep);oval(c,x,4,r-4,r-4,p.steel);oval(c,x,4,3,3,p.deep);
    }
  }
  function exchange(c){
    const p=yardPigment;
    for(const [x,y,size] of [[47,61,30],[129,81,18],[212,68,35],[324,47,48]]){
      const reach=Math.round(size*.6),dishY=y+size*.3;
      polygon(c,[[x-2,dishY],[x+2,dishY],[x+7,139],[x-8,139]],p.under);
      for(let yy=y+18;yy<136;yy+=10){stroke(c,x-3,yy,x+4,yy+6,p.edge);}
      polygon(c,[[x-size,y-size*.32],[x-reach,y+size*.1],[x,y+size*.37],[x+reach,y+size*.31],[x+size,y+size*.1],[x+reach,y+size*.43],[x+4,y+size*.55],[x-reach,y+size*.29]],'#54676c');
      stroke(c,x-size,y-size*.32,x+size,y+size*.1,'#768283');
      stroke(c,x-size,y-size*.32,x-3,y+2,'#65777b');
      stroke(c,x-1,y+size*.3,x+8,y-size*.35,p.edge);rect(c,x+6,y-size*.35,4,2,p.copper);
    }
    cable(c,42,113,323,118,14,p.deep);cable(c,129,111,394,99,15,p.deep);
  }
  const scenes=[throat,dispatch,viaduct,kiln,counterweights,exchange];
  const pilotLamps=[[[14,56],[84,55],[133,78]],[[24,44],[70,44],[116,44]],
    [[48,34],[174,34],[300,34]],[[255,120],[261,120],[267,120]],
    [[61,92],[101,45],[302,46]],[[47,65],[129,85],[212,72],[324,51]]];
  function drawYard(c,s,screenTop,panel){
    const loaded=sourceReady();
    let cached=yardPlates.get(panel);
    if(!cached||cached.loaded!==loaded){
      const plate=document.createElement('canvas');plate.width=W;plate.height=186;
      const d=plate.getContext('2d');sky(d,panel);
      const structure=document.createElement('canvas');structure.width=W;structure.height=186;
      const detail=structure.getContext('2d');scenes[panel](detail);
      patina(detail,W,186,449+panel*713,12);
      d.drawImage(structure,0,0);
      const shade=d.createLinearGradient(0,125,0,185);
      shade.addColorStop(0,'#14253200');shade.addColorStop(1,'#11212ecc');
      d.fillStyle=shade;d.fillRect(0,125,W,61);
      cached={loaded,plate};yardPlates.set(panel,cached);
    }
    const top=screenTop-3;c.drawImage(cached.plate,0,top);
    pilotLamps[panel].forEach(([x,y],i)=>{
      const active=!!s.flags?.yardPower;
      const answering=active&&(Math.floor((s.t||0)*2)+i)%7===0;
      if(active)rect(c,x-1,top+y-1,4,3,answering?'#93b9aa66':'#b98d5866');
      rect(c,x,top+y,2,1,active?(answering?'#afd1bd':'#c9a576'):'#786951');
    });
  }
  // Copper acoustic horns, seen from the side. A recessed elliptical mouth makes
  // each receiver distinct from the upright ducts elsewhere in the Sump.
  function listeningHorn(c,x,y,length,side){
    const radius=Math.round(length*.27);
    for(let d=length;d>=0;d--){
      const u=d/length,cx=x+side*d,cy=y-length*(.3*u+.38*u*u);
      const flare=Math.max(2,Math.round(2+(radius-2)*u*u*u));
      const shades=['#594841','#88674f','#a6805f','#7c6856','#455a55','#3b4a47'];
      for(let i=0;i<shades.length;i++){
        const start=Math.round(i*2*flare/shades.length),end=Math.round((i+1)*2*flare/shades.length);
        rect(c,cx,cy-flare+start,1,end-start+1,shades[i]);
      }
      if(d>5&&d<length-3&&d%12===0)rect(c,cx,cy-flare-1,1,2*flare+2,'#5c6358');
    }
    const mx=x+side*length,my=Math.round(y-.68*length);
    oval(c,mx,my,Math.max(2,Math.round(radius*.47)),radius+2,'#b49370');
    oval(c,mx+side,my,Math.max(1,Math.round(radius*.42)),radius,'#253e42');
    oval(c,mx+side,my+1,Math.max(1,Math.round(radius*.27)),Math.max(1,radius-3),'#182c36');
    rect(c,x-4,y-2,8,48,'#354c49');rect(c,x-3,y,2,47,'#8a775a');
    for(let yy=y+5;yy<y+47;yy+=13){rect(c,x-5,yy,10,3,'#44594f');rect(c,x-4,yy,8,1,'#9e8064');}
  }
  function listeningCut(c){
    const rand=sampler(2618);
    // Wind baffles disappear into mist and give the speaking tubes a sense of scale.
    for(let i=0;i<28;i++){
      const x=5+i*14+rand(5),h=18+rand(34),y=113-h;
      polygon(c,[[x+2,y],[x+4,y+3],[x+5,117],[x,117]],'#324e50');
      stroke(c,x+2,y+1,x+1,105,'#637671');
      rect(c,x+1,y+7,4,1,'#87917a');rect(c,x-1,108,7,2,'#455e59');
    }
    cable(c,-16,92,178,85,17,'#324a48');cable(c,178,85,402,95,16,'#324a48');
    listeningHorn(c,24,105,71,1);listeningHorn(c,12,86,45,1);
    listeningHorn(c,348,81,58,-1);listeningHorn(c,374,101,33,-1);
    for(let i=0;i<62;i++){
      const x=rand(W),y=16+rand(80);
      if(x>110&&x<249){rect(c,x,y,2+rand(9),1,'#a2b3a51a');}
    }
  }
  function foundryBell(c,x,y,scale){
    // Cast a curved profile a scanline at a time. The strong highlight stops at
    // the mould bands, while the underside has a separate dark elliptical lip.
    const body=50*scale,mouth=28*scale;
    const shell=['#303940','#3b3d40','#484341','#574a42','#665348','#775d4c','#84664e',
      '#937153','#a8805b','#b18a63','#bb966e','#c4a17b','#ceac83'];
    for(let yy=0;yy<Math.ceil(body);yy++){
      const t=yy/body;
      const radius=mouth*(.32+.35*Math.min(1,t*5)+.19*t*t+.21*Math.pow(t,6));
      const half=Math.ceil(radius);
      for(let xx=-half;xx<=half;xx++){
        const u=xx/half;
        const key=Math.max(0,1-Math.abs(u+.39)*1.32);
        const edge=Math.max(0,1-Math.abs(u));
        const mould=(t>.16&&t<.20)||(t>.72&&t<.75)||(t>.81&&t<.85);
        const groove=(t>.20&&t<.23)||(t>.75&&t<.775)||(t>.85&&t<.88);
        const narrow=Math.max(0,1-Math.abs(u+.47)*9)*.17;
        const patinated=(Math.sin(xx*.34+t*8)*.45+Math.sin(t*29+u*9)*.25+noise((xx+x)*197+yy*11)*.6)*.05;
        const bounced=Math.max(0,1-Math.abs(u-.68)*4)*.13;
        const lighting=key*.61+edge*.13+narrow+bounced+(mould?.20:0)-(groove?.24:0)+.05*Math.sin(t*4)+patinated;
        const index=Math.max(0,Math.min(12,Math.floor(lighting*12.5)));
        rect(c,x+xx,y+yy,1,1,shell[index]);
      }
    }
    const bottom=Math.round(y+body);
    oval(c,x,bottom,Math.ceil(mouth*1.08),Math.max(2,Math.round(4*scale)),'#a17c58');
    oval(c,x+1,bottom+1,Math.ceil(mouth),Math.max(1,Math.round(3*scale)),'#363738');
    rect(c,x-1,bottom-2,3,6*scale,'#534a40');
    oval(c,x+1,bottom+Math.round(5*scale),Math.max(2,Math.round(3*scale)),Math.max(2,Math.round(3*scale)),'#73624b');
    const markY=Math.round(y+body*.48),m=Math.max(2,Math.round(4*scale));
    for(const side of [-1,1]){
      stroke(c,x,markY-m,x+side*m,markY,'#715740');
      stroke(c,x+side*m,markY,x,markY+m,'#9c7853');
      for(let k=1;k<=3;k++){
        const dx=side*(m+3*k*scale);
        rect(c,x+dx,markY+Math.abs(k-2),1,Math.max(1,scale*2),'#8d7459');
      }
      for(let k=1;k<4;k++){
        const xx=x+side*mouth*.20*k,yy=y+body*.85;
        stroke(c,xx,yy-3*scale,xx+side*2,yy,'#756047');stroke(c,xx+side*2,yy,xx+side*4,yy-2*scale,'#ae8962');
      }
    }
    oval(c,x,y,Math.max(2,Math.ceil(mouth*.35)),Math.max(1,Math.round(2*scale)),'#675643');
    rect(c,x-3*scale,y-5*scale,6*scale,6*scale,'#74614e');
    rect(c,x-scale,y-4*scale,2*scale,4*scale,'#252e33');
    for(let yy=0;yy<y-5*scale;yy+=6){
      rect(c,x-2,yy,4,5,'#5b5248');rect(c,x-1,yy+1,2,2,'#2a363a');
      rect(c,x-2,yy+1,1,2,'#93816b');
    }
  }
  function bellFoundry(c){
    for(const [x,tilt] of [[5,40],[81,22],[165,2],[255,-19],[357,-43]]){
      polygon(c,[[x,0],[x+8,0],[x+tilt+7,38],[x+tilt,38]],'#423e40');
      stroke(c,x+7,0,x+tilt+7,38,'#7b6455');
    }
    for(let i=0;i<14;i++){
      const x=6+i*28,y=3+i%3;
      rect(c,x,y,20,5,'#675b51');rect(c,x+2,y+1,16,1,'#958276');
      stroke(c,x+2,y+6,x+16,y+15,'#68594e');
    }
    for(const x of [61,238,263]){
      polygon(c,[[x,10],[x+9,9],[x-7,81],[x-27,98]],'#c6ac7220');
      rect(c,x+1,9,7,2,'#ab9373');
    }
    foundryBell(c,61,25,.62);foundryBell(c,252,29,.72);foundryBell(c,152,19,1.27);
    cable(c,-12,15,113,7,15,'#4f4541');cable(c,198,8,370,16,18,'#4f4541');
  }
  function soundingWell(c){
    // The shafts cross the far chamber above the waterline. Its reflected image
    // is built before the playable floor is drawn, so it never mirrors the rover.
    const cx=157,horizon=87;
    rect(c,0,0,W,186,'#142c4b78');
    for(const [x,w] of [[12,11],[69,7],[234,8],[319,12],[366,14]]){
      rect(c,x,0,w,horizon,'#273c4e');rect(c,x+w-2,0,2,horizon,'#4c6571');
      for(let yy=10;yy<horizon;yy+=17){rect(c,x-2,yy,w+4,3,'#3c5260');rect(c,x-1,yy,w+2,1,'#637a7f');}
    }
    for(let k=0;k<4;k++){
      const rx=36+k*16,ry=37+k*12;
      for(let x=-rx;x<=rx;x++){
        const y=Math.round(horizon-ry*Math.sqrt(Math.max(0,1-(x/rx)**2)));
        const rib=k===3?7:4;
        rect(c,cx+x,y,1,rib,'#344e62');rect(c,cx+x,y,1,2,'#607a87');
        if((x+rx)%11===0)rect(c,cx+x,y+2,1,rib-2,'#293f55');
      }
    }
    polygon(c,[[143,0],[168,0],[191,87],[124,87]],'#8dcac01a');
    polygon(c,[[151,0],[159,0],[171,87],[140,87]],'#c6d2b91f');
    const reflection=document.createElement('canvas');reflection.width=W;reflection.height=horizon;
    reflection.getContext('2d').drawImage(c.canvas,0,0,W,horizon,0,0,W,horizon);
    rect(c,0,horizon,W,186-horizon,'#233a4b');
    const rand=sampler(2818);
    c.save();c.globalAlpha=.49;
    for(let row=0;row<72;row++){
      const sy=horizon-1-Math.floor(row*1.08),sway=Math.round(Math.sin(row*.63)*row*.065);
      if(sy>=0)c.drawImage(reflection,0,sy,W,1,sway,horizon+row,W,1);
    }
    c.restore();
    for(let i=0;i<135;i++){
      const y=horizon+rand(63),x=rand(W);
      rect(c,x,y,3+rand(11),1,Math.abs(cx-x)<46?'#93c4b339':'#97b5b41d');
    }
    // The sunken rim is mostly underwater. Broken glints at its far edge
    // describe a circular cistern without drawing another walkable platform.
    for(let x=-55;x<=55;x++){
      const distance=Math.sqrt(Math.max(0,1-(x/55)**2));
      const far=96-Math.round(4*distance),near=96+Math.round(8*distance);
      if((x+57)%9<6)rect(c,cx+x,far,1,1,'#6e9396');
      if((x+33)%13<8)rect(c,cx+x,near,1,1,'#91b5ad65');
    }
  }
  const soundingViews=[
    {paint:listeningCut,source:'mossworks',crop:[.31,.10,.55],tint:'#476760',light:'#9c9b77'},
    {paint:bellFoundry,source:'background',crop:[.08,.04,.48],tint:'#574748',light:'#b08960'},
    {paint:soundingWell,source:'canopy',crop:[.48,.05,.41],tint:'#183346',light:'#5a858e'}
  ];
  function drawSounding(c,s,screenTop,panel){
    const view=soundingViews[panel],source=images[view.source],loaded=!!(source.complete&&source.naturalWidth);
    const key=26+panel;
    let cached=yardPlates.get(key);
    if(!cached||cached.loaded!==loaded){
      const plate=document.createElement('canvas');plate.width=W;plate.height=186;
      const d=plate.getContext('2d'),mist=d.createLinearGradient(0,0,0,148);
      mist.addColorStop(0,view.tint);mist.addColorStop(.58,view.light);mist.addColorStop(1,'#253841');
      d.fillStyle=mist;d.fillRect(0,0,W,186);patina(d,W,186,9261+panel,6);
      if(loaded){
        const [x,y,scale]=view.crop,width=source.naturalWidth*scale,height=width*186/W;
        d.save();d.globalAlpha=panel===1?.46:.54;
        d.drawImage(source,source.naturalWidth*x,source.naturalHeight*y,width,height,0,0,W,186);d.restore();
      }
      if(panel===2)view.paint(d);
      else{
        const metal=document.createElement('canvas');metal.width=W;metal.height=186;
        const m=metal.getContext('2d');view.paint(m);
        patina(m,W,186,344+panel*499,15);d.drawImage(metal,0,0);
      }
      const depth=d.createLinearGradient(0,79,0,149);
      depth.addColorStop(0,'#13263200');depth.addColorStop(1,'#111e2cc7');
      d.fillStyle=depth;d.fillRect(0,79,W,107);
      cached={loaded,plate};yardPlates.set(key,cached);
    }
    const top=screenTop-3;c.drawImage(cached.plate,0,top);
    if(panel===2){
      const phase=((s.t||0)*.39)%1,radius=3+Math.floor(phase*29);
      c.save();c.globalAlpha=(1-phase)*.56;
      for(const side of [-1,1])for(let x=0;x<radius;x++){
        const y=Math.round(3*Math.sqrt(Math.max(0,1-(x/radius)**2)));
        rect(c,157+side*x,top+98+y,1,1,'#a2c7ba');
      }
      c.restore();
    }
  }
  // The Dock sits at the warm, staffed end of the line. The canopy and pump
  // hall are recessed behind the existing beacon, Listening Cut door and rover.
  const stationLayers=new Map();
  function mineralWear(c,w,h,sourceX,sourceY){
    if(!sourceReady())return;
    const im=images.background;
    // Break up the flat concrete with real mineral and oxidation detail from
    // the old works. Mask it to the masonry, leaving open air transparent.
    c.save();c.globalCompositeOperation='source-atop';c.globalAlpha=.16;
    c.drawImage(im,im.naturalWidth*sourceX,im.naturalHeight*sourceY,w*1.8,h*1.8,0,0,w,h);
    c.restore();
  }
  function berth(c){
    const rand=sampler(19001);
    polygon(c,[[0,91],[24,82],[44,85],[61,96],[61,185],[0,185]],'#293b3c');
    polygon(c,[[0,92],[25,80],[45,83],[63,95],[59,97],[43,86],[25,84],[0,96]],'#485356');
    for(let y=100;y<184;y+=6){
      rect(c,0,y,58,1,'#1f3034');
      for(let x=rand(9);x<56;x+=11+rand(5))rect(c,x,y+1,1,5,'#213337');
    }
    for(const wx of [3,22,41]){
      rect(c,wx-1,102,15,23,'#1c292c');
      for(let row=0;row<2;row++)for(let col=0;col<3;col++){
        const x=wx+col*4,y=104+row*8;
        rect(c,x,y,3,7,['#855f40','#ae8251','#997347','#b9905e'][rand(4)]);
        rect(c,x,y,3,2,'#d3a86a7f');
      }
      rect(c,wx-2,121,16,2,'#5e6256');
    }
    mineralWear(c,63,185,.10,.32);
    // The overhead beam ends in an angled cantilever; it has no platform lip.
    c.save();c.translate(0,12);
    polygon(c,[[0,53],[119,55],[145,65],[128,70],[0,70]],'#2f393b');
    stroke(c,0,53,119,55,'#69706a');stroke(c,119,55,144,65,'#72786c');
    stroke(c,0,68,128,68,'#53534a');
    for(let x=1;x<123;x+=15){
      stroke(c,x,57,x+12,66,'#6b6656');
      stroke(c,x+12,66,x+14,58,'#4e5551');rect(c,x,67,2,1,'#9a8766');
    }
    for(const x of [7,58]){
      rect(c,x,69,4,101,'#263638');rect(c,x,70,1,97,'#616450');
      polygon(c,[[x+3,69],[x+25,69],[x+3,90]],'#354346');
      stroke(c,x+4,87,x+20,72,'#737463');
      rect(c,x-2,167,8,5,'#394843');
    }
    cable(c,-9,77,140,70,9,'#253637');
    for(const x of [36,103]){
      const y=x===36?79:83;
      rect(c,x-1,68,2,y-68,'#3d4040');
      polygon(c,[[x-2,y-3],[x+2,y-3],[x+5,y],[x-5,y]],'#554e40');
      rect(c,x-5,y,10,1,'#8a7856');rect(c,x-3,y+1,6,2,'#f4c989');
      const glow=c.createRadialGradient(x,y+3,1,x,y+3,24);
      glow.addColorStop(0,'#ffb35c65');glow.addColorStop(.48,'#e7a54e21');glow.addColorStop(1,'#e7a54e00');
      c.fillStyle=glow;c.fillRect(x-24,y-20,48,52);
      polygon(c,[[x-3,y+3],[x+3,y+3],[x+18,y+62],[x-11,y+62]],'#f2bd7610');
    }
    c.restore();
    patina(c,W,205,1934,12);
  }
  function outfall(c){
    const rand=sampler(19002),cx=239,cy=121;
    // A barrel-vaulted outfall cuts into a buttressed concrete bank. The
    // rectangular banks descend into the reservoir and can never be stood on.
    polygon(c,[[182,186],[186,140],[194,110],[207,95],[229,86],[248,87],[270,99],[278,116],[285,186]],'#445958');
    for(let row=0;row<7;row++){
      const y=149+row*6;
      stroke(c,189,y,273,y+1,'#293f42');
      stroke(c,189,y+1,273,y+2,'#65736b');
      for(let x=191+row%2*7;x<272;x+=13+rand(5)){
        stroke(c,x,y+1,x-1,y+5,'#2c4444');rect(c,x+2,y+2,2+rand(4),1,'#718075');
      }
    }
    for(let i=0;i<5;i++){
      const rx=31-i*2,ry=30-i*2;
      oval(c,cx,cy,rx,ry,['#253a40','#6c7971','#535e59','#374c52','#1e333b'][i]);
    }
    for(let index=0;index<16;index++){
      const angle=index*Math.PI/8;
      stroke(c,cx+29*Math.cos(angle),cy+28*Math.sin(angle),cx+24*Math.cos(angle),cy+23*Math.sin(angle),'#344b4e');
      const x=cx+32*Math.cos(angle),y=cy+31*Math.sin(angle);
      rect(c,x-1,y,3,2,'#37484a');rect(c,x-1,y,2,1,'#86908a');
    }
    oval(c,cx,cy,20,20,'#192f38');
    for(let x=-15;x<=15;x+=5){
      const extent=Math.floor(Math.sqrt(19*19-x*x));
      rect(c,cx+x-1,cy-extent,2,2*extent,'#344b4c');
      rect(c,cx+x-1,cy-extent,1,extent,'#506562');
    }
    for(const x of [186,278]){
      polygon(c,[[x,107],[x+5,102],[x+10,118],[x+11,185],[x-2,185]],'#3b4d50');
      stroke(c,x,109,x-2,177,'#6c7366');
      for(let y=123;y<179;y+=13)rect(c,x,y,8,2,'#293e43');
    }
    for(let i=0;i<75;i++){
      const x=(rand(2)?195:264)+rand(9),y=118+rand(47);
      rect(c,x,y,2,1+rand(3),'#8a918223');
    }
    // Old flood marks and leaching run vertically across the block joints.
    for(const x of [189,199,208,251,269,279]){
      const y=118+rand(25);
      rect(c,x,y,2,16+rand(27),'#a99c6b48');rect(c,x+2,y+5,1,21+rand(12),'#a99c6b31');
    }
    for(let x=193;x<280;x+=3+rand(4)){
      const y=153+rand(2);
      rect(c,x,y,2+rand(3),1,'#8a967252');rect(c,x,y-1,1,2+rand(3),'#8b95652f');
    }
    mineralWear(c,W,185,.0,.36);
    patina(c,W,205,1987,16);
  }
  function stationLayer(room){
    const key=room+':'+sourceReady();let layer=stationLayers.get(key);
    if(layer)return layer;
    layer=document.createElement('canvas');layer.width=W;layer.height=205;
    const ctx=layer.getContext('2d');
    if(room===0)berth(ctx);else outfall(ctx);
    stationLayers.set(key,layer);return layer;
  }
  function reservoir(c,s,cameraY){
    const low=!!s.flags?.drained,level=low?175:153,depth=185-level,t=s.t||0;
    if(sourceReady()){
      const im=images.background,frame=roomFrames[1];
      const sw=im.naturalWidth*frame.w,sh=sw*190/W;
      const sx=Math.min(im.naturalWidth-sw,im.naturalWidth*frame.x);
      const sy=Math.min(im.naturalHeight-sh,im.naturalHeight*frame.y);
      const top=HUD+cameraY-4-cameraY*.12;
      c.save();c.globalAlpha=.87;c.translate(W,level);c.scale(-1,-1);
      for(let i=0;i<depth;i+=2){
        const shift=Math.round(Math.sin(i*.58+t*1.7)*(1+i*.075));
        const sourceY=sy+(level-top-i*1.5)*sh/190;
        c.drawImage(im,sx,sourceY,sw,Math.max(1,sh*2/190),shift,-i-2,W,2);
      }
      c.restore();
      // Reflect the retaining wall into the exact same surface as the distant world.
      c.save();c.globalAlpha=.56;c.translate(0,level);c.scale(1,-.62);
      c.drawImage(stationLayer(1),0,level-depth/.62,W,depth/.62,0,-depth/.62,W,depth/.62);c.restore();
    }
    const wash=c.createLinearGradient(0,level,0,185);
    wash.addColorStop(0,'#163a459e');wash.addColorStop(1,'#0a273acc');
    c.fillStyle=wash;c.fillRect(0,level,W,depth);
    const rand=sampler(19200);
    for(let i=0;i<48;i++){
      const y=level+rand(depth),x=rand(W)+Math.round(2*Math.sin(t*.85+i));
      rect(c,x,y,2+rand(12),1,i%4===0?'#90bcb345':'#5d929337');
    }
    if(!low){
      for(let i=0;i<7;i++){
        const y=138+(Math.floor(11*t)+i*7)%15;
        rect(c,231+i*2,y,1,Math.min(4,153-y),'#9bbdb160');
      }
      for(let x=218;x<261;x+=6)rect(c,x+Math.round(Math.sin(x+t*2)),153+(x%3),4,1,'#a8c2b383');
    }
  }
  function stationAtmosphere(c,s,cameraY){
    if(s.room===0){
      const warm=c.createLinearGradient(0,75,270,140);
      warm.addColorStop(0,'#a25c2842');warm.addColorStop(.65,'#8b5e2921');warm.addColorStop(1,'#8b5e2900');
      c.fillStyle=warm;c.fillRect(0,0,300,184);c.drawImage(stationLayer(0),0,0);
      if(s.checkpoint===0){
        const halo=c.createRadialGradient(39,147,1,39,147,17);
        halo.addColorStop(0,'#8bd8ba43');halo.addColorStop(1,'#8bd8ba00');
        c.fillStyle=halo;c.fillRect(22,130,34,34);
      }
    }else{
      rect(c,0,0,W,185,'#123c4a32');c.drawImage(stationLayer(1),0,0);
      reservoir(c,s,cameraY);
    }
  }
  let risePlate=null,etchedRise=false;
  function riseIron(c,x,y,w,h){
    rect(c,x,y,w,h,'#243941');rect(c,x+1,y+1,w-3,h-3,'#47585d');
    rect(c,x+2,y+1,w-4,2,'#7c8580');rect(c,x+2,y+3,2,h-5,'#5d7071');
    rect(c,x+2,y+h-6,w-4,4,'#34484e');
  }
  function winding(c,cx,top,radius,turns){
    // A cylindrical spool has the same lateral highlight on every copper turn.
    const pole=['#293944','#455966','#6b8187','#8b9892','#647c84','#415662','#2a3e49'];
    const rib=['#403a3c','#695044','#956344','#b17750','#c79768','#d8ad7f','#be8c65','#9c7157','#775b50','#53494a'];
    const width=radius*2+1,stem=Math.round(radius*.69),bottom=top+turns*5+9;
    for(let x=-stem;x<=stem;x++){
      const f=(x+stem)/(2*stem);
      rect(c,cx+x,top-24,1,bottom-top+35,pole[Math.min(pole.length-1,Math.floor(f*pole.length))]);
    }
    for(let y=top-18;y<top;y+=6){
      rect(c,cx-stem-2,y,2*stem+4,2,'#344750');rect(c,cx-stem+4,y,stem,1,'#94a29d');
    }
    for(let n=0;n<turns;n++){
      const y=top+5*n;
      for(let x=-radius;x<=radius;x++){
        const f=(x+radius)/(width-1),bow=Math.round(Math.sqrt(Math.max(0,1-(x/radius)**2))*4);
        const value=rib[Math.min(rib.length-1,Math.floor(f*rib.length))];
        rect(c,cx+x,y+bow,1,4,value);
        rect(c,cx+x,y+bow+3,1,1,'#594645');
        if(n%4===0&&f>.35&&f<.56)rect(c,cx+x,y+bow,1,1,'#d7b58b');
      }
    }
    for(const y of [top-3,bottom-3]){
      oval(c,cx,y,radius+5,6,'#24353e');oval(c,cx,y-3,radius+5,5,'#657578');
      rect(c,cx-radius-5,y-3,width+9,4,'#42565f');
      rect(c,cx-radius+4,y+1,Math.floor(radius*1.14),1,'#86938c');
      for(const dx of [-radius+2,radius-6])bolt(c,cx+dx,y-2);
    }
    for(const dx of [-radius+4,radius-8]){
      rect(c,cx+dx,top+4,4,turns*5-3,'#3d5157');rect(c,cx+dx,top+4,1,turns*5-4,'#82908b');
    }
    return bottom;
  }
  function magneticRise(c,s,cameraY){
    const loaded=sourceReady();
    if(!risePlate||etchedRise!==loaded){
      risePlate=document.createElement('canvas');risePlate.width=768;risePlate.height=394;
      const d=risePlate.getContext('2d');
      // Deeper shaft posts and two traveling conductors recede behind the casting.
      for(const x of [36,76,324,355,583,624]){
        rect(d,x,0,2,359,'#243c4dcc');rect(d,x+3,0,1,355,'#67828b88');
      }
      for(const x of [108,293]){
        riseIron(d,x,0,11,350);
        for(let y=16;y<340;y+=32){rect(d,x+3,y,5,9,'#283d47');rect(d,x+4,y,3,1,'#86948c');}
      }
      for(const y of [20,64,254]){
        riseIron(d,104,y,207,7);
        for(let x=111;x<301;x+=47){
          stroke(d,x,y+8,x+30,y+28,'#455c66');stroke(d,x,y+9,x+30,y+29,'#566a6f');
          stroke(d,x+30,y+28,x+43,y+8,'#3a505b');bolt(d,x+2,y+2);
        }
      }
      // Two insulator banks support the lifting magnet. They live behind the real magnetic wall.
      for(const [x,r,t,n] of [[169,24,99,22],[246,29,77,29]]){
        const bottom=winding(d,x,t,r,n);
        riseIron(d,x-r-5,bottom+12,r*2+10,12);riseIron(d,x-12,bottom+23,24,93);
        for(let y=bottom+30;y<bottom+105;y+=15){rect(d,x-9,y,16,3,'#283e49');rect(d,x-7,y+3,11,1,'#687976');}
        rect(d,x-3,51,6,t-52,'#4e5e65');rect(d,x-2,52,2,t-53,'#84938f');
      }
      // Porcelain bushings interrupt the overhead bus; their highlights run away from the copper coils.
      for(const x of [169,246]){
        for(let k=0;k<4;k++){oval(d,x,51-k*5,9-k,3,'#354a53');rect(d,x-8+k,49-k*5,12-2*k,2,'#a6ad95');}
        rect(d,x-2,25,4,9,'#826a50');
      }
      cable(d,32,11,169,26,11,'#333f4b');cable(d,169,26,246,26,8,'#8a7155');
      cable(d,246,26,499,6,17,'#364653');cable(d,246,24,499,4,17,'#717974');
      riseIron(d,103,312,209,13);
      for(const x of [122,279]){riseIron(d,x,326,16,61);bolt(d,x+4,329);}
      if(loaded){
        d.save();d.globalCompositeOperation='source-atop';d.globalAlpha=.14;
        const im=images.background;
        d.drawImage(im,im.naturalWidth*.15,im.naturalHeight*.21,588,394,0,0,768,394);
        d.restore();
      }
      etchedRise=loaded;
    }
    const y=HUD+cameraY-6-cameraY*.16;
    c.save();c.globalAlpha=.96;c.drawImage(risePlate,0,y,384,197);c.restore();
    if(s.flags?.magnet){
      // One moving pilot light along the crane rail, separate from the bright foreground climb stripes.
      const tick=Math.floor((s.t||0)*2)%5;
      rect(c,150,y+107-tick*7,2,1,'#9ba797');
    }
  }

  const paintedRooms={0:'dock',1:'sump',2:'sump',3:'induction'};
  function drawDistrict(c,s,cameraY) {
    const image=images[paintedRooms[s.room]];
    if(!image?.complete||!image.naturalWidth)return false;
    const top=HUD+cameraY, inset=s.room===2?100:0;
    const sw=image.naturalWidth-inset,sh=sw*178/W;
    const sy=Math.max(0,Math.min(image.naturalHeight-sh,16+cameraY*.18));
    c.drawImage(image,inset,sy,sw,sh,0,top,W,178);
    rect(c,0,top,W,178,s.room===0?'#14223548':s.room===3?'#09132a32':'#0a22272c');
    if(s.room===1&&!s.flags.drained){
      for(let n=0;n<9;n++){
        const x=19+n*43+Math.round(Math.sin(s.t*.86+n)*2);
        rect(c,x,top+131+(n*13)%23,3+n%4,1,'#9cc4ae46');
      }
    }
    if(s.room===0)rect(c,228,184,48,60,'#071a24');
    return true;
  }
  function drawInteriorDetail(c,s) {
    if(s.room!==6&&s.room!==7)return;
    c.save();
    function grille(x,y){
      rect(c,x,y,27,9,'#213239');rect(c,x+1,y,25,1,'#626f69');
      for(let i=0;i<8;i++)rect(c,x+3+i*3,y+2,1,5,'#13282d');
    }
    if(s.room===6){
      grille(41,73);grille(286,153);
      // A maintenance lane bends around the two solid bulkheads.
      for(const [x,y] of [[65,145],[71,145],[78,145],[109,145],[115,145],[122,145],
                             [259,98],[265,98],[272,98],[307,98],[313,98],[320,98]]){
        rect(c,x,y,3,1,'#758078');rect(c,x+1,y-1,2,1,'#69746c');
      }
      rect(c,83,177,53,1,'#24363b');rect(c,83,178,53,1,'#4c5955');
      for(let x=87;x<135;x+=12)rect(c,x,176,2,3,'#606a60');
    }else{
      rect(c,23,46,5,99,'#1a3036');rect(c,24,46,1,99,'#536968');
      for(let y=50;y<145;y+=21)rect(c,22,y,7,2,'#627371');
      for(const [x,y] of [[46,57],[286,163]]){
        grille(x,y);rect(c,x-1,y+10,30,1,'#375457');
        rect(c,x+2+Math.floor(s.t*4+x)%22,y+11,3,1,'#537670');
      }
    }
    c.restore();
  }
  function railGlints(c,b,t) {
    const track=b.h-8,phase=Math.floor(t*14)%32;
    for(let offset=(32-phase)%32;offset<track;offset+=32){
      const y=b.y+3+offset;
      rect(c,b.x+2,y,1,Math.min(3,track-offset),'#8ec7bd');
      rect(c,b.x+3,y,1,1,'#d4e4bd');
    }
  }
  function drawBackground(c,s,{cameraY=0}={}){
    if(drawDistrict(c,s,cameraY))return;
    const warm=s.room>=8&&s.room<=9,screenTop=HUD+cameraY;
    rect(c,0,screenTop,W,VIEW_BOTTOM-HUD,warm?'#10252b':'#102832');
    const hasMoss=images.mossworks&&images.mossworks.complete&&images.mossworks.naturalWidth;
    const frame=roomFrames[s.room]||roomFrames[0];
    if(frame.source==='sounding'){
      drawSounding(c,s,screenTop,frame.panel);
      return;
    }
    if(frame.source==='switchyard'){
      drawYard(c,s,screenTop,frame.panel);
      return;
    }
    const hasCanopy=images.canopy&&images.canopy.complete&&images.canopy.naturalWidth;
    const useMoss=frame.source==='mossworks'||(!frame.source&&s.room>=11);
    const image=frame.source==='canopy'&&hasCanopy?images.canopy:(useMoss||frame.source==='canopy')&&hasMoss?images.mossworks:images.background;
    if(image&&image.complete&&image.naturalWidth){
      c.save();c.globalAlpha=warm?.62:.92;
      const sw=image.naturalWidth*frame.w,sh=sw*190/384;
      const sx=Math.min(image.naturalWidth-sw,image.naturalWidth*frame.x),sy=Math.min(image.naturalHeight-sh,image.naturalHeight*frame.y);
      if(frame.mirror){c.translate(384,0);c.scale(-1,1);}
      // The source already contains its machinery, roots, and lights. Keep that
      // composition intact instead of laying procedural industrial props on top.
      c.drawImage(image,sx,sy,sw,sh,0,screenTop-4-cameraY*.12,384,190);c.restore();
      rect(c,0,screenTop,384,177,frame.grade||(warm?'#172c2e35':'#102f3518'));
    }else distantArchitecture(c,s,cameraY);
    if(s.room===0||s.room===1)stationAtmosphere(c,s,cameraY);
    if(s.room===3)magneticRise(c,s,cameraY);
    // This dark shaft is gameplay depth under the real open dock drop.
    if(s.room===0)rect(c,228,184,48,60,'#071a24');
  }
  // Each texel is one backing pixel. World bounds and collision still use the 384-wide field.
  const TERRAIN_SCALE=2;
  const rockColors={
    sump:{cap:'#b5bcaa',lip:'#698578',joint:'#172a32',foot:'#22383e',faces:['#435b5b','#4a605b','#415556','#56685f'],facet:'#667973',vein:'#849084'},
    moss:{cap:'#c1bf99',lip:'#77875c',joint:'#1e3131',foot:'#2c413b',faces:['#51644c','#526a54','#405950','#57685a'],facet:'#718368',vein:'#97a282'},
    yard:{cap:'#b6c0b1',lip:'#75868c',joint:'#202c38',foot:'#303e47',faces:['#495e68','#4f6268','#455764','#58686a'],facet:'#70838a',vein:'#8b9998'},
    kiln:{cap:'#cab395',lip:'#8b7969',joint:'#302c32',foot:'#423c3f',faces:['#665850','#6b5d54','#625656','#715f53'],facet:'#877768',vein:'#ad9176'}
  };
  // In the Sump crops these three waterfall mouths meet the floor. Coordinates follow the room frame.
  const spillways={2:[168,185,204],3:[164,173,187],4:[165,172],5:[177,185,203],11:[187,200]};
  function wetStone(c,w,h,p,rand,room,worldX){
    const moss=p===rockColors.moss;
    if(!moss&&p!==rockColors.sump)return;
    for(let x=rand(17)-8;x<w;x+=32+rand(52)){
      const length=9+rand(moss?33:16),depth=2+rand(moss?8:5);
      // A ledge catches moss in hairline seams. The clusters taper into mineral spalls.
      for(let xx=0;xx<length;xx++){
        const taper=Math.sin(Math.PI*(xx+.5)/length);
        const hang=Math.round(taper*depth*(.55+.42*Math.cos(xx*.47)));
        rect(c,x+xx,3,1,hang,moss?'#64714d':'#536b60');
        if(hang>2)rect(c,x+xx,3,1,1,moss?'#a3a372':'#8c9f89');
        if(hang>3)rect(c,x+xx,3+hang,1,1,moss?'#384b41':'#304c4c');
      }
    }
    if(worldX==null)return;
    // Seepage persists below these limestone lips after the water above drains.
    const centers=(spillways[room]||[]).map(x=>x*2-worldX);
    const spillCount=centers.length;
    for(let x=18+rand(45);x<w;x+=95+rand(116))centers.push(x);
    for(const [index,center] of centers.entries()){
      if(center<-12||center>w+12)continue;
      const spill=index<spillCount,run=Math.min(h-4,(spill?29:15)+rand(24)),width=4+rand(6),kink=rand(5)-2;
      for(let i=-width;i<=width;i++){
        const lane=Math.abs(i)/width,taper=1-lane*lane;
        const length=Math.round(run*taper*(.45+.5*Math.cos(i*1.07)**2));
        for(let dy=2;dy<length;dy++){
          const shift=Math.round(kink*Math.min(1,(dy-2)/14));
          const color=i===-1&&dy<run*.7?(spill?'#aacac3ae':'#92aea254'):i<0?(spill?'#709e9ba6':'#62827d61'):'#203e4966';
          rect(c,center+i+shift,dy,1,1,color);
        }
      }
      if(spill){
        rect(c,center-width+2,0,width*2-3,2,'#658c8c');
        rect(c,center-width+2,0,width-1,1,'#c2d4c3');
        rect(c,center-2,0,3,2,'#adc9be');
      }
      rect(c,center-width+2,2,width+1,1,'#a8b8a79e');
      rect(c,center+kink-2,run-3,3,1,'#78948b72');
    }
  }
  function rockFace(c,w,h,rand,p,worldX,room){
    rect(c,0,0,w,h,p.joint);
    const spacing=16,columns=Math.ceil(w/spacing)+1;
    let ceiling=Array(columns).fill(2),deepest=2;
    const edge=(row,x)=>{
      const k=Math.min(columns-2,Math.floor(x/spacing)),f=(x-k*spacing)/spacing;
      return Math.round(row[k]*(1-f)+row[k+1]*f);
    };
    while(deepest<h){
      const thickness=19+rand(16),phase=rand(96),wave=24+rand(43);
      const floor=ceiling.map((y,i)=>Math.max(y+11,
        Math.round(y*.36+deepest*.64+thickness+Math.sin((i*spacing+phase)/wave)*6+rand(10)-5)));
      for(let x=0;x<w;){
        const span=Math.min(w-x,19+rand(57)),end=x+span;
        const body=p.faces[rand(p.faces.length)],brow=2+rand(8),heel=2+rand(6),shelf=4+rand(9);
        const peak=.16+rand(43)/100,cut=.38+rand(39)/100,slant=4+rand(9);
        const lit=rand(4)===0?'#d6d3a23a':'#cad7ba29';
        for(let xx=x;xx<end;xx++){
          const dx=xx-x,f=dx/Math.max(1,span-1),top=edge(ceiling,xx),bottom=edge(floor,xx)-1;
          const shoulder=Math.max(0,brow-1.2*dx,heel-(end-1-xx)*.8);
          const yy=top+Math.round(shoulder)+1,height=bottom-yy;
          if(height<=0)continue;
          rect(c,xx,yy,1,height,body);
          const under=Math.max(1,Math.round(1+f*3+Math.max(0,f-cut)*slant));
          rect(c,xx,bottom-under,1,under,p.foot);
          const plane=Math.round(Math.max(0,shelf-Math.abs(f-peak)*span*.46+Math.sin(f*5)*1.8));
          if(plane){
            rect(c,xx,yy,1,Math.min(height,plane),lit);
            if(f<peak+.18)rect(c,xx,yy,1,1,p.facet);
          }
          const toe=Math.max(0,Math.round((f-cut)*26));
          if(toe>0)rect(c,xx,bottom-under-toe,1,toe,'#172d383b');
          if(f>.86&&f<.94)rect(c,xx,bottom-under-1,1,1,'#93a89b49');
        }
        if(span>22){
          const ox=x+6+rand(Math.max(1,span-20)),oy=edge(ceiling,ox)+6+rand(4);
          const reach=Math.min(end-ox-2,8+rand(11)),dip=2+rand(5),polarity=rand(2)?1:-1;
          stroke(c,ox,oy,ox+4,oy+polarity*2,p.facet);
          stroke(c,ox+4,oy+polarity*2,ox+reach,oy+polarity*2-1,p.facet);
          stroke(c,ox+5,oy+polarity*2+1,ox+reach,oy+polarity*2,p.foot);
          if(span>40){
            const fx=x+Math.floor(span*(.2+rand(40)/100)),fy=edge(ceiling,fx)+10;
            stroke(c,fx,fy,fx+5,fy+1,p.foot);
            stroke(c,fx+5,fy+1,fx+12,fy+dip,p.foot);
            rect(c,fx+7,fy+3,3,1,'#aab7a35e');
          }
          for(let j=0;j<Math.floor(span/8);j++){
            const xx=x+3+rand(span-8),upper=edge(ceiling,xx),bottom=edge(floor,xx);
            const yy=upper+4+rand(Math.max(1,bottom-upper-10)),run=2+rand(5);
            rect(c,xx,yy,run,1,'#24373d6b');
            if((j&1)===0)rect(c,xx+1,yy+1,Math.max(1,run-2),1,'#b6c1a25e');
          }
        }
        x=end;
      }
      ceiling=floor;deepest=Math.min(...floor);
    }
    if(sourceReady()){
      const im=images.background;
      c.save();c.globalCompositeOperation='soft-light';c.globalAlpha=.52;
      for(let x=0;x<w;){
        const span=Math.min(w-x,59+rand(69)),sw=span*1.25,sh=Math.min(im.naturalHeight*.19,h*1.1);
        const sx=im.naturalWidth*(.12+rand(17)/100),sy=im.naturalHeight*(.14+rand(47)/100);
        c.drawImage(im,sx,sy,sw,sh,x,0,span,h);x+=span;
      }
      c.restore();
    }
    if(h>32){
      const falloff=c.createLinearGradient(0,14,0,h);
      falloff.addColorStop(0,'#12212b00');falloff.addColorStop(1,'#101d2b73');
      c.fillStyle=falloff;c.fillRect(0,5,w,h-5);
    }
    rect(c,0,0,w,2,p.cap);rect(c,0,2,w,2,p.lip);
    for(let x=3+rand(10);x<w;x+=27+rand(35)){
      rect(c,x,4,7+rand(14),1,p.facet);rect(c,x+1,5,4+rand(6),1,p.lip);
    }
    wetStone(c,w,h,p,rand,room,worldX);
  }
  function bolt(c,x,y){
    rect(c,x,y,4,3,'#1c2d34');rect(c,x+1,y-1,2,1,'#7f9090');
    rect(c,x,y,3,1,'#b2b6a1');rect(c,x+1,y+1,2,1,'#637577');
  }
  function magneticRail(c,w,h){
    rect(c,0,0,w,h,'#182831');
    rect(c,1,0,w-2,h,'#52636b');rect(c,2,0,2,h,'#8c9fa0');
    rect(c,4,0,2,h,'#647d7e');rect(c,w-5,0,3,h,'#293d46');
    rect(c,w-2,0,1,h,'#71867f');
    const inner=Math.max(1,w-13);
    rect(c,6,1,inner,h-2,'#2d434c');
    for(let y=6;y<h;y+=30){
      rect(c,6,y+1,inner,19,'#1c323b');rect(c,7,y+2,inner-2,13,'#3b5157');
      // Diagonal ferrite inlays signal a climbable face at any column width.
      c.save();c.beginPath();c.rect(7,y+3,inner-2,10);c.clip();
      for(let x=-2;x<w;x+=12){
        polygon(c,[[x,y+3],[x+5,y+3],[x+14,y+13],[x+9,y+13]],'#b0814d');
        stroke(c,x+4,y+3,x+13,y+12,'#dfb778');
      }
      c.restore();
      rect(c,7,y+15,inner-2,1,'#758783');rect(c,8,y+18,inner-4,3,'#2c3e46');
      rect(c,7,y+24,inner-2,2,'#4d6065');
      bolt(c,2,y+20);bolt(c,w-7,y+22);
    }
    rect(c,0,0,w,2,'#c1c2a9');rect(c,0,2,w,1,'#89978c');
  }
  function beam(c,w,h,rand){
    rect(c,0,0,w,h,'#192d37');rect(c,1,3,w-2,h-6,'#3d535e');
    for(let x=-rand(18);x<w;){
      const span=32+rand(24);
      rect(c,x+1,4,span-3,h-10,'#455b63');
      if(h>=14){
        rect(c,x+4,6,span-9,h-13,'#20343e');
        stroke(c,x+5,h-7,x+16,6,'#6f8182');stroke(c,x+6,h-6,x+17,7,'#4c656d');
        rect(c,x+span-14,7,6,2,'#586c6f');bolt(c,x+span-6,6);
      }
      rect(c,x+span-2,4,2,h-8,'#263c46');x+=span;
    }
    rect(c,0,0,w,2,'#bcc5b0');rect(c,0,2,w,1,'#819992');
    rect(c,0,h-5,w,1,'#728682');rect(c,0,h-4,w,2,'#495d61');rect(c,0,h-1,w,1,'#152831');
  }
  function shutter(c,w,h,rand){
    rect(c,0,0,w,h,'#26343a');
    for(let y=4;y<h;y+=12){
      rect(c,4,y,w-7,9,'#536162');rect(c,4,y,w-7,2,'#87908a');
      rect(c,5,y+2,w-10,3,'#65716c');rect(c,4,y+8,w-7,1,'#33484e');
      rect(c,6+rand(Math.max(1,w-14)),y+3,4,1,'#939a85');
    }
    rect(c,1,2,2,h-3,'#84918b');rect(c,w-4,2,3,h-3,'#192c35');rect(c,0,0,w,2,'#b2b4a1');
  }
  function pressurePanel(c,w,h,rand){
    // In the overhead rooms the same sealed bulkheads turn around all four sides.
    const upright=h>w;
    c.save();if(upright){c.translate(0,h);c.rotate(-Math.PI/2);}
    const length=upright?h:w,height=upright?w:h;
    rect(c,0,0,length,height,'#293c47');
    rect(c,0,2,length,height-5,'#465a62');
    for(let x=-rand(20);x<length;){
      const span=51+rand(25),lip=Math.min(6,Math.round(height/3));
      rect(c,x+2,lip,span-5,height-2*lip,'#374d59');
      rect(c,x+3,lip+1,span-7,1,'#668080');
      rect(c,x+6,lip+4,span-17,1,'#4c6972');
      rect(c,x+span-3,2,2,height-4,'#21343f');
      if(height>10){bolt(c,x+5,3);bolt(c,x+span-9,height-5);}
      x+=span;
    }
    rect(c,0,0,length,2,'#acb7a8');rect(c,0,height-3,length,1,'#657c7d');
    c.restore();
  }
  function railBed(c,w,h,rand,p){
    rockFace(c,w,h,rand,p);
    rect(c,0,0,w,9,'#464b49');rect(c,0,0,w,2,'#bbc0af');
    rect(c,0,3,w,2,'#798583');
    for(let x=-rand(16);x<w;x+=29){
      rect(c,x,5,14,5,'#685847');rect(c,x+1,5,11,1,'#a39275');bolt(c,x+4,6);
    }
  }
  function berthFloor(c,w,rand){
    rect(c,0,0,w,29,'#283a41');
    for(let x=0;x<w;){
      const span=Math.min(61+rand(39),w-x);
      rect(c,x,4,span-2,18,'#556360');rect(c,x,4,span-2,1,'#85928a');rect(c,x,21,span-2,1,'#798578');
      stroke(c,x+2,20,x+11,8,'#384c4e');
      if(span>24){
        rect(c,x+13,8,span-29,7,'#2e4449');
        for(let k=0;k<span-32;k+=7){
          rect(c,x+15+k,8,2,5,'#657774');rect(c,x+16+k,8,1,4,'#829186');
        }
        bolt(c,x+4,7);bolt(c,x+span-9,8);
      }
      x+=span;
    }
    rect(c,0,0,w,2,'#c6b896');rect(c,0,2,w,2,'#8b8e77');rect(c,0,26,w,1,'#73817a');
  }
  function drawSolid(c,b,s){
    const interior=[6,7,10,21].includes(s.room),ground=!interior&&b.y===184;
    const w=Math.ceil(b.w),h=Math.ceil(b.h)+(ground?50:0);
    if(w<=0||h<=0)return;
    const key=[s.room,b.x,b.y,w,h,!!b.metal,sourceReady()].join(',');
    let face=surfaceCache.get(key);
    if(!face){
      face=document.createElement('canvas');face.width=w*TERRAIN_SCALE;face.height=h*TERRAIN_SCALE;
      const ctx=face.getContext('2d'),width=face.width,height=face.height;
      const rand=sampler(199*s.room+b.x*13+b.y*7+w+h);
      const yard=s.room>=20&&s.room<=25,kiln=s.room===23||s.room===27,green=(s.room>=11&&s.room<20)||s.room===26;
      const p=rockColors[kiln?'kiln':yard?'yard':green?'moss':'sump'];
      if(interior)pressurePanel(ctx,width,height,rand);
      else if(b.metal&&b.h>30)magneticRail(ctx,width,height);
      else if(b.metal||!ground&&b.h<=12)beam(ctx,width,height,rand);
      else if(!ground&&w<=24&&h>=54)shutter(ctx,width,height,rand);
      else if(ground&&(yard||s.room===8||s.room===9))railBed(ctx,width,height,rand,p);
      else rockFace(ctx,width,height,rand,p,ground?b.x*TERRAIN_SCALE:null,s.room);
      if(ground&&s.room===0)berthFloor(ctx,width,rand);
      if(ground){
        // The collision lip keeps its high contrast. Deep masonry can recede behind actors.
        const shade=ctx.createLinearGradient(0,4,0,Math.max(26,height*.78));
        shade.addColorStop(0,'#0b1c2700');shade.addColorStop(.38,'#0b1c273b');shade.addColorStop(1,'#0b1c2770');
        ctx.fillStyle=shade;ctx.fillRect(0,4,width,height-4);
      }
      surfaceCache.set(key,face);
    }
    if(interior&&b.x>16&&b.x<360&&b.y>40&&b.y<183){rect(c,b.x+2,b.y+2,w+1,h+2,'#071d2466');}
    c.drawImage(face,b.x,b.y,w,h);
    if(!interior&&b.metal&&b.h>50&&s.flags.magnet)railGlints(c,b,s.t);
  }
  // Compatibility hooks for older callers. Decorative machinery was removed
  // deliberately; actual gates, devices, actors, and collision remain elsewhere.
  function removedDecoration(){}
  root.DeepRelayEnvironment={version:21,ready,drawBackground,drawInteriorDetail,drawSolid,drawTerrain:drawSolid,drawCrane:removedDecoration,drawGantry:removedDecoration,drawSluice:removedDecoration,drawPumpDrive:removedDecoration,diagnostics:status,assets,roomFrames,viewport:{top:25,bottom:201}};
})(window);
