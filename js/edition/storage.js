import { DECISIONS } from './decisions.js';
import { ACHIEVEMENTS, getLifeArchetype } from './simulation.js';
const VERSION=1, PREFIX='pilotdeck.edition.';
const statsKeys=['health','happiness','smarts','social','wealth','educationLevel'];
const validId=id=>ACHIEVEMENTS.some(a=>a.id===id);
const plain=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
const localText=v=>typeof v==='string'||(plain(v)&&['en','ja','zh'].every(k=>typeof v[k]==='string'));
const validCountry=(c,ctx)=>plain(c)&&Object.hasOwn(ctx.byId,c.id)&&['le','im','u5','ppp','gi'].every(k=>Number.isFinite(c[k]))&&c.le>0&&c.ppp>0&&c.im>=0&&c.u5>=0&&c.gi>=0;
const validName=n=>plain(n)&&typeof n.full==='string'&&n.full.length>0;
const validPartner=p=>p==null||(plain(p)&&typeof p.alive==='boolean'&&(typeof p.name==='string'||validName(p.name)));
const validPeer=(p,ctx)=>plain(p)&&typeof p.id==='string'&&p.id.length>0&&validName(p.name)&&['M','F'].includes(p.sex)&&localText(p.status)&&typeof p.alive==='boolean'&&validCountry(p.country,ctx)&&p.countryId===p.country.id;
const validLog=l=>plain(l)&&Number.isInteger(l.age)&&l.age>=0&&l.age<=115&&typeof l.type==='string'&&localText(l.text)&&(l.fact==null||localText(l.fact));
function safeData(o,depth=0){if(depth>40)return false;if(o===null||typeof o==='string'||typeof o==='boolean')return true;if(typeof o==='number')return Number.isFinite(o);if(Array.isArray(o))return o.every(v=>safeData(v,depth+1));if(!plain(o))return false;return Object.entries(o).every(([k,v])=>!['__proto__','constructor','prototype'].includes(k)&&safeData(v,depth+1));}
function validState(s,ctx){return safeData(s)&&s.alive===true&&validCountry(s.country,ctx)&&plain(s.stats)&&statsKeys.every(k=>Number.isFinite(s.stats[k]))&&['health','happiness','smarts','social'].every(k=>s.stats[k]>=0&&s.stats[k]<=100)&&s.stats.wealth>=0&&Number.isInteger(s.yearsLived)&&s.yearsLived>=0&&s.yearsLived<115&&Number.isInteger(s.birthYear)&&validName(s.name)&&['M','F'].includes(s.sex)&&plain(s.flags)&&plain(s.family)&&validPartner(s.family.partner)&&['mom','dad'].every(k=>plain(s.family[k])&&Number.isFinite(s.family[k].age)&&typeof s.family[k].alive==='boolean')&&['children','siblingList'].every(k=>Array.isArray(s.family[k]))&&s.family.children.every(child=>plain(child)&&typeof child.name==='string'&&['M','F'].includes(child.gender)&&Number.isInteger(child.bornAtAge)&&typeof child.alive==='boolean')&&s.family.siblingList.every(sibling=>plain(sibling)&&localText(sibling.relation)&&Number.isFinite(sibling.age)&&['M','F'].includes(sibling.sex))&&['olderSiblings','youngerSiblings','grandchildrenCount'].every(k=>Number.isFinite(s.family[k])&&s.family[k]>=0)&&Array.isArray(s.log)&&s.log.every(validLog)&&Array.isArray(s.peers)&&s.peers.every(p=>validPeer(p,ctx))&&Array.isArray(s.unlockedAchievements)&&s.unlockedAchievements.every(validId);}
export function createStorage(storageLike,ctx){
 const read=key=>{try{const raw=storageLike?.getItem(PREFIX+key);return raw?JSON.parse(raw):null;}catch{return null;}};
 const write=(key,value)=>{try{if(!storageLike)return false;storageLike.setItem(PREFIX+key,JSON.stringify(value));return true;}catch{return false;}};
 const clear=key=>{try{storageLike?.removeItem(PREFIX+key);return true;}catch{return false;}};
 const achievements=()=>{const r=read('achievements');return r?.version===VERSION&&Array.isArray(r.ids)?[...new Set(r.ids.filter(validId))]:[];};
 const pastLives=()=>{const r=read('pastLives');return r?.version===VERSION&&Array.isArray(r.records)?r.records.filter(s=>safeData(s)&&typeof s.id==='string'&&typeof s.name==='string'&&typeof s.countryId==='string'&&Number.isInteger(s.yearsLived)&&s.yearsLived>=1&&s.yearsLived<=115&&plain(s.stats)&&statsKeys.every(k=>Number.isFinite(s.stats[k]))).slice(0,50):[];};
 return {
 saveActive(state){try{if(!state?.alive)return false;const {pendingDecision,pendingReflection,newlyUnlocked,...data}=state;const snapshot=JSON.parse(JSON.stringify(data));if(!validState(snapshot,ctx))return false;return write('active',{version:VERSION,state:snapshot,decisionId:pendingDecision?.id||null,reflectionAge:pendingReflection?state.yearsLived:null,rngState:ctx.getRngState(),seed:ctx.seed,year:ctx.year});}catch{return false;}},
 loadActive(){try{const r=read('active');if(!r||r.version!==VERSION||!validState(r.state,ctx)||!Number.isInteger(r.rngState)||r.rngState<0||r.rngState>4294967295)return null;const s=r.state;s.pendingDecision=null;s.pendingReflection=null;s.newlyUnlocked=null;
 if(r.decisionId!=null){const d=DECISIONS[r.decisionId];if(!d||d.age!==s.yearsLived)return null;s.pendingDecision=d;}
 if(r.reflectionAge!=null){if(r.reflectionAge!==s.yearsLived||!ctx.data.reflections[r.reflectionAge])return null;s.pendingReflection=ctx.data.reflections[r.reflectionAge];}
 ctx.setRngState(r.rngState);if(typeof r.seed==='number'||typeof r.seed==='string')ctx.seed=r.seed;if(Number.isInteger(r.year))ctx.year=r.year;return s;}catch{return null;}},
 clearActive:()=>clear('active'),
 pastLives,
 savePastLife(s){try{if(!s||s.alive!==false||!Number.isInteger(s.yearsLived)||s.yearsLived<1||s.yearsLived>115)return false;const arch=getLifeArchetype(s);const id=String(s.lifeId||`life_${ctx.seed}_${s.birthYear}_${s.country.id}_${s.name.full}`);const record={id,name:s.name.full,countryId:s.country.id,sex:s.sex,urban:s.urban??false,cityName:s.cityName??'',cityNameEn:s.cityNameEn??'',birthYear:s.birthYear,yearsLived:s.yearsLived,lifeExpectancy:s.country.le,job:s.job??'',jobId:s.jobId??'',archetype:arch.title,stats:Object.fromEntries(statsKeys.map(k=>[k,s.stats[k]])),childrenCount:s.family.children.length,grandchildrenCount:s.family.grandchildrenCount,partner:!!s.family.partner,causeOfDeath:s.causeOfDeath??null,unlockedAchievements:[...s.unlockedAchievements],timestamp:new Date().toISOString()};return write('pastLives',{version:VERSION,records:[record,...pastLives().filter(r=>r.id!==id)].slice(0,50)});}catch{return false;}},
 clearPastLives:()=>clear('pastLives'),
 achievements,
 saveAchievement(id){if(!validId(id))return false;const ids=achievements();return ids.includes(id)||write('achievements',{version:VERSION,ids:[...ids,id]});},
 };
}

