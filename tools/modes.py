import sys,time
SP='/private/tmp/claude-501/-Users-vanity-claude/c87d05da-3f29-4c54-8da1-a318602ecf37/scratchpad'
sys.path.insert(0,SP)
import cdp
s=cdp.connect(); ev=lambda e:cdp.ev(s,e)
ev("(async()=>{const l=JSON.parse(Android.listBooks());const b=l.find(x=>/Trigger/i.test(x.title));if(book)closeBook();await openBook(b.id);await new Promise(r=>setTimeout(r,1500));return 1})()")
def run(mode):
    ev("(()=>{ST.emo='%s';applySettings();pcJump(paras[4],null);const r=paras[4].getBoundingClientRect();sc.scrollTop+=r.top-260;ST.wpm=350;pcRun();return 1})()"%mode)
    time.sleep(4.5)
    r=ev("JSON.stringify({mode:ST.emo,cls:[...app.classList].filter(c=>c.startsWith('ei-')),particles:document.querySelectorAll('#body .px').length,played:document.querySelectorAll('#body .fx.play').length,tint:getComputedStyle(document.querySelector('#body .emo-fire.play')||document.body).color})")
    ev("pcStop();1"); print(r)
for m in ['subtle','expressive','off']: run(m)
ev("(()=>{ST.emo='subtle';applySettings();saveST();ST.wpm=220;saveST();return 1})()")
print(cdp.gfx(2))
