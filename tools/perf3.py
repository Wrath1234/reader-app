import sys,time,json,subprocess
SP='/private/tmp/claude-501/-Users-vanity-claude/c87d05da-3f29-4c54-8da1-a318602ecf37/scratchpad'
sys.path.insert(0,SP)
import cdp
s=cdp.connect(); ev=lambda e:cdp.ev(s,e)
shot=lambda n:subprocess.run(cdp.ADB+" exec-out screencap -p > "+SP+"/"+n+".png",shell=True)
OPEN="(async()=>{const l=JSON.parse(Android.listBooks());const b=l.find(x=>/%s/i.test(x.title));if(book)closeBook();await openBook(b.id);await new Promise(r=>setTimeout(r,1600));return 'paras '+paras.length})()"
print('trigger book:',ev(OPEN%'Trigger'))
ev("(()=>{pcJump(paras[4],null);const r=paras[4].getBoundingClientRect();sc.scrollTop+=r.top-260;ST.wpm=300;return 1})()")
time.sleep(.6); ev("pcRun();1")
print('dense test paragraph, 300 wpm :',cdp.gfx(5)); shot('g1')
ev("pcStop();1")
print('novel:',ev(OPEN%'Darkness'))
ev("(()=>{ST.wpm=220;pcRun();return 1})()")
print('novel, 220 wpm               :',cdp.gfx(8)); shot('g2')
ev("pcStop();1")
print(ev("JSON.stringify({pc:st.pc,px:document.querySelectorAll('#body .px').length,played:document.querySelectorAll('#body .fx.play').length,sentQ:document.querySelectorAll('#body .sn-q').length,sentEx:document.querySelectorAll('#body .sn-ex').length,emo:document.querySelectorAll('#body .emo').length,paras:paras.length})"))
ev("(()=>{saveST();return 1})()")
