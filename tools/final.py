import sys,time,json
SP='/private/tmp/claude-501/-Users-vanity-claude/c87d05da-3f29-4c54-8da1-a318602ecf37/scratchpad'
sys.path.insert(0,SP)
import cdp
s=cdp.connect(); ev=lambda e:cdp.ev(s,e)
print(ev("""(async()=>{
 const l=JSON.parse(Android.listBooks());const b=l.find(x=>/Trigger/i.test(x.title));if(book)closeBook();await openBook(b.id);await new Promise(r=>setTimeout(r,1500));
 const cnt=q=>document.querySelectorAll('#body '+q).length;const o={emo:cnt('.emo'),marks:cnt('.pm'),perPara:paras.map(p=>p.querySelectorAll('.emo').length)};
 // run the guide through two paragraphs
 sc.scrollTop=0;pcJump(paras[1],null);ST.wpm=600;pcRun();await new Promise(r=>setTimeout(r,9000));pcStop();
 o.afterRun={pc:st.pc,played:cnt('.fx.play'),inkIn:cnt('.ink-in'),pread:cnt('p.pread')};
 // press-and-hold in a gap between two words of an earlier paragraph: should snap to the nearest word and reset later effects
 const p=paras[1];wrapWords(p);const a=p._w[5][0].getBoundingClientRect(),b2=p._w[6][0].getBoundingClientRect();
 sc.scrollTop+=a.top-300;await new Promise(r=>setTimeout(r,400));const a2=p._w[5][0].getBoundingClientRect();
 lpGo(a2.right+1,a2.top+a2.height/2);
 o.afterJumpBack={pc:st.pc,played:cnt('.fx.play'),inkIn:cnt('.ink-in'),pread:cnt('p.pread'),pw:cnt('.w.pw')};
 ST.wpm=220;saveST();return JSON.stringify(o)})()"""))
print('idle   ',cdp.gfx(3))
