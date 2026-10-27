import { createContext } from './core.js';
import { loadEdition } from './data.js';
import { newLife, stepYear, invokeDecision, invokeReflection, buyItem, canBuy, getShopCost, getLifeArchetype, getOutlivedPercentile, ACHIEVEMENTS, FOCUS_OPTIONS } from './simulation.js';
import { createStorage } from './storage.js';
import { word, escapeHtml, money, renderBirth, renderStats, renderPlayerInfo, renderPeers, renderStory, renderAchievements, renderEnding, renderPastLives } from './ui.js';
import { renderLifeScene } from '../render/pipeline.js';
import { renderWorldMap } from '../render/map.js';

const SCREENS=['screen-landing','screen-ceremony','screen-game','screen-ending','screen-library'];
const CONTROLS=['btn-start','btn-begin','btn-reroll','btn-birth-back','btn-resume','btn-past','btn-achievements','btn-next-year','btn-next-decision','btn-auto','btn-shop','btn-log','btn-game-achievements','btn-save-menu','btn-restart','btn-ending-log','btn-copy-share','btn-library-back','btn-clear-history','btn-random-era'];
const BUTTON_WORDS={'btn-start':'start','btn-begin':'begin','btn-reroll':'reroll','btn-birth-back':'back','btn-resume':'resume','btn-past':'past','btn-achievements':'achievements','btn-next-year':'next','btn-next-decision':'nextDecision','btn-auto':'auto','btn-shop':'shop','btn-log':'fullLog','btn-game-achievements':'achievements','btn-save-menu':'save','btn-restart':'start','btn-ending-log':'fullLog','btn-copy-share':'copy','btn-library-back':'back','btn-clear-history':'clear','btn-random-era':'random','label-language':'language','label-seed':'seed'};
const e=escapeHtml;
const regions={ssa:'Africa',mena:'MENA',sa:'Asia',eap:'Asia',eca:'Europe',lac:'Americas',hi:'Europe'};
const REGION_COUNTRIES={USA:'Americas',CAN:'Americas',AUS:'Oceania',NZL:'Oceania',JPN:'Asia',KOR:'Asia',SGP:'Asia',ISR:'MENA'};

export function createGameApp(options={}) {
 const document=options.document??globalThis.document,window=options.window??globalThis.window,fetchImpl=options.fetchImpl??globalThis.fetch,navigator=options.navigator??globalThis.navigator,year=options.year??2026;
 let storage=options.storage; if(storage===undefined){try{storage=globalThis.localStorage;}catch{storage=null;}}
 let ctx=createContext({countries:[]},{year}),store=null,data=null,map=null,player=null,screen='screen-landing',returnScreen=screen,libraryKind=null,ready=false,initialization=null,destroyed=false,busy=false,candidate=false,autoTimer=null,modalToken=0,counterTimer=null,startedAt=Date.now(),bound=false,hasSaved=false;
 const el=id=>document?.getElementById(id);
 const setText=(id,value)=>{if(el(id))el(id).textContent=value;};
 const html=(id,value)=>{if(el(id))el(id).innerHTML=value;};
 const on=(id,fn)=>{if(el(id))el(id).onclick=fn;};
 const later=fn=>(window?.setTimeout??globalThis.setTimeout)(fn,450);
 const cancel=id=>(window?.clearTimeout??globalThis.clearTimeout)(id);
 const local=(en,ja,zh)=>ctx.l(en,ja,zh);
 function show(next){screen=next;for(const id of SCREENS){const node=el(id);if(node){node.classList.remove('active');if(id===next)node.classList.add('active');}}if(next!=='screen-game')clearModal();updateControls();}
 function pause(){if(autoTimer!==null){cancel(autoTimer);autoTimer=null;}setText('btn-auto',word(ctx,'auto'));}
 function clearModal(){modalToken++;html('event-layer','');}
 function updateControls(){
  for(const id of CONTROLS)if(el(id))el(id).disabled=!ready;
  const pending=!!(player?.pendingDecision||player?.pendingReflection),active=ready&&screen==='screen-game'&&player?.alive&&!candidate;
  for(const id of ['btn-next-year','btn-next-decision','btn-auto'])if(el(id))el(id).disabled=!active||pending||busy;
  for(const id of ['btn-shop','btn-save-menu'])if(el(id))el(id).disabled=!active;
  if(el('btn-begin'))el('btn-begin').disabled=!ready||!candidate||!player||busy;
  if(el('btn-reroll'))el('btn-reroll').disabled=!ready||busy;
  if(el('btn-resume'))el('btn-resume').disabled=!ready||!hasSaved;
  for(const id of ['language-select','seed-input','year-slider'])if(el(id))el(id).disabled=!ready;
 }
 function labels(){
  for(const [id,key] of Object.entries(BUTTON_WORDS))setText(id,word(ctx,key));
  setText('source-note',word(ctx,'sourceNote'));
  if(el('language-select'))el('language-select').value=ctx.lang;
  if(el('seed-input'))el('seed-input').placeholder=local('Random','ランダム','随机');
  if(document?.documentElement)document.documentElement.lang=ctx.lang==='zh'?'zh-CN':ctx.lang;
  setText('btn-auto',word(ctx,autoTimer!==null?'pause':'auto'));
  const subtitle=document?.querySelector?.('#screen-landing .hero > p');
  if(subtitle)subtitle.textContent=local('Be born somewhere on Earth and discover the life ahead of you.','地球のどこかに生まれ、あなたを待つ人生をたどります。','随机出生在地球上的某处，体验你将经历的一生。');
  const birthHeading=el('screen-ceremony')?.querySelector('h2'),endingHeading=el('screen-ending')?.querySelector('h1');
  if(birthHeading)birthHeading.textContent=word(ctx,'birthTitle');
  if(endingHeading)endingHeading.textContent=word(ctx,'endingTitle');
  const yearLabel=document?.querySelector?.('.year-label');
  if(yearLabel?.firstChild)yearLabel.firstChild.textContent=word(ctx,'year')+': ';
 }
 function drawMap(){const canvas=el('world-map');if(canvas&&map&&globalThis.document){try{renderWorldMap(canvas,map,player?.country?.id);}catch{/* Narrative remains usable when canvas is unavailable. */}}}
 function drawScene(){const canvas=el('scene-canvas');if(canvas&&globalThis.document&&player){try{renderLifeScene(canvas,{age:player.yearsLived,stats:{happiness:player.stats.happiness},country:{region:REGION_COUNTRIES[player.country.id]||regions[player.country.p]||'Asia'},sex:player.sex==='M'?'male':'female'});}catch{/* Canvas is optional on browsers without a 2D context. */}}}
 function checkpoint(){if(!store||!player||candidate)return false;if(player.alive){const ok=store.saveActive(player);if(ok)hasSaved=true;setText('save-status',ok?'':word(ctx,'saveError'));return ok;}const ok=store.savePastLife(player);if(ok){store.clearActive();hasSaved=false;}setText('save-status',ok?'':word(ctx,'saveError'));return ok;}
 function renderFocus(){const box=el('focus-selector');if(!box||!player)return;box.innerHTML='';for(const f of FOCUS_OPTIONS){const b=document.createElement('button');b.className=`focus-btn${player.currentFocus===f.id?' active':''}`;b.textContent=ctx.t(f.label);b.title=ctx.t(f.sub);b.disabled=!player.alive;b.onclick=()=>setFocus(f.id);box.appendChild(b);}}
 function renderPending(){
  clearModal();if(screen!=='screen-game'||!player?.alive)return;const d=player.pendingDecision,r=player.pendingReflection;if(!d&&!r)return;pause();const layer=el('event-layer');if(!layer)return;const token=modalToken;
  const overlay=document.createElement('div');overlay.className='edition-modal';overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px';
  const card=document.createElement('div');card.className='panel';card.style.cssText='max-width:640px;width:100%;max-height:85vh;overflow:auto';
  card.setAttribute?.('role','dialog');card.setAttribute?.('aria-modal','true');
  const question=r?.questions?.[0];card.innerHTML=`<h2>${e(ctx.t(d?.title||r?.title))}</h2>${d?.body?`<p>${e(ctx.t(d.body))}</p>`:''}${!d&&question?`<p>${e(ctx.t(question.question))}</p>`:''}${(d?.fact||(!d&&r?.fact))?`<p class="source-note">ⓘ ${e(ctx.t(d?d.fact:r.fact))}</p>`:''}<div id="decision-options" class="options-grid"></div><div class="toolbar"><button id="btn-random-choice" class="focus-btn">${e(word(ctx,'random'))}</button><button id="btn-modal-save" class="focus-btn">${e(word(ctx,'save'))}</button></div>`;
  overlay.appendChild(card);layer.appendChild(overlay);const grid=card.querySelector('#decision-options');
  const choices=d?d.choices:r.questions.flatMap(q=>q.options);choices.forEach((choice,index)=>{const b=document.createElement('button');b.className='opt-btn';const effects=!d?Object.entries(choice.stat||{}).map(([key,value])=>`${ctx.statName(key)} ${value>=0?'+':''}${value}`).join(', '):'';b.innerHTML=`<strong>${index+1}. ${e(ctx.t(choice.label))}</strong>${choice.sub?`<br><small>${e(ctx.t(choice.sub))}</small>`:''}${effects?`<br><small>${e(effects)}</small>`:''}`;b.onclick=()=>{if(token!==modalToken)return false;return d?chooseDecision(choice.id):chooseReflection(index);};grid?.appendChild(b);});
  const randomButton=card.querySelector('#btn-random-choice'),saveButton=card.querySelector('#btn-modal-save');
  if(randomButton)randomButton.onclick=()=>token===modalToken&&randomChoice();
  if(saveButton)saveButton.onclick=()=>token===modalToken&&saveAndMenu();
 }
 function randomChoice(){if(busy||candidate||screen!=='screen-game'||!player?.alive)return false;if(player.pendingDecision){const choice=ctx.pick(player.pendingDecision.choices);return choice?chooseDecision(choice.id):false;}if(player.pendingReflection){const options=player.pendingReflection.questions.flatMap(q=>q.options);return options.length?chooseReflection(ctx.int(0,options.length-1)):false;}return false;}
 function renderGame(){if(!player)return;setText('player-name',`${player.name.full} (${player.yearsLived}${word(ctx,'years')})`);html('stats-panel',renderStats(ctx,player));html('player-info',renderPlayerInfo(ctx,player));html('story-panel',renderStory(ctx,player));html('peers-panel',renderPeers(ctx,player));renderFocus();drawScene();renderPending();updateControls();}
 function renderEnd(){if(!player)return;html('death-record',renderEnding(ctx,player,{archetype:getLifeArchetype(player),outlived:getOutlivedPercentile(player),achievements:ACHIEVEMENTS}));}
 function refresh(){labels();if(screen==='screen-ceremony'&&player){html('ceremony-content',renderBirth(ctx,player));drawMap();}else if(screen==='screen-game')renderGame();else if(screen==='screen-ending')renderEnd();else if(screen==='screen-library')renderLibrary();updateControls();}
 function renderLibrary(){if(!libraryKind)return;setText('library-title',word(ctx,libraryKind==='focus'?'focus':libraryKind));if(el('btn-clear-history'))el('btn-clear-history').hidden=libraryKind!=='past';
  if(libraryKind==='past')html('library-content',renderPastLives(ctx,store?.pastLives()||[]));
  else if(libraryKind==='achievements')html('library-content',renderAchievements(ctx,ACHIEVEMENTS,[...new Set([...(store?.achievements()||[]),...(candidate?[]:player?.unlockedAchievements||[])])]));
  else if(libraryKind==='log')html('library-content',player?renderStory(ctx,player,{full:true}):`<p>${e(word(ctx,'empty'))}</p>`);
  else if(libraryKind==='shop'){
   html('library-content',`<p>${e(word(ctx,'wealth'))}: ${e(money(ctx,player?.stats.wealth||0))}</p><div id="shop-options"></div>`);const box=el('shop-options');for(const item of data.shop){const row=document.createElement('section');row.className='edition-shop-item';row.innerHTML=`<h3>${e(ctx.t(item.name))} · ${e(money(ctx,getShopCost(item)))}</h3><p>${e(ctx.t(item.desc))}</p><p>${e(word(ctx,'age'))}: ${item.minAge}+</p>`;const b=document.createElement('button');b.className='focus-btn';b.textContent=word(ctx,'buy');b.disabled=!player||candidate||!canBuy(player,item);b.onclick=()=>buy(item.id);row.appendChild(b);box?.appendChild(row);}
  }else if(libraryKind==='focus'){html('library-content','<div id="library-focus-options"></div>');const box=el('library-focus-options');for(const f of FOCUS_OPTIONS){const b=document.createElement('button');b.className='focus-btn';b.textContent=ctx.t(f.label)+' · '+ctx.t(f.sub);b.onclick=()=>{setFocus(f.id);closeLibrary();};box?.appendChild(b);}}
 }
 function bind(){if(bound)return;bound=true;
  for(const [id,fn] of Object.entries({'btn-start':startBirth,'btn-begin':begin,'btn-reroll':reroll,'btn-birth-back':()=>{pause();candidate=false;player=null;show('screen-landing');drawMap();},'btn-resume':resume,'btn-past':()=>openLibrary('past'),'btn-achievements':()=>openLibrary('achievements'),'btn-next-year':nextYear,'btn-next-decision':toNextDecision,'btn-auto':toggleAuto,'btn-shop':()=>openLibrary('shop'),'btn-log':()=>openLibrary('log'),'btn-game-achievements':()=>openLibrary('achievements'),'btn-save-menu':saveAndMenu,'btn-restart':()=>{pause();show('screen-landing');},'btn-ending-log':()=>openLibrary('log'),'btn-copy-share':copyShare,'btn-library-back':closeLibrary,'btn-clear-history':()=>{if(libraryKind==='past'&&window?.confirm?.(word(ctx,'confirmClear'))){store.clearPastLives();renderLibrary();}},'btn-random-era':()=>{if(!ready)return;const birthYear=1950+Math.floor(Math.random()*(year-1950+1));if(el('year-slider'))el('year-slider').value=String(birthYear);setText('year-val',birthYear);}}))on(id,fn);
  if(el('year-slider'))el('year-slider').oninput=()=>setText('year-val',el('year-slider').value);
  if(el('language-select'))el('language-select').onchange=()=>setLanguage(el('language-select').value);
  window?.addEventListener?.('keydown',keydown);
 }
 function keydown(event){const tag=String(event.target?.tagName||'').toLowerCase();if(['input','textarea','select'].includes(tag)||event.target?.isContentEditable||event.ctrlKey||event.metaKey||event.altKey)return;const k=String(event.key||'').toLowerCase();let handled=true;
  if(screen==='screen-game'&&(player?.pendingDecision||player?.pendingReflection)&&k==='r')randomChoice();
  else if(player?.pendingDecision&&screen==='screen-game'&&/^[1-9]$/.test(k))chooseDecision(player.pendingDecision.choices[Number(k)-1]?.id);
  else if(player?.pendingReflection&&screen==='screen-game'&&/^[1-9]$/.test(k))chooseReflection(Number(k)-1);
  else if(k==='escape'||k==='q'){if(screen==='screen-library')closeLibrary();else if(screen==='screen-game')saveAndMenu();else if(screen==='screen-ceremony')el('btn-birth-back')?.onclick?.();else handled=false;}
  else if(screen==='screen-game'){const actions={enter:nextYear,' ':nextYear,n:nextYear,d:toNextDecision,a:toggleAuto,f:()=>openLibrary('focus'),s:()=>openLibrary('shop'),l:()=>openLibrary('log'),v:saveAndMenu};if(actions[k])actions[k]();else handled=false;}
  else if(screen==='screen-ceremony'&&k==='enter')begin();else if(k==='r'&&screen==='screen-ceremony')reroll();else if(k==='enter'&&screen==='screen-landing')startBirth();else handled=false;
  if(handled)event.preventDefault?.();
 }
 async function init(){if(initialization)return initialization;initialization=(async()=>{bind();labels();updateControls();html('load-status','');setText('load-status',word(ctx,'loading'));
  try{const json=async path=>{const r=await fetchImpl(path);if(!r||r.ok===false)throw Error(`${path}: HTTP ${r?.status??'unavailable'}`);const v=typeof r.json==='function'?await r.json():JSON.parse(await r.text());if(!v||typeof v!=='object')throw Error(`${path}: invalid JSON`);return v;};
   const loaded=await Promise.all([loadEdition('./data/edition/',{fetchImpl}),json('./data/history.json'),json('./data/map.json')]);if(destroyed)return false;[data,dataHistory,map]=[loaded[0],loaded[1],loaded[2]];
   data.history=dataHistory;ctx=createContext(data,{lang:'zh',year});store=createStorage(storage,ctx);ctx.saveAchievement=id=>store.saveAchievement(id);hasSaved=!!store.loadActive();
   const params=new URLSearchParams(window?.location?.search||'');const lang=params.get('lang');if(['zh','ja','en'].includes(lang))ctx.lang=lang;const seed=params.get('seed');if(seed!==null&&Number.isFinite(Number(seed))&&el('seed-input'))el('seed-input').value=seed;const selectedYear=Number(params.get('year'));if(el('year-slider')){el('year-slider').max=String(year);if(params.has('year')&&Number.isInteger(selectedYear)&&selectedYear>=1950&&selectedYear<=year)el('year-slider').value=String(selectedYear);setText('year-val',el('year-slider').value||year);}
   ready=true;labels();setText('load-status','');drawMap();updateControls();const rate=data.countries.reduce((sum,c)=>sum+Number(c.b||0),0)/(365.25*86400);const counter=()=>setText('birth-counter',local(`${Math.floor((Date.now()-startedAt)/1000*rate).toLocaleString()} babies born worldwide while you were here`, `ここにいる間に世界で約${Math.floor((Date.now()-startedAt)/1000*rate).toLocaleString()}人が誕生`, `你停留期间，全球约有 ${Math.floor((Date.now()-startedAt)/1000*rate).toLocaleString()} 名婴儿出生`));counter();if(window?.setInterval)counterTimer=window.setInterval(counter,3000);return true;
  }catch(error){ready=false;setText('load-status',`${word(ctx,'loadError')} ${error.message}`);const retry=document.createElement('button');retry.id='btn-retry';retry.className='focus-btn';retry.textContent=word(ctx,'retry');retry.onclick=()=>init();el('load-status')?.appendChild(retry);updateControls();initialization=null;return false;}
 })();return initialization;}
 let dataHistory;
 function startBirth(){if(!ready||busy||destroyed)return false;pause();busy=true;try{const input=String(el('seed-input')?.value??'').trim();const seed=input!==''&&Number.isFinite(Number(input))?Math.trunc(Number(input)):Math.floor(Math.random()*4294967296);const selected=Number(el('year-slider')?.value||year);const era=Number.isInteger(selected)&&selected>=1950&&selected<=year?String(selected):'current';ctx=createContext(data,{seed,lang:ctx.lang,year});store=createStorage(storage,ctx);ctx.saveAchievement=id=>store.saveAchievement(id);player=newLife(ctx,era);candidate=true;show('screen-ceremony');refresh();return player;}finally{busy=false;updateControls();}}
 function reroll(){if(!ready||busy)return false;/* New seed makes rerolls distinct while each share stays reproducible. */if(el('seed-input'))el('seed-input').value=String(Math.floor(Math.random()*4294967296));return startBirth();}
 function begin(){if(!ready||busy||screen!=='screen-ceremony'||!player||!candidate)return false;candidate=false;show('screen-game');checkpoint();renderGame();return true;}
 function nextYear(){if(!ready||destroyed||busy||candidate||screen!=='screen-game'||!player?.alive)return false;if(player.pendingDecision||player.pendingReflection){pause();renderPending();updateControls();return false;}busy=true;let advanced=false;try{advanced=stepYear(ctx,player);checkpoint();if(!player.alive){pause();clearModal();show('screen-ending');renderEnd();}else renderGame();return advanced;}finally{busy=false;updateControls();}}
 function toNextDecision(){if(!ready||busy||screen!=='screen-game'||!player?.alive)return false;pause();let advanced=false;for(let i=0;i<116&&player.alive&&!player.pendingDecision&&!player.pendingReflection;i++){if(!nextYear())break;advanced=true;}return advanced;}
 function chooseDecision(id){if(busy||candidate||screen!=='screen-game'||!player?.pendingDecision)return false;busy=true;try{const result=invokeDecision(ctx,player,id);if(result===false)return false;checkpoint();renderGame();return result;}finally{busy=false;updateControls();}}
 function chooseReflection(index){if(busy||candidate||screen!=='screen-game'||player?.pendingDecision||!player?.pendingReflection)return false;busy=true;try{const result=invokeReflection(ctx,player,index);if(!result)return false;checkpoint();renderGame();return true;}finally{busy=false;updateControls();}}
 function buy(id){if(busy||candidate||!player?.alive||!['screen-game','screen-library'].includes(screen))return false;busy=true;try{const ok=buyItem(ctx,player,id);if(ok){checkpoint();if(screen==='screen-library')renderLibrary();else renderGame();}return ok;}finally{busy=false;updateControls();}}
 function setFocus(id){if(!ready||candidate||!player?.alive||!FOCUS_OPTIONS.some(f=>f.id===id))return false;player.currentFocus=id;checkpoint();if(screen==='screen-game')renderGame();return true;}
 function saveAndMenu(){if(!ready||candidate||!player)return false;pause();const saved=checkpoint();clearModal();show('screen-landing');return saved;}
 function resume(){if(!ready||busy)return false;pause();const s=store.loadActive();if(!s){setText('load-status',word(ctx,'noSave'));updateControls();return false;}player=s;candidate=false;labels();show('screen-game');renderGame();checkpoint();return player;}
 function setLanguage(lang){if(!['en','ja','zh'].includes(lang))return false;ctx.lang=lang;refresh();return true;}
 function openLibrary(kind){if(!ready||!['past','achievements','shop','log','focus'].includes(kind))return false;if(['shop','focus'].includes(kind)&&(!player?.alive||candidate))return false;pause();if(screen!=='screen-library')returnScreen=screen;libraryKind=kind;clearModal();show('screen-library');renderLibrary();return true;}
 function closeLibrary(){if(screen!=='screen-library')return false;libraryKind=null;show(returnScreen);refresh();return true;}
 function toggleAuto(){if(autoTimer!==null){pause();return false;}if(!ready||screen!=='screen-game'||!player?.alive||player.pendingDecision||player.pendingReflection)return false;const tick=()=>{autoTimer=null;if(destroyed||screen!=='screen-game'||!player?.alive||player.pendingDecision||player.pendingReflection){pause();return;}nextYear();if(screen==='screen-game'&&player.alive&&!player.pendingDecision&&!player.pendingReflection){autoTimer=later(tick);setText('btn-auto',word(ctx,'pause'));}else pause();};autoTimer=later(tick);setText('btn-auto',word(ctx,'pause'));return true;}
 async function copyShare(){if(!player)return false;const url=new URL(window?.location?.href||'http://localhost/');url.searchParams.set('seed',String(ctx.seed));url.searchParams.set('year',String(player.birthYear));url.searchParams.set('lang',ctx.lang);const arch=getLifeArchetype(player);const share=`${player.name.full} · ${ctx.countryName(player.country.id)} · ${player.birthYear}–${player.birthYear+player.yearsLived}\n${word(ctx,'lived')}: ${player.yearsLived} ${word(ctx,'years')} · ${ctx.t(arch.title)}\n${word(ctx,'deathCause')}: ${ctx.t(player.causeOfDeath)}\n${url.href}`;try{if(!navigator?.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(share);return share;}catch{setText('save-status',share);return false;}}
 function destroy(){pause();destroyed=true;clearModal();if(counterTimer!==null)(window?.clearInterval??globalThis.clearInterval)(counterTimer);window?.removeEventListener?.('keydown',keydown);for(const id of CONTROLS)if(el(id))el(id).onclick=null;}
 const initialLang=new URLSearchParams(window?.location?.search||'').get('lang');
 if(['en','ja','zh'].includes(initialLang))ctx.lang=initialLang;
 labels();updateControls();
 return {init,startBirth,begin,nextYear,toNextDecision,chooseDecision,chooseReflection,buy,setFocus,saveAndMenu,resume,reroll,setLanguage,openLibrary,closeLibrary,toggleAuto,copyShare,destroy,get state(){return player;},get context(){return ctx;},get screen(){return screen;}};
}

