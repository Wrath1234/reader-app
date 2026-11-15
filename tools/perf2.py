import sys,time,json
sys.path.insert(0,'/private/tmp/claude-501/-Users-vanity-claude/c87d05da-3f29-4c54-8da1-a318602ecf37/scratchpad')
import cdp
s=cdp.connect(); ev=lambda e:cdp.ev(s,e)
print('open:',ev("(async()=>{if(!book){const l=JSON.parse(Android.listBooks());const b=l.find(x=>/Darkness/.test(x.title))||l[0];await openBook(b.id);await new Promise(r=>setTimeout(r,1800))}return 'paras '+paras.length+' ch '+ch+' pc '+JSON.stringify(st.pc)})()"))
print('idle           ',cdp.gfx(3))
ev("pcRun();1"); print('guide running  ',cdp.gfx(6)); ev("pcStop();1")
print('after run:',ev("JSON.stringify({pc:st.pc,played:document.querySelectorAll('#body .fx.play').length,pw:document.querySelectorAll('.w.pw').length,fd:document.querySelectorAll('.w.fd').length,glyphs:document.querySelectorAll('img.glyph').length})"))
print('timer jitter:',ev("(async()=>{const g=[];let last=performance.now();pcRun();const t=setInterval(()=>{const now=performance.now();g.push(now-last);last=now},16);await new Promise(r=>setTimeout(r,5000));clearInterval(t);pcStop();g.sort((a,b)=>a-b);return 'p50 '+g[g.length>>1].toFixed(1)+'ms p99 '+g[Math.floor(g.length*.99)].toFixed(1)+'ms max '+g[g.length-1].toFixed(1)+'ms'})()"))
