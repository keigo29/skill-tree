(() => {
const K = window.SkillCore;
const { SLOTS, FREQ, RATE, W, H, pt, addDays, parseKey, todayKey, monOf } = K;
const ICONS=['star','sparkles','zap','flame','target','flag','trophy','crown','medal','rocket','mountain','compass','map','route','footprints','eye','scan-eye','brain','lightbulb',
 'key','lock-open','shield','sword','swords','scale','gavel','filter','git-fork','crosshair','link','network','puzzle','ear','messages-square','megaphone','users','handshake',
 'heart','gift','smile','wind','leaf','sprout','flower-2','sun','moon','cloud-fog','circle-pause','equal-not','dumbbell','biceps-flexed','activity','heart-pulse','bike',
 'utensils','apple','droplet','bed','book-open','notebook-pen','pen-line','graduation-cap','languages','code','laptop','briefcase','clipboard-list','calendar-check',
 'clock','timer','alarm-clock','trending-up','chart-line','repeat','piggy-bank','wallet','music','palette','camera','house','phone-off','smartphone'];
const WD=['日','月','火','水','木','金','土'];
const md=k=>{const d=parseKey(k);return `${d.getMonth()+1}月${d.getDate()}日(${WD[d.getDay()]})`;};
const shortMd=k=>{const d=parseKey(k);return `${d.getMonth()+1}/${d.getDate()}`;};
const fmt=v=>String(Math.round(v*10)/10);

let state=K.fresh(), C=K.ctx(state);
let selected='root', selDay=todayKey(), editing=false;

// ================= 保存 =================
const LKEY='skilltree.v3', OLDKEYS=['skilltree.v2','skilltree.v1'], SKEY='skilltree.sync';
let mode='local', cloudRef=null, chain=Promise.resolve();
const inClaude=!!(window.claude&&typeof window.claude.use==='function');
const $=id=>document.getElementById(id);
function loadLocal(){
  try{ let r=localStorage.getItem(LKEY); if(!r) for(const k of OLDKEYS){ r=localStorage.getItem(k); if(r) break; } return r?K.normalize(JSON.parse(r)):null; }catch(e){ return null; }
}
const saveLocal=()=>{ try{ localStorage.setItem(LKEY,JSON.stringify(state)); }catch(e){} };
function commit(next,popId){
  if(!next||next===state){ render(popId); return; }
  state=next; saveLocal(); render(popId);
  if(mode==='cloud'&&cloudRef){ const b=JSON.parse(JSON.stringify(state));
    chain=chain.then(()=>cloudRef.set(b)).catch(e=>{ if(e&&e.code==='invalid_argument'){ mode='local'; setBadge(); } }); }
  schedulePush();
}

// ================= GitHub Gist と同期（MCP サーバーと同じデータを読む） =================
let sync=null; try{ sync=JSON.parse(localStorage.getItem(SKEY)||'null'); }catch(e){}
const saveSync=()=>{ try{ sync?localStorage.setItem(SKEY,JSON.stringify(sync)):localStorage.removeItem(SKEY); }catch(e){} };
const GH='https://api.github.com';
const ghHead=()=>({Authorization:'Bearer '+sync.token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});
let syncNote='', pushTimer=null, syncing=false;
async function gistGet(){
  const r=await fetch(`${GH}/gists/${sync.gistId}`,{headers:ghHead(),cache:'no-store'});
  if(!r.ok) throw new Error(r.status===404?'Gist が見つかりません。IDとトークンを確かめてください':r.status===401?'トークンが正しくないか、期限が切れています':`GitHub に接続できませんでした（${r.status}）`);
  const j=await r.json(), f=j.files&&j.files['skilltree.json'];
  if(!f) return null;
  const txt=f.truncated?await (await fetch(f.raw_url)).text():f.content;
  return K.normalize(JSON.parse(txt));
}
async function gistPut(obj){
  const r=await fetch(`${GH}/gists/${sync.gistId}`,{method:'PATCH',headers:{...ghHead(),'Content-Type':'application/json'},
    body:JSON.stringify({files:{'skilltree.json':{content:JSON.stringify(obj,null,1)}}})});
  if(!r.ok) throw new Error(`保存できませんでした（${r.status}）`);
}
async function pull(){
  if(!sync||syncing) return; syncing=true;
  try{ const remote=await gistGet();
    if(remote&&(remote.updatedAt||'')>(state.updatedAt||'')){ state=remote; saveLocal(); render(); }
    else if(!remote||(state.updatedAt||'')>(remote.updatedAt||'')) await gistPut(state);
    sync.last=new Date().toISOString(); saveSync(); syncNote='';
  }catch(e){ syncNote=e.message; }
  syncing=false; renderSync();
}
function schedulePush(){ if(!sync) return; clearTimeout(pushTimer); pushTimer=setTimeout(push,1200); }
async function push(){
  if(!sync) return; if(syncing){ schedulePush(); return; } syncing=true;
  try{ const remote=await gistGet();
    // 他の場所（MCP や別の端末）で変わっていたら、合わせてから保存
    if(remote&&(remote.updatedAt||'')>(sync.last||'')){ state=K.merge(state,remote); saveLocal(); render(); }
    await gistPut(state); sync.last=state.updatedAt; saveSync(); syncNote='';
  }catch(e){ syncNote=e.message; }
  syncing=false; renderSync();
}
async function createGist(token){
  const r=await fetch(`${GH}/gists`,{method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'},
    body:JSON.stringify({description:'スキルツリーのデータ',public:false,files:{'skilltree.json':{content:JSON.stringify(state,null,1)}}})});
  if(!r.ok) throw new Error(r.status===401?'トークンが正しくありません':r.status===403||r.status===404?'トークンに gist の権限がありません':`Gist を作れませんでした（${r.status}）`);
  return (await r.json()).id;
}
function renderSync(){
  const box=$('syncBox'); if(!box) return;
  if(inClaude){ box.innerHTML='<p>GitHub Gist との同期と MCP 連携は、GitHub Pages に置いた版で使えます（claude.ai の中からは GitHub に接続できません）。</p>'; return; }
  if(!sync){
    box.innerHTML=`<p>Gist（GitHub の非公開メモ）にデータを置くと、スマホとMacで同じ記録を使え、Claude Code の MCP からも操作できます。<code>gist</code> 権限だけのトークンを使ってください。</p>
      <div class="two" style="margin-top:10px">
        <label class="fld"><span>GitHub トークン</span><input id="sTok" type="password" autocomplete="off" placeholder="ghp_…"></label>
        <label class="fld"><span>Gist ID（空なら新しく作る）</span><input id="sGist" autocomplete="off" placeholder="空欄で新規作成"></label>
      </div>
      <div class="drow"><button class="btn ghost" id="sConnect" type="button"><i data-lucide="cloud-upload"></i>同期を始める</button></div>
      ${syncNote?`<p class="err">${esc(syncNote)}</p>`:''}`;
  } else {
    box.innerHTML=`<p>Gist と同期しています。Gist ID：<code id="gidTxt">${esc(sync.gistId)}</code>${sync.last?` ・ 最後の同期 ${new Date(sync.last).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}`:''}</p>
      <div class="drow"><button class="btn ghost" id="sNow" type="button"><i data-lucide="refresh-cw"></i>今すぐ同期</button>
        <button class="btn ghost" id="sCopy" type="button"><i data-lucide="copy"></i>Gist ID をコピー</button>
        <button class="btn ghost" id="sOff" type="button"><i data-lucide="cloud-off"></i>同期をやめる</button></div>
      ${syncNote?`<p class="err">${esc(syncNote)}</p>`:''}`;
  }
  setBadge();
}

// ================= 描画 =================
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons=()=>{ if(window.lucide) lucide.createIcons({attrs:{'stroke-width':1.7}}); };
const pascal=s=>s.replace(/(^|-)([a-z0-9])/g,(m,a,b)=>b.toUpperCase());
const iconOk=name=>!window.lucide||!!lucide.icons[pascal(name)];
const ic=n=>esc(iconOk(n.icon)?n.icon:'star');

function drawArcs(){
  let s='';
  [140,245,340,430,500].forEach((r,i)=>{ const a=pt(r,180),b=pt(r,0);
    s+=`<path d="M${a.x} ${a.y} A${r} ${r} 0 0 1 ${b.x} ${b.y}" fill="none" stroke="#ffffff" stroke-opacity="${i===4?0.05:0.035}" stroke-width="1" ${i%2?'stroke-dasharray="2 6"':''}/>`; });
  $('edges').innerHTML=s+'<g id="edgeLines"></g>';
}
function labelStyle(b){
  const t4=C.NODES[b.key+'4'], x=t4.x/W*100, y=t4.y/H*100, ang=t4.ang;
  if(ang>=160) return 'left:0;bottom:2%;text-align:left';
  if(ang<=20) return 'right:0;bottom:2%;text-align:right';
  if(ang>=90) return `right:${(100-x+4).toFixed(1)}%;top:${Math.max(1,y-6).toFixed(1)}%;text-align:right`;
  return `left:${(x+4).toFixed(1)}%;top:${Math.max(1,y-6).toFixed(1)}%;text-align:left`;
}
function renderTree(popId){
  $('labels').innerHTML=state.branches.map(b=>`<div class="blabel" style="${labelStyle(b)}"><b>${esc(b.name)}</b><span>${esc(b.en)}</span><small>${SLOTS.filter(s=>C.isOn(b.key+s)).length} / 6</small></div>`).join('');
  let e='';
  C.ALL.forEach(n=>n.parents.forEach(pid=>{
    const p=C.NODES[pid], lit=C.isOn(n.id)&&C.isOn(pid), next=C.isActive(n.id);
    e+=`<line x1="${p.x}" y1="${p.y}" x2="${n.x}" y2="${n.y}" stroke="${lit?'#ece8df':next?'#c99a62':'#3a4150'}" stroke-opacity="${lit?0.85:next?0.55:1}" stroke-width="${lit?3:2}" vector-effect="non-scaling-stroke"/>`;
    if(lit) e+=`<circle cx="${(p.x+n.x)/2}" cy="${(p.y+n.y)/2}" r="3.5" fill="#ece8df"/>`;
  }));
  $('edgeLines').innerHTML=e;
  $('nodes').innerHTML=C.ALL.map(n=>{
    const on=C.isOn(n.id), act=C.isActive(n.id), pr=act?(n.freq==='g'?C.goalPct(n):C.pctOf(n.id)):0;
    const cls=['node',n.id==='root'?'root':'',n.cap?'cap':'',on?'on':'',act?'avail':'',selected===n.id?'sel':'',popId===n.id?'pop':''].join(' ');
    const st=on?'解放済み':act?(n.freq==='g'?'挑戦中の達成目標':`挑戦中 ${C.count(n.id)}/${n.need}回`):'未解放';
    return `<button type="button" class="${cls}" style="left:${(n.x/W*100).toFixed(2)}%;top:${(n.y/H*100).toFixed(2)}%;--p:${pr}" data-node="${n.id}" aria-label="${esc(n.name)}（${st}）" aria-pressed="${selected===n.id}"><i data-lucide="${n.id==='root'?'sparkles':ic(n)}"></i></button>`;
  }).join('');
  const P=C.progress();
  $('pctNum').innerHTML=`${P.pct}<small>%</small>`; $('pctBar').style.width=P.pct+'%';
  $('pctTxt').textContent=P.branches?`チェックした回数でスキルが解放されます ・ 1年で最終スキルに届く目安 ・ 最終スキル ${P.caps} / ${P.branches}`:'まだ系統がありません。「編集」から系統を追加して、ツリーを作りましょう';
  $('progressTxt').textContent=`${P.unlocked} / ${P.total} 解放`;
  $('title').textContent=state.title;
}

function rowHtml(n){
  const on=C.checkedOn(n,selDay), q=C.quota(n.freq);
  let fq, met=false;
  if(n.freq==='g'){ const r=C.rec(n.id); fq=on?'達成':'達成目標'; if(n.goalTarget!=null) fq+=` ${r?fmt(r.value):'—'} / ${fmt(n.goalTarget)}${esc(n.goalUnit)}`; }
  else if(n.freq==='d') fq='毎日';
  else if(n.freq==='m1') fq=on?'今月 済み':'今月まだ';
  else { const wc=C.weekCount(n.id,selDay); met=!on&&wc>=q; fq=`今週 ${wc}/${q}`; }
  const live=C.isActive(n.id);
  const tail=n.freq==='g'?(live?'記録はスキルの詳細から':'解放済み'):live?`${C.count(n.id)}/${n.need}回`:'解放済み';
  const pw=n.freq==='g'?C.goalPct(n):C.pctOf(n.id);
  return `<div class="hb-row${met?' met':''}" style="--c:${n.color}">
    <button type="button" class="hb-chk${on?' done':''}${met?' met':''}" data-chk="${n.id}" aria-label="${esc(n.name)}を${on?'未チェックにする':'チェックする'}" aria-pressed="${on}"><i data-lucide="check"></i></button>
    <button type="button" class="hb-name" ${n.freq==='g'?`data-open="${n.id}"`:`data-chk="${n.id}"`} title="${esc(n.name)}">
      <span class="hb-icon"><i data-lucide="${ic(n)}"></i></span>
      <span class="txt"><span class="nm">${esc(n.act||n.name)}</span><small><span class="fq">${fq}</span><span>${esc(n.name)} ・ ${tail}</span></small>
      ${live?`<span class="prog"><i style="width:${pw}%"></i></span>`:''}</span>
    </button>
  </div>`;
}
function renderCheck(){
  const today=todayKey(); if(selDay>today) selDay=today;
  const mon=monOf(selDay);
  let wk=`<button class="iconBtn" data-wk="-7" type="button" aria-label="前の週"><i data-lucide="chevron-left"></i></button>`;
  for(let i=0;i<7;i++){
    const k=addDays(mon,i), d=parseKey(k), its=C.itemsOn(k).filter(n=>n.freq!=='g'), dn=its.filter(n=>C.satisfied(n,k)).length;
    const cls=['wday',k===today?'today':'',k===selDay?'sel':'',k>today?'future':'',state.off[k]?'offd':'',its.length&&dn>=its.length?'all':''].join(' ');
    wk+=`<button type="button" class="${cls}" data-day="${k}" aria-label="${md(k)}"${k>today?' disabled':''}><small>${WD[d.getDay()]}</small><b>${d.getDate()}</b><i><span style="width:${its.length?Math.round(dn/its.length*100):0}%"></span></i></button>`;
  }
  wk+=`<button class="iconBtn" data-wk="7" type="button" aria-label="次の週"${addDays(mon,7)>today?' disabled':''}><i data-lucide="chevron-right"></i></button>`;
  const allIts=C.itemsOn(selDay), its=allIts.filter(n=>n.freq!=='g'), dn=its.filter(n=>C.satisfied(n,selDay)).length, isOff=!!state.off[selDay];
  const full=its.length&&dn>=its.length, Cc=2*Math.PI*28, pct=its.length?dn/its.length:0;
  let msg;
  if(isOff) msg='<i data-lucide="tree-palm"></i>休みの日（連続記録は途切れません）';
  else if(!its.length) msg=allIts.length?'今日の確認項目はありません':'確認項目がありません';
  else if(full) msg='<i data-lucide="party-popper"></i>全部できました';
  else msg=`あと ${its.length-dn} つ`;
  const groups=[['d','毎日'],['w','週ごと（今週の中ならいつでも）'],['m1','月ごと（今月の中ならいつでも）'],['g','達成目標（できたらチェック）']];
  const list=groups.map(([g,label])=>{ const rows=allIts.filter(n=>g==='w'?n.freq[0]==='w':n.freq===g); return rows.length?`<div class="hb-sep">${label}</div>`+rows.map(rowHtml).join(''):''; }).join('');
  $('check').innerHTML=`
    <div class="phead"><h2><i data-lucide="calendar-check"></i>毎日確認</h2>
      <div class="streak"><i data-lucide="flame"></i><span>${C.streak()}</span><small>日連続</small></div></div>
    <div class="week">${wk}</div>
    <div class="hb-top${full?' all':''}">
      <div class="hb-ring"><svg viewBox="0 0 64 64"><circle class="bgc" cx="32" cy="32" r="28"/><circle class="fgc" cx="32" cy="32" r="28" stroke-dasharray="${Cc}" stroke-dashoffset="${Cc*(1-pct)}"/></svg><b>${its.length?dn+'/'+its.length:'—'}</b></div>
      <div class="hb-text"><div class="date">${md(selDay)}</div><div class="msg">${msg}</div></div>
    </div>
    <button type="button" class="softBtn" id="offBtn"><i data-lucide="tree-palm"></i>${isOff?'休みをやめる':selDay===today?'今日を休みにする':'この日を休みにする'}</button>
    <div class="hb-head"><span>確認項目（挑戦中のスキル）</span><span>${dn} / ${its.length}</span></div>
    <div class="hb-list">${list}</div>
    ${allIts.length?'':state.branches.length?`<div class="empty"><i data-lucide="trophy"></i><span>挑戦中のスキルはありません。</span></div>`
      :`<div class="empty"><i data-lucide="sprout"></i><span>右上の「編集」を押し、まん中のノードから「系統を追加」してツリーを作りましょう。</span></div>`}`;
}

function renderDetail(){
  const n=C.NODES[selected]; if(!n){ selected='root'; return renderDetail(); }
  if(editing) return renderEditor(n);
  if(n.id==='root'){
    $('detail').innerHTML=`<h2>${esc(state.title)}</h2>
      <div class="meta"><span class="cost">START</span><span class="br">CORE</span></div>
      <p class="desc">確認項目をチェックした回数が、そのスキルの「必要回数」に届くと自動で解放されます。解放すると、次の段のスキルが新しい確認項目になります。</p>
      <div class="practice"><i data-lucide="calendar-range"></i><div><b>1年で最終スキルへ</b><br>必要回数は、8割のペースで続けると約1年で各系統の最終スキルに届くように決めています。「編集」でツリーの中身ごと変えられます。</div></div>
      <p class="hint">今挑戦中のスキル：${C.activeNodes().length}つ</p>`;
    return;
  }
  const on=C.isOn(n.id), act=C.isActive(n.id), c=C.count(n.id), eta=C.eta(n);
  const status=on?`<span class="status on"><i data-lucide="check"></i>${shortMd(state.unlocked[n.id])} に${n.freq==='g'?'達成':'解放'}</span>`
    :act?`<span class="status go"><i data-lucide="zap"></i>挑戦中${eta!=null?` ・ このペースならあと約${eta}日`:''}</span>`
    :`<span class="status"><i data-lucide="lock"></i>前のスキルを解放すると挑戦できます</span>`;
  $('detail').innerHTML=`
    <h2>${esc(n.name)}</h2>
    <div class="meta"><span class="cost">LEVEL ${n.level} ・ ${FREQ[n.freq]}</span><span class="br">${esc(n.branch.name)} · ${esc(n.branch.en)}</span></div>
    ${n.desc?`<p class="desc">${esc(n.desc)}</p>`:''}
    <div class="practice"><i data-lucide="list-checks"></i><div><b>確認すること（${FREQ[n.freq]}）</b><br>${esc(n.act||'未設定')}</div></div>
    ${n.freq==='g'?goalBlock(n,on,act):`<div class="dprog"><div class="row"><span>チェック回数</span><span><b>${Math.min(c,n.need)}</b> / ${n.need} 回</span></div>
      <div class="track"><i style="width:${on?100:C.pctOf(n.id)}%"></i></div></div>`}
    ${status}`;
}
function goalBlock(n,on,act){
  const r=C.rec(n.id), done=C.checkedOn(n,todayKey());
  const prog=n.goalTarget!=null?`<div class="dprog"><div class="row"><span>今の記録${r?`（${shortMd(r.date)}）`:''}</span><span><b>${r?fmt(r.value):'—'}</b> / ${fmt(n.goalTarget)} ${esc(n.goalUnit)}</span></div>
      <div class="track"><i style="width:${on||done?100:C.goalPct(n)}%"></i></div></div>`:'';
  const form=act&&n.goalTarget!=null?`<div class="needRow" style="margin-top:12px"><input id="recIn" type="number" step="0.5" inputmode="decimal" placeholder="今日の記録（${esc(n.goalUnit)||'数値'}）" aria-label="今日の記録"><button type="button" id="recBtn">記録する</button></div>
      <p class="hint">${n.goalDir==='down'?'目標以下':'目標以上'}の記録を入れると、自動で達成になります</p>`:'';
  const btn=act||done?`<button type="button" class="btn${done?' ghost':''}" data-chk="${n.id}"><i data-lucide="${done?'undo-2':'trophy'}"></i>${done?'達成を取り消す':'達成した！'}</button>`:'';
  return prog+form+btn;
}
function iconPicker(cur){
  return `<div class="ipick" role="listbox" aria-label="アイコンを選ぶ">${ICONS.filter(iconOk).map(i=>`<button type="button" data-icon="${i}" class="${i===cur?'on':''}" aria-label="${i}" title="${i}"><i data-lucide="${i}"></i></button>`).join('')}</div>`;
}
function renderEditor(n){
  if(n.id==='root'){
    const full=state.branches.length>=K.MAX_BRANCHES;
    $('detail').innerHTML=`<div class="form">
      <h3>ツリー全体</h3>
      <label class="fld"><span>タイトル</span><input id="e-title" data-f="title" value="${esc(state.title)}" maxlength="40"></label>
      <button type="button" class="btn" id="addBranch"${full?' disabled':''}><i data-lucide="plus"></i>系統を追加（${state.branches.length} / ${K.MAX_BRANCHES}）</button>
      <button type="button" class="btn ghost" id="yearAll"${state.branches.length?'':' disabled'}><i data-lucide="calendar-range"></i>全スキルの必要回数を1年ペースに戻す</button>
      <p class="hint" style="margin:0">ツリーのスキルを押すと、そのスキルと系統を編集できます。</p>
      <h3>作り直す</h3>
      <button type="button" class="btn danger" id="newBlank"><i data-lucide="eraser"></i>空のツリーからゼロで作る</button>
      <button type="button" class="btn ghost" id="newTpl"><i data-lucide="layout-template"></i>見本のツリーで作り直す</button>
      <button type="button" class="btn ghost" id="goAi"><i data-lucide="wand-sparkles"></i>AIに作ってもらう</button>
      <p class="hint" style="margin:0">作り直すと、今の系統と記録はすべて消えます。先に「データ」から書き出しておくと安心です。</p>
    </div>`;
    return;
  }
  const b=n.branch;
  $('detail').innerHTML=`<div class="form">
    <h3>系統</h3>
    <div class="two">
      <label class="fld"><span>系統の名前</span><input id="e-bname" data-b="name" value="${esc(b.name)}" maxlength="20"></label>
      <label class="fld"><span>英字ラベル</span><input id="e-ben" data-b="en" value="${esc(b.en)}" maxlength="20"></label>
    </div>
    <label class="fld"><span>色</span><input type="color" id="e-bcolor" data-b="color" value="${b.color}"></label>
    <h3>スキル（LEVEL ${n.level}）</h3>
    <label class="fld"><span>スキルの名前</span><input id="e-name" data-n="name" value="${esc(n.name)}" maxlength="30"></label>
    <div class="fld"><span>アイコン</span>
      <div class="iconRow"><span class="pv"><i data-lucide="${ic(n)}"></i></span><input id="e-icon" data-n="icon" value="${esc(n.icon)}" maxlength="40" aria-label="Lucide のアイコン名"></div>
      ${iconPicker(n.icon)}
      <span class="hint" style="margin:0">一覧にないものは lucide.dev のアイコン名を入れても使えます</span></div>
    <label class="fld"><span>説明</span><textarea id="e-desc" data-n="desc" maxlength="200">${esc(n.desc)}</textarea></label>
    <label class="fld"><span>確認すること（毎日確認に出る文）</span><input id="e-act" data-n="act" value="${esc(n.act)}" maxlength="120"></label>
    <div class="two">
      <label class="fld"><span>頻度</span><select id="e-freq" data-n="freq">${Object.entries(FREQ).map(([k,v])=>`<option value="${k}"${k===n.freq?' selected':''}>${v}</option>`).join('')}</select></label>
      ${n.freq==='g'?`<label class="fld"><span>目標の数値（なしでも可）</span><input id="e-gt" data-n="goalTarget" type="number" step="0.5" value="${n.goalTarget??''}" placeholder="例：100"></label>`
      :`<div class="fld"><span>必要回数（目安 約${Math.ceil(n.need/RATE[n.freq]/0.8)}日）</span>
        <div class="needRow"><input id="e-need" data-n="need" type="number" min="1" max="999" value="${n.need}"><button type="button" id="yearOne">1年ペース：${K.yearNeed(n.level,n.freq)}</button></div></div>`}
    </div>
    ${n.freq==='g'?`<div class="two">
      <label class="fld"><span>単位</span><input id="e-gu" data-n="goalUnit" value="${esc(n.goalUnit)}" maxlength="10" placeholder="例：kg"></label>
      <label class="fld"><span>達成の向き</span><select id="e-gd" data-n="goalDir"><option value="up"${n.goalDir!=='down'?' selected':''}>この数値以上で達成</option><option value="down"${n.goalDir==='down'?' selected':''}>この数値以下で達成</option></select></label>
    </div><p class="hint" style="margin:0">達成目標は1回達成すると解放されます。数値を決めておくと、詳細から記録を入れて進み具合を見られます。</p>`:''}
    <p class="hint" style="margin:0">スキルID：<code>${n.id}</code>（MCP から操作するときに使います）</p>
    <button type="button" class="btn danger" id="delBranch"><i data-lucide="trash-2"></i>この系統を削除</button>
  </div>`;
}

function renderContrib(){
  const today=todayKey(), start=addDays(monOf(today),-52*7), perDay=C.perDay();
  let h='<span></span>', lastM=-1;
  for(let w=0;w<53;w++){ const m=parseKey(addDays(start,w*7)).getMonth(); if(m!==lastM){ h+=`<span class="mon" style="grid-column:${w+2}">${m+1}月</span>`; lastM=m; } }
  ['月','','水','','金','',''].forEach((l,i)=>{ h+=`<span class="wdl" style="grid-row:${i+2}">${l}</span>`; });
  let days=0;
  for(let w=0;w<53;w++) for(let i=0;i<7;i++){
    const k=addDays(start,w*7+i), c=perDay[k]||0; if(c&&k<=today) days++;
    const cls=['cell',k>today?'fut':c?'l'+Math.min(4,c):state.off[k]?'off':'',k===selDay?'sel':''].join(' ');
    h+=`<button type="button" class="${cls}" style="grid-column:${w+2};grid-row:${i+2}" data-day="${k}" title="${md(k)}：${c}件${state.off[k]?'（休み）':''}" aria-label="${md(k)} ${c}件"${k>today?' disabled tabindex="-1"':''}></button>`;
  }
  $('cgrid').innerHTML=h;
  const total=Object.values(perDay).reduce((a,v)=>a+v,0);
  $('csum').innerHTML=`<span><b>${days}</b>日 確認（1年）</span><span><b>${total}</b>回 チェック</span><span><b>${Math.max(0,...C.runs())}</b>日 最長連続</span>`;
}
function render(popId){ C=K.ctx(state); renderTree(popId); renderCheck(); renderDetail(); renderContrib(); renderSync(); icons(); }

// ================= 操作 =================
function afterUnlock(r,label){
  selected=r.newly; commit(r.st,r.newly); strike(r.newly);
  toast(`「${C.NODES[r.newly].name}」を${label}！${r.nexts&&r.nexts.length?'次は'+r.nexts.map(x=>`「${x}」`).join(''):''}`,'zap');
}
function toggleCheck(id){
  const r=K.applyCheck(state,id,selDay);
  if(r.status==='future') return toast('先の日はチェックできません','triangle-alert');
  if(r.status==='quota') return toast(`今週の${FREQ[C.NODES[id].freq]}は達成済みです`,'circle-check');
  if(r.status==='locked') return toast('この日はまだ挑戦していないスキルです','lock');
  if(r.checked&&navigator.vibrate) navigator.vibrate(12);
  if(r.newly) afterUnlock(r,C.NODES[id].freq==='g'?'達成':'解放'); else commit(r.st);
}
function saveRecord(){
  const n=C.NODES[selected], v=parseFloat($('recIn')?.value); if(!n) return;
  if(!Number.isFinite(v)) return toast('数値を入れてください','triangle-alert');
  const r=K.applyRecord(state,n.id,v);
  if(r.newly) return afterUnlock(r,'達成');
  commit(r.st); toast(r.better?`自己ベスト更新：${fmt(v)}${n.goalUnit}`:`記録しました（ベストは ${fmt(r.best)}${n.goalUnit}）`,r.better?'trending-up':'notebook-pen');
}
// 入力欄の change は描き直しの途中にも起きるので、反映は次の瞬間にまとめる
let pending=null; function later(fn){ pending=fn; setTimeout(()=>{ const f=pending; pending=null; if(f) f(); },0); }
function editSkill(f,v){
  const n=C.NODES[selected]; if(!n||n.id==='root') return;
  if(f==='need') v=parseInt(v,10)||1;
  const r=K.updateSkill(state,n.id,{[f]:v});
  later(()=>{ if(r.newly){ commit(r.st,r.newly); strike(r.newly); } else commit(r.st); });
}
function editBranch(f,v){ const n=C.NODES[selected]; if(!n||!n.branch) return; const r=K.updateBranch(state,n.branch.key,{[f]:v}); later(()=>commit(r.st)); }
let armed=null, armTimer;
function twoStep(btn,label,fn){
  if(armed!==btn.id){ armed=btn.id; btn.innerHTML='<i data-lucide="triangle-alert"></i>もう一度押すと確定します'; icons();
    clearTimeout(armTimer); armTimer=setTimeout(()=>{ armed=null; const b=$(btn.id); if(b){ b.innerHTML=label; icons(); } },5000); return; }
  armed=null; clearTimeout(armTimer); fn();
}

document.addEventListener('click',e=>{
  const t=e.target.closest('button'); if(!t) return;
  if(t.dataset.node){ selected=t.dataset.node; render(); return; }
  if(t.dataset.chk){ toggleCheck(t.dataset.chk); return; }
  if(t.dataset.open){ selected=t.dataset.open; render(); $('detail').scrollIntoView({behavior:'smooth',block:'nearest'}); return; }
  if(t.dataset.icon){ editSkill('icon',t.dataset.icon); return; }
  if(t.dataset.day&&!t.disabled){ selDay=t.dataset.day; render(); return; }
  if(t.dataset.wk){ const k=addDays(selDay,+t.dataset.wk); selDay=k>todayKey()?todayKey():k; render(); return; }
  switch(t.id){
    case 'offBtn': commit(K.setOff(state,selDay,!state.off[selDay])); break;
    case 'recBtn': saveRecord(); break;
    case 'editBtn': editing=!editing; t.classList.toggle('on',editing); t.setAttribute('aria-pressed',editing); t.querySelector('span').textContent=editing?'編集を終える':'編集'; render(); break;
    case 'addBranch': { const r=K.addBranch(state,{}); if(r.status==='added'){ selected=r.key+'1'; commit(r.st); toast('系統を追加しました。スキルを押して中身を決めましょう','plus'); } break; }
    case 'yearAll': twoStep(t,'<i data-lucide="calendar-range"></i>全スキルの必要回数を1年ペースに戻す',()=>{ commit(K.yearAll(state)); toast('必要回数を1年ペースにしました','calendar-range'); }); break;
    case 'yearOne': { const n=C.NODES[selected]; editSkill('need',K.yearNeed(n.level,n.freq)); break; }
    case 'delBranch': twoStep(t,'<i data-lucide="trash-2"></i>この系統を削除',()=>{ const r=K.deleteBranch(state,C.NODES[selected].branch.key); selected='root'; commit(r.st); toast(`「${r.name}」を削除しました`,'trash-2'); }); break;
    case 'newBlank': twoStep(t,'<i data-lucide="eraser"></i>空のツリーからゼロで作る',()=>{ selected='root'; editing=true; commit(K.newTree('blank')); toast('空のツリーにしました。「系統を追加」から作りましょう','eraser'); }); break;
    case 'newTpl': twoStep(t,'<i data-lucide="layout-template"></i>見本のツリーで作り直す',()=>{ selected='root'; commit(K.newTree('template')); toast('見本のツリーで作り直しました','layout-template'); }); break;
    case 'goAi': $('aiPanel').scrollIntoView({behavior:'smooth',block:'start'}); setTimeout(()=>$('aiWish').focus({preventScroll:true}),400); break;
    case 'aiCopy': copyPrompt(); break;
    case 'aiApply': if(aiTree) twoStep(t,'<i data-lucide="sparkles"></i>このツリーにする',applyAi); break;
    case 'sConnect': connectGist(); break;
    case 'sNow': pull().then(push); break;
    case 'sCopy': try{ navigator.clipboard.writeText(sync.gistId).then(()=>toast('Gist ID をコピーしました','copy'),()=>selectText('gidTxt')); }catch(err){ selectText('gidTxt'); } break;
    case 'sOff': twoStep(t,'<i data-lucide="cloud-off"></i>同期をやめる',()=>{ sync=null; saveSync(); renderSync(); toast('同期をやめました（データはこの端末に残ります）','cloud-off'); }); break;
  }
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.n) editSkill(t.dataset.n,t.value);
  else if(t.dataset.b) editBranch(t.dataset.b,t.value);
  else if(t.dataset.f==='title'){ const v=t.value; later(()=>commit(K.setTitle(state,v))); }
});
// ---- AIでツリーを作る ----
let aiTree=null;
function copyPrompt(){
  const txt=K.prompt($('aiWish').value), out=$('aiPromptOut');
  const show=()=>{ out.hidden=false; out.value=txt; out.focus(); out.select(); toast('下の欄の指示文を全選択してコピーしてください','clipboard-copy'); };
  try{ navigator.clipboard.writeText(txt).then(()=>{ out.hidden=true; toast('指示文をコピーしました。AIに貼り付けて送ってください','clipboard-copy'); },show); }catch(e){ show(); }
}
function previewAi(){
  const raw=$('aiPaste').value, box=$('aiPreview'), btn=$('aiApply');
  if(!raw.trim()){ aiTree=null; box.innerHTML=''; btn.disabled=true; return; }
  const r=K.parseTree(raw);
  if(!r.ok){ aiTree=null; btn.disabled=true; box.innerHTML=`<div class="err"><i data-lucide="circle-alert"></i>${esc(r.error)}</div>`; icons(); return; }
  aiTree=r; btn.disabled=false;
  const goals=r.branches.reduce((a,b)=>a+SLOTS.filter(s=>b.nodes[s].freq==='g').length,0);
  box.innerHTML=`<div class="ok"><i data-lucide="circle-check"></i>${r.title?`「${esc(r.title)}」 ・ `:''}${r.branches.length}系統・${r.skills}スキルを読み取りました${goals?`（達成目標 ${goals}）`:''}</div>
    <ul>${r.branches.map(b=>`<li><i class="dot" style="background:${b.color}"></i><b>${esc(b.name)}</b><span>${SLOTS.map(s=>esc(b.nodes[s].name)).join(' → ')}</span></li>`).join('')}</ul>
    ${r.notes.map(n=>`<div class="note">${esc(n)}</div>`).join('')}`;
  icons();
}
function applyAi(){
  const r=K.applyTree(state,aiTree,$('aiKeep').checked);
  $('aiApply').innerHTML='<i data-lucide="sparkles"></i>このツリーにする';
  selected='root'; selDay=todayKey(); commit(r.st);
  $('aiPaste').value=''; previewAi();
  window.scrollTo({top:0,behavior:'smooth'});
  toast(r.kept.length?`新しいツリーにしました（${r.kept.join('・')}の記録を引き継ぎ）`:'新しいツリーにしました','sparkles');
}
$('aiPaste').addEventListener('input',previewAi);

function selectText(id){ const el=$(id); if(!el) return; const r=document.createRange(); r.selectNodeContents(el); const s=getSelection(); s.removeAllRanges(); s.addRange(r); toast('選択しました。コピーしてください','copy'); }
async function connectGist(){
  const token=$('sTok').value.trim(), gid=$('sGist').value.trim().replace(/^.*gist\.github\.com\/(?:[^/]+\/)?/,'').replace(/[^\w]/g,'');
  if(!token){ syncNote='トークンを入れてください'; return renderSync(); }
  try{
    const id=gid||await createGist(token);
    sync={token,gistId:id,last:''}; saveSync(); syncNote='';
    if(gid){ const remote=await gistGet(); if(remote){ state=K.merge(state,remote); saveLocal(); } }
    await push(); render(); toast(gid?'Gist と同期しました':'新しい Gist を作って同期しました','cloud');
  }catch(err){ sync=null; saveSync(); syncNote=err.message; renderSync(); }
}

let tt;
function toast(msg,icon){
  const el=$('toast'); el.innerHTML=`<i data-lucide="${icon||'sparkles'}"></i><span>${esc(msg)}</span>`; icons();
  el.classList.add('show'); clearTimeout(tt); tt=setTimeout(()=>el.classList.remove('show'),2800);
}
function setBadge(){
  $('saveBadge').innerHTML=mode==='cloud'?'<i data-lucide="cloud"></i><span>アカウントに保存</span>':sync?'<i data-lucide="cloud"></i><span>Gist と同期</span>':'<i data-lucide="hard-drive"></i><span>この端末に保存</span>';
  icons();
}

// ---- 書き出し・読み込み ----
const exportText=()=>JSON.stringify(state,null,1);
$('copyBtn').addEventListener('click',()=>{
  const txt=exportText();
  const fallback=()=>{ const ta=$('importTxt'); ta.value=txt; ta.focus(); ta.select(); toast('下の欄に出しました。全選択してコピーしてください','copy'); };
  try{ navigator.clipboard.writeText(txt).then(()=>toast('データをコピーしました','copy'),fallback); }catch(e){ fallback(); }
});
$('saveBtn').addEventListener('click',()=>{
  const blob=new Blob([exportText()],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`skilltree-${todayKey()}.json`;
  document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
});
function doImport(raw){
  let d; try{ d=JSON.parse(raw); }catch(e){ toast('読み込めませんでした。書き出したデータをそのまま貼り付けてください','triangle-alert'); return; }
  if(!d||typeof d!=='object'||!(d.branches||d.unlocked||d.done||d.checks||d.checkins)){ toast('スキルツリーのデータではないようです','triangle-alert'); return; }
  const s=K.normalize(d); s.updatedAt=new Date().toISOString(); selDay=todayKey(); selected='root'; commit(s); $('importTxt').value=''; toast('データを読み込みました','circle-check');
}
$('importBtn').addEventListener('click',e=>{ const raw=$('importTxt').value.trim(); if(!raw){ toast('先にデータを貼り付けてください','triangle-alert'); return; }
  twoStep(e.currentTarget,'<i data-lucide="file-input"></i>貼り付けたデータを読み込む',()=>{ $('importBtn').innerHTML='<i data-lucide="file-input"></i>貼り付けたデータを読み込む'; doImport(raw); }); });
$('fileIn').addEventListener('change',e=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader(); r.onload=()=>{ $('importTxt').value=String(r.result); toast('内容を下の欄に入れました。「貼り付けたデータを読み込む」で確定します','upload'); };
  r.readAsText(f); e.target.value='';
});
if(inClaude){ $('saveBtn').hidden=true; $('fileLbl').hidden=true; }

// ================= 稲妻 =================
const cv=$('bolts'), cx=cv.getContext('2d');
const calmMotion=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
let bolts=[], nextArc=0;
function fit(){ const r=cv.getBoundingClientRect(), dpr=Math.min(2,window.devicePixelRatio||1);
  cv.width=Math.max(1,r.width*dpr); cv.height=Math.max(1,r.height*dpr); cx.setTransform(dpr,0,0,dpr,0,0); }
const toPx=n=>{ const r=cv.getBoundingClientRect(); return {x:n.x/W*r.width, y:n.y/H*r.height}; };
function jag(a,b,rough,depth){
  let pts=[a,b];
  for(let d=0;d<depth;d++){ const out=[pts[0]];
    for(let i=1;i<pts.length;i++){ const p=pts[i-1],q=pts[i],dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy)||1;
      const off=(Math.random()-.5)*rough*len; out.push({x:(p.x+q.x)/2-dy/len*off, y:(p.y+q.y)/2+dx/len*off},q); }
    pts=out; }
  return pts;
}
function addBolt(a,b,o){ o=o||{};
  const main=jag(a,b,o.rough||.35,o.depth||5), forks=[];
  if(o.forks) for(let i=0;i<o.forks;i++){ const s=main[2+Math.floor(Math.random()*(main.length-4))], ang=Math.random()*Math.PI*2, L=(o.forkLen||40)*(.5+Math.random());
    forks.push(jag(s,{x:s.x+Math.cos(ang)*L,y:s.y+Math.sin(ang)*L},.5,3)); }
  bolts.push({paths:[main,...forks], born:performance.now(), life:o.life||260, width:o.width||1.4, flash:o.flash});
}
function sparkAt(n){ const p=toPx(n); const k=2+Math.floor(Math.random()*2);
  for(let i=0;i<k;i++){ const ang=Math.random()*Math.PI*2, L=26+Math.random()*22;
    addBolt({x:p.x+Math.cos(ang)*22,y:p.y+Math.sin(ang)*22},{x:p.x+Math.cos(ang)*(22+L),y:p.y+Math.sin(ang)*(22+L)},{rough:.6,depth:3,life:200,width:1}); } }
function strike(id){
  if(calmMotion) return; const n=C.NODES[id]; if(!n) return; const p=toPx(n);
  addBolt({x:p.x+(Math.random()-.5)*120,y:-10},p,{rough:.3,depth:6,forks:4,forkLen:60,life:520,width:2.6,flash:p});
  setTimeout(()=>addBolt({x:p.x+(Math.random()-.5)*80,y:-10},p,{rough:.35,depth:6,forks:2,life:380,width:1.6}),90);
  for(let i=0;i<3;i++) setTimeout(()=>sparkAt(n),120+i*110);
}
function ambient(now){
  if(now<nextArc) return; nextArc=now+500+Math.random()*900;
  const lit=[]; C.ALL.forEach(n=>n.parents.forEach(pid=>{ if(C.isOn(n.id)&&C.isOn(pid)) lit.push([C.NODES[pid],n]); }));
  const on=C.SKILLS.filter(n=>C.isOn(n.id));
  if(!on.length&&!lit.length) return;
  if(lit.length&&Math.random()<.6){ const [a,b]=lit[Math.floor(Math.random()*lit.length)];
    const pa=toPx(a),pb=toPx(b),dx=pb.x-pa.x,dy=pb.y-pa.y,L=Math.hypot(dx,dy)||1,r=24;
    addBolt({x:pa.x+dx/L*r,y:pa.y+dy/L*r},{x:pb.x-dx/L*r,y:pb.y-dy/L*r},{rough:.28,depth:5,forks:Math.random()<.4?1:0,forkLen:18,life:240}); }
  else if(on.length) sparkAt(on[Math.floor(Math.random()*on.length)]);
}
function frame(now){
  const r=cv.getBoundingClientRect(); cx.clearRect(0,0,r.width,r.height);
  if(!document.hidden) ambient(now);
  bolts=bolts.filter(b=>now-b.born<b.life);
  cx.lineCap='round'; cx.lineJoin='round';
  for(const b of bolts){
    const t=(now-b.born)/b.life, a=(1-t)*(Math.random()<.15?.4:1);
    if(b.flash){ const g=cx.createRadialGradient(b.flash.x,b.flash.y,0,b.flash.x,b.flash.y,90);
      g.addColorStop(0,`rgba(214,230,255,${.55*(1-t)})`); g.addColorStop(1,'rgba(214,230,255,0)'); cx.fillStyle=g; cx.fillRect(b.flash.x-90,b.flash.y-90,180,180); }
    b.paths.forEach((pts,i)=>{
      const w=i?b.width*.6:b.width;
      cx.beginPath(); pts.forEach((p,j)=>j?cx.lineTo(p.x,p.y):cx.moveTo(p.x,p.y));
      cx.shadowColor='rgba(140,180,255,.9)'; cx.shadowBlur=14;
      cx.strokeStyle=`rgba(150,190,255,${.55*a})`; cx.lineWidth=w*3; cx.stroke();
      cx.shadowBlur=0; cx.strokeStyle=`rgba(245,248,255,${a})`; cx.lineWidth=w; cx.stroke();
    });
  }
  requestAnimationFrame(frame);
}

// ================= 起動 =================
drawArcs();
const local=loadLocal(); if(local) state=local;
render(); setBadge();
fit(); window.addEventListener('resize',fit); if(window.ResizeObserver) new ResizeObserver(fit).observe(cv);
if(!calmMotion) requestAnimationFrame(frame);
requestAnimationFrame(()=>{ const s=$('treeScroll'); s.scrollLeft=(s.scrollWidth-s.clientWidth)/2; const c=$('cscroll'); c.scrollLeft=c.scrollWidth; });
let lastDay=todayKey();
setInterval(()=>{ const t=todayKey(); if(t!==lastDay){ if(selDay===lastDay) selDay=t; lastDay=t; render(); } },60000);
// Gist：開いたとき・画面に戻ったとき・2分ごとに最新を取りに行く（MCP で変えた内容もここで反映される）
if(sync&&!inClaude){ pull(); document.addEventListener('visibilitychange',()=>{ if(!document.hidden) pull(); }); setInterval(()=>{ if(!document.hidden) pull(); },120000); }

// claude.ai で開いたときだけ、アカウントにも保存する
(async function connect(){
  if(!inClaude) return;
  try{
    const [user,db]=await Promise.all([window.claude.use('user'),window.claude.use('db')]);
    if(!user||!db) return;
    const id=await user.id(); if(!id) return;
    const ref=db.doc('data/users/'+id+'/state');
    const snap=await Promise.race([ref.get(),new Promise((_,rej)=>setTimeout(()=>rej({code:'timeout'}),10000))]);
    cloudRef=ref; mode='cloud';
    if(snap.exists){ state=K.normalize(snap.data()); saveLocal(); render(); }
    else ref.set(JSON.parse(JSON.stringify(state))).catch(()=>{});
    setBadge();
    $('dataNote').textContent='claude.ai で開いているときは、記録はあなたのアカウントに保存されます。GitHub Pages 版へ移すときは「コピーして書き出す」で写してください。';
  }catch(e){ mode='local'; setBadge(); }
})();
})();
