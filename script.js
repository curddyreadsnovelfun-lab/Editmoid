:root{
  --bg:#f7f4ec; --panel:#fffdf8; --panel2:#f1ecdd;
  --ink:#22304f; --muted:#7d8296;
  --acc:#c9a227; --acc-soft:rgba(201,162,39,.16);
  --acc2:#0e9bd8; --acc2-soft:rgba(14,155,216,.14);
  --line:#e2d9c2; --danger:#c0392b;
  --clip-video:#bfe3f2; --clip-audio:#f2e3b3; --clip-over:#e6d6f7; --clip-text:#f5d3dd;
  --shadow:0 4px 18px rgba(70,55,15,.14);
}
[data-theme="dark"]{
  --bg:#12101a; --panel:#1b1726; --panel2:#251e33;
  --ink:#ece7f4; --muted:#9a90ad;
  --acc:#d21f4c; --acc-soft:rgba(210,31,76,.20);
  --acc2:#8b5cf6; --acc2-soft:rgba(139,92,246,.20);
  --line:#373047; --danger:#e74c3c;
  --clip-video:#1f4257; --clip-audio:#54471f; --clip-over:#3c2b5e; --clip-text:#5c2140;
  --shadow:0 4px 18px rgba(0,0,0,.5);
}
*{box-sizing:border-box}
html,body{height:100%}
body{
  margin:0; font:13px/1.45 system-ui,"Segoe UI",Roboto,sans-serif;
  background:var(--bg); color:var(--ink);
  display:flex; flex-direction:column; overflow:hidden;
}
button{font:inherit;color:inherit}
.hidden{display:none!important}
.muted{color:var(--muted);font-size:11px}

/* ---------- top bar ---------- */
#topbar{
  height:46px; display:flex; align-items:center; gap:10px; padding:0 10px; flex:none;
  background:var(--panel); border-bottom:1px solid var(--line);
}
.tb-group{display:flex;align-items:center;gap:6px}
.tb-group.grow{flex:1}
.brand .logo{color:var(--acc);font-size:20px;text-shadow:0 0 8px var(--acc-soft)}
#projName{
  background:transparent;border:1px solid transparent;color:var(--ink);font-weight:600;
  width:170px;padding:4px 6px;border-radius:6px;
}
#projName:hover,#projName:focus{border-color:var(--line);background:var(--bg);outline:none}
.tbtn{
  background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:5px 9px;
  cursor:pointer;color:var(--ink);white-space:nowrap;
}
.tbtn:hover{border-color:var(--acc2);color:var(--acc2)}
.tbtn.primary{background:var(--acc2);border-color:var(--acc2);color:#fff;font-weight:600}
.tbtn.primary:hover{filter:brightness(1.1);color:#fff}
.tbtn.danger:hover{border-color:var(--danger);color:var(--danger)}
.tbtn.big{font-size:15px;padding:6px 13px;min-width:44px}
.tbtn:disabled{opacity:.5;cursor:default}
.only-mobile{display:none}

/* ---------- workspace ---------- */
#workspace{flex:1;display:flex;min-height:0}
aside{width:280px;background:var(--panel);display:flex;flex-direction:column;min-height:0;flex:none}
#left{border-right:1px solid var(--line)}
#right{border-left:1px solid var(--line);width:320px}
#center{flex:1;display:flex;flex-direction:column;min-width:0}

/* left: media + storage */
.tabs{display:flex;border-bottom:1px solid var(--line);flex:none}
.tab{flex:1;background:transparent;border:0;padding:8px;cursor:pointer;color:var(--muted);border-bottom:2px solid transparent}
.tab.active{color:var(--ink);border-bottom-color:var(--acc);font-weight:600}
.tabpage{display:none;flex:1;flex-direction:column;min-height:0;padding:10px;gap:10px}
.tabpage.active{display:flex}
.library{
  flex:1;overflow-y:auto;border:1px dashed var(--line);border-radius:8px;padding:8px;
  display:flex;flex-direction:column;gap:8px;min-height:80px;
}
.library.drag{border-color:var(--acc2);background:var(--acc2-soft)}
.empty{color:var(--muted);text-align:center;margin-top:26px;font-size:12px}
.empty span{font-size:10px;opacity:.8}
.mitem{display:flex;gap:8px;padding:6px;border:1px solid var(--line);border-radius:8px;cursor:pointer;align-items:center;background:var(--panel)}
.mitem:hover{border-color:var(--acc2)}
.mitem.sel{border-color:var(--acc);background:var(--acc-soft)}
.mthumb{width:64px;height:38px;background:#000;border-radius:4px;object-fit:cover;flex:none}
.micon{width:64px;height:38px;flex:none;display:flex;align-items:center;justify-content:center;background:var(--panel2);border-radius:4px;font-size:18px}
.mname{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.mkind{font-size:10px;color:var(--muted);text-transform:uppercase}
.madd{padding:2px 8px;font-size:12px;flex:none}
.media-preview{border-top:1px solid var(--line);padding-top:10px;display:flex;flex-direction:column;gap:6px;flex:none}
.media-preview video,.media-preview img{width:100%;max-height:150px;object-fit:contain;background:#000;border-radius:6px}
.mp-name{font-size:11px;color:var(--muted)}
.mp-actions{display:flex;gap:6px}
.storage-info{font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:4px;overflow:auto;flex:1}
.storage-info b{color:var(--ink)}
.temp-row{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dashed var(--line);padding:3px 0}
.storage-btns{display:flex;flex-direction:column;gap:6px;flex:none}

/* center: stage + transport */
#stage{
  flex:1;display:flex;align-items:center;justify-content:center;background:#000;
  position:relative;min-height:0;overflow:hidden;
}
#view{max-width:100%;max-height:100%;background:#000;touch-action:none;display:block}
#view.eyedrop{cursor:crosshair}
.stage-hint{position:absolute;color:rgba(255,255,255,.5);pointer-events:none;font-size:14px;text-align:center;max-width:70%}
#transport{
  height:44px;display:flex;align-items:center;gap:10px;padding:0 12px;flex:none;
  background:var(--panel);border-top:1px solid var(--line);
}
.time{font-variant-numeric:tabular-nums;color:var(--muted);min-width:52px;text-align:center}
#seek{flex:1}
.vol-wrap input{width:80px}
input[type=range]{accent-color:var(--acc2)}

/* right: properties */
#panel{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:12px}
.psection{border:1px solid var(--line);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px}
.psection h3{margin:0 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.phead{display:flex;align-items:center;gap:8px;font-weight:600}
.phead .chip{font-size:10px;padding:2px 7px;border-radius:9px;background:var(--acc2-soft);color:var(--acc2);text-transform:uppercase;flex:none}
.pactions{display:flex;gap:6px}
.pactions .btn{flex:1;font-size:11px}
.prow{display:flex;align-items:center;gap:6px}
.plabel{width:74px;flex:none;font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.prow input[type=range]{flex:1;min-width:0}
.prow .num{width:56px;flex:none;background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:5px;padding:3px 4px;font-size:11px}
.prow input[type=text]{flex:1;min-width:0;background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:5px;padding:4px;font-size:11px}
.prow select{flex:1;min-width:0;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:5px;padding:3px 4px;font-size:11px}
input[type=color]{width:26px;height:22px;padding:0;border:1px solid var(--line);background:none;border-radius:5px;flex:none}
input[type=checkbox]{accent-color:var(--acc2)}
.kf-btn{
  background:transparent;border:1px solid var(--line);border-radius:5px;width:22px;height:22px;
  flex:none;cursor:pointer;color:var(--muted);font-size:10px;padding:0;line-height:1;
}
.kf-btn.on{color:var(--acc);border-color:var(--acc);background:var(--acc-soft)}
.kf-btn:hover{border-color:var(--acc2);color:var(--acc2)}
.qacts{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:2px}
.qacts .btn{font-size:11px;padding:4px 7px;flex:1}
.btn{background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:6px 10px;cursor:pointer}
.btn:hover{border-color:var(--acc2)}
.btn.primary{background:var(--acc2);color:#fff;border-color:var(--acc2)}
.btn.danger:hover{border-color:var(--danger);color:var(--danger)}
.btn.wide{width:100%}
.kf-editor{border-color:var(--acc)}

/* ---------- timeline ---------- */
#timeline-wrap{height:308px;background:var(--panel);border-top:1px solid var(--line);display:flex;flex-direction:column;flex:none}
#tl-toolbar{height:36px;display:flex;align-items:center;justify-content:space-between;padding:0 10px;border-bottom:1px solid var(--line);flex:none}
#tlScroll{flex:1;overflow:auto;position:relative}
#tlInner{position:relative;min-height:100%;min-width:100%}
#ruler{display:block;height:26px;position:sticky;top:0;z-index:6;background:var(--panel);margin-left:52px}
#kfLane{height:22px;position:relative;border-bottom:1px solid var(--line);margin-left:52px}
#tracks{position:relative;margin-left:52px}
.trow{position:relative;height:44px;border-bottom:1px solid var(--line);display:flex;align-items:stretch}
.tlabel{
  position:sticky;left:4px;width:48px;flex:none;z-index:5;background:var(--panel);
  border-right:1px solid var(--line);display:flex;align-items:center;padding-left:7px;
  font-size:11px;color:var(--muted);font-weight:600;
}
.tclips{position:absolute;left:0;top:0;bottom:0;right:0}
.clip{
  position:absolute;top:4px;bottom:4px;border-radius:5px;border:1px solid;
  overflow:hidden;cursor:grab;user-select:none;display:flex;align-items:center;
  font-size:11px;white-space:nowrap;
}
.clip.sel{outline:2px solid var(--acc);z-index:3}
.clip.video,.clip.image{background:var(--clip-video);border-color:var(--acc2);color:var(--ink)}
.clip.audio{background:var(--clip-audio);border-color:var(--acc);color:var(--ink)}
.clip.text,.clip.shape{background:var(--clip-over);border-color:var(--acc);color:var(--ink)}
.cname{padding:0 8px;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
.clip .handle{position:absolute;top:0;bottom:0;width:7px;cursor:ew-resize}
.clip .handle.l{left:0;border-radius:5px 0 0 5px}
.clip .handle.r{right:0;border-radius:0 5px 5px 0}
.clip .handle:hover{background:rgba(0,0,0,.18)}
.kf-m{
  position:absolute;width:9px;height:9px;background:var(--acc);border:1px solid var(--panel);
  transform:translate(-50%,-50%) rotate(45deg);top:50%;cursor:ew-resize;z-index:4;
}
.kf-m.sel{background:var(--acc2);box-shadow:0 0 0 3px var(--acc2-soft)}
#playhead{position:absolute;top:0;bottom:0;width:1px;background:var(--danger);z-index:7;pointer-events:none}
#playhead::before{
  content:'';position:absolute;top:0;left:-5px;
  border:5px solid transparent;border-top:7px solid var(--danger);
}

/* ---------- modals ---------- */
.modal{position:fixed;inset:0;background:rgba(10,8,20,.45);display:flex;align-items:center;justify-content:center;z-index:50}
.modal-card{
  background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px;width:340px;
  display:flex;flex-direction:column;gap:10px;box-shadow:var(--shadow);
}
.modal-card h2{margin:0;font-size:16px}
.form-row{display:flex;align-items:center;gap:8px}
.form-row label{width:80px;color:var(--muted);font-size:12px;flex:none}
.form-row select{flex:1;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:5px;padding:4px}
.modal-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
.progress{height:8px;background:var(--panel2);border-radius:5px;overflow:hidden}
#expBar{height:100%;width:0%;background:var(--acc2);transition:width .2s}
.proj-list{display:flex;flex-direction:column;gap:6px;max-height:300px;overflow:auto}
.prow-item{display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:8px;padding:7px 9px}
.prow-item .pn{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.prow-item .pd{font-size:10px;color:var(--muted);flex:none}

/* ---------- toast / scrollbars ---------- */
#toast{
  position:fixed;bottom:320px;left:50%;transform:translateX(-50%);
  background:var(--ink);color:var(--bg);padding:8px 14px;border-radius:8px;z-index:99;
  font-size:12px;opacity:0;transition:opacity .25s;pointer-events:none;max-width:80%;
}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:var(--line);border-radius:6px}
::-webkit-scrollbar-track{background:transparent}

/* ---------- responsive ---------- */
@media (max-width:980px){
  #workspace{flex-direction:column}
  #center{order:1;min-height:200px}
  aside{width:100%!important;height:230px;border:0;border-top:1px solid var(--line)}
  #left{order:2}
  #right{order:3}
  aside.collapsed{display:none}
  .only-mobile{display:inline-block}
  #timeline-wrap{height:230px}
}
