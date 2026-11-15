import sys,time,json,subprocess
SP='/private/tmp/claude-501/-Users-vanity-claude/c87d05da-3f29-4c54-8da1-a318602ecf37/scratchpad'
sys.path.insert(0,SP)
import cdp
s=cdp.connect(); ev=lambda e:cdp.ev(s,e)
shot=lambda n:subprocess.run(cdp.ADB+" exec-out screencap -p > "+SP+"/"+n+".png",shell=True)
print(ev("""(async()=>{
 const l=JSON.parse(Android.listBooks());const b=l.find(x=>/Trigger/i.test(x.title));if(book)closeBook();await openBook(b.id);await new Promise(r=>setTimeout(r,1500));
 const cnt=q=>document.querySelectorAll('#body '+q).length;const cats={};document.querySelectorAll('#body .emo').forEach(e=>{const k=[...e.classList].find(c=>c.startsWith('emo-')).slice(4);cats[k]=(cats[k]||0)+1});
 return JSON.stringify({emo:cnt('.emo'),families:Object.keys(cats).length,sentQ:cnt('.sn-q'),sentEx:cnt('.sn-ex'),xf:app.classList.contains('xf'),emoMode:ST.emo,qfont:getComputedStyle(app).getPropertyValue('--qfont')})})()"""))
# fire paragraph (index 4): run the guide and capture mid-effect
ev("(()=>{pcJump(paras[4],null);const r=paras[4].getBoundingClientRect();sc.scrollTop+=r.top-260;ST.wpm=300;return 1})()")
time.sleep(.6); ev("pcRun();1")
time.sleep(3.2); shot('f1'); time.sleep(3.0); shot('f2')
print('running',cdp.gfx(4))
ev("pcStop();1"); time.sleep(.5); shot('f3')
print(ev("JSON.stringify({pc:st.pc,px:document.querySelectorAll('#body .px').length,played:document.querySelectorAll('#body .fx.play').length})"))
# jump back: marks on the page should be cleared
print(ev("(()=>{pcJump(paras[1],null);return JSON.stringify({px:document.querySelectorAll('#body .px').length,played:document.querySelectorAll('#body .fx.play').length})})()"))
ev("(()=>{ST.wpm=220;saveST();return 1})()")
