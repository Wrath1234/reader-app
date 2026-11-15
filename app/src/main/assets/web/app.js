'use strict';
/* Reader prototype. Runs inside the Android WebView; window.Android is the native bridge. */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const app=$('#app'), sc=$('#scroller'), bodyEl=$('#body');
const A=window.Android||null;
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const load=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}};
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const set=(k,v)=>app.style.setProperty(k,v);
const INS={top:0,bot:0};
window.__insets=(t,b)=>{INS.top=+t||0;INS.bot=+b||0;set('--sat',INS.top+'px');set('--sab',INS.bot+'px')};
if(A){try{const p=A.insets().split(',');window.__insets(p[0],p[1])}catch(e){}}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2400)}

/* ================= settings ================= */
const DEF={skin:'room',font:"'Literata',serif",size:17,lh:1.7,m:26,ls:0,align:'justify',par:'indent',dc:true,focus:false,ticks:true,emo:'subtle',ink:true,vig:true,motes:true,snd:'off',vol:.5,hap:true,auto:true,pacer:true,wpm:220,pcPos:null,dust:false,xfont:true};
const ST=Object.assign({},DEF,load('settings',{}));
const saveST=()=>save('settings',ST);
function haptic(p){if(!ST.hap)return;const s=Array.isArray(p)?p.join(','):String(p);try{if(A)A.haptic(s);else if(navigator.vibrate)navigator.vibrate(p)}catch(e){}}
const SKINS=['room','aurora','midnight','rain'];
function applySettings(){
  SKINS.forEach(k=>app.classList.toggle('skin-'+k,ST.skin===k));if(!SKINS.includes(ST.skin)){ST.skin='room';app.classList.add('skin-room')}
  set('--font',ST.font);set('--size',ST.size+'px');set('--lh',ST.lh);set('--m',ST.m+'px');set('--ls',ST.ls+'em');set('--align',ST.align);
  app.classList.toggle('sp-indent',ST.par==='indent');app.classList.toggle('sp-space',ST.par==='space');
  app.classList.toggle('dc',ST.dc);app.classList.toggle('focus',ST.focus);app.classList.toggle('noticks',!ST.ticks||ST.pacer);$('#pacer').style.display=ST.pacer?'':'none';
  app.classList.toggle('reactive',ST.ink);app.classList.toggle('xf',ST.xfont);
  {const cor=/Cormorant/.test(ST.font);set('--qfont',cor?"'Lora',serif":"'Cormorant Garamond',serif");set('--qsize',cor?'1em':'1.16em');set('--xfont',"'Playfair Display',serif")}
  app.classList.remove('ei-off','ei-subtle','ei-expressive');app.classList.add('ei-'+ST.emo);
  $$('.mote').forEach(m=>m.style.display=ST.dust?'':'none');$$('.glow i').forEach(i=>i.style.opacity=ST.motes?'':0);
  lhCache=0;
}
function chipsBind(id,key,after){const bs=$$(id+' button');const sync=()=>bs.forEach(b=>b.classList.toggle('on',b.dataset.v===String(ST[key])));
  bs.forEach(b=>b.onclick=()=>{keepPos(()=>{ST[key]=b.dataset.v;sync();applySettings()});saveST();after&&after(b.dataset.v)});sync()}
function sliderBind(id,key,fmt){const el=$(id),o=el.nextElementSibling;const show=()=>o.textContent=fmt?fmt(ST[key]):ST[key];el.value=ST[key];show();
  el.oninput=()=>{keepPos(()=>{ST[key]=+el.value;show();applySettings()});saveST()}}
function toggleBind(id,key,after){const b=$(id);const sync=()=>b.classList.toggle('on',!!ST[key]);
  b.onclick=()=>{keepPos(()=>{ST[key]=!ST[key];sync();applySettings()});saveST();after&&after(ST[key])};sync()}
function toggleLocal(id,fn){const b=$(id);b.onclick=()=>{b.classList.toggle('on');fn(b.classList.contains('on'))}}
/* keep the reading position stable while a setting changes the layout */
function keepPos(fn){const pos=book&&paras.length?capturePos():null;fn();if(pos){restorePos(pos);updateReading()}}

/* ================= library ================= */
let book=null,st=null,ch=-1,paras=[],paraInfo=[],curHref='';
const hash=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;return h};
function coverHtml(b){
  if(b.hasCover)return `<div class="cov"><img src="/cover/${b.id}" alt=""></div>`;
  const h=hash(b.title)%360;
  return `<div class="cov gen" style="background:linear-gradient(160deg,hsl(${h} 42% 32%),hsl(${(h+35)%360} 48% 13%));color:hsl(${h} 60% 90%)"><em>${esc((b.author||'').split(/[,;&]/)[0].trim().slice(0,22))}</em><b>${esc(b.title.slice(0,60))}</b><em>&nbsp;</em></div>`}
function renderLib(){
  const hr=new Date().getHours();$('#greet').textContent=hr<5?'Late night':hr<12?'Good morning':hr<18?'Good afternoon':'Good evening';
  let list=[];try{list=A?JSON.parse(A.listBooks()):[]}catch(e){}
  $('#libEmpty').classList.toggle('hidden',list.length>0);
  const last=load('last',null);const hero=list.find(b=>b.id===last)||list[0];
  const prog=id=>Math.round((load('b:'+id,{}).max||0)*100);
  $('#libHero').innerHTML=hero?`<div class="hero" data-id="${hero.id}">${coverHtml(hero)}<div class="info"><div class="meta">${prog(hero.id)?'Continue reading · '+prog(hero.id)+'%':'Start reading'}</div><h3>${esc(hero.title)}</h3><div class="au">${esc(hero.author||'')}</div><div class="bar"><i style="width:${prog(hero.id)}%"></i></div><button class="cta">${prog(hero.id)?'Continue':'Open'}</button></div></div>`:'';
  $('#libGridWrap').innerHTML=list.length?`<h4 class="sec">All books · ${list.length}</h4><div class="grid">${list.map(b=>`<div class="bk" data-id="${b.id}">${coverHtml(b)}<button class="del" data-del="${b.id}">⋯</button><div class="t">${esc(b.title)}</div><div class="p">${prog(b.id)}% read</div></div>`).join('')}</div>`:'';
}
$('#lib').addEventListener('click',e=>{
  const del=e.target.closest('[data-del]');
  if(del){if(del.classList.contains('arm')){const id=del.dataset.del;try{A&&A.deleteBook(id)}catch(x){}try{localStorage.removeItem('b:'+id)}catch(x){}renderLib();toast('Removed from your library')}
    else{del.classList.add('arm');del.textContent='Remove?';setTimeout(()=>{if(del.isConnected){del.classList.remove('arm');del.textContent='⋯'}},3000)}return}
  const el=e.target.closest('[data-id]');if(el)openBook(el.dataset.id)});
$('#importBtn').onclick=()=>{if(!A){toast('Import works inside the Android app');return}$('#importBtn').disabled=true;A.importBook()};
window.__imported=r=>{$('#importBtn').disabled=false;if(!r||r.cancelled)return;if(r.error){toast(r.error);return}
  if(!$('#lib').classList.contains('hidden')){renderLib();toast('Added to your library')}};

/* ================= opening a book ================= */
const burl=p=>'/book/'+book.id+'/'+p.split('/').map(encodeURIComponent).join('/');
const STDEF=()=>({ch:-1,pos:null,max:0,unlocked:[],bm:null,reveal:null,newDot:false,wear:.04,ticks:{},reach:{},done:{},firstDone:false});
let saveTimer=0;
function saveSt(){if(book&&st)save('b:'+book.id,st)}
let cssFlags={};
async function loadCssFlags(){cssFlags={};for(const p of book.css||[]){try{const t=await(await fetch(burl(p))).text();
  t.replace(/\.([\w-]+)\s*\{([^}]*)\}/g,(m,cls,b)=>{const f=cssFlags[cls]||(cssFlags[cls]={});
    if(/font-style\s*:\s*(italic|oblique)/i.test(b))f.i=1;if(/font-weight\s*:\s*(bold|[6-9]00)/i.test(b))f.b=1;
    if(/text-align\s*:\s*center/i.test(b))f.c=1;if(/text-align\s*:\s*right/i.test(b))f.r=1;
    const fs=/font-size\s*:\s*([\d.]+)(em|rem|%)/i.exec(b);if(fs){const v=fs[2]==='%'?fs[1]/100:+fs[1];if(v>=1.15)f.big=1}return m})}catch(e){}}}
async function openBook(id){
  let meta;try{meta=JSON.parse(A.getBook(id))}catch(e){toast('Could not open that book');return}
  book=meta;st=Object.assign(STDEF(),load('b:'+id,{}));save('last',id);
  let c=0;book.cum=book.spine.map(s=>{const v=c;c+=s.size;return v});book.totalSize=c||1;
  book.spineIdx={};book.spine.forEach((s,i)=>book.spineIdx[s.href]=i);
  if(st.ch<0){const first=book.toc&&book.toc.length?book.spineIdx[book.toc[0].href]:0;st.ch=first>=0?first:0}
  st.ch=Math.max(0,Math.min(st.ch,book.spine.length-1));
  bodyEl.innerHTML='<div class="loading">Opening…</div>';
  $('#lib').classList.add('hidden');$('#rd').classList.remove('hidden');app.classList.remove('hide');
  $('#miniCover').textContent=book.title;
  await loadCssFlags();
  if(ST.snd!=='off')setScene();
  renderBM();hang();applyWear();updDot();buildToc();
  if(st.reveal)$('#bmHang').style.opacity=0;
  await loadChapter(st.ch,{restore:true});
  revealBM();
}
function closeBook(){if(!book)return;pcStop();savePosNow();closeSheets();cancelQuote();setScene('pause');
  $('#rd').classList.add('hidden');$('#lib').classList.remove('hidden');book=null;st=null;paras=[];bodyEl.innerHTML='';renderLib()}
$('#bBack').onclick=e=>{e.stopPropagation();closeBook()};

/* ================= EPUB content cleanup ================= */
const BLOCK=new Set('P DIV BLOCKQUOTE H1 H2 H3 H4 H5 H6 LI SECTION ARTICLE UL OL TABLE TBODY THEAD TR TD TH HR PRE FIGURE FIGCAPTION CENTER DL DD DT ASIDE HEADER FOOTER NAV MAIN'.split(' '));
const tagOf=n=>(n.localName||'').toUpperCase();
function elFlags(el){const f={};(el.getAttribute('class')||'').split(/\s+/).forEach(c=>{const x=cssFlags[c];if(x)Object.assign(f,x)});
  const s=el.getAttribute('style')||'';if(/italic/i.test(s))f.i=1;if(/font-weight\s*:\s*(bold|[6-9]00)/i.test(s))f.b=1;if(/text-align\s*:\s*center/i.test(s))f.c=1;
  const t=tagOf(el);if(t==='I'||t==='EM'||t==='CITE')f.i=1;if(t==='B'||t==='STRONG')f.b=1;if(t==='CENTER')f.c=1;return f}
function resolveRel(base,rel){if(/^[a-z][a-z0-9+.-]*:/i.test(rel)||rel.startsWith('//'))return null;const parts=base.split('/');parts.pop();
  rel.split('#')[0].split('?')[0].split('/').forEach(p=>{if(p==='..')parts.pop();else if(p&&p!=='.'){let d=p;try{d=decodeURIComponent(p)}catch(e){}parts.push(d)}});return parts.join('/')}
function inl(node,fl,o){for(const n of node.childNodes){
  if(n.nodeType===3){o.segs.push({t:n.nodeValue,i:fl.i,b:fl.b,big:fl.big})}
  else if(n.nodeType===1){const t=tagOf(n);
    if(t==='BR'){o.segs.push({t:'\n',br:1});continue}
    if(t==='IMG'||t==='IMAGE'){const src=n.getAttribute('src')||n.getAttribute('xlink:href')||n.getAttribute('href');if(src)o.imgs.push(src);continue}
    if(t==='SCRIPT'||t==='STYLE'||t==='TITLE')continue;
    const id=n.getAttribute('id')||n.getAttribute('name');if(id)o.ids.push(id);
    const f=elFlags(n);inl(n,{i:fl.i||!!f.i,b:fl.b||!!f.b,big:fl.big||!!f.big},o)}}}
function cleanSegs(segs,keepBr){const out=[];let sp=true;
  for(const s of segs){if(s.br){if(keepBr&&out.length){out.push({br:1,t:'\n'});sp=true}else if(!sp&&out.length){out.push({t:' ',i:false,b:false});sp=true}continue}
    let t=s.t.replace(/\s+/g,' ');if(sp)t=t.replace(/^ /,'');if(!t)continue;sp=t.endsWith(' ');
    const last=out[out.length-1];if(last&&!last.br&&last.i===!!s.i&&last.b===!!s.b)last.t+=t;else out.push({t,i:!!s.i,b:!!s.b,big:!!s.big})}
  while(out.length&&(out[out.length-1].br||!out[out.length-1].t.trim()))out.pop();
  if(out.length&&!out[out.length-1].br)out[out.length-1].t=out[out.length-1].t.replace(/ $/,'');
  return out}
function finishBlock(o,ctx,blocks){
  const plain=o.segs.map(s=>s.br?' ':s.t).join('').replace(/\s+/g,' ').trim();
  o.imgs.forEach(src=>{const r=resolveRel(curHref,src);if(r)blocks.push({t:'img',src:r,ids:o.ids})});
  const last=blocks[blocks.length-1];
  if(!plain){if(!o.imgs.length){if(last&&last.t!=='gap')blocks.push({t:'gap',ids:o.ids});else if(last&&o.ids.length)last.ids=(last.ids||[]).concat(o.ids)}return}
  if(!/[A-Za-z0-9]/.test(plain)&&plain.length<=15){blocks.push({t:'hr',ids:o.ids});return}
  let len=0,bl=0,gl=0;o.segs.forEach(s=>{if(s.br)return;const n=s.t.replace(/\s/g,'').length;len+=n;if(s.b)bl+=n;if(s.big)gl+=n});
  const allBold=bl>=len*.9,allBig=gl>=len*.9,f=ctx.f;
  let type='p';
  if(ctx.head)type='h';
  else if(plain.length<=90&&(allBig||(f.c&&allBold)||(allBold&&plain.length<=60&&!/[.!?,;:”"]$/.test(plain))))type='h';
  else if(ctx.quote)type='q';
  blocks.push({t:type,segs:cleanSegs(o.segs,type!=='p'),plain,c:!!f.c,r:!!f.r,lvl:ctx.head?(ctx.head<=2?2:3):(allBig?2:3),ids:o.ids})}
function walk(el,ctx,blocks){let run=null;
  const flush=()=>{if(!run)return;const r=run;run=null;if(r.childNodes.every(n=>n.nodeType===3&&!n.nodeValue.trim()))return;
    const o={segs:[],imgs:[],ids:[]};inl(r,{i:!!ctx.f.i,b:!!ctx.f.b,big:!!ctx.f.big},o);finishBlock(o,ctx,blocks)};
  for(const n of[...el.childNodes]){
    if(n.nodeType===1&&BLOCK.has(tagOf(n))){flush();const t=tagOf(n);
      if(t==='HR'){blocks.push({t:'hr'});continue}
      const f=Object.assign({},ctx.f,elFlags(n));
      const c2={quote:ctx.quote||t==='BLOCKQUOTE',head:/^H[1-6]$/.test(t)?+t[1]:ctx.head,f};
      if([...n.children].some(c=>BLOCK.has(tagOf(c))))walk(n,c2,blocks);
      else{const o={segs:[],imgs:[],ids:[]};const id=n.getAttribute('id');if(id)o.ids.push(id);inl(n,{i:!!f.i,b:!!f.b,big:!!f.big},o);finishBlock(o,c2,blocks)}}
    else if(n.nodeType===1||n.nodeType===3){(run||(run={childNodes:[]})).childNodes.push(n)}}
  flush()}
const entCache={};
function parseChapter(src){
  // XHTML first (handles self-closing tags correctly), HTML as the forgiving fallback
  const fixed=src.replace(/<!DOCTYPE[^>]*>/i,'').replace(/&([a-zA-Z][a-zA-Z0-9]*);/g,(m,n)=>{
    if(/^(amp|lt|gt|quot|apos)$/.test(n))return m;if(!(n in entCache)){const d=document.createElement('textarea');d.innerHTML=m;entCache[n]=d.value===m?'':[...d.value].map(c=>'&#'+c.codePointAt(0)+';').join('')}return entCache[n]});
  let doc=new DOMParser().parseFromString(fixed,'application/xhtml+xml');
  if(doc.getElementsByTagName('parsererror').length)doc=new DOMParser().parseFromString(src,'text/html');
  const body=doc.querySelector('body')||doc.documentElement;const blocks=[];
  walk(body,{quote:false,head:0,f:{}},blocks);
  while(blocks.length&&blocks[0].t==='gap')blocks.shift();while(blocks.length&&blocks[blocks.length-1].t==='gap')blocks.pop();
  return blocks}
/* small black-on-white ornaments: redraw once as cream ink on transparent, so no blend effect is needed while scrolling */
window.imgCls=img=>{if(img.dataset.done)return;if(!(img.naturalHeight<=90||img.naturalWidth*img.naturalHeight<36000))return;img.dataset.done=1;img.classList.add('glyph');
  try{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d');x.drawImage(img,0,0);const d=x.getImageData(0,0,c.width,c.height),a=d.data;
    for(let i=0;i<a.length;i+=4){const l=(a[i]*.3+a[i+1]*.59+a[i+2]*.11);a[i]=230;a[i+1]=211;a[i+2]=177;a[i+3]=Math.round((255-l)*(a[i+3]/255))}
    x.putImageData(d,0,0);img.src=c.toDataURL('image/png')}catch(e){}};

/* ================= ink: dialogue, loud words, emotion words ================= */
/* word families: every form of a word shares one animation */
const LEX={
 cry:'cry|cries|crying|tears?|teary|tearful(?:ly)?|teardrops?|wept|weep(?:s|ing)?|sob(?:s|bed|bing)?|wail(?:s|ed|ing)?|bawl(?:s|ed|ing)?|whimper(?:s|ed|ing)?|sniffl(?:e|es|ed|ing)|blubber(?:ed|ing)?|lament(?:s|ed|ing)?|mourn(?:s|ed|ing|ful|fully)?',
 sorrow:'sorrow(?:s|ful|fully)?|grief|griev(?:e|ed|es|ing)|sad(?:ly|ness|der|dened)?|misery|miserabl[ey]|despair(?:s|ed|ing)?|desolat(?:e|ion)|anguish(?:ed)?|woe(?:s|ful)?|melanchol(?:y|ic)|forlorn|heartbr(?:oken|eak|eaking)|heartache|bereft|gloomy|glum|dejected|despondent|hopeless(?:ly|ness)?|lonely|loneliness|lonesome|regret(?:s|ted|ting|ful)?|remorse(?:ful)?|wistful(?:ly)?|unhappy|depress(?:ed|ing|ion)|crestfallen|downcast|pitiful',
 anger:'anger(?:ed|s)?|angry|angrily|angrier|fury|furious(?:ly)?|rage[sd]?|raging|wrath(?:ful)?|outrag(?:e|ed|es|eous)|hate[sd]?|hatred|hateful|loath(?:e|ed|ing)|scowl(?:s|ed|ing)?|glar(?:e|es|ed|ing)|glower(?:ed|ing)?|snarl(?:s|ed|ing)?|growl(?:s|ed|ing)?|seeth(?:e|ed|ing)|livid|enraged?|infuriat(?:ed|ing)|irate|incensed|indignant(?:ly)?|indignation|contempt(?:uous)?|scorn(?:ed|ful)?|bristl(?:ed|ing)|fum(?:ed|ing)|resent(?:s|ed|ful|ment)?|bitter(?:ly|ness)?|irritat(?:ed|ing|ion)|annoy(?:ed|ing|ance)|exasperat(?:ed|ion)|frustrat(?:ed|ing|ion)|tantrum|vengeance|vengeful|spite(?:ful)?|hostil(?:e|ity)',
 fear:'fear(?:s|ed|ful|fully|ing)?|afraid|terrors?|terrif(?:ied|ying)|dread(?:s|ed|ful|ing)?|horrors?|horrif(?:ied|ying|ic)|horrible|panic(?:s|ked|king|ky)?|fright(?:ened|ening|ful)?|scar(?:ed|y)|alarm(?:ed|ing)?|anxious(?:ly)?|anxiety|nervous(?:ly|ness)?|uneas[ey]|uneasily|foreboding|cower(?:s|ed|ing)?|flinch(?:ed|ing)?|cring(?:e|ed|ing)|overwhelm(?:ed|ing)|petrified|spooked|menac(?:e|ing)|ominous(?:ly)?|eerie|creepy|sinister|nightmar(?:e|es|ish)|haunt(?:s|ed|ing)?|worr(?:y|ied|ies|ying)|timid(?:ly)?|coward(?:ly|ice)?',
 shake:'trembl(?:e|es|ed|ing)|shiver(?:s|ed|ing)?|shudder(?:s|ed|ing)?|quiver(?:s|ed|ing)?|quak(?:e|ed|ing)|shak(?:e|es|en|ing|y|ily)|shook|twitch(?:ed|ing)?|convuls(?:ed|ing|ion)|jitter(?:s|y)|tremors?|wobbl(?:e|ed|ing)|quaver(?:ed|ing)?',
 blood:'blood(?:y|ied|less|shed|stain|stained)?|bleed(?:s|ing)?|bled|gore|gory|wound(?:s|ed)?|gash(?:es|ed)?|crimson|scarlet|slaughter(?:ed)?|butcher(?:ed)?|carnage|stab(?:s|bed|bing)?|slash(?:es|ed|ing)?',
 pain:'pain(?:s|ful|fully)?|agon(?:y|ies|ized|izing)|ache[sd]?|aching|hurt(?:s|ing)?|torment(?:s|ed|ing)?|suffer(?:s|ed|ing)?|tortur(?:e|ed|ing)|writh(?:e|ed|ing)|winc(?:e|ed|ing)|groan(?:s|ed|ing)?|moan(?:s|ed|ing)?|unbearable|sore|sting(?:s|ing)?|stung|cramp(?:s|ed)?|bruise[sd]?|excruciating|pangs?',
 death:'death(?:s|ly)?|dead(?:ly)?|die[sd]?|dying|kill(?:s|ed|ing|er)?|murder(?:s|ed|er|ous)?|slain|slay(?:s|ing)?|corpses?|perish(?:ed)?|doom(?:ed)?|lifeless|funeral|graves?|tombs?|coffins?|skulls?|ghost(?:s|ly)?|deceased|fatal(?:ly)?|execut(?:e|ed|ion)|massacre[sd]?',
 dark:'dark(?:ness|er|ened|ly)?|shadow(?:s|y|ed)?|gloom|blackness|murk(?:y)?|dusk|ash(?:es|en)|vanish(?:ed|ing)?|disappear(?:s|ed|ing)?|night(?:s|fall|time)?|midnight|dim(?:ly|med)?|obscur(?:e|ed)|void|abyss|eclipse[sd]?|unlit|sunless',
 fire:'fire[sd]?|fiery|flame[sd]?|flaming|burn(?:s|ed|t|ing)?|blaz(?:e|ed|ing)|embers?|scorch(?:ed|ing)?|smoke|smoking|inferno|sear(?:ed|ing)|torch(?:es|ed)?|flicker(?:s|ed|ing)?|crackl(?:e|ed|ing)|hot(?:ter)?|heat(?:ed)?|ablaze|ignit(?:e|ed|ing)|kindl(?:e|ed|ing)|bonfires?|furnace|lava|molten|sizzl(?:e|ed|ing)|smou?lder(?:ed|ing)?|charred|cinders?|incinerat(?:e|ed)|wildfire|fireplace|candle(?:s|light)?',
 cold:'cold(?:er|ly|ness)?|frost(?:y|ed)?|froze(?:n)?|freez(?:e|ing)|icy|icily|icicles?|ice|chill(?:s|ed|ing|y)?|snow(?:s|y|ed|fall|flakes?)?|winter(?:s|y)?|wintry|numb(?:ed|ly|ness)?|frigid|glacial|blizzards?|sleet|frostbit(?:e|ten)|arctic',
 joy:'laugh(?:s|ed|ing|ter)?|chuckl(?:e|ed|ing)|giggl(?:e|ed|ing)|delight(?:ed|ful)?|joy(?:s|ful|ous|ously)?|cheer(?:s|ed|ful|fully|ing)?|glee(?:ful)?|mirth|happy|happi(?:ly|ness)|merry|merrily|elat(?:ed|ion)|ecsta(?:sy|tic)|jubilant|thrill(?:ed|ing)?|excit(?:ed|ing|ement)|overjoyed|glad(?:ly|ness)?|celebrat(?:e|ed|ing|ion)|rejoic(?:e|ed|ing)|bliss(?:ful)?|euphori[ac]|giddy|playful(?:ly)?',
 smile:'smil(?:e|es|ed|ing)|grin(?:s|ned|ning)?|beam(?:ed|ing)|smirk(?:s|ed|ing)?',
 love:'love[sd]?|loving|lovers?|beloved|kiss(?:es|ed|ing)?|tender(?:ly|ness)?|ador(?:e|ed|ing)|cherish(?:ed)?|embrac(?:e|ed|ing)|caress(?:ed|ing)?|desir(?:e|ed|es)|longing|yearn(?:ed|ing)?|passion(?:s|ate)?|affection(?:ate)?|warm(?:th|ly)?|romanc(?:e|tic)|darling|sweetheart|fond(?:ly|ness)?|devot(?:ed|ion)|hug(?:s|ged|ging)?|cuddl(?:e|ed|ing)|infatuat(?:ed|ion)|swoon(?:ed|ing)?|blush(?:es|ed|ing)?|compassion(?:ate)?',
 wary:'suspici(?:on|ons|ous|ously)|suspect(?:s|ed|ing)?|wary|warily|doubt(?:s|ed|ful|ing)?|distrust(?:ed)?|mistrust(?:ed)?|skeptic(?:al|ism)?|narrowed|guarded|sly(?:ly)?|cunning|scheming|conspir(?:e|ed|acy|ing)|deceit(?:ful)?|deceiv(?:e|ed|ing)|treacher(?:y|ous)|betray(?:s|ed|al|ing)?|liars?|lying|secretive(?:ly)?|furtive(?:ly)?|shifty|lurk(?:s|ed|ing)?|sneak(?:s|ed|ing|y)?|spied|spying|plott(?:ed|ing)|cautious(?:ly)?|hesitat(?:e|ed|ing|ion)|dubious',
 hush:'whisper(?:s|ed|ing)?|murmur(?:s|ed|ing)?|mutter(?:s|ed|ing)?|mumbl(?:e|ed|ing)|hush(?:ed)?|silen(?:ce|t|tly|ced)|quiet(?:ly|ed)?|stillness|breathless|noiseless(?:ly)?|soundless(?:ly)?|muted|tiptoe(?:d|ing)?|serene|tranquil',
 storm:'storm(?:s|y|ed|ing)?|tempest(?:s|uous)?|hurricanes?|downpours?|deluge|cloudburst',
 lightning:'lightning|thunderbolts?',
 thunder:'thunder(?:s|ed|ing|ous|claps?)?|rumbl(?:e|es|ed|ing)',
 loud:'scream(?:s|ed|ing)?|shout(?:s|ed|ing)?|shriek(?:s|ed|ing)?|yell(?:s|ed|ing)?|roar(?:s|ed|ing)?|bellow(?:s|ed|ing)?|howl(?:s|ed|ing)?|boom(?:s|ed|ing)?|cried|clamou?r|deafening|explo(?:de|ded|sion|sive)|blar(?:e|ed|ing)|clang(?:ed|ing)?|screech(?:ed|ing)?|holler(?:ed|ing)?|exclaim(?:ed|ing)?',
 magic:'sorcer(?:y|er|ers|ous|ies|ess)|magic(?:al|s)?|spells?|enchant(?:ed|ment|ing)?|cants?|witch(?:es|craft)?|wizards?|arcane|gnosis|gnostic|glimmer(?:s|ed|ing)?|shimmer(?:s|ed|ing)?|conjur(?:e|ed|ing)|incantations?|wards?|mystic(?:al)?|potions?|curse[sd]?|hex(?:ed)?|runes?|rituals?|summon(?:s|ed|ing)?|bewitch(?:ed|ing)?|supernatural|phantoms?|mages?|wands?|prophe(?:cy|cies|tic)|omens?|dragons?|fairy|fairies',
 light:'shin(?:e|es|ed|ing)|shone|glow(?:s|ed|ing)?|gleam(?:s|ed|ing)?|glitter(?:s|ed|ing)?|radian(?:t|ce)|bright(?:er|ly|ness)?|golden|gold|sun(?:light|lit|rise|set|shine|beams?)?|dawn|dazzl(?:e|ed|ing)|spark(?:s|ed|le|led|ling)?|flash(?:es|ed|ing)?|brilliant|illuminat(?:e|ed|ing)|luminous|glint(?:s|ed|ing)?|glisten(?:s|ed|ing)?|twinkl(?:e|ed|ing)|lanterns?|lamp(?:s|light)?|daylight|moon(?:light|lit)?|stars?|starlight|starlit|starry|lightning',
 steel:'swords?|blades?|knife|knives|daggers?|steel|spears?|axes?|arrows?|shields?|armou?r(?:ed)?|sab(?:re|er)s?|lances?|guns?|gunshots?|gunfire|rifles?|pistols?|bullets?|cannons?|helmets?',
 water:'rain(?:s|ed|ing|y|drops?)?|rivers?|oceans?|seas?|waves?|flood(?:s|ed|ing)?|drown(?:s|ed|ing)?|streams?|drip(?:s|ped|ping)?|pour(?:s|ed|ing)?|waters?|watery|lakes?|ponds?|puddles?|tides?|splash(?:es|ed|ing)?|soak(?:ed|ing)?|drench(?:ed|ing)?|damp|mist(?:s|y)?|fog(?:gy)?|dew|waterfalls?|drizzl(?:e|ed|ing)|downpour',
 heart:'hearts?|heartbeats?|pulse[sd]?|pulsing|throb(?:s|bed|bing)?|pounding|pounded|hammer(?:ed|ing)|palpitat(?:e|ing|ions?)|thump(?:s|ed|ing)?|thud(?:s|ded|ding)?',
 fall:'fell|fall(?:s|en|ing)?|collaps(?:e|ed|ing)|stumbl(?:e|ed|ing)|tumbl(?:e|ed|ing)|plummet(?:ed|ing)?|dropped|dropping|sank|sink(?:s|ing)?|crumpl(?:ed|ing)|toppl(?:e|ed|ing)|tripped|slipped|plung(?:e|ed|ing)|sprawl(?:ed|ing)|slump(?:ed|ing)?|faint(?:ed|ing)',
 rush:'ran|run(?:s|ning)?|rush(?:es|ed|ing)?|sprint(?:ed|ing)?|fled|flee(?:s|ing)?|bolt(?:ed|ing)|dash(?:ed|ing)|charg(?:e|ed|ing)|hurr(?:y|ied|ying)|rac(?:ed|ing)|leap(?:s|t|ed|ing)?|lung(?:e|ed|ing)|hast(?:e|ily|ened)|scurr(?:y|ied|ying)|scrambl(?:e|ed|ing)|gallop(?:ed|ing)?|chas(?:e|ed|ing)|pursu(?:e|ed|ing|it)|escap(?:e|ed|ing)|dart(?:ed|ing)|swift(?:ly)?|hurtl(?:e|ed|ing)',
 surprise:'gasp(?:s|ed|ing)?|sudden(?:ly)?|startl(?:e|ed|ing)|shock(?:s|ed|ing)?|astonish(?:ed|ing|ment)?|amaz(?:e|ed|ing|ement)|stunn(?:ed|ing)|abrupt(?:ly)?|unexpected(?:ly)?|jolt(?:ed|ing)?|widen(?:ed|ing)|disbelief|surpris(?:e|ed|ing)|speechless|bewilder(?:ed|ing|ment)?|baffl(?:ed|ing)|dumbfounded|aghast|stagger(?:ed|ing)|incredul(?:ous|ity)|confus(?:ed|ing|ion)|puzzl(?:ed|ing)|perplex(?:ed|ing)',
 wonder:'wonder(?:s|ed|ing|ful|ment)?|awe(?:d|some)?|marvel(?:s|ed|led|ous|lous)?|miracl(?:e|es|ulous)|glor(?:y|ies|ious)|majest(?:y|ic)|beaut(?:y|iful|ifully)|sacred|divine|ancient|magnificent|splendid|splendou?r|breathtaking|spectacular|sublime|gorgeous|exquisite|heaven(?:s|ly)?|paradise|angel(?:s|ic)?',
 memory:'remember(?:s|ed|ing)?|memor(?:y|ies)|recall(?:s|ed|ing)?|recollect(?:ed|ion)?|nostalgi[ac]|forgot(?:ten)?|forget(?:s|ting)?|dream(?:s|ed|t|ing)?|remind(?:s|ed|ing)?|reminisc(?:e|ed|ing|ent)|childhood',
 sleep:'sleep(?:s|ing|y|less)?|slept|asleep|drows(?:y|ily)|slumber(?:s|ed|ing)?|weary|wearily|weariness|exhaust(?:ed|ion)|yawn(?:s|ed|ing)?|sigh(?:s|ed|ing)?|tired|napp(?:ed|ing)|doz(?:e|ed|ing)|snor(?:e|ed|ing)|fatigued?|lullab(?:y|ies)',
 wind:'wind(?:s|y)?|breez(?:e|es|y)|gust(?:s|ed|ing)?|gales?|blew|flutter(?:s|ed|ing)?|sway(?:s|ed|ing)?|drift(?:s|ed|ing)?|whirlwind|tornado|billow(?:ed|ing)?|rustl(?:e|ed|ing)|whistl(?:e|ed|ing)|soar(?:ed|ing)?',
 disgust:'disgust(?:ed|ing)?|revolt(?:ed|ing)|revulsion|repuls(?:ed|ive)|nause(?:a|ous|ated)|sicken(?:ed|ing)?|vile|foul|putrid|rancid|stench|stink(?:s|ing)?|stank|reek(?:s|ed|ing)?|rott(?:ed|ing|en)|rot|filth(?:y)?|grim[ey]|slim[ey]|vomit(?:ed|ing)?|retch(?:ed|ing)|loathsome|grotesque|hideous|poison(?:s|ed|ous)?|venom(?:ous)?|decay(?:ed|ing)?'};
const LEXCAT=Object.keys(LEX).map(k=>[k,new RegExp('^(?:'+LEX[k]+')$','i')]);
const LEXRE=new RegExp('\\b(?:'+Object.values(LEX).join('|')+')\\b','gi');
const catCache={};
function catOf(w){const k=w.toLowerCase();if(!(k in catCache)){const h=LEXCAT.find(e=>e[1].test(k));catCache[k]=h?h[0]:null}return catCache[k]}
const NEG=/(\bnot|\bnever|\bno|n['’]t)\s+(?:\w+\s+)?$/i;
const SUDDEN=/\b(bang|crash(?:ed)?|shatter(?:ed)?|slammed|exploded)\b/gi;
const CAP=14;           // most animated words in one paragraph
let lastEmo={},lastAny=-99;
/* how a line is spoken, read from the words around the quote ("...," she said angrily) */
const TAG={
 angry:/\b(angrily|furiously|snapped|snarled|growled|spat|barked|roared|bellowed|thundered|raged|fumed|seethed|scowl\w*|glar(?:ed|ing)|hotly|icily|coldly|bitterly|with (?:fury|rage|anger|venom|contempt|scorn|hatred)|in (?:a )?(?:fury|rage|anger)|outrage\w*|furious|angry|enraged|livid)\b/i,
 shout:/\b(shout\w*|scream\w*|yell\w*|shriek\w*|cried|howled|called out|bellowed|roared|thundered)\b/i,
 whisper:/\b(whisper\w*|murmur\w*|mutter\w*|mumbl\w*|breathed|softly|quietly|under (?:his|her|their) breath|hissed|hushed|barely audible)\b/i,
 cry:/\b(sobb\w*|wept|weeping|sniffl\w*|chok(?:ed|ing)|tearfully|through (?:his |her |their )?tears|voice (?:broke|cracked|breaking)|wailed|whimper\w*)\b/i,
 fear:/\b(stammer\w*|stutter\w*|quaver\w*|trembl\w*|shakily|nervously|fearfully|gasped|in (?:terror|horror|fear))\b/i,
 joy:/\b(laugh\w*|chuckl\w*|giggl\w*|grinn\w*|cheerfully|happily|beamed|merrily|gushed|cheered|with a (?:grin|smile|laugh))\b/i,
 sad:/\b(sigh\w*|sadly|mournfully|wearily|sorrowfully|numbly|bleakly)\b/i};
function annotate(T,idx){
  const dlg=[],words=[],ems=[];let shout=false,sudden=false,m;
  const re=/“([^”]*)(?:”|$)|"([^"]{2,})"/g;
  while((m=re.exec(T))){const inner=m[1]!==undefined?m[1]:m[2];if(!inner||!inner.trim()){if(!m[0])re.lastIndex++;continue}dlg.push({a:m.index,b:m.index+m[0].length,inner})}
  dlg.forEach((d,i)=>{const prev=i>0?dlg[i-1].b:0,next=i<dlg.length-1?dlg[i+1].a:T.length;
    const ctx=T.slice(Math.max(prev,d.a-70),d.a)+' | '+T.slice(d.b,Math.min(next,d.b+90));
    const bangs=(d.inner.match(/!/g)||[]).length,caps=/\b[A-Z]{3,}\b/.test(d.inner);
    const ang=TAG.angry.test(ctx),sh=bangs>0||caps||TAG.shout.test(ctx);
    d.cls='dlg';d.stl='';
    if(sh){shout=true;d.cls='ink-shout dlg';if(ang){d.cls='ink-shout dlg-angry dlg';d.stl=` style="--lv:${Math.min(3,1+bangs+(caps?1:0))}"`}}
    else if(ang){d.cls='dlg-angry dlg';d.stl=' style="--lv:1"'}
    else if(TAG.whisper.test(ctx))d.cls='ink-whisper dlg';
    else if(TAG.cry.test(ctx))d.cls='dlg-cry dlg';
    else if(TAG.fear.test(ctx))d.cls='dlg-fear dlg';
    else if(TAG.joy.test(ctx))d.cls='dlg-joy dlg';
    else if(TAG.sad.test(ctx))d.cls='dlg-sad dlg'});
  const hit=(a,b)=>words.some(x=>a<x.b&&b>x.a);
  SUDDEN.lastIndex=0;if((m=SUDDEN.exec(T))){sudden=true;words.push({a:m.index,b:m.index+m[0].length,cls:'ink-sudden',tail:''})}
  LEXRE.lastIndex=0;let n=0;
  while((m=LEXRE.exec(T))){const w=m[0],off=m.index;if(NEG.test(T.slice(Math.max(0,off-16),off)))continue;
    const k=catOf(w);if(!k)continue;ems.push(k);if(n>=CAP||hit(off,off+w.length))continue;n++;
    words.push({a:off,b:off+w.length,cls:'fx emo emo-'+k,tail:k==='cry'?'<i class="drop d1"></i><i class="drop d2"></i><i class="drop d3"></i><i class="drop d4"></i>':''})}
  // punctuation gets its own small animation
  const mr=/[!?]+|—(?=[”"’]|\s*$)|…|\.\.\./g;
  while((m=mr.exec(T))){const t=m[0],a=m.index,b=a+t.length;if(hit(a,b))continue;
    words.push({a,b,cls:'fx pm '+(t[0]==='—'?'pm-cut':(t==='…'||t==='...')?'pm-el':t.includes('!')?'pm-ex':'pm-q'),tail:''})}
  // whole sentences that end in ? or ! (used for the expressive fonts); kept inside or outside a quote, never across
  const sent=[];const sr=/[!?]+/g;
  while((m=sr.exec(T))){let a=m.index,b=m.index+m[0].length;while(a>0&&!/[.!?…]/.test(T[a-1]))a--;
    const d=dlg.find(x=>m.index>=x.a&&m.index<x.b);
    if(d){a=Math.max(a,d.a);b=Math.min(b,d.b)}else{const pv=dlg.filter(x=>x.b<=m.index).pop();if(pv)a=Math.max(a,pv.b)}
    while(a<m.index&&/[\s”’"')]/.test(T[a])&&!(d&&a===d.a))a++;
    if(b-a>1&&!sent.some(x=>a<x.b&&b>x.a))sent.push({a,b,cls:'sn '+(m[0].includes('!')?'sn-ex':'sn-q')})}
  return{dlg,sent,words,ems,shout,sudden}}
function buildPara(p,segs,idx){
  const T=segs.map(s=>s.t).join('');const ann=annotate(T,idx);
  const cuts=new Set([0,T.length]);let pos=0;
  const sr=segs.map(s=>{const r={a:pos,b:pos+s.t.length,i:s.i,bold:s.b};pos=r.b;cuts.add(r.a);return r});
  const L=[ann.dlg,ann.sent,ann.words];L.forEach(l=>l.forEach(r=>{cuts.add(r.a);cuts.add(r.b)}));
  const cs=[...cuts].sort((x,y)=>x-y);let html='';const cur=[null,null,null];
  for(let k=0;k<cs.length-1;k++){const a=cs[k],b=cs[k+1];if(a>=b)continue;
    const sg=sr.find(r=>a>=r.a&&a<r.b),now=L.map(l=>l.find(r=>a>=r.a&&a<r.b)||null);
    let d=0;while(d<3&&now[d]===cur[d])d++;
    for(let j=2;j>=d;j--)if(cur[j]){html+=(cur[j].tail||'')+'</span>';cur[j]=null}
    for(let j=d;j<3;j++)if(now[j]){html+=`<span class="${now[j].cls}"${now[j].stl||''}>`;cur[j]=now[j]}
    let t=esc(T.slice(a,b));if(sg&&sg.bold)t='<b>'+t+'</b>';if(sg&&sg.i)t='<i>'+t+'</i>';html+=t}
  for(let j=2;j>=0;j--)if(cur[j])html+=(cur[j].tail||'')+'</span>';
  p.innerHTML=html;return{ems:ann.ems,shout:ann.shout,sudden:ann.sudden}}
const segHtml=segs=>segs.map(s=>s.br?'<br>':(s.i?'<i>'+esc(s.t)+'</i>':esc(s.t))).join('');

/* ================= chapter loading ================= */
let io=null,ready=false,loadSeq=0;
function tocTitle(idx){const href=book.spine[idx].href;const t=(book.toc||[]).find(x=>x.href===href);return t?t.title:''}
function nearTitle(idx){for(let i=idx;i>=0;i--){const t=tocTitle(i);if(t)return t}return''}
async function loadChapter(idx,opts={}){
  const seq=++loadSeq;ready=false;ch=idx;st.ch=idx;curHref=book.spine[idx].href;
  let src='';try{const r=await fetch(burl(curHref));if(!r.ok)throw 0;src=await r.text()}catch(e){toast('Could not open this section')}
  if(seq!==loadSeq)return;
  let blocks=[];try{blocks=parseChapter(src)}catch(e){console.error('parse',e)}
  let html='',prev='',pi=0,afterHead=true;const pdata=[];
  blocks.forEach(b=>{const ids=b.ids&&b.ids.length?` data-ids="${esc(b.ids.join(' '))}"`:'';
    if(b.t==='p'){const first=prev!=='p';const dcap=afterHead&&b.plain.length>140&&/^[A-Za-z]/.test(b.plain);afterHead=false;
      html+=`<p class="para${first?' first':''}${dcap?' dcap':''}${b.c?' ctr':''}${b.r?' rt':''}" data-i="${pi}"${ids}></p>`;pdata.push(b);pi++}
    else if(b.t==='h'){const lbl=b.plain.length<30&&/^(chapter|part|book|prologue|epilogue|appendix|interlude)\b/i.test(b.plain);
      html+=`<h${b.lvl} class="hd${lbl?' lbl':''}"${ids}>${segHtml(b.segs)}</h${b.lvl}>`;afterHead=true}
    else if(b.t==='q')html+=`<blockquote class="bq${b.r?' r':''}"${ids}>${segHtml(b.segs)}</blockquote>`;
    else if(b.t==='img')html+=`<figure class="im"${ids}><img src="${esc(burl(b.src))}" alt="" onload="imgCls(this)"></figure>`;
    else if(b.t==='hr')html+=`<div class="scene"${ids}>· · ·</div>`;
    else if(b.t==='gap')html+=`<div class="gap"${ids}></div>`;
    prev=b.t});
  const last=idx>=book.spine.length-1;
  html+=`<div class="chend">${last?'The end':'· · ·'}</div><div class="chnav">${idx>0?'<button id="prevCh"><small>Previous</small>'+esc(nearTitle(idx-1)||'Back')+'</button>':''}${last?'':'<button class="next" id="nextCh"><small>Next</small>'+esc(tocTitle(idx+1)||'Continue')+'</button>'}</div>`;
  if(io)io.disconnect();
  bodyEl.innerHTML=html;lastEmo={};lastAny=-99;paraInfo=[];
  paras=$$('#body p.para');paras.forEach((p,i)=>{paraInfo.push(buildPara(p,pdata[i].segs,i))});
  addTicks();(st.ticks[ch]||[]).forEach(i=>paras[i]&&paras[i].classList.add('ticked'));
  const pc=$('#prevCh'),nc=$('#nextCh');if(pc)pc.onclick=e=>{e.stopPropagation();loadChapter(idx-1)};if(nc)nc.onclick=e=>{e.stopPropagation();loadChapter(idx+1)};
  $('#topTitle').textContent=nearTitle(idx)||book.title;
  apIdx=0;curR=-1;lhCache=0;sc.scrollTop=0;
  try{await document.fonts.ready}catch(e){}
  if(seq!==loadSeq)return;
  if(opts.restore&&st.pos&&st.pos.ch===idx)restorePos(st.pos);
  else if(opts.frag)scrollToFrag(opts.frag);
  observeInk();
  // anything already above the reading point counts as seen: show it without replaying effects
  const lim=ST.pacer?-1e9:sc.getBoundingClientRect().top+sc.clientHeight*.78;
  $$('#body '+EFX.split(',').join(',#body ')).forEach(el=>{if(el.getBoundingClientRect().bottom<lim)el.classList.add(el.classList.contains('fx')?'play':'ink-in')});
  if(ST.pacer)pcInit();
  lastY=sc.scrollTop;updateReading();onScrollUi();markToc();saveSt();
  setTimeout(()=>{if(seq===loadSeq)ready=true},700);
}
function scrollToFrag(frag){const el=$$('#body [data-ids]').find(e=>e.dataset.ids.split(' ').includes(frag));
  if(el)sc.scrollTop+=el.getBoundingClientRect().top-readTop()-8}
function observeInk(){
  if(ST.pacer){io=null;return}
  io=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting)fire(e.target)})},{root:sc,rootMargin:'0px 0px -22% 0px',threshold:.35});
  $$('#body '+EFX.split(',').join(',#body ')).forEach(el=>io.observe(el))}
function fire(t){{{
    if(t.classList.contains('fx')){if(!t.classList.contains('play')){t.classList.add('play');emoFx(t)}return}
    if(t.classList.contains('ink-in'))return;
    t.classList.add('ink-in');if(!ready||!ST.ink)return;
    if(t.classList.contains('ink-shout')){haptic(35);const p=t.closest('p');p.classList.remove('shake');void p.offsetWidth;p.classList.add('shake')}
    if(t.classList.contains('ink-sudden')){const f=$('#flash');f.classList.remove('go');void f.offsetWidth;f.classList.add('go');haptic([25,50,25])}
    if(t.classList.contains('dlg-angry')&&!t.classList.contains('ink-shout')){const h=$('#heat');h.classList.remove('go');void h.offsetWidth;h.classList.add('go');hapOnce(28)}
    if(t.classList.contains('ink-whisper'))haptic(8)}}}
/* element effects: small shapes spawned on a word when it plays. [class, count, lifetime ms (0 = stays as a mark on the page)] */
const FXDEF={
 fire:[],cold:[],
 blood:[],anger:[['crack',3,0],['steam',4,1700]],fear:[['shard',4,1700]],dark:[],
 death:[],magic:[],light:[],water:[],wind:[],
 love:[['heart',4,2200]],joy:[['conf',8,1500]],smile:[['arc',1,0]],sorrow:[['rain',5,1600],['drop1',1,0]],heart:[],
 steel:[],loud:[['wave',3,1300]],hush:[['mist',3,2900]],wary:[['lidt',1,1700],['lidb',1,1700]],
 fall:[['dust',4,1500]],rush:[['speed',4,900]],surprise:[['burst',8,900]],wonder:[],memory:[['sepia',1,0],['speck',3,2600]],
 sleep:[['bubble',3,2900]],pain:[['bolt',1,1100]],disgust:[['ooze',3,0],['pop',3,1800]]};
const rnd=(a,b)=>a+Math.random()*(b-a);
function spawnFx(el){if(ST.emo!=='expressive')return;const k=[...el.classList].find(c=>c.startsWith('emo-'));const def=k&&FXDEF[k.slice(4)];if(!def)return;const sc=1;
  def.forEach(([cls,n,life])=>{const cnt=life?Math.max(1,Math.round(n*sc)):n;
    for(let i=0;i<cnt;i++){const p=document.createElement('i');p.className='px px-'+cls;const dl=Math.round(i*(life?life*.08:110)+rnd(0,110));
      p.style.cssText=`--i:${i};--f:${i%2?-1:1};--x:${cls==='flame'?((i+.5)/cnt*100).toFixed(1):rnd(4,96).toFixed(1)}%;--r:${rnd(-1,1).toFixed(2)};--s:${rnd(.75,1.25).toFixed(2)};--dl:${dl}ms;--a:${Math.round(360/cnt*i+rnd(-14,14))}deg`;
      el.appendChild(p);if(life)setTimeout(()=>p.remove(),life+dl+300);else p.addEventListener('animationend',()=>{p.style.willChange='auto'},{once:true})}})}
/* cold: ice-fern SVGs (made once), then per word: Subtle = breath of mist + flakes; Expressive = ferns, icicles, glints, and the chill spreads into nearby letters */
const FERNS=(()=>{function dd(x,y,a,L,l){const ex=x+Math.cos(a)*L,ey=y+Math.sin(a)*L;let d=`M${x.toFixed(1)} ${y.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}`;
  if(l<1)for(let i=1;i<=3;i++){const t=i/4.2,px=x+Math.cos(a)*L*t,py=y+Math.sin(a)*L*t;for(const s of[-1,1])d+=dd(px,py,a+s*1.05,L*.36*(1-t*.55),l+1)}return d}
  const mk=(n,dir,sp)=>{let d='';for(let j=0;j<n;j++)d+=dd(0,0,dir+(n>1?(j/(n-1)-.5)*sp:0)+rnd(-.12,.12),rnd(34,48)*(j%2?.7:1),0);
    return 'url("data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" fill="none" stroke="#e6f5ff" stroke-width="1.8" stroke-linecap="round"><path d="${d}"/></svg>`)+'")'};
  return{tl:[mk(4,-2.36,1.6),mk(4,-2.36,1.6)],br:[mk(4,.79,1.6),mk(4,.79,1.6)],l:mk(3,2.4,1.2),r:mk(3,.7,1.2)}})();
function pxAdd(par,cls,css,life){const i=document.createElement('i');i.className='px px-'+cls;i.style.cssText=css;par.appendChild(i);
  if(life)setTimeout(()=>i.remove(),life+(+(/--dl:(\d+)/.exec(css)||[0,0])[1])+300);else i.addEventListener('animationend',()=>{i.style.willChange='auto'},{once:true});return i}
function coldFx(el){const p=el.closest('.para');if(!p)return;const pick=a=>a[Math.random()*a.length|0];
  if(ST.emo!=='expressive'){pxAdd(el,'cmist',`--ww:${el.offsetWidth}px;--dl:0ms`,2400);
    for(let j=0;j<5;j++)pxAdd(el,'cflake',`--x:${rnd(0,95).toFixed(1)}%;--dx:${rnd(-.5,.5).toFixed(2)}em;--dl:${300+j*260}ms`,2600);return}
  pxAdd(el,'fern',`left:0;top:22%;--dl:0ms;background-image:${pick(FERNS.tl)}`,0);
  pxAdd(el,'fern',`left:100%;top:82%;--dl:150ms;background-image:${pick(FERNS.br)}`,0);
  for(let j=0;j<3;j++)pxAdd(el,'icicle',`--x:${(20+j*30+rnd(-6,6)).toFixed(1)}%;--s:${rnd(.6,1).toFixed(2)};--dl:${400+j*120}ms`,0);
  for(let j=0;j<3;j++)pxAdd(el,'glint',`--x:${rnd(5,95).toFixed(1)}%;--r:${rnd(-1,1).toFixed(2)};--dl:${900+j*350}ms`,1300);
  const R=13,all=[],tw=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n,a=-1,b=-1;
  while(n=tw.nextNode()){const inEl=el.contains(n),skip=!inEl&&n.parentElement.closest('.fx,.fz,mark');
    for(let o=0;o<n.nodeValue.length;o++){if(inEl){if(a<0)a=all.length;b=all.length}all.push(skip||inEl?null:[n,o])}}
  if(a<0)return;const sel=new Map(),edge=[null,null];
  for(let d=1;d<=R;d++)[[a-d,0],[b+d,1]].forEach(([ix,side])=>{const c=all[ix];if(!c||/\s/.test(c[0].nodeValue[c[1]]))return;
    if(!sel.has(c[0]))sel.set(c[0],new Map());sel.get(c[0]).set(c[1],d);edge[side]=c});
  const es=[null,null];
  sel.forEach((m,node)=>{const v=node.nodeValue,f=document.createDocumentFragment();let buf='';
    for(let o=0;o<v.length;o++){if(!m.has(o)){buf+=v[o];continue}if(buf){f.append(buf);buf=''}
      const d=m.get(o),s=document.createElement('span');s.className='fz';s.style.cssText=`--d:${d};--k:${((1-d/(R+1))*.75).toFixed(2)}`;s.textContent=v[o];f.append(s);
      edge.forEach((e,i)=>{if(e&&e[0]===node&&e[1]===o)es[i]=s})}
    if(buf)f.append(buf);node.replaceWith(f)});
  if(es[0])pxAdd(es[0],'fern',`left:0;top:82%;--s:.55;--o:.45;--dl:500ms;background-image:${FERNS.l}`,0);
  if(es[1])pxAdd(es[1],'fern',`left:100%;top:82%;--s:.55;--o:.45;--dl:650ms;background-image:${FERNS.r}`,0)}
/* fire: a bank of flame-tongue SVGs (3 layers: red outer, orange body, white-hot core), made once */
const FLAMES=(()=>{const enc=s=>"url('data:image/svg+xml,"+encodeURIComponent(s)+"')";
  const tp=()=>{const bl=rnd(3,8),br=rnd(32,37),tx=rnd(14,26),ty=rnd(0,6),lx=rnd(6,12),ly=rnd(45,62),rx=rnd(28,34),ry=rnd(40,58),hx=rnd(10,16),hy=rnd(22,34);
    return `M${bl} 100C${bl-5} 84 ${bl-1} 70 ${lx} ${ly}C${lx+3} ${ly-8} ${hx-3} ${hy+10} ${hx} ${hy}C${hx+2} ${hy+9} ${tx-5} ${ty+30} ${tx} ${ty}C${tx+4} ${ty+26} ${rx+5} ${ry-14} ${rx} ${ry}C${br+5} 70 ${br+3} 88 ${br} 100Z`.replace(/\d+\.\d+/g,m=>(+m).toFixed(1))};
  const GR={o:[[0,'#ff8a1e',.95],[.35,'#ff4d0c',.8],[.72,'#b8200a',.45],[1,'#6a1004',0]],m:[[0,'#ffe596',1],[.3,'#ffb02e',.95],[.65,'#ff6a12',.65],[1,'#ff3c08',0]],c:[[0,'#fffdf0',1],[.45,'#fff1a6',.9],[1,'#ffd25a',0]]};
  const B={};for(const k in GR){B[k]=[];const st=GR[k].map(([o,c,a])=>`<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('');
    for(let i=0;i<6;i++)B[k].push(enc(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 100" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="1" x2="0" y2="0">${st}</linearGradient></defs><path d="${tp()}" fill="url(#g)"/></svg>`))}
  return B})();
/* fire on a word: four burn marks land like the tear drops (both modes); in Expressive each one catches fire first */
let burning=0;
function fireFx(el){const pick=a=>a[Math.random()*a.length|0],ex=ST.emo==='expressive',lite=burning>=2;if(ex){burning++;setTimeout(()=>burning--,3800)}
  const M=[['b1','-.22em','-.03em',1,0],['b2','calc(100% + .58em)','.72em',.8,350],['b3','calc(36% + .4em)','calc(100% + .55em)',.62,700],['b4','-.22em','calc(100% + .22em)',.45,1000]];
  M.forEach(([b,x,y,s,dl])=>{pxAdd(el,'bm '+b,`--dl:${dl+(ex?200:0)}ms`,0);if(!ex||(lite&&s<.7))return;
    const fh=1.05*s+.35,life=2600,n=lite?1:s>.7?(s>.9?3:2):s>.5?2:1;
    pxAdd(el,'glw',`left:${x};top:${y};--g:${(fh*3.2).toFixed(2)}em;--dl:${dl}ms;--life:${life}ms`,life);
    for(let j=0;j<n;j++){const h=fh*rnd(.7,1.15),fw=h*rnd(.42,.55),off=(n>1?(j/(n-1)-.5)*.35*s:0)+rnd(-.08,.08),fl=`left:calc(${x} + ${off.toFixed(2)}em);--fw:${fw.toFixed(2)}em;--fh:${h.toFixed(2)}em;`;
      const f=pxAdd(el,'fl',fl+`top:calc(${y} - ${h.toFixed(2)}em + .25em);--dl:${dl+j*90}ms;--life:${life-j*120}ms;--k:${rnd(.32,.5).toFixed(2)}s`,life-j*120);
      f.innerHTML=`<b class="o" style="background-image:${pick(FLAMES.o)}"></b><b class="m" style="background-image:${pick(FLAMES.m)}"></b><b class="c" style="background-image:${pick(FLAMES.c)}"></b>`;
      if(!lite)pxAdd(el,'ws',fl+`top:calc(${y} - ${(h*.9).toFixed(2)}em);--dx:${rnd(-.25,.25).toFixed(2)}em;--dl:${dl+500+j*300}ms;background-image:${pick(FLAMES.m)}`,600)}
    if(lite)return;for(let j=0;j<2;j++)pxAdd(el,'spk',`left:${x};top:calc(${y} - ${(fh*.5).toFixed(2)}em);--dx:${rnd(-.8,.8).toFixed(2)}em;--dl:${dl+300+j*rnd(300,600)|0}ms`,1400);
    pxAdd(el,'smk',`left:${x};top:calc(${y} - ${(fh*.6).toFixed(2)}em);--dx:${rnd(-.5,.5).toFixed(2)}em;--dl:${dl+life*.75|0}ms`,3000)});
  if(ex)hapOnce(10)}
/* upgraded families (v11). Each gets (word element, expressive?). Subtle = the word's colour change (CSS) plus marks for blood/water; Expressive = everything. */
const MARKS=['polygon(50% 0,68% 9%,84% 6%,90% 27%,100% 44%,91% 62%,96% 82%,74% 88%,58% 100%,40% 91%,20% 96%,12% 74%,0 58%,9% 38%,4% 16%,26% 12%)','polygon(44% 2%,70% 0,80% 18%,98% 30%,90% 52%,100% 74%,78% 82%,66% 100%,42% 92%,22% 98%,14% 76%,0 62%,8% 40%,2% 20%,24% 14%)','polygon(52% 0,76% 10%,96% 22%,88% 48%,100% 70%,80% 86%,56% 100%,32% 90%,10% 94%,6% 66%,0 44%,14% 24%,30% 6%)','polygon(40% 0,72% 8%,100% 30%,86% 58%,94% 86%,60% 100%,28% 90%,0 70%,10% 40%,6% 14%)'];
const RUNES=(()=>{let s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" fill="none" stroke="#c9a8ff" stroke-width="1.3" stroke-linecap="round"><circle r="46"/><circle r="38" stroke-dasharray="2 4"/><circle r="30"/>';
  const g=['M-3 -4L0 4L3 -4','M-3 4V-4L3 0L-3 4','M0 -4V4M-3 -1L3 -4','M-3 -4H3M0 -4V4','M-3 4L0 -4L3 4M-2 1H2','M-3 -4V4M-3 0L3 -4M-3 0L3 4'];
  for(let i=0;i<12;i++)s+=`<path transform="rotate(${i*30}) translate(0 -42)" d="${g[i%6]}"/>`;for(let i=0;i<6;i++)s+=`<path transform="rotate(${i*60+15})" d="M0 -30L0 -22"/>`;
  return "url('data:image/svg+xml,"+encodeURIComponent(s+'</svg>')+"')"})();
/* page-level layer in the reader (flashes, edge pulses, rain sheet, bolt, leaves) */
function pg(cls,life,css='',html=''){const d=document.createElement('div');d.className='pg pg-'+cls;d.style.cssText=css;d.innerHTML=html;$('#rd').appendChild(d);setTimeout(()=>d.remove(),life);return d}
function rel(el){const r=el.getBoundingClientRect(),q=$('#rd').getBoundingClientRect();return{x:r.left-q.left,y:r.top-q.top,w:r.width,h:r.height,W:q.width,H:q.height}}
const UPFX={
  storm(el,ex){if(!ex)return;const b=rel(el);pg('gloom',3400);
    for(let i=0;i<30;i++)pg('streak',3400,`left:${rnd(0,b.W*1.15)|0}px;top:${rnd(b.y-b.H*.35,b.y+b.H*.15)|0}px;--d:${rnd(.45,.75).toFixed(2)}s;--dl:${rnd(0,2.4).toFixed(2)}s`)},
  lightning(el,ex){if(!ex)return;const b=rel(el);let x=b.x+b.w/2+rnd(-40,40),y=Math.max(0,b.y-b.H*.4);const y0=y,ty=b.y+b.h*.45,pts=[[x,y]];
    for(let i=1;i<=9;i++){x+=i===9?(b.x+b.w/2-x):rnd(-16,16);pts.push([x,y0+(ty-y0)*i/9])}
    const d='M'+pts.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join('L'),k=3+(Math.random()*3|0);let bx=pts[k][0],by=pts[k][1],bd=`M${bx.toFixed(1)} ${by.toFixed(1)}`;
    for(let i=0;i<4;i++){bx+=rnd(8,22)*(Math.random()<.5?-1:1);by+=rnd(8,16);bd+=`L${bx.toFixed(1)} ${by.toFixed(1)}`}
    pg('bolt',1300,'',`<svg width="${b.W|0}" height="${b.H|0}"><path d="${d}" stroke="rgba(150,185,255,.35)" stroke-width="7" fill="none" stroke-linejoin="round"/><path d="${bd}" stroke="rgba(150,185,255,.3)" stroke-width="4" fill="none"/><path d="${d}" stroke="#f4f8ff" stroke-width="1.8" fill="none" stroke-linejoin="round"/><path d="${bd}" stroke="#e6eeff" stroke-width="1" fill="none"/></svg>`);
    pg('lflash',1300);hapOnce(20)},
  thunder(el,ex){if(!ex)return;pg('edge th',1700);const p=el.closest('.para');if(p){p.classList.remove('shud');void p.offsetWidth;p.classList.add('shud');setTimeout(()=>p.classList.remove('shud'),1300)}hapOnce([40,30,70,40,40])},
  blood(el,ex){const pos=[[-.55,-.45,.95,0],[1.05,.15,.7,180],[.45,1.0,.55,320],[-.25,.85,.38,420]],w=el.offsetWidth;
    pos.forEach(([x,y,s,dl],i)=>{const st=`left:${(x*w/2.4).toFixed(1)}px;top:${y}em;width:${s}em;height:${s}em;margin-left:${i==1?0:-s/2}em;clip-path:${MARKS[i]};--r:${rnd(-30,30)|0}deg;`;
      pxAdd(el,'bsr',st+`--dl:${dl}ms`,6500);pxAdd(el,'bsd',st+`--dl:${dl+600}ms`,0)});
    if(ex)[[.3,1.75,500],[.72,1.15,800]].forEach(([fx,h,dl])=>{const st=`left:${fx*100}%;top:.82em;--h:${h}em;`;pxAdd(el,'drip2',st+`--dl:${dl}ms`,0);pxAdd(el,'bulb',st+`--dl:${dl}ms`,0)})},
  steel(el,ex){if(!ex)return;const t=el.textContent;el.style.setProperty('--ww',el.offsetWidth+'px');
    const g=pxAdd(el,'sheen','',1200);g.innerHTML='<b></b>';pxAdd(el,'cut','--dl:450ms',2000);
    const a=document.createElement('span'),bb=document.createElement('span');a.className='half t';bb.className='half b';a.textContent=bb.textContent=t;el.append(a,bb);el.classList.add('cutting');
    setTimeout(()=>{a.remove();bb.remove();el.classList.remove('cutting')},2400)},
  dark(el,ex){if(!ex)return;pxAdd(el,'ink',`left:50%;top:50%;width:6.5em;height:3.6em;margin:-1.8em 0 0 -3.25em;clip-path:polygon(4% 46%,12% 22%,26% 26%,34% 6%,50% 14%,64% 2%,74% 20%,90% 16%,96% 40%,100% 58%,88% 74%,92% 92%,72% 86%,58% 100%,44% 86%,28% 96%,18% 78%,2% 70%);--dl:0ms`,4300);
    pxAdd(el,'ink',`left:20%;top:30%;width:3em;height:2em;margin:-1em 0 0 -1.5em;clip-path:${MARKS[1]};--dl:400ms`,4700)},
  death(el,ex){if(!ex)return;for(let i=0;i<9;i++)pxAdd(el,'ashf',`left:${rnd(10,100)|0}%;top:${rnd(10,60)|0}%;--dx:${rnd(.4,1.8).toFixed(2)}em;--dy:${rnd(-1.6,-.3).toFixed(2)}em;--dl:${600+i*160}ms`,2700);
    for(let i=0;i<4;i++)pxAdd(el,'crumb',`left:${rnd(10,90)|0}%;--dx:${rnd(-.2,.2).toFixed(2)}em;--dl:${900+i*250}ms`,1700)},
  water(el,ex){const w=el.offsetWidth;[[-.6,-.5,1.1,0],[1.0,.2,.8,300],[.4,.95,.6,600]].forEach(([x,y,s,dl],i)=>pxAdd(el,'wet',`left:${(x*w/2).toFixed(1)}px;top:${y}em;width:${s}em;height:${s}em;margin-left:${-s/2}em;clip-path:${MARKS[i]};--dl:${dl}ms`,0))},
  wind(el,ex){if(!ex)return;const p=el.closest('.para');if(p){wrapWords(p);const all=[...p.querySelectorAll('.w')];let i=all.findIndex(w=>el.contains(w)||w.contains(el));
      const own=[...el.querySelectorAll('.w')],gs=[...(own.length?own:[el]),...all.slice(i+1,i+5).filter(w=>!el.contains(w))];gs.forEach((g,j)=>{g.style.setProperty('--gi',j);g.classList.remove('gust');void g.offsetWidth;g.classList.add('gust');setTimeout(()=>g.classList.remove('gust'),2600)})}
    const b=rel(el);for(let i=0;i<2;i++)pg('leaf',3400,`left:-20px;top:${(b.y+rnd(-20,30))|0}px;--dl:${i*500}ms;--W:${b.W|0}px`)},
  light(el,ex){if(!ex)return;el.style.setProperty('--ww',el.offsetWidth+'px');pxAdd(el,'bloom','left:50%;top:50%;--dl:0ms',4200);
    [-30,-14,4].forEach((a,i)=>pxAdd(el,'ray',`left:${50+i*20}%;top:30%;--a:${a}deg;--dl:${200+i*200}ms`,4400));const g=pxAdd(el,'sheen gold','--dl:600ms',1300);g.innerHTML='<b></b>'},
  magic(el,ex){if(!ex)return;const r=pxAdd(el,'rune','left:50%;top:58%;--dl:0ms',4600);r.style.backgroundImage=RUNES},
  wonder(el,ex){if(!ex)return;for(let i=0;i<10;i++)pxAdd(el,'mote',`left:${rnd(-15,110)|0}%;top:${rnd(0,80)|0}%;--s:${rnd(.2,.42).toFixed(2)}em;--dx:${rnd(-.6,.6).toFixed(2)}em;--dl:${i*180}ms`,3300)},
  heart(el,ex){if(ex)pg('edge hb',2800)}};
let lastHap=0;
function hapOnce(p){const n=Date.now();if(n-lastHap<500)return;lastHap=n;haptic(p)}
function emoFx(t){if(!ready||ST.emo==='off')return;const c=t.classList;spawnFx(t);if(c.contains('emo-cold'))coldFx(t);else if(c.contains('emo-fire'))fireFx(t);else{const u=[...c].find(x=>UPFX[x.slice(4)]&&x.startsWith('emo-'));if(u)UPFX[u.slice(4)](t,ST.emo==='expressive')}
  if(c.contains('emo-anger')){const h=$('#heat');h.classList.remove('go');void h.offsetWidth;h.classList.add('go');hapOnce(28)}
  else if(c.contains('emo-fear')||c.contains('emo-shake'))hapOnce([12,70,12]);
  else if(c.contains('emo-heart'))hapOnce([14,90,14]);
  else if(c.contains('emo-loud')||c.contains('pm-ex'))hapOnce(22);
  else if(c.contains('emo-cry')||c.contains('emo-surprise'))hapOnce(8)}

/* ================= reading tracker: ticks + "last line left" rule ================= */
let apIdx=0,curR=-1,lhCache=0,lastY=0;
const readTop=()=>sc.getBoundingClientRect().top+INS.top+78;
function lineH(){if(!lhCache&&paras.length){const cs=getComputedStyle(paras[0]);lhCache=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.7}return lhCache||28}
const atBottom=()=>sc.scrollTop>=sc.scrollHeight-sc.clientHeight-3;
function autoPassed(){const n=paras.length;if(!n)return 0;if(atBottom())return n;const top=readTop(),lim=lineH()*1.15;
  apIdx=Math.min(apIdx,n);
  while(apIdx<n&&paras[apIdx].getBoundingClientRect().bottom-top<=lim)apIdx++;
  while(apIdx>0&&paras[apIdx-1].getBoundingClientRect().bottom-top>lim)apIdx--;
  return apIdx}
function tickTo(){const t=st.ticks[ch]||[];return t.length?Math.max(...t)+1:0}
function bookProg(){const n=paras.length;const frac=n?Math.min(1,(st.reach[ch]||0)/n):(atBottom()?1:0);return(book.cum[ch]+book.spine[ch].size*frac)/book.totalSize}
function updateReading(){if(!book)return;const n=paras.length,r=ST.pacer?Math.min(n,pcPara()):Math.min(n,Math.max(tickTo(),autoPassed()));
  if(r!==curR){if(paras[curR])paras[curR].classList.remove('now','cur');if(paras[r])paras[r].classList.add('now','cur');curR=r;autoMood(r)}
  if(r>(st.reach[ch]||0))st.reach[ch]=r;
  if(n&&r>=n&&!st.done[ch]){st.done[ch]=1;if(n>=12)st.firstDone=true}
  const bp=bookProg();if(bp>st.max)st.max=bp;
  checkUnlocks();
  $('#reachTxt').textContent=!n?'no text on this page':r>=n?'end of this section':'paragraph '+(r+1)+' of '+n+(r<tickTo()?' (ticked)':'');
  $('#maxp').textContent=Math.round(st.max*100)+'% of book'}
function addTicks(){paras.forEach((p,i)=>['l','r'].forEach(sd=>{const b=document.createElement('button');b.className='tick t'+sd;b.setAttribute('aria-label','Mark paragraph as read');b.onclick=e=>{e.stopPropagation();tickPara(i)};p.appendChild(b)}))}
function tickPara(i){const cur=st.ticks[ch]||[],on=!cur.includes(i);
  st.ticks[ch]=on?[...cur,i]:cur.filter(x=>x!==i);if(!st.ticks[ch].length)delete st.ticks[ch];
  paras[i].classList.toggle('ticked',on);if(on)haptic(10);saveSt();updateReading();onScrollUi()}

/* ================= position ================= */
function capturePos(){if(!paras.length)return{ch,s:sc.scrollTop/(sc.scrollHeight-sc.clientHeight||1)};
  const mid=readTop()+sc.clientHeight*.18;let lo=0,hi=paras.length-1;
  while(lo<hi){const m=(lo+hi)>>1;if(paras[m].getBoundingClientRect().bottom<mid)lo=m+1;else hi=m}
  const r=paras[lo].getBoundingClientRect();return{ch,i:lo,f:Math.min(1,Math.max(0,(mid-r.top)/r.height))}}
function restorePos(pos){if(pos.i===undefined){sc.scrollTop=(pos.s||0)*(sc.scrollHeight-sc.clientHeight);return}
  const p=paras[pos.i];if(!p)return;const r=p.getBoundingClientRect();sc.scrollTop+=(r.top+pos.f*r.height)-(readTop()+sc.clientHeight*.18)}
function savePosNow(){if(!book)return;st.pos=capturePos();saveSt()}
function onScrollUi(){const p=sc.scrollTop/(sc.scrollHeight-sc.clientHeight||1);$('#prog').style.width=(Math.min(1,p)*100)+'%';
  $('#progl').textContent=book?Math.round(bookProg()*100)+'% · '+(ch+1)+'/'+book.spine.length:''}
sc.addEventListener('scroll',()=>{if(!book)return;updateReading();onScrollUi();
  st.wear=Math.min(1,st.wear+Math.abs(sc.scrollTop-lastY)/2500000);lastY=sc.scrollTop;
  clearTimeout(saveTimer);saveTimer=setTimeout(()=>{if(!book)return;savePosNow();applyWear();const s=$('#saved');s.classList.add('on');setTimeout(()=>s.classList.remove('on'),1100)},350)},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)savePosNow()});

/* ================= mood, tension, sound ================= */
const MOOD={calm:'#d4a64a',tense:'#c0452a',sad:'#4f7bff',mystery:'#8b5cf6',hopeful:'#3fbf8f'};
const TENSION={'#d4a64a':0,'#c0452a':.75,'#4f7bff':.3,'#8b5cf6':.45,'#3fbf8f':0};
const SCENE={'#d4a64a':'fire','#c0452a':'wind','#4f7bff':'rain','#8b5cf6':'library','#3fbf8f':'library'};
let mood=MOOD.calm;
function setMood(c){mood=c;set('--glow',c);{const v=$('#rd .vig');if(v)v.style.opacity=ST.vig?TENSION[c]:0}$$('#cMood button').forEach(b=>b.classList.toggle('on',b.dataset.v===c));if(ST.snd==='auto')setScene('auto')}
const MW={tense:{storm:1,thunder:1.5,lightning:1,anger:2,fear:2,shake:1,blood:1,pain:1,death:1,loud:1.5,fire:.5,rush:.5,steel:.5,disgust:1},sad:{cry:2,sorrow:2,memory:.5,death:.5,sleep:.3},mystery:{dark:1,magic:2,wary:1.5,hush:.7,cold:.5,surprise:.5,wind:.3},hopeful:{joy:2,smile:1,love:2,light:1,wonder:1.5}};
function autoMood(r){if(!ST.auto)return;const s={tense:0,sad:0,mystery:0,hopeful:0};
  for(let i=Math.max(0,r-1);i<=Math.min(paraInfo.length-1,r+4);i++){const e=paraInfo[i];
    e.ems.forEach(x=>{for(const k in MW)if(MW[k][x])s[k]+=MW[k][x]});if(e.shout)s.tense+=1.5;if(e.sudden)s.tense+=1}
  let best='calm',bv=4.5;for(const k in s)if(s[k]>bv){bv=s[k];best=k}
  if(MOOD[best]!==mood)setMood(MOOD[best])}
$$('#cMood button').forEach(b=>b.onclick=()=>{ST.auto=false;saveST();$('#tAuto').classList.remove('on');setMood(b.dataset.v)});

let AC=null,master=null,G={};
function noiseBuf(type){const len=AC.sampleRate*3,b=AC.createBuffer(1,len,AC.sampleRate),d=b.getChannelData(0);let last=0;for(let i=0;i<len;i++){const w=Math.random()*2-1;if(type==='brown'){last=(last+.02*w)/1.02;d[i]=last*3.2}else d[i]=w}return b}
function loopSrc(buf){const s=AC.createBufferSource();s.buffer=buf;s.loop=true;s.start();return s}
function burst(dest,hp,dur,vol){const s=AC.createBufferSource();s.buffer=G.white;const f=AC.createBiquadFilter();f.type='highpass';f.frequency.value=hp;const g=AC.createGain();const t=AC.currentTime;g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(f);f.connect(g);g.connect(dest);s.start(t,Math.random()*2,dur)}
function initAudio(){if(AC)return;AC=new(window.AudioContext||window.webkitAudioContext)();master=AC.createGain();master.gain.value=0;master.connect(AC.destination);
  G.white=noiseBuf('white');G.brown=noiseBuf('brown');
  const mk=()=>{const g=AC.createGain();g.gain.value=0;g.connect(master);return g};
  G.rain=mk();{const s=loopSrc(G.white),h=AC.createBiquadFilter(),l=AC.createBiquadFilter();h.type='highpass';h.frequency.value=1400;l.type='lowpass';l.frequency.value=7500;s.connect(h);h.connect(l);l.connect(G.rain)}
  G.wind=mk();{const s=loopSrc(G.brown),b=AC.createBiquadFilter(),m=AC.createGain();b.type='bandpass';b.frequency.value=420;b.Q.value=.6;m.gain.value=.55;s.connect(b);b.connect(m);m.connect(G.wind);const o=AC.createOscillator(),lg=AC.createGain();o.frequency.value=.12;lg.gain.value=.4;o.connect(lg);lg.connect(m.gain);o.start()}
  G.fire=mk();{const s=loopSrc(G.brown),l=AC.createBiquadFilter();l.type='lowpass';l.frequency.value=260;s.connect(l);l.connect(G.fire)}
  G.library=mk();{const s=loopSrc(G.brown),l=AC.createBiquadFilter();l.type='lowpass';l.frequency.value=140;s.connect(l);l.connect(G.library)}
  setInterval(()=>{if(G.cur==='fire'&&AC.state==='running'&&Math.random()<.4)burst(G.fire,1800+Math.random()*2500,.04+Math.random()*.07,.25+Math.random()*.3)},110);
  setInterval(()=>{if(G.cur==='library'&&AC.state==='running'&&Math.random()<.3)burst(G.library,3200,.35,.05)},2600)}
const LEVEL={rain:.2,wind:.5,fire:.55,library:.5};
function setScene(mode){
  if(mode==='pause'){if(AC)AC.suspend();return}
  if(ST.snd==='off'){if(AC){master.gain.cancelScheduledValues(AC.currentTime);master.gain.linearRampToValueAtTime(0,AC.currentTime+.5)}return}
  initAudio();AC.resume();const name=ST.snd==='auto'?SCENE[mood]:ST.snd;G.cur=name;const t=AC.currentTime;
  ['rain','wind','fire','library'].forEach(k=>{G[k].gain.cancelScheduledValues(t);G[k].gain.linearRampToValueAtTime(k===name?LEVEL[k]:0,t+2.2)});
  master.gain.cancelScheduledValues(t);master.gain.linearRampToValueAtTime(ST.vol,t+.6)}

/* ================= sheets ================= */
const sheets=['#shT','#shA','#shB','#shC'],btnFor={'#shT':'#bAa','#shA':'#bM','#shB':'#bBook','#shC':'#bC'};
const anySheet=()=>sheets.some(s=>$(s).classList.contains('open'));
function closeSheets(){sheets.forEach(s=>$(s).classList.remove('open'));$$('.dock button').forEach(b=>b.classList.remove('on'))}
function openSheet(id){const was=$(id).classList.contains('open');closeSheets();if(was)return;$(id).classList.add('open');
  if(id!=='#shB')$(btnFor[id]).classList.add('on');
  if(id==='#shB'){st.newDot=false;saveSt();updDot()}
  if(id==='#shC'){const c=$('#tocList .cur'),sh=$('#shC');if(c)sh.scrollTop=Math.max(0,c.offsetTop-sh.clientHeight/2)}}
Object.entries(btnFor).forEach(([id,b])=>$(b).onclick=e=>{e.stopPropagation();openSheet(id)});
sc.addEventListener('click',e=>{if(lpSkip){lpSkip=false;return}if(app.classList.contains('qmode'))return;if(anySheet()){closeSheets();return}if(e.target.closest('button'))return;
  if(ST.pacer){const now=Date.now();if(now-lastTap<330){lastTap=0;app.classList.toggle('hide');const p=e.target.closest('p.para');if(p)pcJump(p,wordAt(p,e.clientX,e.clientY));return}lastTap=now}
  app.classList.toggle('hide')});
function buildToc(){const list=$('#tocList');const toc=(book.toc&&book.toc.length)?book.toc.filter(t=>book.spineIdx[t.href]!==undefined):book.spine.map((s,i)=>({title:'Section '+(i+1),href:s.href,frag:'',depth:0}));
  list.innerHTML=toc.map((t,i)=>`<button data-k="${i}" style="padding-left:${4+(t.depth||0)*16}px"><small>${Math.round(book.cum[book.spineIdx[t.href]]/book.totalSize*100)}%</small>${esc(t.title)}</button>`).join('');
  list.onclick=e=>{const b=e.target.closest('button');if(!b)return;const t=toc[+b.dataset.k];closeSheets();savePosNow();loadChapter(book.spineIdx[t.href],{frag:t.frag})};
  book.tocView=toc}
function markToc(){const toc=book.tocView||[];let cur=-1;toc.forEach((t,i)=>{if(book.spineIdx[t.href]<=ch)cur=i});$$('#tocList button').forEach((b,i)=>b.classList.toggle('cur',i===cur))}

/* ================= bookmarks (cosmetic, earned silently) ================= */
const BMS=[
 {n:'Crimson ribbon',svg:'<svg viewBox="0 0 24 90"><path d="M3 0h18v82l-9-9-9 9z" fill="#a32a2f"/><path d="M3 0h5v82l-5 0z" fill="#0003"/></svg>'},
 {n:'Gilded tassel',svg:'<svg viewBox="0 0 24 100"><path d="M4 0h16v58H4z" fill="#c9a24a"/><path d="M4 0h4v58H4z" fill="#0003"/><circle cx="12" cy="65" r="5" fill="#e6c36a"/><path d="M12 70v24M8 71l-2 21M16 71l2 21" stroke="#c9a24a" stroke-width="2.5" stroke-linecap="round"/></svg>'},
 {n:'Quill',svg:'<svg viewBox="0 0 30 100"><path d="M15 0v24" stroke="#9c7a4a" stroke-width="1.5"/><path d="M15 24c15 12 14 44 0 70C1 68 0 36 15 24z" fill="#f1e7d0" stroke="#9c7a4a"/><path d="M15 28v66" stroke="#9c7a4a" stroke-width="1.2"/><path d="M15 46l8-6M15 58l8-6M15 46l-8-6M15 58l-8-6M15 70l7-5M15 70l-7-5" stroke="#9c7a4a" stroke-width=".8"/></svg>'},
 {n:'Oak leaf',svg:'<svg viewBox="0 0 30 100"><path d="M15 0v26" stroke="#7a5a2a" stroke-width="1.5"/><path d="M15 26c6 0 5 6 11 6-3 4-1 7 2 9-5 1-4 6-9 7 1 5-2 8-4 11-2-3-5-6-4-11-5-1-4-6-9-7 3-2 5-5 2-9 6 0 5-6 11-6z" fill="#6f8f3a" stroke="#4d6a24"/><path d="M15 30v28" stroke="#4d6a24"/></svg>'},
 {n:'Crescent charm',svg:'<svg viewBox="0 0 30 100"><path d="M15 0v22" stroke="#9a9ab8" stroke-width="1.5"/><path d="M22 24A17 17 0 1 0 22 58A30 30 0 0 1 22 24Z" fill="#e8d9a0" stroke="#b8a45a"/><circle cx="24" cy="30" r="1.6" fill="#fff"/></svg>'},
 {n:'Skeleton key',svg:'<svg viewBox="0 0 30 100"><path d="M15 0v14" stroke="#9c7a4a" stroke-width="1.5"/><circle cx="15" cy="22" r="8" fill="none" stroke="#c9a24a" stroke-width="3"/><path d="M15 30v50M15 70h8M15 78h6" stroke="#c9a24a" stroke-width="3.2" stroke-linecap="round"/></svg>'}];
const THR=[0,.2,.4,.6,.8,.985];
const bmLabel=k=>k===1?'first chapter':Math.round(THR[k-1]*100)+'%';
function updDot(){$('#bBook').classList.toggle('dot',!!(st&&st.newDot))}
function renderBM(){const g=$('#bmGrid');g.innerHTML='';
  const none=document.createElement('div');none.className='bmt'+(st.bm===null?' sel':'');none.innerHTML='<svg viewBox="0 0 24 90"><path d="M3 8h18v70H3z" fill="none" stroke="#ffffff33" stroke-dasharray="3 3"/></svg>None<small>always free</small>';none.onclick=()=>{st.bm=null;saveSt();renderBM();hang()};g.appendChild(none);
  BMS.forEach((b,i)=>{const k=i+1,un=st.unlocked.includes(k),d=document.createElement('div');d.className='bmt'+(un?'':' lock')+(st.bm===k?' sel':'');d.innerHTML=b.svg+b.n+'<small>'+(un?'earned':bmLabel(k))+'</small>';
    d.onclick=()=>{if(!un){toast('Earned at '+bmLabel(k));return}st.bm=k;saveSt();renderBM();hang()};g.appendChild(d)})}
function hang(){const h=$('#bmHang');h.innerHTML=st.bm?BMS[st.bm-1].svg:'';h.style.pointerEvents=st.bm?'auto':'none'}
$('#bmHang').onclick=e=>{e.stopPropagation();openSheet('#shB')};
function checkUnlocks(){let chg=false;for(let k=1;k<=6;k++){const ok=k===1?st.firstDone:st.max>=THR[k-1];
  if(ok&&!st.unlocked.includes(k)){st.unlocked.push(k);st.reveal=k;st.newDot=true;chg=true}}
  if(chg){updDot();saveSt();renderBM()}}
function revealBM(){const h=$('#bmHang');if(!st||!st.reveal){h.style.opacity='';return}const k=st.reveal;h.style.opacity=0;
  const o=document.createElement('div');o.className='bmrev';o.innerHTML=BMS[k-1].svg;$('#rd').appendChild(o);
  setTimeout(()=>{o.classList.add('go');haptic(12)},1000);
  setTimeout(()=>{o.remove();if(!st)return;st.bm=k;st.reveal=null;saveSt();hang();renderBM();h.style.opacity='';h.classList.remove('arrive');void h.offsetWidth;h.classList.add('arrive')},3100)}

/* ================= wear ================= */
function applyWear(){if(!st)return;set('--w',st.wear);const v=Math.round(st.wear*100);$('#rWear').value=v;$('#wearo').textContent=v;
  $('#wearTxt').textContent=st.wear<.2?'Like new':st.wear<.45?'Soft creases forming':st.wear<.7?'Dog-eared and well read':'Loved to pieces: coffee ring, creases and all'}
$('#rWear').oninput=e=>{if(!st)return;st.wear=e.target.value/100;applyWear();saveSt()};

/* ================= quotes: touch highlighter ================= */
const qm=$('#qmake');
function qCount(){const n=$$('mark.q').length;qm.disabled=!n;$('#qhint').textContent=n?'Nice. Keep going, or tap Make card.':'Tap a sentence, or press and drag across the words you want.'}
function textNodes(p){const w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT),a=[];while(w.nextNode())a.push(w.currentNode);return a}
function absOff(p,node,off){let n=0;for(const t of textNodes(p)){if(t===node)return n+off;n+=t.length}return n}
function rangeFromAbs(p,a,b){const r=document.createRange();let n=0,sa=false;const ts=textNodes(p);
  for(const t of ts){const e=n+t.length;if(!sa&&a<e){r.setStart(t,Math.max(0,a-n));sa=true}if(sa&&b<=e){r.setEnd(t,Math.max(0,b-n));return r}n=e}
  if(sa&&ts.length){const l=ts[ts.length-1];r.setEnd(l,l.length);return r}return null}
function caretAt(x,y){const r=document.caretRangeFromPoint?document.caretRangeFromPoint(x,y):null;if(!r||r.startContainer.nodeType!==3)return null;
  const p=r.startContainer.parentElement&&r.startContainer.parentElement.closest('p.para');if(!p)return null;return{p,off:absOff(p,r.startContainer,r.startOffset)}}
function wordSpan(T,a,b){if(a>b)[a,b]=[b,a];while(a>0&&/\S/.test(T[a-1]))a--;while(b<T.length&&/\S/.test(T[b]))b++;return[a,b]}
function sentenceSpan(T,off){let a=off,b=off;
  while(a>0&&!(/[.!?…]/.test(T[a-1])&&/\s/.test(T[a]))&&!(/[.!?…]/.test(T[a-2]||'')&&/[”’"']/.test(T[a-1])&&/\s/.test(T[a])))a--;
  while(a<T.length&&/\s/.test(T[a]))a++;
  while(b<T.length&&!/[.!?…]/.test(T[b]))b++;while(b<T.length&&/[.!?…”’"')]/.test(T[b]))b++;
  return[a,Math.max(b,a)]}
function paint(range){const root=range.commonAncestorContainer.nodeType===3?range.commonAncestorContainer.parentNode:range.commonAncestorContainer;
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(w.nextNode()){const n=w.currentNode;if(range.intersectsNode(n)&&n.textContent.trim()&&n.parentNode.closest('#body p.para')&&!n.parentNode.closest('mark.q'))nodes.push(n)}
  nodes.forEach(n=>{let s=0,e=n.length;if(n===range.startContainer)s=range.startOffset;if(n===range.endContainer)e=range.endOffset;if(e<=s)return;const r=document.createRange();r.setStart(n,s);r.setEnd(n,e);const m=document.createElement('mark');m.className='q';r.surroundContents(m)})}
function unwrap(m){const p=m.parentNode;while(m.firstChild)p.insertBefore(m.firstChild,m);p.removeChild(m);p.normalize()}
function clearMarks(){$$('mark.q').forEach(unwrap)}
function collect(){const segs=[];paras.forEach(p=>{if(!p.querySelector('mark.q'))return;let cur='';
  for(const n of textNodes(p)){if(n.parentElement.closest('mark.q'))cur+=n.textContent;else if(cur&&!n.textContent.trim())cur+=n.textContent;else{if(cur.trim())segs.push(cur.trim());cur=''}}
  if(cur.trim())segs.push(cur.trim())});return segs.map(s=>s.replace(/\s+/g,' ')).join(' … ')}
function cancelQuote(){app.classList.remove('qmode');clearMarks();liveClear()}
$('#bQ').onclick=e=>{e.stopPropagation();closeSheets();app.classList.add('qmode');app.classList.remove('hide');qCount()};
$('#qcancel').onclick=cancelQuote;
document.addEventListener('selectstart',e=>e.preventDefault());
document.addEventListener('contextmenu',e=>e.preventDefault());
const HL=window.CSS&&CSS.highlights&&window.Highlight?CSS.highlights:null;
function liveSet(r){if(HL&&r)HL.set('qlive',new Highlight(r))}
function liveClear(){if(HL)HL.delete('qlive')}
let qd=null;
function qStart(x,y,immediate){if(!app.classList.contains('qmode'))return;qd={x,y,active:false,start:null,range:null,moved:false,t:Date.now()};
  const go=()=>{if(!qd)return;const c=caretAt(qd.x,qd.y);if(!c)return;qd.active=true;qd.start=c;haptic(10);qMove(qd.x,qd.y)};
  if(immediate)go();else qd.timer=setTimeout(go,260)}
function qMove(x,y){if(!qd)return false;
  if(!qd.active){if(Math.hypot(x-qd.x,y-qd.y)>10){qd.moved=true;clearTimeout(qd.timer)}return false}
  const c=caretAt(x,y);if(c&&c.p===qd.start.p){const T=c.p.textContent;const[a,b]=wordSpan(T,qd.start.off,c.off);qd.range=rangeFromAbs(c.p,a,b);liveSet(qd.range)}return true}
function qEnd(target){if(!qd)return;clearTimeout(qd.timer);const d=qd;qd=null;liveClear();
  if(d.active){if(d.range){paint(d.range);haptic(8)}qCount();return}
  if(d.moved||Date.now()-d.t>400)return;
  const m=target&&target.closest&&target.closest('mark.q');
  if(m){// tapping a highlight removes that whole highlighted run
    const p=m.closest('p.para');if(p)[...p.querySelectorAll('mark.q')].forEach(unwrap);else unwrap(m);qCount();return}
  const c=caretAt(d.x,d.y);if(!c)return;const T=c.p.textContent;const[a,b]=sentenceSpan(T,Math.min(c.off,T.length-1));
  if(b>a){const r=rangeFromAbs(c.p,a,b);if(r){paint(r);haptic(8)}}qCount()}
sc.addEventListener('touchstart',e=>{if(e.touches.length===1)qStart(e.touches[0].clientX,e.touches[0].clientY,false);else if(qd){clearTimeout(qd.timer);qd=null;liveClear()}},{passive:true});
sc.addEventListener('touchmove',e=>{if(qd&&qMove(e.touches[0].clientX,e.touches[0].clientY)&&e.cancelable)e.preventDefault()},{passive:false});
sc.addEventListener('touchend',e=>{if(qd){const had=qd.active;qEnd(e.target);if(had&&e.cancelable)e.preventDefault()}});
sc.addEventListener('touchcancel',()=>{if(qd){clearTimeout(qd.timer);qd=null;liveClear()}});
let mouseDown=false;
sc.addEventListener('mousedown',e=>{if(e.sourceCapabilities&&e.sourceCapabilities.firesTouchEvents)return;mouseDown=true;qStart(e.clientX,e.clientY,false)});
sc.addEventListener('mousemove',e=>{if(mouseDown&&qd){if(!qd.active&&Math.hypot(e.clientX-qd.x,e.clientY-qd.y)>4){clearTimeout(qd.timer);const c=caretAt(qd.x,qd.y);if(c){qd.active=true;qd.start=c}}qMove(e.clientX,e.clientY)}});
sc.addEventListener('mouseup',e=>{if(mouseDown){mouseDown=false;qEnd(e.target)}});

/* ================= quote cards ================= */
let cardText='',cardStyle='warm',cardMeta=null,editing=null;
const STY={warm:{font:"italic 600 {s}px 'Cormorant Garamond'",fill:'#f3e3c7',align:'center'},aurora:{font:"800 {s}px 'Playfair Display'",fill:'#ffffff',align:'left'},paper:{font:"italic 600 {s}px 'Cormorant Garamond'",fill:'#33281d',align:'left'},mono:{font:"800 {s}px 'Playfair Display'",fill:'#111111',align:'left'}};
function wrapLines(ctx,text,maxW){const words=text.split(' '),lines=[];let l='';words.forEach(w=>{const t=l?l+' '+w:w;if(ctx.measureText(t).width>maxW&&l){lines.push(l);l=w}else l=t});if(l)lines.push(l);return lines}
function blob(ctx,x,y,r,c,a){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,c+Math.round(a*255).toString(16).padStart(2,'0'));g.addColorStop(1,c+'00');ctx.fillStyle=g;ctx.fillRect(0,0,1080,1350)}
function drawCard(cv,q){const ctx=cv.getContext('2d'),W=1080,H=1350,style=q.style,stl=STY[style],pad=96,glow=q.glow||'#d4a64a';ctx.clearRect(0,0,W,H);
  if(style==='warm'){const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#2a170b');g.addColorStop(1,'#0d0805');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);blob(ctx,W*.85,60,700,glow,.5);blob(ctx,W*.1,H,500,glow,.12)}
  if(style==='aurora'){ctx.fillStyle='#0b0b14';ctx.fillRect(0,0,W,H);blob(ctx,W*.9,120,720,glow,.6);blob(ctx,0,H*.8,640,'#ff5e7e',.4);blob(ctx,W*.5,H,500,'#4f7bff',.3)}
  if(style==='paper'){ctx.fillStyle='#f1e7d0';ctx.fillRect(0,0,W,H);for(let i=0;i<9000;i++){ctx.fillStyle=`rgba(90,60,30,${Math.random()*.06})`;ctx.fillRect(Math.random()*W,Math.random()*H,2,2)}ctx.fillStyle='#a32a2f';ctx.beginPath();ctx.moveTo(W-190,0);ctx.lineTo(W-120,0);ctx.lineTo(W-120,230);ctx.lineTo(W-155,200);ctx.lineTo(W-190,230);ctx.closePath();ctx.fill()}
  if(style==='mono'){ctx.fillStyle='#f4f3ee';ctx.fillRect(0,0,W,H)}
  const acc={warm:glow,aurora:'#8b8cff',paper:'#a32a2f',mono:'#111'}[style];
  ctx.fillStyle=acc;ctx.font="800 260px 'Playfair Display'";ctx.textAlign=stl.align==='center'?'center':'left';ctx.textBaseline='alphabetic';ctx.globalAlpha=.9;ctx.fillText('“',stl.align==='center'?W/2:pad-10,330);ctx.globalAlpha=1;
  const maxW=W-pad*2,top=400,bottom=H-250;let s=76,lines,lh;for(;s>26;s-=2){ctx.font=stl.font.replace('{s}',s);lines=wrapLines(ctx,q.text,maxW);lh=s*1.32;if(lines.length*lh<=bottom-top)break}
  ctx.font=stl.font.replace('{s}',s);ctx.fillStyle=stl.fill;ctx.textAlign=stl.align;const x=stl.align==='center'?W/2:pad,used=lines.length*lh,y0=top+Math.max(0,(bottom-top-used)/2);
  lines.forEach((l,i)=>ctx.fillText(l,x,y0+(i+1)*lh-lh*.2));
  const fy=H-130;ctx.fillStyle=acc;if(stl.align==='center')ctx.fillRect(W/2-30,fy-46,60,3);else ctx.fillRect(pad,fy-46,60,3);
  ctx.fillStyle=stl.fill;ctx.globalAlpha=.9;ctx.font="600 34px 'Cormorant Garamond'";ctx.fillText((q.book||'').toUpperCase().slice(0,44),x,fy);ctx.globalAlpha=.55;ctx.font="500 26px Inter";ctx.fillText((q.author||'').slice(0,50),x,fy+44);ctx.globalAlpha=1}
async function fontsReady(){try{await Promise.all(["italic 600 40px 'Cormorant Garamond'","600 40px 'Cormorant Garamond'","800 40px 'Playfair Display'","500 20px Inter"].map(f=>document.fonts.load(f)))}catch(e){}}
const curGlow=()=>getComputedStyle(app).getPropertyValue('--glow').trim()||'#d4a64a';
const cardQ=()=>Object.assign({},cardMeta,{text:cardText,style:cardStyle});
async function renderCard(){await fontsReady();drawCard($('#cv'),cardQ())}
function openCard(q,idx){cardText=q.text;cardStyle=q.style||'warm';cardMeta={glow:q.glow||curGlow(),book:q.book,author:q.author,date:q.date||Date.now()};editing=idx===undefined?null:idx;
  $$('#cStyle button').forEach(b=>b.classList.toggle('on',b.dataset.v===cardStyle));$('#cardDel').style.display=editing===null?'none':'';$('#fsCard').classList.add('open');renderCard()}
$$('#cStyle button').forEach(b=>b.onclick=()=>{cardStyle=b.dataset.v;$$('#cStyle button').forEach(x=>x.classList.toggle('on',x===b));renderCard()});
qm.onclick=()=>{const t=collect();if(t)openCard({text:t,style:ST.skin==='room'?'warm':'aurora',book:book.title,author:book.author})};
$('#cardClose').onclick=()=>$('#fsCard').classList.remove('open');
$('#cardSave').onclick=()=>{const q=load('quotes',[]);if(editing!==null&&q[editing])q[editing]=cardQ();else q.unshift(cardQ());save('quotes',q);toast('Saved to your quotes');$('#fsCard').classList.remove('open');cancelQuote();if($('#fsList').classList.contains('open'))showList()};
$('#cardDel').onclick=()=>{const q=load('quotes',[]);if(editing!==null){q.splice(editing,1);save('quotes',q)}$('#fsCard').classList.remove('open');showList()};
function savePng(canvas,name){const url=canvas.toDataURL('image/png');
  if(A){if(!A.savePng(name,url))toast('Could not save the image')}
  else{const a=document.createElement('a');a.href=url;a.download=name+'.png';a.click();toast('Downloaded')}}
$('#cardDl').onclick=()=>savePng($('#cv'),'quote');
let view='grid';
async function showList(){await fontsReady();const q=load('quotes',[]),box=$('#qlist');box.innerHTML='';$('#wallBtns').style.display=view==='wall'&&q.length?'flex':'none';
  if(!q.length)box.innerHTML='<div class="empty">No saved quotes yet.<br>Tap ❝ in the reader, highlight some words and save a card.</div>';
  else{const g=document.createElement('div');g.className='qgrid'+(view==='wall'?' wall':'');q.forEach((it,i)=>{const d=document.createElement('div');d.className='qi';const c=document.createElement('canvas');c.width=540;c.height=675;const big=document.createElement('canvas');big.width=1080;big.height=1350;drawCard(big,it);c.getContext('2d').drawImage(big,0,0,540,675);d.appendChild(c);d.onclick=()=>openCard(it,i);g.appendChild(d)});box.appendChild(g)}
  $('#fsList').classList.add('open')}
$$('#cView button').forEach(b=>b.onclick=()=>{view=b.dataset.v;$$('#cView button').forEach(x=>x.classList.toggle('on',x===b));showList()});
$('#bS').onclick=e=>{e.stopPropagation();closeSheets();showList()};$('#listClose').onclick=()=>$('#fsList').classList.remove('open');
$('#posterBtn').onclick=async()=>{await fontsReady();const q=load('quotes',[]);if(!q.length)return;const cols=2,cw=440,chh=550,gap=76,rows=Math.ceil(q.length/cols),W=1080,H=Math.max(1350,300+rows*(chh+gap)+120);
  const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');const g=x.createRadialGradient(W*.3,H*.2,50,W*.5,H*.5,H);g.addColorStop(0,'#efe8d8');g.addColorStop(1,'#d3c9b2');x.fillStyle=g;x.fillRect(0,0,W,H);
  for(let i=0;i<14000;i++){x.fillStyle=`rgba(90,70,40,${Math.random()*.05})`;x.fillRect(Math.random()*W,Math.random()*H,2,2)}
  x.fillStyle='#33281d';x.textAlign='center';x.font="italic 600 64px 'Cormorant Garamond'";x.fillText('Lines I kept',W/2,150);
  q.forEach((it,i)=>{const t=document.createElement('canvas');t.width=1080;t.height=1350;drawCard(t,it);const col=i%cols,row=Math.floor(i/cols);
    const cx=(W-(cols*cw+60))/2+cw/2+col*(cw+60)+(row%2?18:-12),cy=300+chh/2+row*(chh+gap)+(col?20:0);
    x.save();x.translate(cx,cy);x.rotate((((i*37)%7)-3)*.012);x.shadowColor='#0007';x.shadowBlur=30;x.shadowOffsetY=14;x.fillStyle='#fbf8f0';x.fillRect(-cw/2-14,-chh/2-14,cw+28,chh+28);x.shadowColor='transparent';x.drawImage(t,-cw/2,-chh/2,cw,chh);
    x.fillStyle='#b3202a';x.beginPath();x.arc(0,-chh/2-8,10,0,7);x.fill();x.restore()});
  savePng(c,'quote-wall')};

/* ================= reading guide (hold-to-read pacer) ================= */
const EFX='.ink-whisper,.ink-shout,.ink-sudden,.dlg-angry,.dlg-cry,.dlg-fear,.dlg-joy,.dlg-sad,.fx';
const pb=$('#pacer');let pcTimer=0,pcRunning=false,pcTrail=[],pcCur=null;
/* wrap a paragraph's words; a word split across inline tags ("tears" + ",") stays one group */
function wrapWords(p){if(p._w)return;const groups=[];let cur=null,glue=false;
  textNodes(p).forEach(t=>{const v=t.nodeValue;if(!v)return;const f=document.createDocumentFragment();
    v.split(/(\s+)/).forEach(tok=>{if(!tok)return;
      if(/^\s+$/.test(tok)){f.appendChild(document.createTextNode(tok));glue=false;return}
      const s=document.createElement('span');s.className='w';s.textContent=tok;f.appendChild(s);
      if(glue&&cur)cur.push(s);else{cur=[s];groups.push(cur)}glue=true});
    t.parentNode.replaceChild(f,t)});
  p._w=groups}
const gcl=(g,c,on)=>g.forEach(x=>x.classList.toggle(c,on));
function pcPara(){return st&&st.pc&&st.pc.ch===ch?st.pc.p:0}
function pcSeen(P){for(let i=0;i<P&&i<paras.length;i++)paras[i].querySelectorAll(EFX).forEach(el=>el.classList.add(el.classList.contains('fx')?'play':'ink-in'))}
function fireFor(w,p,silent){let el=w.parentElement;while(el&&el!==p){if(el.matches(EFX)){if(silent)el.classList.add(el.classList.contains('fx')?'play':'ink-in');else fire(el)}el=el.parentElement}}
function pcLeave(){if(!pcCur)return;gcl(pcCur,'pw',false);gcl(pcCur,'rd',true);gcl(pcCur,'fd',true);pcTrail.push(pcCur);if(pcTrail.length>6)gcl(pcTrail.shift(),'fd',false);pcCur=null}
/* put the guide at st.pc: everything before it is "read", everything after is reset so its effects play again */
function pcApply(){const P=st.pc.p;pcTrail.forEach(g=>gcl(g,'fd',false));pcTrail=[];if(pcCur){gcl(pcCur,'pw',false);pcCur=null}
  paras.forEach((p,i)=>{p.classList.toggle('pread',i<P);if(i>=P){if(p._w)p._w.forEach(g=>gcl(g,'rd',false));p.querySelectorAll(EFX).forEach(el=>el.classList.remove('play','ink-in'));p.querySelectorAll('.px').forEach(x=>x.remove());if(p.querySelector('.fz')){p.querySelectorAll('.fz').forEach(s=>s.replaceWith(s.textContent));p.normalize()}}});
  pcSeen(P);const p=paras[P];if(!p)return;wrapWords(p);st.pc.w=Math.min(st.pc.w,p._w.length);
  p._w.forEach((g,i)=>{if(i<st.pc.w){gcl(g,'rd',true);g.forEach(x=>fireFor(x,p,true))}});
  const g=p._w[st.pc.w];if(g){g.forEach(x=>x.style.setProperty('--d','1ms'));gcl(g,'pw',true);pcCur=g}}
function pcInit(){if(!paras.length)return;
  if(!st.pc||st.pc.ch!==ch){let p=0;if(st.pos&&st.pos.ch===ch&&st.pos.i!==undefined)p=st.pos.i;st.pc={ch,p,w:0}}
  st.pc.p=Math.min(st.pc.p,paras.length);pcApply()}
function pcFollow(w){const r=w.getBoundingClientRect(),target=readTop()+sc.clientHeight*.3;
  if(r.top>target+lineH()*1.5||r.top<readTop()+4)sc.scrollBy({top:r.top-target,behavior:'smooth'})}
function pcStep(){if(!pcRunning||!st)return;const pc=st.pc,p=paras[pc.p];if(!p){pcStop();return}
  wrapWords(p);const ws=p._w,base=60000/ST.wpm;
  if(pc.w>=ws.length){pcLeave();p.classList.add('pread');ws.forEach(g=>gcl(g,'rd',false));pc.p++;pc.w=0;updateReading();onScrollUi();
    if(pc.p>=paras.length){pcStop();return}
    pcTimer=setTimeout(pcStep,base*1.4);return}
  const g=ws[pc.w];if(pcCur!==g)pcLeave();
  let t='';g.forEach(x=>t+=x.textContent);let f=.6+Math.min(t.length,12)/10;if(/[,;:—–]$/.test(t))f+=.6;if(/[.!?…]["”’)]*$/.test(t))f+=1.1;const dur=Math.round(base*f);
  g.forEach(x=>{x.style.setProperty('--d',dur+'ms');x.classList.add('pw');fireFor(x,p,false)});pcCur=g;
  if(pc.w%3===0)pcFollow(g[0]);pc.w++;pcTimer=setTimeout(pcStep,dur)}
function pcRun(){if(!st||!paras.length||!st.pc||st.pc.p>=paras.length)return;pcRunning=true;pb.classList.add('run');app.classList.add('pcrun');pcStep()}
function pcStop(){if(pcRunning){pcRunning=false;saveSt()}clearTimeout(pcTimer);pb.classList.remove('run');app.classList.remove('pcrun')}
function pcJump(pEl,wEl){const i=paras.indexOf(pEl);if(i<0)return;wrapWords(pEl);const k=wEl?pEl._w.findIndex(g=>g.includes(wEl)):0;
  st.pc={ch,p:i,w:Math.max(0,k)};pcApply();updateReading();onScrollUi();saveSt();haptic(14)}
/* press and hold a word: the guide jumps there (forwards or back) */
let lp=null,lpSkip=false;
/* the word under a point, or the nearest one when the point falls in a gap */
function wordAt(p,x,y){wrapWords(p);const el=document.elementFromPoint(x,y),w=el&&el.closest('.w');if(w&&p.contains(w))return w;
  let best=null,bd=1e9;p._w.forEach(g=>g.forEach(s=>{const r=s.getBoundingClientRect();const dx=x<r.left?r.left-x:x>r.right?x-r.right:0,dy=y<r.top?r.top-y:y>r.bottom?y-r.bottom:0,d=dx+dy*3;if(d<bd){bd=d;best=s}}));return best}
function lpGo(x,y){const el=document.elementFromPoint(x,y);const p=el&&el.closest('p.para');if(!p)return;
  pcStop();pcJump(p,wordAt(p,x,y));lpSkip=true;setTimeout(()=>lpSkip=false,800)}
sc.addEventListener('touchstart',e=>{if(!ST.pacer||!book||app.classList.contains('qmode')||e.touches.length!==1||e.target.closest('button'))return;const t=e.touches[0];
  lp={x:t.clientX,y:t.clientY,timer:setTimeout(()=>{const l=lp;lp=null;if(l)lpGo(l.x,l.y)},480)}},{passive:true});
sc.addEventListener('touchmove',e=>{if(lp){const t=e.touches[0];if(Math.hypot(t.clientX-lp.x,t.clientY-lp.y)>10){clearTimeout(lp.timer);lp=null}}},{passive:true});
['touchend','touchcancel'].forEach(n=>sc.addEventListener(n,()=>{if(lp){clearTimeout(lp.timer);lp=null}}));
/* the feather: hold = read, slide right = faster, left = slower, tap = switch to move mode */
let ph=null;
function placePacer(){if(ST.pcPos){pb.style.left=Math.min(innerWidth-62,Math.max(4,ST.pcPos.x*innerWidth))+'px';pb.style.top=Math.min(innerHeight-62,Math.max(4,ST.pcPos.y*innerHeight))+'px';pb.style.right='auto';pb.style.bottom='auto'}}
function phStart(x,y){const r=pb.getBoundingClientRect();ph={x,y,t:Date.now(),moved:false,w0:ST.wpm,steps:0,ox:x-r.left,oy:y-r.top};
  if(!pb.classList.contains('move'))ph.timer=setTimeout(()=>{if(ph){ph.held=true;pcRun()}},170)}
function phMove(x,y){if(!ph)return;const dx=x-ph.x,dy=y-ph.y;if(Math.hypot(dx,dy)>9)ph.moved=true;
  if(pb.classList.contains('move')){if(ph.moved){ST.pcPos={x:(x-ph.ox)/innerWidth,y:(y-ph.oy)/innerHeight};placePacer()}}
  else{const s=Math.round(dx/18);if(s!==ph.steps){ph.steps=s;ST.wpm=Math.min(600,Math.max(80,ph.w0+s*10));haptic(8)}
    if(ph.moved){$('#pbub').textContent=ST.wpm+' words/min';pb.classList.add('adj')}}}
function phEnd(){if(!ph)return;clearTimeout(ph.timer);const tap=!ph.moved&&Date.now()-ph.t<300;
  if(pb.classList.contains('move')){if(tap){pb.classList.remove('move');haptic(10)}}
  else{pcStop();if(tap){pb.classList.add('move');haptic(10)}}
  pb.classList.remove('adj');saveST();ph=null}
pb.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();phStart(e.touches[0].clientX,e.touches[0].clientY)},{passive:false});
pb.addEventListener('touchmove',e=>{e.preventDefault();phMove(e.touches[0].clientX,e.touches[0].clientY)},{passive:false});
pb.addEventListener('touchend',e=>{e.preventDefault();phEnd()});pb.addEventListener('touchcancel',phEnd);
pb.addEventListener('mousedown',e=>{e.stopPropagation();phStart(e.clientX,e.clientY);const mv=ev=>phMove(ev.clientX,ev.clientY),up=()=>{phEnd();removeEventListener('mousemove',mv);removeEventListener('mouseup',up)};addEventListener('mousemove',mv);addEventListener('mouseup',up)});
pb.addEventListener('click',e=>e.stopPropagation());
let lastTap=0;

/* ================= back button ================= */
window.__back=()=>{
  if($('#fsCard').classList.contains('open')){$('#fsCard').classList.remove('open');return true}
  if($('#fsList').classList.contains('open')){$('#fsList').classList.remove('open');return true}
  if(anySheet()){closeSheets();return true}
  if(app.classList.contains('qmode')){cancelQuote();return true}
  if(book){closeBook();return true}
  return false};

/* ================= boot ================= */
chipsBind('#cSkin','skin');chipsBind('#cFont','font');chipsBind('#cAl','align');chipsBind('#cPar','par');chipsBind('#cEmo','emo');
chipsBind('#cSnd','snd',()=>setScene());
sliderBind('#rSize','size');sliderBind('#rLh','lh');sliderBind('#rM','m');sliderBind('#rLs','ls',v=>(v*100).toFixed(1));
sliderBind('#rVol','vol',v=>Math.round(v*100));$('#rVol').addEventListener('input',()=>{if(AC&&ST.snd!=='off')master.gain.value=ST.vol});
toggleBind('#tPacer','pacer',()=>{pcStop();if(book){savePosNow();loadChapter(ch,{restore:true})}});placePacer();
toggleBind('#tDc','dc');toggleBind('#tXfont','xfont');toggleBind('#tFocus','focus');toggleBind('#tTicks','ticks');toggleBind('#tInk','ink');
toggleBind('#tVig','vig',()=>setMood(mood));toggleBind('#tMotes','motes');toggleBind('#tDust','dust');toggleBind('#tHap','hap');toggleBind('#tAuto','auto',on=>{if(on&&book)autoMood(curR)});
toggleLocal('#tLine',on=>$('#rline').style.display=on?'block':'none');
applySettings();setMood(MOOD.calm);renderLib();
window.addEventListener('error',e=>console.error('JS error: '+e.message+' @'+e.lineno));
