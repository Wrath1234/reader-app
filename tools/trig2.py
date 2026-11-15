import sys,time,json,subprocess,os
SP='/private/tmp/claude-501/-Users-vanity-claude/c87d05da-3f29-4c54-8da1-a318602ecf37/scratchpad'
sys.path.insert(0,SP)
import cdp
s=cdp.connect(); ev=lambda e:cdp.ev(s,e)
r=ev("""(()=>{return JSON.stringify(paras.map((p,i)=>({i,
  tagged:[...p.querySelectorAll('.emo')].map(e=>e.firstChild.textContent+'>'+[...e.classList].find(c=>c.startsWith('emo-')).slice(4)).join(', '),
  marks:p.querySelectorAll('.pm').length,
  dlg:[...p.querySelectorAll('.dlg')].map(d=>d.className.replace(/ ?dlg$/,'').replace('ink-in','').trim()||'plain').join('|'),
  plainWords:p.textContent.split(/[^A-Za-z']+/).filter(w=>w.length>4&&![...p.querySelectorAll('.emo')].some(e=>e.textContent.includes(w))).join(' ').slice(0,260)})))})()""")
for p in json.loads(r):
    print(p['i'],'| TAGGED:',p['tagged'],'| marks',p['marks'],'| dlg:',p['dlg']); print('    untagged:',p['plainWords'])
# visual: run the guide through paragraphs 1-3 quickly and capture
ev("(()=>{sc.scrollTop=0;pcJump(paras[1],null);ST.wpm=420;pcRun();return 1})()")
time.sleep(5.5)
subprocess.run(cdp.ADB+" exec-out screencap -p > "+SP+"/u1.png",shell=True)
time.sleep(5)
subprocess.run(cdp.ADB+" exec-out screencap -p > "+SP+"/u2.png",shell=True)
ev("(()=>{pcStop();ST.wpm=220;saveST();return 1})()")
print('pc',ev("JSON.stringify(st.pc)"))
