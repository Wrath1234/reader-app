/* Reader Motion Lab: decorations never own text or reading state. */
(() => {
'use strict';
let ctx, active=0, peak=0, origin=null, moment=null, intro=null, headingObserver=null, opening=false, turnDirection=0;
const motion=matchMedia('(prefers-reduced-motion: reduce)'), jobs=new Set(), timers=new Map();
// Owner-approved word families only. The other nine keep the app's own effects (their branches below are inactive).
const ghosted=['anger','fear','loud','fall','shake','joy'];
const families=[...ghosted,'memory'];
const C=()=>ctx(), q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>[...r.querySelectorAll(s)];
const enabled=()=>C().settings.bookMoments!==false;
const ex=()=>!motion.matches&&C().settings.emo==='expressive';
const svg=(s,vb='0 0 100 24')=>`url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+vb+'" preserveAspectRatio="none">'+s+'</svg>').replace(/'/g,'%27')}")`;
/* Deterministic variation: a small bank of hand-drawn shapes made once at start, and a per-word seed so each
   mark differs from its neighbours yet is redrawn identically when a page is restored. No per-word image generation. */
const rng=s=>()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const seedOf=el=>{let h=(+el.closest('.para')?.dataset.i||0)*131+el.offsetLeft|0;for(const ch of el.textContent)h=Math.imul(h^ch.charCodeAt(0),16777619);return h|0};
const JAG=['polygon(50% 0,68% 9%,84% 6%,90% 27%,100% 44%,91% 62%,96% 82%,74% 88%,58% 100%,40% 91%,20% 96%,12% 74%,0 58%,9% 38%,4% 16%,26% 12%)','polygon(44% 2%,70% 0,80% 18%,98% 30%,90% 52%,100% 74%,78% 82%,66% 100%,42% 92%,22% 98%,14% 76%,0 62%,8% 40%,2% 20%,24% 14%)','polygon(52% 0,76% 10%,96% 22%,88% 48%,100% 70%,80% 86%,56% 100%,32% 90%,10% 94%,6% 66%,0 44%,14% 24%,30% 6%)','polygon(40% 0,72% 8%,100% 30%,86% 58%,94% 86%,60% 100%,28% 90%,0 70%,10% 40%,6% 14%)'];
function pen(r,col,thick,rough,taper,op=1){const top=[],bot=[];for(let x=0;x<=100;x+=4){const t=x/100;let hw=thick*7*(taper==='end'?Math.pow(1-t,.6)*.9+.1*Math.sin(Math.PI*t):.8+.2*Math.sin(Math.PI*t));
  const cy=12+(r()*2-1)*rough*.7;hw=Math.max(.35,hw+(r()*2-1)*rough*.9);top.push(x+' '+(cy-hw).toFixed(1));bot.unshift(x+' '+(cy+hw).toFixed(1))}
  return `<path d="M${top.concat(bot).join('L')}Z" fill="${col}" fill-opacity="${op}"/>`}
const bank=(n,seed,fn)=>Array.from({length:n},(_,i)=>svg(fn(rng(seed+i*977))));
const slashes=bank(5,11,r=>pen(r,'#b8402d',1.3,1.6,'end'));
const flicks=bank(3,23,r=>pen(r,'#e8dccb',.85,.6,'end'));
const tremors=bank(5,37,r=>{let d='M0 12';for(let i=1;i<=40;i++){const x=i*2.5,a=10*Math.pow(x/100,2.2);d+=`L${x} ${(12+(i%2?1:-1)*a*(.35+r()*.65)).toFixed(1)}`}return `<path d="${d}" fill="none" stroke="#b9aede" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`});
const smears=bank(3,51,r=>{let s='<defs><linearGradient id="g"><stop offset="0" stop-color="#e8dccb" stop-opacity="0"/><stop offset="1" stop-color="#e8dccb"/></linearGradient></defs>';for(let i=0;i<7;i++){const x=r()*55|0;s+=`<rect x="${x}" y="${(2+i*3.3+r()*1.2-.6).toFixed(1)}" width="${100-x}" height="${(.5+r()).toFixed(1)}" fill="url(#g)" fill-opacity="${(.4+r()*.6).toFixed(2)}"/>`}return s});
const flourish=svg('<g fill="none" stroke="#e6c77e" stroke-linecap="round"><path d="M3 8C22 19 58 19 84 8C91 5 98 5 96 11C94.5 15 87 13 89 8" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M22 15.2C40 18.5 62 17 79 10.5" stroke-width="2.4" stroke-opacity=".8" vector-effect="non-scaling-stroke"/></g>');
const crease=svg('<defs><linearGradient id="a"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset=".25" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="b"><stop offset="0" stop-opacity=".2"/><stop offset=".25" stop-opacity=".9"/><stop offset="1" stop-opacity="0"/></linearGradient></defs><rect width="100" height="1.2" fill="url(#a)"/><rect y="1.4" width="100" height="1.6" fill="url(#b)"/>','0 0 100 3');
// Guide strokes: a wet wash and broken dry-brush lines (three shapes, shared by every word).
const brushes=[0,1,2].map(i=>{const r=rng(71+i*19);let b='';for(let k=0;k<6;k++){const y=5+k*2.7+r()*1.2;b+=`<path d="M${(2+r()*7).toFixed(0)} ${y.toFixed(1)}Q${30+i*6} ${(y-3+r()*2).toFixed(1)} 62 ${(y+r()*1.5).toFixed(1)}T${(89+r()*9).toFixed(0)} ${(y-1+r()*2).toFixed(1)}" stroke-opacity="${(.16+r()*.24).toFixed(2)}" stroke-width="${(.5+r()*.6).toFixed(2)}" stroke-dasharray="${14+r()*26|0} ${2+r()*6|0} ${8+r()*22|0} ${1+r()*4|0}"/>`}
  return{wash:svg(`<path d="M2 ${7+i}Q12 2 28 5T58 4T98 7L96 19Q83 23 66 20T34 21T2 18Z" fill="#c4c4c4" fill-opacity=".26"/><path d="M5 11Q29 8 52 10T95 11L91 15Q60 14 35 16L5 14Z" fill="#e2e2e2" fill-opacity=".2"/>`),bristle:svg(`<g fill="none" stroke="#d8d0c4">${b}</g>`)}});
const taper=svg('<path d="M2 8Q21 2 48 6T98 14Q69 17 43 21T2 18Z" fill="#c4c4c4" fill-opacity=".28"/>');
function later(fn,ms,owner){const id=setTimeout(()=>{timers.delete(id);fn()},ms);timers.set(id,owner);return id}
/* With more than two keyframes the easing applies to each segment (a keyframe may carry its own), so swings
   decelerate into every turn and falls accelerate, instead of one curve stretched over linear segments. */
function tween(el,frames,duration,delay=0,easing='ease-out',owner=el,temporary=false){
 if(frames.length>2&&!/^steps/.test(easing)){frames=frames.map(f=>f.easing?f:{...f,easing});easing='linear'}
 el.style.willChange='transform, opacity';const a=el.animate(frames,{duration,delay,easing,fill:'both'}), job={a,el,owner};jobs.add(job);
 a.finished.then(()=>{if(!jobs.delete(job))return;const last=frames[frames.length-1];for(const k of ['transform','opacity'])if(last[k]!==undefined)el.style[k]=last[k];a.cancel();if(![...jobs].some(j=>j.el===el))el.style.willChange='';if(temporary)el.remove()}).catch(()=>{});return a;
}
function stop(owner){for(const j of [...jobs])if(!owner||j.owner===owner||owner.contains?.(j.owner)){jobs.delete(j);j.a.cancel();j.el.style.willChange=''}
 for(const [id,o] of [...timers])if(!owner||o===owner||owner.contains?.(o)){clearTimeout(id);timers.delete(id)}}
function node(parent,cls,style=''){const n=document.createElement('i');n.className=cls;n.setAttribute('aria-hidden','true');n.style.cssText=style;parent.append(n);return n}
function mark(el,cls,style=''){return node(el,'lab-deco '+cls,style)}
function ghost(el,cls=''){const g=mark(el,'lab-glyph '+cls);g.dataset.text=el.textContent;return g}
/* A drawn line is revealed by a clip sliding in while its content slides the opposite way: the shape is never
   stretched (a tremor that starts steady must not show its jagged end early). Transform only. */
function drawn(el,cls,image,style=''){const m=mark(el,'lab-wipe '+cls,style),b=node(m,'');b.style.backgroundImage=image;return m}
function draw(m,dur,delay,easing,owner,axis='X'){const b=m.firstChild;tween(m,[{transform:`translate${axis}(-101%)`},{transform:'none'}],dur,delay,easing,owner);tween(b,[{transform:`translate${axis}(101%)`},{transform:'none'}],dur,delay,easing,owner)}
/* Marks are placed in em from the top of the word's inline box, which depends on the font's ascent (Literata sits
   lower than Georgia). Measure it once per font and shift every mark so it keeps its distance from the baseline. */
let fontKey='',pen2d=null;
function baseline(el){const cs=getComputedStyle(el),key=cs.fontFamily+cs.fontSize;if(key===fontKey)return;fontKey=key;pen2d=pen2d||document.createElement('canvas').getContext('2d');
 pen2d.font=cs.fontStyle+' '+cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;const a=pen2d.measureText('x').fontBoundingBoxAscent/parseFloat(cs.fontSize);if(a>0)C().body.style.setProperty('--lab-o',(a-.917).toFixed(3)+'em')}
function selected(el){return families.find(k=>el.classList.contains('emo-'+k))||(el.matches('.pm')?el.classList.contains('pm-ex')?'ex':el.classList.contains('pm-q')?'q':el.classList.contains('pm-cut')?'dash':'ellipsis':null)}
function prepare(root){qa('.fx',root).forEach(el=>{if(selected(el))el.classList.add('lab-word')});qa('.ink-whisper',root).forEach(el=>el.classList.add('lab-whisper'))}
function clearWord(el){stop(el);if(el._labRelease)el._labRelease();(el._labNear||[]).forEach(w=>{stop(w);w.style.opacity=''});delete el._labNear;qa('.lab-deco',el).forEach(x=>x.remove());el.classList.remove('lab-hidden','lab-set');delete el.dataset.labDone;el.style.removeProperty('--lab-color');el.style.opacity=''}
function shiver(g,amp,dur,delay,owner){tween(g,[{transform:'none'},...[-1,1,-.9,.8,-.6,.35,0].map((v,i)=>({transform:`translate(${v*amp}em,${i%2?-.4*amp:.4*amp}em)`}))],dur,delay,'linear',owner)}
const SPRING='cubic-bezier(.3,0,.3,1)',THROW='cubic-bezier(.1,.7,.3,1)',DROP='cubic-bezier(.6,0,1,.8)';
function word(el,silent=false){const k=selected(el);if(!k)return false;el.classList.add('lab-word');
 if(!el.isConnected||!C().body.contains(el))return true;if(el.dataset.labDone)return true;el.dataset.labDone='1';const c=C();if(c.settings.emo==='off')return true;
 el.classList.add('lab-set');const color=getComputedStyle(el).color;el.style.setProperty('--lab-color',color);baseline(el);
 const multi=el.getClientRects().length>1, full=ex(), animate=!silent&&c.ready&&full&&!multi&&active<3;
 const r=rng(seedOf(el)), R=(a,b)=>a+r()*(b-a), pick=a=>a[r()*a.length|0];
 let g=null;if(!multi&&(ghosted.includes(k)||['ex','q','dash','ellipsis'].includes(k))){g=ghost(el);el.classList.add('lab-hidden')}
 let life=0;
 if(k==='anger'){const m=mark(el,'lab-slash');m.style.backgroundImage=pick(slashes);
   const fl=full?[0,1,2].map(i=>mark(el,'lab-fleck',`left:calc(100% + ${R(.3,.75).toFixed(2)}em);top:${R(.85,1.25).toFixed(2)}em;width:${R(.06,.13).toFixed(2)}em;aspect-ratio:1;background:#b8402d;opacity:.85;clip-path:${JAG[i]}`)):[];
   if(animate){tween(m,[{transform:'scaleX(0)'},{transform:'scaleX(1)'}],130,0,'cubic-bezier(.6,0,.9,.5)',el);tween(g,[{transform:'none'},{transform:'translateY(.05em) scale(1.03,.96)',offset:.22},{transform:'none'}],340,0,SPRING,el);
    fl.forEach((f,i)=>tween(f,[{opacity:0,transform:`translate(-.5em,${R(-.1,.1).toFixed(2)}em) scale(.3)`},{opacity:.85,transform:'none'}],260,110+i*30,THROW,el));life=400}}
 if(k==='fear'){const m=drawn(el,'lab-fear-line',pick(tremors));if(animate){draw(m,1000,0,'linear',el);shiver(g,.035,600,550,el);life=1150}}
 if(k==='sorrow'){if(g&&full)g.style.transform='translateY(.06em)';if(animate)tween(g,[{transform:'none'},{transform:'translateY(.06em)'}],1800,0,SPRING,el);
   [[18,.55,300],[53,.8,900],[82,.4,1400]].slice(0,full?3:2).forEach(([x,h,dl])=>{h=h*R(.8,1.15);const st=`left:${(x+R(-4,4)).toFixed(0)}%;`,run=mark(el,'lab-run',st+`height:${h.toFixed(2)}em`),bead=mark(el,'lab-bead',st+`top:calc(.9em + ${h.toFixed(2)}em)`);
    if(animate){const d=(2+h)*1000;tween(run,[{transform:'scaleY(0)'},{transform:'none'}],d,dl,'cubic-bezier(.45,0,.3,1)',el);tween(bead,[{opacity:0,transform:`translateY(${(.06-h).toFixed(2)}em)`},{opacity:1,transform:`translateY(${((.06-h)*.88).toFixed(2)}em)`,offset:.12,easing:'linear'},{opacity:1,transform:'none'}],d,dl,'cubic-bezier(.45,0,.3,1)',el)}});if(animate)life=2400}
 if(k==='smile'){const m=drawn(el,'lab-flourish',flourish);if(animate){draw(m,750,150,'cubic-bezier(.4,0,.2,1)',el);tween(g,[{transform:'none'},{transform:'translateY(-.07em)',offset:.45},{transform:'none'}],1000,0,SPRING,el);life=1000}}
 if(k==='wary'){const a=mark(el,'lab-tick lab-tick-a'),b=mark(el,'lab-tick lab-tick-b');if(animate){tween(a,[{opacity:0,transform:'translate(-.45em,-.2em)'},{opacity:.65,transform:'none'}],500,100,'ease-out',el);tween(b,[{opacity:0,transform:'translate(.45em,.2em)'},{opacity:.65,transform:'none'}],500,500,'ease-out',el);
   tween(g,[{transform:'none'},{transform:'translateX(-.05em)',offset:.28},{transform:'translateX(.05em)',offset:.64},{transform:'none'}],1100,0,'ease-in-out',el);life=1100}}
 if(k==='surprise'){const m=drawn(el,'lab-flick',pick(flicks));const dots=full?[.07,.05,.035].map((s,i)=>mark(el,'lab-dot',`left:calc(100% + ${(.42+i*.1+R(-.03,.03)).toFixed(2)}em);top:${(-.5-i*.13+R(-.04,.04)).toFixed(2)}em;width:${s}em;height:${s}em`)):[];
   if(animate){draw(m,100,0,'cubic-bezier(.2,.6,.3,1)',el);tween(g,[{transform:'none'},{transform:'translateY(-.16em)',offset:.3},{transform:'translateY(.025em)',offset:.68},{transform:'none'}],460,0,SPRING,el);
    dots.forEach((d,i)=>tween(d,[{opacity:0,transform:'translate(-.25em,.32em) scale(.3)'},{opacity:.8,transform:'none'}],300,70+i*35,THROW,el));life=500}}
 if(k==='hush'){const a=drawn(el,'lab-caesura','none','left:-.25em'),b=drawn(el,'lab-caesura','none','left:-.14em');el.style.opacity='.66';
   if(animate){draw(a,500,0,'ease-out',el,'Y');draw(b,500,180,'ease-out',el,'Y');tween(el,[{opacity:1},{opacity:.66}],1800,0,'ease-out',el);
    const p=el.closest('.para');if(p&&!c.settings.pacer){c.wrap(p);const ws=qa('.w',p),at=ws.findIndex(w=>el.contains(w)||w.contains(el)),near=ws.slice(at+1).filter(w=>!el.contains(w)).slice(0,3);el._labNear=near;
     near.forEach((w,i)=>{tween(w,[{opacity:1},{opacity:.45,offset:.3},{opacity:1}],2800,300+i*180,'ease-in-out',el);later(()=>{w.style.opacity=''},3200+i*180,el)})}life=1800}}
 if(k==='rush'){const m=mark(el,'lab-smear');m.style.backgroundImage=pick(smears);if(g){g.style.transformOrigin='0 100%';if(full)g.style.transform='skewX(-7deg)'}
   if(animate){tween(g,[{opacity:.2,transform:'translateX(-.55em) skewX(-24deg)'},{opacity:1,transform:'skewX(-7deg)'}],320,0,'cubic-bezier(.1,.8,.2,1)',el);tween(m,[{opacity:0,transform:'scaleX(.05)'},{opacity:.95,offset:.3},{opacity:.55,transform:'none'}],550,0,'cubic-bezier(.1,.8,.2,1)',el);life=550}}
 if(k==='pain'){const cr=[[-152,1.9,0],[-22,1.1,50],[40,.8,90]].map(([a,l,dl])=>[mark(el,'lab-crease',`background-image:${crease};rotate:${(a+R(-7,7)).toFixed(0)}deg;width:${(l*R(.85,1.15)).toFixed(2)}em`),dl]);
   if(animate){if(g)g.style.transformOrigin='55% 100%';tween(g,[{transform:'none'},{transform:'scale(.95,.91)',offset:.14},{transform:'none'}],550,0,'cubic-bezier(.2,.7,.3,1)',el);cr.forEach(([m,dl])=>tween(m,[{opacity:1,transform:'scaleX(0)'},{opacity:.55,transform:'none'}],150,dl,'ease-out',el));life=550}}
 if(k==='loud'){const plate=mark(el,'lab-plate');if(animate){tween(g,[{transform:'scale(1.24)',opacity:0},{transform:'none',opacity:1}],170,0,'cubic-bezier(.6,0,1,.7)',el);tween(plate,[{opacity:0,transform:'scale(1.1)'},{opacity:.75,transform:'none'}],500,150,'ease-out',el);
   for(let i=0;i<5;i++){const d=mark(el,'lab-dust',`left:${R(-5,105).toFixed(0)}%;`),dx=R(-.25,.25);tween(d,[{opacity:0,transform:'none',easing:THROW},{opacity:.8,transform:`translate(${dx.toFixed(2)}em,-.38em)`,offset:.5,easing:DROP},{opacity:0,transform:`translate(${(dx*1.5).toFixed(2)}em,.12em)`}],750,160,'linear',el,true)}
   const p=el.closest('.para');if(p&&!p.classList.contains('shake')&&!q('.ink-shout',p)&&!p._labBump){p._labBump=true;tween(p,[{transform:'none'},{transform:'translateY(2.5px)',offset:.18},{transform:'translateY(-.6px)',offset:.55},{transform:'none'}],360,150,'cubic-bezier(.2,.7,.3,1)',el);later(()=>delete p._labBump,550,el)}life=920}}
 if(k==='fall'&&g){g.style.transform=full?'rotate(5deg) translateY(.04em)':'none';g.style.transformOrigin='.1em 80%';if(animate){tween(g,[{transform:'none',easing:'cubic-bezier(.5,0,1,.7)'},{transform:'rotate(12deg)',offset:.22},{transform:'rotate(1.5deg)',offset:.42},{transform:'rotate(7.5deg)',offset:.62},{transform:'rotate(4deg)',offset:.8},{transform:'rotate(5deg) translateY(.04em)'}],1250,0,'ease-in-out',el);
   for(let i=0;i<2;i++){const d=mark(el,'lab-crumb');tween(d,[{opacity:.9,transform:'none'},{opacity:0,transform:`translate(${R(-.1,.15).toFixed(2)}em,1.5em) rotate(200deg)`}],700,250+i*170,DROP,el,true)}life=1300}}
 if(k==='shake'&&!multi){const echo=ghost(el,'lab-echo');echo.style.cssText='color:#b9aede;opacity:.32;transform:translate(.045em,-.028em)';if(animate){shiver(g,.055,700,0,el);tween(echo,[{opacity:0,transform:'none'},{opacity:.55,transform:'translate(.12em,-.05em)',offset:.4},{opacity:.32,transform:'translate(.045em,-.028em)'}],900,0,'ease-out',el);life=900}}
 if(k==='disgust'){const n=full?7:4,fx=[];for(let i=0;i<n;i++){const s=i?R(.16,.4):.62,o=R(.6,.95);fx.push([mark(el,'lab-fox',`left:${R(45,112).toFixed(0)}%;top:${R(.45,1.2).toFixed(2)}em;width:${s.toFixed(2)}em;height:${s.toFixed(2)}em;opacity:${o.toFixed(2)};clip-path:${pick(JAG)}`),o,i*230+R(0,150)])}
   if(animate){tween(g,[{transform:'none'},{transform:'rotate(-1.6deg) translateY(.02em)',offset:.25},{transform:'rotate(1.2deg)',offset:.6},{transform:'none'}],1500,0,'ease-in-out',el);fx.forEach(([m,o,dl])=>tween(m,[{opacity:0,transform:'scale(.35)'},{opacity:o,transform:'none'}],1900,dl,'ease-out',el));life=1900}}
 if(k==='memory'){const patch=mark(el,'lab-aged');if(!multi){const echo=ghost(el,'lab-echo');echo.style.cssText='color:#c9a877;opacity:.2;transform:translate(-.12em,-.4em) scale(.92);transform-origin:0 50%';if(animate)tween(echo,[{opacity:0,transform:'translate(-.6em,-.4em) scale(.92)'},{opacity:.2,transform:'translate(-.12em,-.4em) scale(.92)'}],2200,0,'cubic-bezier(.2,.6,.3,1)',el)}if(animate){tween(patch,[{opacity:0},{opacity:1}],2200,0,'ease-out',el);life=2200}}
 if(k==='joy'){if(animate)tween(g,[{transform:'none'},{transform:'translateY(-.13em)',offset:.32},{transform:'translateY(.015em)',offset:.68},{transform:'none'}],850,0,SPRING,el);
   for(let i=0;i<(animate?7:2);i++){const stay=i<2,s=R(.1,.18),d=mark(el,'lab-gold',`left:${R(5,95).toFixed(0)}%;top:.35em;width:${s.toFixed(2)}em;height:${(s*.8).toFixed(2)}em;clip-path:${pick(JAG)}`),dx=R(-.9,.9),dy=stay?R(.62,.85):R(.3,.9),up=R(-1.4,-.8),end=`translate(${dx.toFixed(2)}em,${dy.toFixed(2)}em) rotate(340deg)`;
    d.style.transform=end;d.style.opacity='.85';
    if(animate)tween(d,[{opacity:0,transform:'none',easing:THROW},{opacity:1,offset:.12,easing:THROW},{opacity:1,transform:`translate(${(dx*.6).toFixed(2)}em,${up.toFixed(2)}em) rotate(150deg) scaleY(-1)`,offset:.42,easing:'cubic-bezier(.4,0,.8,.6)'},{opacity:.9,transform:`translate(${(dx*.9).toFixed(2)}em,${(up*.3).toFixed(2)}em) rotate(260deg)`,offset:.72},{opacity:stay?.85:0,transform:end+(stay?'':' scaleY(-1)')}],R(1500,2200),60+i*70,'linear',el,!stay)}if(animate)life=2900}
 if(k==='sleep'){const m=mark(el,'lab-breath');el.style.opacity='.68';if(g&&full)g.style.transform='translateY(.05em)';
   if(animate){tween(el,[{opacity:1},{opacity:.68}],2800,0,'ease-in-out',el);tween(g,[{transform:'none'},{transform:'translateY(.05em)'}],2800,0,'ease-in-out',el);tween(m,[{opacity:0,transform:'scaleX(.15)'},{opacity:1,transform:'scaleX(1)',offset:.32},{opacity:.5,transform:'scaleX(.4)',offset:.66},{opacity:.6,transform:'scaleX(.7)'}],3800,0,'ease-in-out',el);life=2800}}
 if(k==='ex'&&animate){tween(g,[{opacity:0,transform:'translateY(-.6em) scale(1.35)'},{opacity:1,transform:'none'}],200,0,'cubic-bezier(.6,0,1,.7)',el);const ring=mark(el,'lab-pressure');tween(ring,[{opacity:.7,transform:'scale(.15)'},{opacity:0,transform:'scale(1)'}],600,190,'ease-out',el,true);life=800}
 if(k==='q'&&g){g.style.transform=full?'translateY(-.05em) rotate(7deg)':'none';if(animate){tween(g,[{transform:'none'},{transform:'translateY(-.17em) rotate(17deg)',offset:.4},{transform:'translateY(-.02em) rotate(3deg)',offset:.72},{transform:'translateY(-.05em) rotate(7deg)'}],1100,0,SPRING,el);life=1100}}
 if(k==='dash'&&animate){g.style.transformOrigin='0 50%';tween(g,[{transform:'scaleX(0)',easing:'cubic-bezier(.6,0,1,.6)'},{transform:'scaleX(1.14)',offset:.7,easing:'ease-out'},{transform:'scaleX(1)'}],180,0,'linear',el);life=180}
 // The real glyph is uncovered a third at a time, so the dots are the font's own and nothing swaps at the end.
 if(k==='ellipsis'&&animate){const m=mark(el,'lab-wipe lab-ell','inset:0 -.02em');m.append(g);tween(m,[{transform:'translateX(-101%)'},{transform:'none'}],1200,0,'steps(3,end)',el);tween(g,[{transform:'translateX(101%)'},{transform:'none'}],1200,0,'steps(3,end)',el);life=1210}
 if(animate&&life){active++;peak=Math.max(peak,active);let released=false;el._labRelease=()=>{if(released)return;released=true;active--;delete el._labRelease};later(el._labRelease,life+30,el)}
 else if(!silent&&!motion.matches&&c.ready&&!full){qa('.lab-deco:not(.lab-glyph)',el).forEach(d=>tween(d,[{opacity:0},{opacity:getComputedStyle(d).opacity}],1200,0,'ease-out',el))}
 return true;
}
function wrap(p,groups){groups.forEach((g,i)=>g.forEach(w=>{const b=brushes[i%3];w.style.setProperty('--lab-wash',/[.!?…][”"’)]*$/.test(g.map(x=>x.textContent).join(''))?taper:b.wash);w.style.setProperty('--lab-bristle',b.bristle);w.style.setProperty('--lab-rt',((i*13%33)/10-1.6)+'deg');w.style.setProperty('--lab-ty',((i*7%8)/100-.035)+'em')}))}
function whisper(el,silent=false){const c=C();if(!c.settings.ink||c.settings.emo==='off')return;el.classList.add('lab-whisper-seen');if(silent||!ex()||c.settings.pacer)return;
 const p=el.closest('.para');c.wrap(p);const words=qa('.w',el);words.forEach((w,i)=>tween(w,[{opacity:.12},{opacity:.7}],1000,Math.min(i*150,1500),'ease-out',el))}
function guideWord(g){if(!C().settings.ink||!ex())return;g.forEach(w=>{if(w.closest('.ink-whisper'))tween(w,[{opacity:.2},{opacity:.7}],Math.min(1000,60000/C().settings.wpm),0,'ease-out',w)})}
function guideLeave(g){later(()=>g.forEach(w=>w.classList.remove('fd')),2900,g[0])}
function resetFrom(P){C().paras.slice(P).forEach(p=>{qa('.lab-word',p).forEach(clearWord);qa('.lab-whisper-seen',p).forEach(e=>{stop(e);e.classList.remove('lab-whisper-seen')});qa('.w',p).forEach(w=>{stop(w);w.style.opacity='';w.classList.remove('fd')})})}
function endIntro(){if(headingObserver){headingObserver.disconnect();headingObserver=null}if(!intro)return;const i=intro;intro=null;stop(i);qa('.lab-intro-ornament,.lab-cap',i).forEach(n=>n.remove());qa('[data-lab-intro]',i).forEach(n=>{n.style.opacity='';n.style.transform='';n.removeAttribute('data-lab-intro')});qa('.lab-title-mask,.lab-cap',i).forEach(n=>n.remove());qa('.lab-title-hidden,.lab-intro-cap',i).forEach(n=>n.classList.remove('lab-title-hidden','lab-intro-cap'));i.removeEventListener('click',skipIntro,true)}
function skipIntro(e){e?.stopPropagation();endIntro()}
function introChapter(){const c=C();if(!enabled()||c.book.sectionLabel==='pages')return;const heading=q('.hd',c.body);if(!heading||heading.getBoundingClientRect().bottom<c.sc.getBoundingClientRect().top)return;
 headingObserver=new IntersectionObserver(es=>{if(!es.some(e=>e.isIntersecting))return;headingObserver.disconnect();headingObserver=null;
 const top=c.sc.getBoundingClientRect().top;if(heading.getBoundingClientRect().top<top-8)return; // a resumed passage must never scroll up for ceremony
 if(!ex()){tween(heading,[{opacity:.5},{opacity:1}],250);return}
 intro=c.body;intro.addEventListener('click',skipIntro,true);const hs=qa('.hd',c.body),p=c.paras[0];
 hs.slice(0,3).forEach((h,i)=>{h.dataset.labIntro='';if(!i){tween(h,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],800,0,'cubic-bezier(.2,.7,.2,1)',intro);return}
 const r=h.getBoundingClientRect(),lines=[];const walker=document.createTreeWalker(h,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const t=walker.currentNode;for(let k=0;k<t.length;k++){const range=document.createRange();range.setStart(t,k);range.setEnd(t,k+1);const box=range.getBoundingClientRect();if(!box.width)continue;let line=lines.find(l=>Math.abs(l.top-box.top)<2);if(!line){line={top:box.top,left:box.left,height:box.height,text:''};lines.push(line)}line.text+=t.nodeValue[k];line.left=Math.min(line.left,box.left)}}
 h.classList.add('lab-title-hidden');lines.forEach((line,j)=>{const mask=node(h,'lab-title-mask',`left:${line.left-r.left}px;top:${line.top-r.top}px;height:${line.height+3}px;`),glyph=node(mask,'lab-title-line');glyph.dataset.text=line.text;glyph.style.color=getComputedStyle(h).getPropertyValue('--txt');tween(glyph,[{transform:'translateY(108%)'},{transform:'none'}],850,700+(i-1+j)*140,'cubic-bezier(.2,.7,.2,1)',intro)});
 });
 const orn=node(heading,'lab-intro-ornament');orn.innerHTML='<i></i><b></b><i></i>';
 qa('i',orn).forEach(n=>tween(n,[{transform:'scaleX(0)'},{transform:'scaleX(1)'}],800,450,'cubic-bezier(.2,.7,.2,1)',intro));tween(q('b',orn),[{opacity:0,transform:'scale(.2)'},{opacity:1,transform:'scale(1)'}],500,300,'cubic-bezier(.3,1.5,.5,1)',intro);
 if(p){p.dataset.labIntro='';tween(p,[{opacity:0},{opacity:1}],1300,1750,'ease-out',intro);
 // Stamp a decorative first glyph; the original drop cap keeps its layout and text.
 if(c.settings.dc&&p.classList.contains('dcap')){const cs=getComputedStyle(p,'::first-letter'),pr=p.getBoundingClientRect(),br=c.body.getBoundingClientRect(),cap=node(c.body,'lab-cap');cap.dataset.text=p.textContent.trim()[0];cap.style.cssText=`left:${pr.left-br.left}px;top:${pr.top-br.top}px;color:${cs.color};font-size:${cs.fontSize};line-height:${cs.lineHeight};font-family:${cs.fontFamily};font-weight:700`;p.classList.add('lab-intro-cap');tween(cap,[{opacity:0,transform:'scale(1.5)'},{opacity:1,transform:'none'}],320,1550,'cubic-bezier(.6,0,1,.7)',intro)}}

 later(endIntro,3080,intro);
 },{root:c.sc,threshold:.3});headingObserver.observe(heading)}
function finishMoment(runDone=true){if(!moment)return;const m=moment;moment=null;stop(m.el);m.el.remove();m.resolve?.();if(runDone||m.kind==='bookmark')m.done?.();if(runDone&&m.kind==='turn')Promise.resolve().then(bookmark)}
function overlay(kind){finishMoment();const el=document.createElement('div');el.className='lab-moment lab-'+kind;el.setAttribute('role','dialog');el.setAttribute('aria-label',kind==='finish'?'Book completed':kind==='bookmark'?'Bookmark earned':'Opening book');el.tabIndex=0;C().app.append(el);const m={el,kind,skipped:false};moment=m;el.onclick=e=>{e.stopPropagation();if(kind==='finish'&&!m.settled){stop(el);qa('[data-final]',el).forEach(n=>{const v=JSON.parse(n.dataset.final);Object.assign(n.style,v)});m.settled=true;return}m.skipped=true;finishMoment()};return m}
function momentTween(m,n,f,d,delay=0,e='ease-out'){n.dataset.final=JSON.stringify(f[f.length-1]);return tween(n,f,d,delay,e,m.el)}
function cover(parent,book){const card=node(parent,'lab-cover');card.innerHTML=C().cover(book);return card}
function remember(id,el){if(el){const r=el.getBoundingClientRect();origin={id,left:r.left,top:r.top,width:r.width,height:r.height}}}
function beforeBook(meta,state){if(origin?.id!==meta.id)remember(meta.id,q(`[data-sh="${CSS.escape(meta.id)}"]`));cancelAll();if(state.labFinishedSeen===undefined&&(state.done?.[meta.spine.length-1]||state.max>=.985)){state.labFinishedSeen=true}
 opening=true;if(!enabled()||!ex())return;const m=overlay('opening'),el=m.el;
 const b=cover(el,meta);b.style.transformOrigin='50% 50%';const r=origin?.id===meta.id?origin:null,dx=r?r.left+r.width/2-innerWidth/2:0,dy=r?r.top+r.height/2-innerHeight/2:40,s=r?Math.min(r.height/260,1):.65;
 momentTween(m,b,[{transform:`translate(${dx}px,${dy}px) scale(${s})`},{transform:'translateX(42px)'}],600,0,'cubic-bezier(.2,.8,.2,1)');
 const paper=node(b,'lab-cover-paper lab-paper-wait');paper.textContent=meta.title;node(b,'lab-cover-back');const inside=node(b,'lab-cover-inside');momentTween(m,inside,[{opacity:0,transform:'scaleX(.12)'},{opacity:1,transform:'none'}],520,1090,'cubic-bezier(.2,.7,.3,1)');const face=q('.cov',b);if(face){face.style.transformOrigin='0 50%';momentTween(m,face,[{transform:'rotateY(0)'},{transform:'rotateY(-152deg)'}],950,650,'cubic-bezier(.45,0,.15,1)')}
 m.started=performance.now();
}
/* When the chapter has loaded, the opened book shows a small copy of the page the reader is about to land on,
   and the zoom ends with that copy lined up over the real page. */
function preview(m){const c=C(),paper=q('.lab-cover-paper',m.el);if(!paper||!c.body.firstElementChild)return;const top=c.sc.getBoundingClientRect().top;
 const first=[...c.body.children].find(n=>n.getBoundingClientRect().bottom>top+4)||c.body.firstElementChild,cs=getComputedStyle(c.body),w=c.body.clientWidth||innerWidth,page=document.createElement('div');
 page.className='lab-preview';page.style.cssText=`width:${w}px;font-family:${cs.fontFamily};font-size:${cs.fontSize};line-height:${cs.lineHeight};text-align:${cs.textAlign};padding:0 ${cs.paddingRight} 0 ${cs.paddingLeft};transform:scale(${(paper.clientWidth/w).toFixed(4)})`;
 // Printed, not mirrored: plain text set as a book page. No reading state (dimmed lines, guide marks, effects) is copied.
 for(let n=first,i=0;n&&i<22;n=n.nextElementSibling,i++){const t=n.textContent.trim();if(!t){if(n.matches('.orn,hr'))page.append(Object.assign(document.createElement('div'),{className:'lab-pv-orn'}));continue}
  const k=document.createElement(n.matches('.hd')?'div':'p');k.className=n.matches('.hd')?'lab-pv-h':'';k.textContent=t;page.append(k)}
 paper.classList.remove('lab-paper-wait');paper.textContent='';paper.append(page);m.pageTop=Math.max(top,first.getBoundingClientRect().top);m.paperW=paper.clientWidth}
async function bookReady(){if(!opening)return;opening=false;const m=moment;if(!m||m.kind!=='opening')return;preview(m);const wait=Math.max(0,1750-(performance.now()-m.started));await new Promise(resolve=>{m.resolve=resolve;later(()=>{if(moment!==m)return;const b=q('.lab-cover',m.el);const s=innerWidth/(m.paperW||167),tx=85*s-innerWidth/2,ty=(m.pageTop??innerHeight*.12)-(innerHeight/2-108*s);momentTween(m,b,[{opacity:1,transform:'translateX(42px)'},{opacity:1,offset:.72},{opacity:0,transform:`translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${s.toFixed(3)})`}],850,0,'cubic-bezier(.5,0,.3,1)');momentTween(m,m.el,[{opacity:1},{opacity:0}],400,560);later(finishMoment,980,m.el)},wait,m.el)})}
async function beforeSwap(from,to){turnDirection=Math.abs(to-from)===1?(to>from?1:-1):0;endIntro();if(opening||from<0){clearPage();return}finishMoment(false);clearPage();if(!enabled())return;
 const c=C(),adj=Math.abs(to-from)===1,dir=to>from?1:-1;
 if(!ex()||!adj){await new Promise(resolve=>{const a=tween(c.body,[{opacity:1},{opacity:.15}],130);a.finished.catch(()=>{}).then(resolve)});return}
 const m=overlay('turn');m.el.style.pointerEvents='auto';m.el.style.background='transparent';const edge=node(m.el,'lab-turn-edge');edge.style.transform=dir<0?'scaleX(-1)':'';
 momentTween(m,edge,[{opacity:0,transform:`translateX(${dir*innerWidth}px) scaleX(${dir})`},{opacity:1,transform:`translateX(${dir*innerWidth*.5}px) scaleX(${dir})`,offset:.5},{opacity:0,transform:`translateX(${-dir*100}px) scaleX(${dir})`}],620,50,'cubic-bezier(.45,0,.2,1)');
 tween(c.body,[{opacity:1,transform:'none'},{opacity:0,transform:`translateX(${-dir*16}px)`}],380,0,'cubic-bezier(.5,0,.8,.5)',m.el);
 await new Promise(resolve=>{m.resolve=resolve;later(()=>{m.resolve=null;resolve()},300,m.el)});
 if(moment===m)later(finishMoment,400,m.el);
}
function clearPage(){const keep=moment?.el;for(const j of [...jobs])if(j.owner!==keep){jobs.delete(j);j.a.cancel();j.el.style.willChange=''}for(const [id,o] of [...timers])if(o!==keep){clearTimeout(id);timers.delete(id)}C().paras.forEach(p=>qa('.lab-word',p).forEach(clearWord));active=0}
function afterChapter(){const c=C();prepare(c.body);c.body.style.opacity='';c.body.style.transform='';if(enabled()&&!opening){tween(c.body,[{opacity:.15,transform:ex()&&turnDirection?`translateX(${turnDirection*16}px)`:'none'},{opacity:1,transform:'none'}],ex()?500:180)}introChapter();bookReady().then(()=>bookmark())}
function completed(){const c=C();if(!c.book||c.state.labFinishedSeen||c.chapter!==c.book.spine.length-1||!c.state.done[c.chapter])return;c.state.labFinishedSeen=true;c.save();if(!enabled())return;
 endIntro();finishMoment();const m=overlay('finish'),el=m.el;const end=document.createElement('div');end.className='lab-finish-end';end.innerHTML='<div class="lab-intro-ornament"><i></i><b></b><i></i></div><em>The End</em>';el.append(end);
 const card=document.createElement('div');card.className='lab-finish-card';el.append(card);const b=cover(card,c.book),foil=node(b,'lab-foil'),ribbon=node(b,'lab-ribbon');const text=document.createElement('p');text.className='lab-finish-text';const n=Object.values(c.state.done).filter(Boolean).length,places=(c.state.places||[]).length;text.textContent=`${n} completed section${n===1?'':'s'} · ${places} saved place${places===1?'':'s'}`;const line=document.createElement('em');line.textContent='A story, kept with you.';text.prepend(line);card.append(text);const hint=document.createElement('small');hint.textContent='Tap to settle · tap again to return';hint.className='lab-moment-hint';el.append(hint);
 const scale=ex()?1:0;momentTween(m,q('b',end),[{opacity:0,transform:'scale(.2)'},{opacity:1,transform:'scale(1)'}],500*scale,500*scale);qa('i',end).forEach(i=>momentTween(m,i,[{transform:'scaleX(0)'},{transform:'scaleX(1)'}],900*scale,650*scale));momentTween(m,q('em',end),[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],1000*scale,1100*scale);momentTween(m,end,[{opacity:1},{opacity:0}],900*scale,2700*scale);
 momentTween(m,card,[{opacity:0},{opacity:1}],200*scale,3300*scale);momentTween(m,b,[{opacity:0,transform:'translateY(34px) scale(.94)'},{opacity:1,transform:'none'}],900*scale,3300*scale);momentTween(m,foil,[{opacity:0,transform:'translateX(-190px) skewX(-18deg)'},{opacity:.6,transform:'translateX(0) skewX(-18deg)',offset:.5},{opacity:0,transform:'translateX(190px) skewX(-18deg)'}],1100*scale,4200*scale);momentTween(m,ribbon,[{transform:'scaleY(0)'},{transform:'scaleY(1)'}],700*scale,4400*scale,'cubic-bezier(.3,1.3,.5,1)');momentTween(m,text,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],1000*scale,4900*scale);later(()=>m.settled=true,5900*scale,el);m.done=()=>{c.close()};
}
function bookmark(){const c=C();if(!c.book||!c.state.reveal||moment||opening)return;const id=c.book.id,k=c.state.reveal,b=c.bookmarks[k-1];const commit=()=>{const now=C();if(now.book?.id!==id)return;now.state.bm=k;if(now.state.reveal===k)now.state.reveal=null;now.save();now.hang();now.renderBM();q('#bmHang').style.opacity=''};
 if(!enabled()){commit();return}const m=overlay('bookmark');m.el.style.background='transparent';const swing=node(m.el,'lab-bm-swing'),rb=node(swing,'lab-bm-ribbon');rb.innerHTML=b.svg;const glint=node(rb,'lab-bm-glint');const label=document.createElement('div');label.className='lab-bm-label';const title=document.createElement('b');title.textContent=b.n;label.append(title,document.createTextNode('Earned at '+c.bookmarkLabel(k)));m.el.append(label);const s=ex()?1:0;
 momentTween(m,rb,[{transform:'scaleY(0)'},{transform:'scaleY(1)'}],700*s,300*s,'cubic-bezier(.3,1.25,.5,1)');momentTween(m,swing,[0,6,-4.2,2.6,-1.4,.6,0].map(v=>({transform:`rotate(${v}deg)`})),2600*s,750*s,'ease-in-out');momentTween(m,glint,[{opacity:0,transform:'translateY(-40px) skewY(-20deg)'},{opacity:.5,transform:'translateY(50px) skewY(-20deg)',offset:.5},{opacity:0,transform:'translateY(200px) skewY(-20deg)'}],1000*s,1200*s);momentTween(m,label,[{opacity:0,transform:s?'translateX(10px)':'none'},{opacity:1,transform:'none'}],s?1000:250,1300*s);m.done=commit;later(finishMoment,s?3600:1100,m.el)
}
function cancelAll(){endIntro();finishMoment(false);C().paras.forEach(p=>qa('.lab-word',p).forEach(clearWord));stop();active=0;opening=false;}
function settings(){if(!ctx)return;endIntro();finishMoment(false);resetFrom(0);prepare(C().body);qa('.lab-word.play',C().body).forEach(el=>word(el,true));C().app.classList.toggle('lab-reduced',motion.matches)}
function navigation(){if(opening)return;endIntro();finishMoment(false);clearPage();C().body.style.opacity='';C().body.style.transform='';qa('.lab-word.play',C().body).forEach(el=>word(el,true))}
window.MotionLab={navigation,loadFailed(){opening=false;endIntro();finishMoment(false)},bind(fn){ctx=fn;motion.addEventListener('change',settings);settings()},prepare,word,whisper,wrap,guideWord,guideLeave,resetFrom,remember,beforeBook,beforeSwap,afterChapter,completed,bookmark,cancelAll,settings,
 back(){if(moment){const kind=moment.kind;finishMoment();if(kind==='opening')C().close();return true}if(intro){endIntro();return true}return false},
 stats(){return{active,peak,animations:jobs.size,timers:timers.size,moment:moment?.kind||null,opening}}};
})();
