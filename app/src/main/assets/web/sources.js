'use strict';

let SOURCE_LIST=[];
const pendingSources=new Map();let sourceRequestId=0,discoverySeq=0,currentNovel=null;
function requestSource(data){
  return new Promise((resolve,reject)=>{
    if(!A||!A.sourceRequest){reject({error:'Online sources work inside the Android app.'});return}
    const id=String(++sourceRequestId),timer=setTimeout(()=>{pendingSources.delete(id);reject({error:'The source took too long. Please try again.'})},120000);
    pendingSources.set(id,{resolve,reject,timer});
    try{A.sourceRequest(id,JSON.stringify(data))}catch(e){clearTimeout(timer);pendingSources.delete(id);reject({error:e.message})}
  });
}
window.__sourceResult=(id,result)=>{const p=pendingSources.get(id);if(!p)return;clearTimeout(p.timer);pendingSources.delete(id);if(result.error)p.reject(result);else p.resolve(result.data)};
window.__sourceConnected=()=>toast('Connection saved. Try the source again.');

function sourceError(box,error,source,retry){
  box.replaceChildren();const p=document.createElement('p');p.className='source-message';p.textContent=error.error||error.message||'This source could not be reached.';box.appendChild(p);
  if(retry){const button=document.createElement('button');button.className='btn sm';button.textContent='Retry';button.onclick=retry;box.appendChild(button)}
  if(source){const button=document.createElement('button');button.className='btn sm';button.textContent='Connect to '+source.name;button.onclick=()=>A&&A.connectSource(source.id);box.appendChild(button)}
}
function closeDiscovery(){++discoverySeq;$('#discover').classList.add('hidden');currentNovel=null;$('#novelDetails').classList.add('hidden');$('#sourceSearch').classList.remove('hidden');$('#sourceResults').classList.remove('hidden')}
function backDiscovery(){if(currentNovel){if(/^https?:\/\//i.test($('#sourceQuery').value))$('#sourceQuery').value='';searchSources()}else closeDiscovery()}
$('#discoverClose').onclick=backDiscovery;
$('#discoverBtn').onclick=()=>{
  $('#discover').classList.remove('hidden');
  searchSources();
};
$('#sourceSearch').onsubmit=e=>{e.preventDefault();searchSources()};
$('#sourceSelect').onchange=()=>{save('sourceFilter',$('#sourceSelect').value);searchSources()};
const sourcesReady=requestSource({op:'sources'}).then(data=>{
  SOURCE_LIST=data.sources.map(source=>({...source,host:new URL(source.url).hostname}));
  const select=$('#sourceSelect');select.replaceChildren(new Option('All sources','all'));
  for(const source of SOURCE_LIST)select.add(new Option(source.name,source.id));
  const selected=load('sourceFilter','all');select.value=selected==='all'||SOURCE_LIST.some(s=>s.id===selected)?selected:'all';
}).catch(error=>sourceError($('#sourceResults'),error));

async function searchSources(){
  const seq=++discoverySeq;await sourcesReady;if(seq!==discoverySeq)return;
  const query=$('#sourceQuery').value.trim(),filter=$('#sourceSelect').value;
  currentNovel=null;$('#novelDetails').classList.add('hidden');$('#sourceResults').classList.remove('hidden');$('#sourceSearch').classList.remove('hidden');
  $('#sourceResults').replaceChildren();
  if(/^https?:\/\//i.test(query)){
    let url;try{url=new URL(query)}catch(e){toast('Enter a valid novel link');return}
    const source=SOURCE_LIST.find(s=>url.hostname===s.host||url.hostname==='www.'+s.host);
    if(!source){toast('Use a link from one of the supported sources');return}
    showNovel(source,query);return;
  }
  const sources=SOURCE_LIST.filter(s=>filter==='all'||s.id===filter);
  for(const source of sources){
    const section=document.createElement('section');section.className='source-section';
    const head=document.createElement('div');head.className='source-section-head';
    const title=document.createElement('h2');title.textContent=source.name;
    const connect=document.createElement('button');connect.className='source-link';connect.textContent='Connect';connect.onclick=()=>A&&A.connectSource(source.id);
    head.append(title,connect);section.appendChild(head);const list=document.createElement('div');section.appendChild(list);$('#sourceResults').appendChild(section);
    const state={page:0,seen:new Set()};
    const more=document.createElement('button');more.className='btn sm';more.textContent='Load more';more.hidden=true;section.appendChild(more);
    const loadPage=async()=>{
      more.disabled=true;const status=document.createElement('div');status.className='source-message';status.textContent='Looking for stories…';section.insertBefore(status,more);
      try{
        const data=await requestSource({op:'catalog',source:source.id,query,page:state.page+1});if(seq!==discoverySeq)return;
        status.remove();state.page++;let added=0;
        for(const card of data.items){if(state.seen.has(card.url))continue;state.seen.add(card.url);added++;
          const row=document.createElement('button');row.className='source-result';
          const title=document.createElement('b');title.textContent=card.title;const subtitle=document.createElement('span');subtitle.textContent='View novel and chapters';row.append(title,subtitle);
          row.onclick=()=>showNovel(source,card.url);list.appendChild(row);
        }
        if(!state.seen.size)list.innerHTML='<p class="source-message">No novels found. Try another title.</p>';
        more.hidden=!data.hasMore||!added;more.disabled=false;
      }catch(error){if(seq!==discoverySeq)return;status.remove();more.hidden=true;const errorBox=document.createElement('div');section.insertBefore(errorBox,more);sourceError(errorBox,error,source,()=>{errorBox.remove();loadPage()})}
    };
    more.onclick=loadPage;loadPage();
  }
}

async function showNovel(source,url){
  const seq=++discoverySeq;currentNovel={source,url};
  $('#sourceSearch').classList.add('hidden');$('#sourceResults').classList.add('hidden');const box=$('#novelDetails');box.classList.remove('hidden');box.innerHTML='<p class="source-message">Opening novel…</p>';
  try{
    const novel=await requestSource({op:'details',source:source.id,url});if(seq!==discoverySeq)return;
    currentNovel={source,url,novel};
    box.innerHTML=`${novel.coverUrl?'<img class="novel-cover" alt="" src="/online/image?source='+source.id+'&amp;url='+encodeURIComponent(novel.coverUrl)+'" onerror="this.remove()">':''}<p class="novel-source">${esc(source.name)}</p><h2 class="novel-title">${esc(novel.title)}</h2><p class="source-message">${esc([novel.author,novel.status,novel.spine.length+' '+(novel.sectionLabel||'chapters')].filter(Boolean).join(' · '))}</p>${novel.tags&&novel.tags.length?'<p class="source-message">'+esc(novel.tags.join(', '))+'</p>':''}<p class="novel-description">${esc(novel.description||'No description supplied.')}</p><div class="novel-actions"><button class="btn pri" id="novelRead">Read</button><button class="btn" id="novelAdd">Add to library</button></div><h3>${novel.sectionLabel==='pages'?'Pages':'Chapters'}</h3><label class="source-message" for="chapterFilter">Find a ${novel.sectionLabel==='pages'?'page':'chapter'}</label><input id="chapterFilter" type="search" placeholder="${novel.sectionLabel==='pages'?'Page':'Chapter'} number or title"><div id="novelChapterList"></div><button class="btn sm" id="moreNovelChapters">Show more ${novel.sectionLabel||'chapters'}</button>`;
    const add=async(read,href)=>{
      const buttons=$$('#novelDetails button');buttons.forEach(b=>b.disabled=true);
      try{const saved=await requestSource({op:'add',source:source.id,url});renderLib();if(seq!==discoverySeq)return;if(read){closeDiscovery();await openBook(saved.id,href)}else{toast('Added to your library');$('#novelAdd').textContent='In your library'}}
      catch(error){toast(error.error||'Could not add the novel')}
      finally{buttons.forEach(b=>b.disabled=false)}
    };
    $('#novelRead').onclick=()=>add(true);$('#novelAdd').onclick=()=>add(false);
    let limit=60;
    const chapters=()=>{
      const query=$('#chapterFilter').value.trim().toLowerCase(),matches=novel.toc.filter(c=>c.title.toLowerCase().includes(query));
      const list=$('#novelChapterList');list.replaceChildren();
      for(const chapter of matches.slice(0,limit)){const button=document.createElement('button');button.className='source-chapter';button.textContent=chapter.title;button.onclick=()=>add(true,chapter.href);list.appendChild(button)}
      if(!matches.length)list.innerHTML='<p class="source-message">No matching chapters.</p>';
      $('#moreNovelChapters').hidden=matches.length<=limit;
    };
    $('#chapterFilter').oninput=()=>{limit=60;chapters()};$('#moreNovelChapters').onclick=()=>{limit+=100;chapters()};chapters();
  }catch(error){if(seq===discoverySeq)sourceError(box,error,source,()=>showNovel(source,url))}
}

/** Chapter URLs, not changing chapter numbers, keep state attached to the story. */
function remapOnlineState(state,hrefs){
  const previous=state.hrefs;
  if(previous){
    const indices=new Map(hrefs.map((href,i)=>[href,i]));
    const index=old=>indices.get(previous[old]);
    state.ch=index(state.ch)??0;
    for(const key of ['ticks','reach','done']){const mapped={};for(const [old,value] of Object.entries(state[key]||{})){const at=index(+old);if(at!==undefined)mapped[at]=value}state[key]=mapped}
    for(const key of ['pos','pc'])if(state[key]){const at=index(state[key].ch);if(at===undefined)state[key]=null;else state[key].ch=at}
  }
  state.hrefs=hrefs;
}
function renderSavedPlaces(){
  const box=$('#savedPlaces');box.replaceChildren();if(!book||!st)return;
  for(const place of st.places||[]){
    const row=document.createElement('div');row.className='saved-place';
    const go=document.createElement('button');go.className='source-chapter';go.textContent=place.title;
    go.onclick=()=>{const idx=book.spineIdx[place.href];if(idx===undefined){toast('This chapter is no longer available');return}savePosNow();st.pos={...place.pos,ch:idx};closeSheets();loadChapter(idx,{restore:true,place:st.pos})};
    const remove=document.createElement('button');remove.className='source-link';remove.textContent='Remove';remove.onclick=()=>{st.places=st.places.filter(p=>p.id!==place.id);saveSt();renderSavedPlaces()};row.append(go,remove);box.appendChild(row);
  }
}
$('#savePlaceBtn').onclick=()=>{if(!book||ch<0||!paras.length)return;const pos=capturePos(),href=book.spine[ch].href;st.places=st.places||[];
  if(st.places.some(p=>p.href===href&&p.pos.i===pos.i)){toast('This place is already saved');return}
  st.places.push({id:Date.now(),href,pos,title:(tocTitle(ch)||'Section '+(ch+1))+' · paragraph '+((pos.i||0)+1)});saveSt();renderSavedPlaces();toast('Place saved')};
$('#refreshChaptersBtn').onclick=async()=>{
  if(!book||!book.online)return;const id=book.id,button=$('#refreshChaptersBtn');button.disabled=true;savePosNow();
  try{await requestSource({op:'refresh',id});if(book&&book.id===id){closeSheets();await openBook(id);toast(book.sectionLabel==='pages'?'Page list updated':'Chapter list updated')}}catch(error){toast(error.error||'Could not refresh chapters')}finally{button.disabled=false}
};
