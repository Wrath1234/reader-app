import sys,time,json
sys.path.insert(0,'/private/tmp/claude-501/-Users-vanity-claude/c87d05da-3f29-4c54-8da1-a318602ecf37/scratchpad')
import cdp
s=cdp.connect(); ev=lambda e:cdp.ev(s,e)
print(ev("""(async()=>{
 if(book)closeBook();
 const l=JSON.parse(Android.listBooks());const b=l.find(x=>/Trigger/i.test(x.title));if(!b)return 'no trigger book';
 await openBook(b.id);await new Promise(r=>setTimeout(r,1500));
 const out={sections:book.spine.length,toc:(book.toc||[]).map(t=>t.title).slice(0,30)};
 const all={},miss={};let paraN=0,emoN=0,dl={};
 for(let i=0;i<book.spine.length;i++){await loadChapter(i);await new Promise(r=>setTimeout(r,250));paraN+=paras.length;
   document.querySelectorAll('#body .emo').forEach(e=>{const k=[...e.classList].find(c=>c.startsWith('emo-')).slice(4);all[k]=(all[k]||0)+1;emoN++});
   ['dlg-angry','ink-shout','ink-whisper','dlg-cry','dlg-fear','dlg-joy','dlg-sad'].forEach(c=>{const n=document.querySelectorAll('#body .'+c).length;if(n)dl[c]=(dl[c]||0)+n});
   // words in short list-like paragraphs that got no animation
   paras.forEach(p=>{const t=p.textContent.trim();if(t.length<=60&&!p.querySelector('.emo'))t.split(/[^A-Za-z']+/).forEach(w=>{if(w.length>3){const k=w.toLowerCase();miss[k]=(miss[k]||0)+1}})});
 }
 out.paras=paraN;out.emo=emoN;out.cats=all;out.dialogue=dl;
 out.sample=[...document.querySelectorAll('#body p.para')].slice(0,6).map(p=>p.textContent.slice(0,90));
 out.untagged=Object.entries(miss).sort((a,b)=>b[1]-a[1]).slice(0,120).map(x=>x[0]).join(' ');
 return JSON.stringify(out)})()"""))
