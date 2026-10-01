'use strict';
/* ---------- core ---------- */
const E=id=>document.getElementById(id),uid=()=>Math.random().toString(36).slice(2,9),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const esc=s=>String(s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt()+';');
const fmt=s=>Math.floor(s/60)+':'+(s%60).toFixed(1).padStart(4,'0');
const cv=E('cv'),ctx=cv.getContext('2d'),inr=E('inner'),pf=E('pf'),LW=64,RH=44,DAY=864e5;
const TR=['Video','Overlay 1','Overlay 2','Audio 1','Audio 2'],T={video:[0,1,2],image:[0,1,2],text:[1,2],shape:[1,2],audio:[3,4]};
const F={start:['Start',0,3600,.1],len:['Length',.1,3600,.1],x:['X',-2000,4000,1],y:['Y',-2000,4000,1],w:['Width',1,4000,1],h:['Height',1,4000,1],s:['Scale',.05,5,.01],rot:['Rotation',-360,360,1],op:['Opacity',0,1,.01],b:['Brightness',0,2,.01],c:['Contrast',0,2,.01],sat:['Saturation',0,3,.01],ex:['Exposure',-2,2,.05],bl:['Blur',0,20,.5],g:['Grayscale',0,1,.01],vol:['Volume',0,1,.01],fi:['Fade in',0,10,.1],fo:['Fade out',0,10,.1],size:['Size',8,400,1],sw:['Outline',0,20,.5],kt:['Tolerance',0,1,.01],ks:['Strength',0,1,.01],kd:['Softness',0,1,.01],mx:['Mask X',0,1,.01],my:['Mask Y',0,1,.01],mw:['Mask W',0,2,.01],mh:['Mask H',0,2,.01],mr:['Mask rotate',-180,180,1],mf:['Feather',0,100,1],mo:['Mask opacity',0,1,.01],mp:['Corners/sides',0,12,.1]};
let S={name:'Untitled',clips:[],dur:1},W=1280,H=720,HS=[],hi=-1,selId=null,pvId=null,t=0,base=0,t0=0,playing=false,dirty=true,raf=0,pps=50,mv=1,ac,adest,mg,ct,at,tt,dt=null,dp=null,exp=false,ex,ew,eh,rec,cancel=false;
const M=new Map,els=new Map,ec=document.createElement('canvas');
/* ---------- keyframes, masks, chroma key ---------- */
const AN=['x','y','w','h','s','rot','op','b','c','sat','ex','bl','g','vol','size','sw','kt','ks','kd','mx','my','mw','mh','mr','mf','mo','mp'];
const DEF={ck:0,kc:'#00ff00',kt:.3,ks:1,kd:.1,mt:'none',mx:.5,my:.5,mw:.5,mh:.5,mr:0,mf:0,mo:1,mp:4,mi:0};
const EZ={lin:x=>x,in:x=>x*x,out:x=>1-(1-x)*(1-x),io:x=>x<.5?2*x*x:1-2*(1-x)*(1-x)};
const kcs=new Map;let selKf=null,kclip=[],picking=false,OC,MC,SC;
const cl=o=>o&&JSON.parse(JSON.stringify(o)),kat=(c,k)=>c.kf&&c.kf[k]&&c.kf[k].some(f=>Math.abs(f[0]-(t-c.start))<.02);
const hex=h=>{const n=parseInt(h.slice(1),16);return[n>>16,n>>8&255,n&255]};
const fnt=v=>`${v.it?'italic ':''}${v.bd?'bold ':''}${v.size}px ${v.font}`;
const kfm=c=>c.kf?[...new Set(Object.values(c.kf).flat().map(f=>+f[0].toFixed(3)))].filter(x=>x>=0&&x<=c.len).map(x=>`<b class="kfm${x===selKf?' on':''}" data-tm="${x}" style="left:${x*pps}px"></b>`).join(''):'';
function interp(a,k){const n=a.length-1;if(k<=a[0][0])return a[0][1];if(k>=a[n][0])return a[n][1];let i=0;while(a[i+1][0]<k)i++;const p=a[i],q=a[i+1];return p[1]+(q[1]-p[1])*EZ[p[2]||'lin']((k-p[0])/(q[0]-p[0]))}
function ev(c){if(!c.kf)return c;const o=Object.create(c),r=t-c.start;for(const k in c.kf)o[k]=interp(c.kf[k],r);return o}
function kset(c,k,v){const a=c.kf[k],r=t-c.start,f=a.find(x=>Math.abs(x[0]-r)<.02);if(f)f[1]=v;else{a.push([r,v,'lin']);a.sort((p,q)=>p[0]-q[0])}}
const setProp=(c,k,v)=>c.kf&&c.kf[k]?kset(c,k,v):c[k]=v;
function kshift(c,d){for(const k in c.kf)c.kf[k].forEach(f=>f[0]+=d)}
function kfToggle(c,k){const r=t-c.start;if(r<-.01||r>c.len+.01)return toast('Move the playhead over the clip');
 const a=c.kf&&c.kf[k],f=a&&a.find(x=>Math.abs(x[0]-r)<.02);
 if(f){a.splice(a.indexOf(f),1);if(!a.length){c[k]=f[1];delete c.kf[k];if(!Object.keys(c.kf).length)delete c.kf}}
 else{const val=ev(c)[k];c.kf=c.kf||{};(c.kf[k]=c.kf[k]||[]).push([Math.max(0,r),val,'lin']);c.kf[k].sort((p,q)=>p[0]-q[0])}
 commit()}
function syncPanel(){const c=cur();if(!c||!c.kf)return;const V=ev(c);
 pf.querySelectorAll('[data-k]').forEach(el=>{const k=el.dataset.k;if(c.kf[k]&&el!==document.activeElement){el.value=V[k];const o=el.nextElementSibling;if(o&&o.tagName==='OUTPUT'&&el.type==='range')o.value=(+V[k]).toFixed(2)}});
 pf.querySelectorAll('.kb').forEach(b=>{const k=b.dataset.kf;b.className='kb'+(kat(c,k)?' on':c.kf[k]?' has':'')})}
function loc(c,p){const a=-c.rot*Math.PI/180,dx=p.x-c.x,dy=p.y-c.y;return{lx:(dx*Math.cos(a)-dy*Math.sin(a))/c.s,ly:(dx*Math.sin(a)+dy*Math.cos(a))/c.s}}
function pick(c,p){const v=ev(c),src=c.type==='video'?els.get(c.id):(M.get(c.mid)||{}).img;if(!src)return;
 const {lx,ly}=loc(v,p),sw=src.videoWidth||src.naturalWidth,sh=src.videoHeight||src.naturalHeight,sx=(lx+v.w/2)/v.w*sw,sy=(ly+v.h/2)/v.h*sh;
 if(sx<0||sy<0||sx>=sw||sy>=sh)return toast('Click inside the clip');
 const g=SC=SC||document.createElement('canvas').getContext('2d',{willReadFrequently:true});g.canvas.width=1;g.canvas.height=1;g.drawImage(src,sx|0,sy|0,1,1,0,0,1,1);
 c.kc='#'+[...g.getImageData(0,0,1,1).data.slice(0,3)].map(x=>x.toString(16).padStart(2,'0')).join('');c.ck=1;commit()}
// chroma key at <=640px, cached per clip until the frame or settings change
function key(c,v,src){const w=src.videoWidth||src.naturalWidth||v.w,h=src.videoHeight||src.naturalHeight||v.h,k=Math.min(1,640/Math.max(w,h)),pw=Math.max(1,w*k|0),ph=Math.max(1,h*k|0);
 let e=kcs.get(c.id);if(!e){const cn=document.createElement('canvas');e={cn,g:cn.getContext('2d',{willReadFrequently:true}),key:''};kcs.set(c.id,e)}
 const sig=[src.currentTime,v.kc,v.kt,v.ks,v.kd,pw,ph].join();if(e.key===sig)return e.cn;e.key=sig;
 if(e.cn.width!==pw||e.cn.height!==ph){e.cn.width=pw;e.cn.height=ph}
 e.g.drawImage(src,0,0,pw,ph);const im=e.g.getImageData(0,0,pw,ph),d=im.data,[kr,kg,kb]=hex(v.kc),tol=v.kt,soft=Math.max(.001,v.kd),st=v.ks;
 for(let i=0;i<d.length;i+=4){const dr=d[i]-kr,dg=d[i+1]-kg,db=d[i+2]-kb,u=Math.sqrt(dr*dr+dg*dg+db*db)/441.67,a=u<=tol?0:u>=tol+soft?1:(u-tol)/soft;d[i+3]*=1-st*(1-a)}
 e.g.putImageData(im,0,0);return e.cn}
function paint(g,v,src){
 if(src)g.drawImage(src,-v.w/2,-v.h/2,v.w,v.h);
 else if(v.type==='shape'){g.fillStyle=v.color;if(v.kind==='ellipse'){g.beginPath();g.ellipse(0,0,v.w/2,v.h/2,0,0,7);g.fill()}else g.fillRect(-v.w/2,-v.h/2,v.w,v.h)}
 else if(v.type==='text'){g.font=fnt(v);g.textAlign='center';g.textBaseline='middle';
  if(v.sh){g.shadowColor='rgba(0,0,0,.7)';g.shadowBlur=8;g.shadowOffsetY=3}
  if(v.sw){g.lineWidth=v.sw;g.strokeStyle=v.sc;g.lineJoin='round';g.strokeText(v.text,0,0)}
  g.fillStyle=v.color;g.fillText(v.text,0,0)}}
// masked clip: content -> OC, mask shape -> MC, then destination-in
function masked(v,src){const P=24,w=Math.ceil(v.w)+2*P,h=Math.ceil(v.h)+2*P;OC=OC||document.createElement('canvas');MC=MC||document.createElement('canvas');
 for(const k of [OC,MC])if(k.width!==w||k.height!==h){k.width=w;k.height=h}
 const o=OC.getContext('2d'),g=MC.getContext('2d');
 o.setTransform(1,0,0,1,0,0);o.globalCompositeOperation='source-over';o.clearRect(0,0,w,h);o.save();o.translate(w/2,h/2);paint(o,v,src);o.restore();
 g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-over';g.filter='none';g.globalAlpha=1;g.clearRect(0,0,w,h);g.fillStyle='#000';
 if(v.mi){g.fillRect(0,0,w,h);g.globalCompositeOperation='destination-out'}else{if(v.mo<1){g.globalAlpha=1-v.mo;g.fillRect(0,0,w,h)}g.globalCompositeOperation='lighter'}
 g.globalAlpha=v.mo;g.filter=v.mf>0?`blur(${v.mf}px)`:'none';
 const a=v.mw*v.w,b=v.mh*v.h;g.translate(w/2+(v.mx-.5)*v.w,h/2+(v.my-.5)*v.h);g.rotate(v.mr*Math.PI/180);g.beginPath();
 if(v.mt==='circle')g.ellipse(0,0,a/2,b/2,0,0,7);
 else if(v.mt==='round')g.roundRect(-a/2,-b/2,a,b,Math.min(a,b)/2*clamp(v.mp/12,0,1));
 else if(v.mt==='poly'){const n=Math.round(clamp(v.mp,3,12));for(let i=0;i<n;i++){const th=-Math.PI/2+i*2*Math.PI/n;g[i?'lineTo':'moveTo'](a/2*Math.cos(th),b/2*Math.sin(th))}g.closePath()}
 else g.rect(-a/2,-b/2,a,b);
 g.fill();g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-over';g.globalAlpha=1;g.filter='none';
 o.globalCompositeOperation='destination-in';o.drawImage(MC,0,0);o.globalCompositeOperation='source-over'}
function draw(c){const v=ev(c);let src=null;
 if(c.type==='video'){const el=getEl(c);if(!el||el.readyState<2)return;src=el}
 else if(c.type==='image'){const m=M.get(c.mid);if(!m||!m.img)return;src=m.img}
 else if(c.type==='text'){ctx.font=fnt(v);c.w=v.w=ctx.measureText(v.text).width;c.h=v.h=v.size*1.2}
 if(src&&v.ck)src=key(c,v,src);
 ctx.save();ctx.globalAlpha=v.op;ctx.translate(v.x,v.y);ctx.rotate(v.rot*Math.PI/180);ctx.scale(v.s,v.s);ctx.filter=fx(v);
 if(v.mt&&v.mt!=='none'){masked(v,src);ctx.drawImage(OC,-OC.width/2,-OC.height/2)}else paint(ctx,v,src);
 ctx.restore()}

const cur=()=>S.clips.find(c=>c.id===selId),req=()=>{raf||(raf=requestAnimationFrame(tick))},redraw=()=>{dirty=true;req()};
const toast=m=>{const e=E('toast');e.textContent=m;e.hidden=false;clearTimeout(tt);tt=setTimeout(()=>e.hidden=true,4000)};
const setSize=(w,h)=>{W=w;H=h;cv.width=w;cv.height=h};

/* ---------- IndexedDB ---------- */
const idb=new Promise((ok,no)=>{const r=indexedDB.open('lite-editor',1);r.onupgradeneeded=()=>['projects','renders'].forEach(n=>r.result.createObjectStore(n,{keyPath:'id'}));r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
const q=(s,m,f)=>idb.then(d=>new Promise((ok,no)=>{const x=d.transaction(s,m),r=f(x.objectStore(s));x.oncomplete=()=>ok(r&&r.result);x.onabort=x.onerror=()=>no(x.error)}));
async function sweep(){const r=await q('renders','readonly',o=>o.getAll()),dead=r.filter(x=>x.expires<Date.now());if(dead.length)await q('renders','readwrite',o=>{dead.forEach(x=>o.delete(x.id));return o.count()})}

/* ---------- media library ---------- */
function probe(m){return new Promise((ok,no)=>{
 if(m.type==='image'){const i=new Image();i.onload=()=>{m.img=i;m.w=i.naturalWidth;m.h=i.naturalHeight;ok()};i.onerror=no;i.src=m.url;return}
 const el=document.createElement(m.type);el.preload='metadata';
 el.onloadedmetadata=()=>{m.dur=el.duration;m.w=el.videoWidth;m.h=el.videoHeight;el.removeAttribute('src');el.load();ok()};el.onerror=no;el.src=m.url})}
async function imp(files){toast('Importing '+files.length+' file(s)…');
 for(const f of files){const type=f.type.split('/')[0];if(!['video','image','audio'].includes(type)){toast('Unsupported file: '+f.name);continue}
  const m=[...M.values()].find(o=>o.missing&&o.name===f.name)||{id:uid()};
  const first=type==='video'&&!S.clips.length&&![...M.values()].some(o=>o.type==='video'&&!o.missing);
  Object.assign(m,{name:f.name,type,url:URL.createObjectURL(f),size:f.size,missing:false});
  try{await probe(m)}catch{URL.revokeObjectURL(m.url);toast('Cannot read '+f.name);continue}
  if(first&&m.w){const k=Math.min(1,1920/m.w);setSize(Math.round(m.w*k/2)*2,Math.round(m.h*k/2)*2)}
  M.set(m.id,m)}
 libDraw();drawTL();redraw();toast('Import finished')}
function libDraw(){E('items').innerHTML=[...M.values()].map(m=>`<div class="it${m.id===pvId?' s':''}" data-id="${m.id}"><span>${esc(m.name)}${m.missing?' (re-import)':''}</span><button data-a="add" title="Add to timeline">+</button><button data-a="rm" title="Remove">×</button></div>`).join('')||'<p>No media yet. Import videos, images or audio.</p>'}
E('items').onclick=e=>{const d=e.target.closest('.it');if(!d)return;const m=M.get(d.dataset.id),a=e.target.dataset.a;a==='add'?addMedia(m):a==='rm'?rmMedia(m):preview(m)};
function preview(m){if(m.missing)return toast('Re-import this file to relink it');pvId=m.id;const im=m.type==='image';E('pi').hidden=!im;E('pv').hidden=im;im?E('pi').src=m.url:E('pv').src=m.url;libDraw()}
function rmMedia(m){if(!confirm('Remove "'+m.name+'" and its clips?'))return;S.clips=S.clips.filter(c=>c.mid!==m.id);E('pv').removeAttribute('src');E('pi').removeAttribute('src');URL.revokeObjectURL(m.url);M.delete(m.id);pvId=null;libDraw();commit()}
function mk(type,o){const c={id:uid(),type,track:0,start:t,len:5,off:0,x:W/2,y:H/2,w:300,h:200,s:1,rot:0,op:1,b:1,c:1,sat:1,ex:0,bl:0,g:0,vol:1,fi:0,fo:0,mute:0,noa:0,...DEF,...o};place(c);return c}
function place(c){const ts=T[c.type];c.track=ts.find(k=>!S.clips.some(o=>o.track===k&&o.start<c.start+c.len&&o.start+o.len>c.start))??ts[ts.length-1]}
function addMedia(m){if(m.missing)return toast('Re-import this file to relink it');
 const o={mid:m.id,name:m.name};if(m.type!=='image')o.len=m.dur;
 if(m.type!=='audio'){const f=Math.min(W/m.w,H/m.h);Object.assign(o,{nw:m.w,nh:m.h,w:m.w*f,h:m.h*f})}
 const c=mk(m.type,o);if(c.track&&c.nw)c.s=.4;S.clips.push(c);selId=c.id;commit()}
E('bText').onclick=()=>{const c=mk('text',{name:'Text',text:'Your text',size:72,font:'Arial',color:'#ffffff',sc:'#000000',sw:0,bd:0,it:0,sh:0});S.clips.push(c);selId=c.id;commit()};
E('bShape').onclick=()=>{const c=mk('shape',{name:'Shape',kind:'rect',color:'#c9a227'});S.clips.push(c);selId=c.id;commit()};
E('file').onchange=e=>{imp([...e.target.files]);e.target.value=''};
ondragover=e=>e.preventDefault();ondrop=e=>{e.preventDefault();imp([...e.dataTransfer.files])};

/* ---------- timeline ---------- */
function drawTL(){const n=Math.max(S.dur+10,30),w=LW+n*pps,step=pps<25?10:pps<70?5:1;let h=`<div id="ruler" style="width:${w}px">`;
 for(let s=0;s<n;s+=step)h+=`<span style="left:${LW+s*pps}px">${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}</span>`;h+='</div>';
 TR.forEach((nm,i)=>{h+=`<div class="row" style="width:${w}px"><i>${nm}</i>`+S.clips.filter(c=>c.track===i).map(c=>`<div class="clip ${c.type}${c.id===selId?' sel':''}${c.mid&&M.get(c.mid)?.missing?' miss':''}" data-id="${c.id}" style="left:${LW+c.start*pps}px;width:${Math.max(4,c.len*pps)}px"><u data-h="l"></u>${esc(c.name||c.type)}${kfm(c)}<u data-h="r"></u></div>`).join('')+'</div>'});
 inr.innerHTML=h+'<div id="ph"></div>';inr.style.width=w+'px';movePH()}
const movePH=()=>{const p=E('ph');if(p)p.style.left=LW+t*pps+'px'};
const scrub=e=>seek((e.clientX-inr.getBoundingClientRect().left-LW)/pps);
inr.onpointerdown=e=>{
 if(e.target.closest('#ruler')){dt={k:'scrub'};inr.setPointerCapture(e.pointerId);return scrub(e)}
 const el=e.target.closest('.clip');if(!el){selId=null;panel();drawTL();return redraw()}
 const c=S.clips.find(o=>o.id===el.dataset.id);selId=c.id;const km=e.target.dataset.tm;selKf=km!=null?+km:null;if(km!=null){seek(c.start+selKf);dt={k:'kf',c,x:e.clientX,tm:selKf,fr:Object.values(c.kf).flat().filter(f=>Math.abs(f[0]-selKf)<.001)};inr.setPointerCapture(e.pointerId);panel();drawTL();return}
 dt={k:e.target.dataset.h||'move',c,x:e.clientX,s:c.start,l:c.len,o:c.off};inr.setPointerCapture(e.pointerId);panel();drawTL();redraw()};
inr.onpointermove=e=>{if(!dt)return;if(dt.k==='scrub')return scrub(e);
 const c=dt.c,d=(e.clientX-dt.x)/pps,md=c.type==='video'||c.type==='audio';if(dt.k==='kf'){const nt=+clamp(dt.tm+d,0,c.len).toFixed(3);dt.fr.forEach(f=>f[0]=nt);for(const k in c.kf)c.kf[k].sort((p,q)=>p[0]-q[0]);selKf=nt;dt.m=1;drawTL();return redraw()}
 if(dt.k==='move'){c.start=Math.max(0,dt.s+d);const r=Math.floor((e.clientY-inr.getBoundingClientRect().top-20)/RH);if(T[c.type].includes(r))c.track=r}
 else if(dt.k==='l'){const k=clamp(d,-(md?Math.min(dt.s,dt.o):dt.s),dt.l-.1);c.start=dt.s+k;c.len=dt.l-k;if(md)c.off=dt.o+k;kshift(c,(dt.q||0)-k);dt.q=k}
 else{c.len=Math.max(.1,dt.l+d);const m=M.get(c.mid);if(md&&m&&m.dur)c.len=Math.min(c.len,m.dur-c.off)}
 dt.m=1;drawTL();redraw()};
inr.onpointerup=()=>{if(dt&&dt.m)commit();dt=null};
function split(){const c=cur()||S.clips.find(o=>t>o.start&&t<o.start+o.len);
 if(!c||t<=c.start+.05||t>=c.start+c.len-.05)return toast('Place the playhead inside a clip to split it');
 const b={...c,id:uid(),start:t,len:c.start+c.len-t,off:c.off+(t-c.start),kf:cl(c.kf)};kshift(b,-(t-c.start));c.len=t-c.start;S.clips.push(b);selId=b.id;commit()}
function dup(){const c=cur();if(!c)return;const d={...c,id:uid(),start:c.start+c.len,kf:cl(c.kf)};place(d);S.clips.push(d);selId=d.id;commit()}
function del(){const c=cur();if(!c)return;
 if(selKf!=null&&c.kf){for(const k in c.kf){const a=c.kf[k],n=a.filter(f=>Math.abs(f[0]-selKf)>.02);if(n.length)c.kf[k]=n;else{c[k]=a[0][1];delete c.kf[k]}}if(!Object.keys(c.kf).length)delete c.kf;selKf=null;return commit()}
 S.clips=S.clips.filter(o=>o!==c);selId=null;commit()}
E('bSplit').onclick=split;E('bDup').onclick=dup;E('bDel').onclick=del;E('zoom').oninput=e=>{pps=+e.target.value;drawTL()};

/* ---------- undo / redo ---------- */
function commit(keep){const j=JSON.stringify(S.clips);
 if(j!==HS[hi]){HS.length=hi+1;HS.push(j);if(HS.length>100)HS.shift();hi=HS.length-1}
 prune();refresh(keep);clearTimeout(at);at=setTimeout(()=>save('auto').catch(()=>{}),1500)}
function refresh(keep){S.dur=Math.max(1,...S.clips.map(c=>c.start+c.len));t=Math.min(t,S.dur);
 E('bUndo').disabled=hi<1;E('bRedo').disabled=hi>=HS.length-1;if(selId&&!cur())selId=null;if(!keep)panel();drawTL();redraw()}
function undo(){if(hi>0){hi--;S.clips=JSON.parse(HS[hi]);prune();refresh()}}
function redo(){if(hi<HS.length-1){hi++;S.clips=JSON.parse(HS[hi]);refresh()}}
E('bUndo').onclick=undo;E('bRedo').onclick=redo;
onkeydown=e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;const k=e.key.toLowerCase(),m=e.ctrlKey||e.metaKey;
 if(k===' '){e.preventDefault();playing?pause():play()}else if(m&&k==='z'){e.preventDefault();e.shiftKey?redo():undo()}else if(m&&k==='y')redo();
 else if(k==='delete'||k==='backspace')del();else if(k==='s'&&!m)split()};
function prune(all){for(const id of kcs.keys())if(all||!S.clips.some(c=>c.id===id))kcs.delete(id);for(const [id,el] of els)if(all||!S.clips.some(c=>c.id===id)){el.pause();el.removeAttribute('src');el.load();el._g&&el._g.disconnect();els.delete(id)}}

/* ---------- properties panel ---------- */
function panel(){const c=cur();if(!c){pf.innerHTML='<h3>Properties</h3><p>Select a clip to edit it.</p>';return}
 const V=ev(c),n=k=>{const [l,a,b,s]=F[k],r=b-a<=10,x=V[k];return `<label>${l}<input data-k="${k}" type="${r?'range':'number'}" min="${a}" max="${b}" step="${s}" value="${x}"><output>${r?(+x).toFixed(2):''}</output>${AN.includes(k)?`<button class="kb${kat(c,k)?' on':c.kf&&c.kf[k]?' has':''}" data-kf="${k}" title="Toggle keyframe">◆</button>`:''}</label>`};
 const ck=(k,l)=>`<label>${l}<input data-k="${k}" type="checkbox"${c[k]?' checked':''}></label>`,col=(k,l)=>`<label>${l}<input data-k="${k}" type="color" value="${c[k]}"></label>`;
 let h='<h3>'+esc(c.name||c.type)+'</h3>'+['start','len'].map(n).join('');
 if(c.type==='text')h+=`<label>Text<input data-k="text" type="text" value="${esc(c.text)}"></label><label>Font<select data-k="font">${['Arial','Georgia','Impact','Courier New','Verdana'].map(f=>`<option${f===c.font?' selected':''}>${f}</option>`).join('')}</select></label>`+n('size')+ck('bd','Bold')+ck('it','Italic')+col('color','Color')+col('sc','Outline')+n('sw')+ck('sh','Shadow');
 if(c.type==='shape')h+=`<label>Kind<select data-k="kind"><option>rect</option><option${c.kind==='ellipse'?' selected':''}>ellipse</option></select></label>`+col('color','Color');
 if(c.track<3)h+=['x','y',...(c.type==='text'?[]:['w','h']),'s','rot','op','b','c','sat','ex','bl','g'].map(n).join('')+'<button data-q="ch">Center H</button><button data-q="cv">Center V</button><button data-q="fit">Fit</button><button data-q="fill">Fill</button>';
 if(c.type==='video'||c.type==='audio')h+=['vol','fi','fo'].map(n).join('')+ck('mute','Mute')+(c.type==='video'?ck('noa','Remove audio'):'');
 if(c.track<3){if(c.nw)h+='<h3>Chroma key</h3>'+ck('ck','Enable')+col('kc','Key color')+'<button data-q="pick">Pick from video</button>'+['kt','ks','kd'].map(n).join('');
  h+='<h3>Mask</h3><label>Shape<select data-k="mt">'+[['none','None'],['rect','Rectangle'],['round','Rounded'],['circle','Circle'],['poly','Polygon']].map(([a,b])=>`<option value="${a}"${c.mt===a?' selected':''}>${b}</option>`).join('')+'</select></label>';
  if(c.mt&&c.mt!=='none')h+=['mx','my','mw','mh','mr','mf','mo','mp'].map(n).join('')+ck('mi','Invert')}
 if(c.track<3||c.type==='audio')h+='<h3>Keyframes</h3><label>Interpolation<select data-ease><option value="lin">Linear</option><option value="in">Ease in</option><option value="out">Ease out</option><option value="io">Ease in/out</option></select></label><button data-q="kc">Copy</button><button data-q="kp">Paste</button><button data-q="kx">Delete here</button>';
 pf.innerHTML=h}
pf.oninput=e=>{const el=e.target,k=el.dataset.k,c=cur();if(c&&el.dataset.ease!=null){const r=t-c.start;for(const a of Object.values(c.kf||{}))a.forEach(f=>Math.abs(f[0]-r)<.02&&(f[2]=el.value));return commit(1)}if(!k||!c)return;
 const v=el.type==='checkbox'?+el.checked:el.type==='range'||el.type==='number'?+el.value:el.value;if(k==='mt'){c.mt=v;c.mp=v==='poly'?5:4;return commit()}setProp(c,k,v);
 if(el.nextElementSibling&&el.nextElementSibling.tagName==='OUTPUT')el.nextElementSibling.value=(+v).toFixed(2);
 if(k==='start'||k==='len')drawTL();redraw();clearTimeout(ct);ct=setTimeout(()=>commit(1),400)};
pf.onclick=e=>{const a=e.target.dataset.q,c=cur(),kb=e.target.dataset.kf;if(c&&kb)return kfToggle(c,kb);if(!a||!c)return;
 if(a==='pick'){picking=true;return toast('Click the video in the preview to pick the key color')}
 const r=t-c.start;
 if(a==='kc'){kclip=Object.entries(c.kf||{}).flatMap(([k,x])=>x.filter(f=>Math.abs(f[0]-r)<.02).map(f=>[k,f[1],f[2]]));return toast(kclip.length?'Keyframes copied':'No keyframes at the playhead')}
 if(a==='kp'){for(const [k,v,z] of kclip){c.kf=c.kf||{};const x=c.kf[k]=c.kf[k]||[],f=x.find(o=>Math.abs(o[0]-r)<.02);f?(f[1]=v,f[2]=z):x.push([r,v,z]);x.sort((p,q)=>p[0]-q[0])}return commit()}
 if(a==='kx'){if(!c.kf)return;selKf=r;return del()}const nw=c.nw||c.w,nh=c.nh||c.h;
 if(a==='ch')setProp(c,'x',W/2);if(a==='cv')setProp(c,'y',H/2);
 if(a==='fit'||a==='fill'){const f=Math[a==='fit'?'min':'max'](W/nw,H/nh);c.w=nw*f;c.h=nh*f;c.s=1;c.x=W/2;c.y=H/2}commit()};

/* ---------- playback & audio ---------- */
function audio(){if(!ac){ac=new AudioContext();adest=ac.createMediaStreamDestination();mg=ac.createGain();mg.gain.value=mv;mg.connect(ac.destination)}if(ac.state!=='running')ac.resume()}
function getEl(c){let el=els.get(c.id);if(!el){const m=M.get(c.mid);if(!m||m.missing)return null;el=document.createElement(c.type);el.src=m.url;el.preload='auto';el.playsInline=true;el.onseeked=redraw;els.set(c.id,el)}return el}
function wire(c,el){if(!ac||el._g||c.noa)return;const g=ac.createGain();ac.createMediaElementSource(el).connect(g);g.connect(mg);g.connect(adest);el._g=g}
function vol(c,el){const k=t-c.start,f=Math.min(c.fi?k/c.fi:1,c.fo?(c.len-k)/c.fo:1,1),v=(c.mute||c.noa?0:ev(c).vol)*Math.max(0,f);el._g?el._g.gain.value=v:el.volume=clamp(v,0,1)}
function sync(){for(const c of S.clips){if(c.type!=='video'&&c.type!=='audio')continue;
 const on=t>=c.start&&t<c.start+c.len,el=on?getEl(c):els.get(c.id);if(!el)continue;
 if(!on){if(!el.paused)el.pause();continue}
 const want=c.off+t-c.start;
 if(playing){wire(c,el);if(el.paused){el.currentTime=want;el.play().catch(()=>{})}else if(Math.abs(el.currentTime-want)>.3)el.currentTime=want;vol(c,el)}
 else{if(!el.paused)el.pause();if(Math.abs(el.currentTime-want)>.04)el.currentTime=want}}}
function seek(x){t=clamp(x,0,S.dur);if(playing){base=t;t0=performance.now()}redraw()}
function play(){if(!S.clips.length)return;audio();if(t>=S.dur-.05)t=0;playing=true;base=t;t0=performance.now();E('bPlay').textContent='Pause';req()}
function pause(){playing=false;E('bPlay').textContent='Play';sync();redraw()}
function tick(now){raf=0;
 if(playing){t=base+(now-t0)/1000;if(t>=S.dur){t=S.dur;const was=exp;pause();if(was)finish()}}
 if(playing||dirty){dirty=false;sync();render();movePH();E('time').textContent=fmt(t)+' / '+fmt(S.dur);if(exp)E('xp').value=t/S.dur;if(!playing)syncPanel()}
 if(playing)req()}
E('bPlay').onclick=()=>playing?pause():play();
E('vol').oninput=e=>{mv=+e.target.value;if(mg)mg.gain.value=mv};
E('bFs').onclick=()=>cv.requestFullscreen&&cv.requestFullscreen();

/* ---------- rendering, overlays, transform handles ---------- */
const vis=()=>S.clips.filter(c=>c.track<3&&t>=c.start&&t<c.start+c.len).sort((a,b)=>a.track-b.track);
const fx=c=>c.b==1&&c.c==1&&c.sat==1&&!c.ex&&!c.bl&&!c.g?'none':`brightness(${c.b*2**c.ex}) contrast(${c.c}) saturate(${c.sat}) blur(${c.bl}px) grayscale(${c.g})`;
function render(){ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);const list=vis();for(const c of list)draw(c);
 const s=cur();if(s&&!playing&&!exp&&list.includes(s))handles(s);
 if(exp)ex.drawImage(cv,0,0,ew,eh)}
function handles(c){c=ev(c);ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.rot*Math.PI/180);ctx.scale(c.s,c.s);
 ctx.lineWidth=2/c.s;ctx.strokeStyle='#19b4d8';ctx.strokeRect(-c.w/2,-c.h/2,c.w,c.h);
 const k=16/c.s;ctx.fillStyle='#fff';ctx.fillRect(c.w/2-k/2,c.h/2-k/2,k,k);ctx.strokeRect(c.w/2-k/2,c.h/2-k/2,k,k);ctx.restore()}
function pt(e){const r=cv.getBoundingClientRect(),k=Math.min(r.width/cv.width,r.height/cv.height);
 return{x:(e.clientX-r.left-(r.width-cv.width*k)/2)/k,y:(e.clientY-r.top-(r.height-cv.height*k)/2)/k}}
function hit(p){return vis().reverse().find(c=>{c=ev(c);const {lx,ly}=loc(c,p);return Math.abs(lx)<=c.w/2&&Math.abs(ly)<=c.h/2})}
function corner(c,p){c=ev(c);const a=c.rot*Math.PI/180,gx=c.x+c.s*(c.w/2*Math.cos(a)-c.h/2*Math.sin(a)),gy=c.y+c.s*(c.w/2*Math.sin(a)+c.h/2*Math.cos(a));return Math.hypot(p.x-gx,p.y-gy)<24}
cv.onpointerdown=e=>{if(exp)return;const p=pt(e),c=cur();if(picking&&c&&c.nw){picking=false;return pick(c,p)}
 if(c&&c.track<3&&!playing&&corner(c,p))dp={k:'s',c};
 else{const h=hit(p);selId=h?h.id:null;panel();drawTL();redraw();if(!h)return;const u=ev(h);dp={k:'m',c:h,dx:u.x-p.x,dy:u.y-p.y}}
 cv.setPointerCapture(e.pointerId)};
cv.onpointermove=e=>{if(!dp)return;const p=pt(e),c=dp.c;
 const u=ev(c);if(dp.k==='m'){setProp(c,'x',p.x+dp.dx);setProp(c,'y',p.y+dp.dy)}else setProp(c,'s',Math.max(.05,Math.hypot(p.x-u.x,p.y-u.y)/(Math.hypot(u.w,u.h)/2)));
 dp.m=1;redraw()};
cv.onpointerup=()=>{if(dp&&dp.m)commit();dp=null};

/* ---------- export ---------- */
E('bExp').onclick=()=>S.clips.length?E('xd').showModal():toast('Add a clip before exporting');
E('xcx').onclick=()=>{if(exp){cancel=true;finish()}else E('xd').close()};
function dl(b,n){const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),6e4)}
E('xgo').onclick=async()=>{if(exp)return;if(!window.MediaRecorder)return toast('This browser cannot record video for export');
 const est=await(navigator.storage?.estimate?.()||{});if(est.quota&&est.usage/est.quota>.9)toast('Storage is nearly full — clear temporary files.');
 const r=+E('xr').value,fps=+E('xf').value;ew=r?Math.round(r*W/H/2)*2:W;eh=r||H;ec.width=ew;ec.height=eh;ex=ec.getContext('2d');
 const st=ec.captureStream(fps);if(E('xa').checked){audio();adest.stream.getAudioTracks().forEach(k=>st.addTrack(k))}
 const mt=['video/mp4;codecs=avc1,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(x=>MediaRecorder.isTypeSupported(x))||'',ch=[];cancel=false;
 rec=new MediaRecorder(st,{mimeType:mt||undefined,videoBitsPerSecond:Math.round(ew*eh*fps*+E('xq').value)});
 rec.ondataavailable=e=>e.data.size&&ch.push(e.data);
 rec.onstop=async()=>{st.getTracks().forEach(k=>k.stop());E('xp').hidden=true;E('xgo').disabled=false;E('xcx').textContent='Close';E('xd').close();
  if(cancel)return toast('Export cancelled');
  const type=mt||rec.mimeType,name=S.name+'.'+(type.includes('mp4')?'mp4':'webm'),blob=new Blob(ch,{type}),now=Date.now();
  try{await q('renders','readwrite',o=>o.put({id:uid(),name,blob,size:blob.size,created:now,used:now,expires:now+3*DAY}))}
  catch(err){toast(err.name==='QuotaExceededError'?'Storage is full — clear temporary files. Your download still works.':'Could not cache the export')}
  dl(blob,name);store()};
 pause();seek(0);sync();await new Promise(k=>setTimeout(k,400));
 exp=true;E('xp').hidden=false;E('xgo').disabled=true;E('xcx').textContent='Cancel';rec.start(500);play()};
function finish(){if(!exp)return;exp=false;if(rec.state!=='inactive')rec.stop();if(playing)pause()}

/* ---------- storage management ---------- */
async function store(){const r=await q('renders','readonly',o=>o.getAll()).catch(()=>[]),e=await(navigator.storage?.estimate?.()||{}),mb=n=>(n/1048576).toFixed(1)+' MB';
 E('store').innerHTML=`<p>Used ≈ ${mb(e.usage||0)} of ${mb(e.quota||0)}<br>${r.length} temporary video(s). ${r.length?'Next expires '+new Date(Math.min(...r.map(x=>x.expires))).toLocaleString():'Exports are deleted after 3 days.'}</p><button data-c="t">Clear temp files</button> <button data-c="a">Clear all cache</button>`;
 if(e.quota&&e.usage/e.quota>.85)toast('Storage is almost full — clear temporary files.')}
E('store').onclick=async e=>{const k=e.target.dataset.c;if(!k||!confirm(k==='t'?'Delete all temporary exported videos?':'Delete all cached videos and the autosave snapshot?'))return;
 await q('renders','readwrite',o=>o.clear());if(k==='a')await q('projects','readwrite',o=>o.delete('auto'));store();toast('Cleared')};

/* ---------- projects ---------- */
const snap=()=>({name:S.name,W,H,clips:S.clips,media:[...M.values()].map(({id,name,type,dur,w,h,size})=>({id,name,type,dur,w,h,size}))});
const save=id=>q('projects','readwrite',o=>o.put({id,saved:Date.now(),...snap()}));
function openProj(p){if(!p)return;for(const m of M.values())URL.revokeObjectURL(m.url);M.clear();pvId=null;E('pv').removeAttribute('src');E('pi').removeAttribute('src');
 S={name:p.name,clips:p.clips.map(c=>({...DEF,...c})),dur:1};prune(true);p.media.forEach(m=>M.set(m.id,{...m,missing:true}));setSize(p.W,p.H);selId=null;t=0;HS=[JSON.stringify(S.clips)];hi=0;
 libDraw();refresh();if(p.media.length)toast('Re-import your media files to relink them')}
E('bNew').onclick=()=>confirm('Discard the current project?')&&openProj({name:'Untitled',W:1280,H:720,clips:[],media:[]});
E('bSave').onclick=async()=>{const n=prompt('Project name',S.name);if(!n)return;S.name=n;
 try{await save('p:'+n);toast('Project saved')}catch(err){toast(err.name==='QuotaExceededError'?'Storage is full — clear temporary files.':'Save failed')}};
E('bLoad').onclick=async()=>{const ps=(await q('projects','readonly',o=>o.getAll())).filter(p=>p.id!=='auto');
 E('pl').innerHTML=ps.map(p=>`<div><button data-p="${esc(p.id)}">${esc(p.name)}</button> ${new Date(p.saved).toLocaleString()}</div>`).join('')||'<p>No saved projects yet.</p>';E('pd').showModal()};
E('pl').onclick=async e=>{const id=e.target.dataset.p;if(!id)return;openProj(await q('projects','readonly',o=>o.get(id)));E('pd').close()};
E('pc').onclick=()=>E('pd').close();

/* ---------- theme (UI only; export is unaffected) ---------- */
document.documentElement.dataset.theme=localStorage.getItem('theme')||'light';
E('bTheme').onclick=()=>{const d=document.documentElement;d.dataset.theme=d.dataset.theme==='dark'?'light':'dark';localStorage.setItem('theme',d.dataset.theme)};

/* ---------- start ---------- */
HS=['[]'];hi=0;libDraw();refresh();
sweep().catch(()=>{}).then(store);
q('projects','readonly',o=>o.get('auto')).then(p=>p&&p.clips&&p.clips.length&&openProj(p)).catch(()=>{});
