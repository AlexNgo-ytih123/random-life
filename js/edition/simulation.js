import { clamp, jsRound } from './core.js';
import { getLifeTable, getIncomeAt } from './life-table.js';
import { selectCountry, newBirthIdentity, newPeerBabies, newPersonName } from './demographics.js';
import { DECISIONS } from './decisions.js';
import { CONTENT, TEXT } from './simulation-content.js';

export const FOCUS_OPTIONS = CONTENT.focus;
const field = (o,k,fallback) => o?.[k] || fallback;
const text = (index, vars = {}) => Object.fromEntries(Object.entries(TEXT[index]).map(([lang,s]) => [lang,s.replace(/\$\(\$(\w+(?:\.\w+)+)\)|\$\{(\w+)\}|\$(\w+)/g, (_m,path,braced,key) => {const parts=(path||braced||key).split('.');let v=vars;for(const p of parts)v=v?.[p];return v == null ? '' : String(v);})]));
const entry = (age,type,value,fact=null)=>({age,type,text:value,fact});
const addLogs=(s,logs)=>s.log.unshift(...logs);
export function limitStats(s) {for(const k of ['health','happiness','smarts','social']) s.stats[k]=Math.round(clamp(Number(s.stats[k])||0,0,100)*100)/100;s.stats.wealth=Math.max(0,Number(s.stats.wealth)||0);}
const checks = {
 survivor:s=>s.yearsLived>=5&&s.country.u5>=35,
 scholar:s=>s.q<=2&&s.stats.educationLevel>=4,
 tycoon:s=>s.stats.wealth>=50000,
 centenarian:s=>s.yearsLived>=85,
 patriarch:s=>s.family.children.length>=2&&s.family.grandchildrenCount>=1,
 globetrotter:s=>!!(s.flags.abroad||s.flags.workedAbroad),
 leader:s=>s.jobId==='owner'||s.jobId==='specialist'||!!s.job?.includes('Quản lý'),
 zen:s=>s.yearsLived>=50&&s.stats.happiness>=85,
 philanthropist:s=>!!s.flags.charitable,
 polymath:s=>s.stats.smarts>=90,
 athlete:s=>s.yearsLived>=65&&s.stats.health>=85,
 outliver:s=>s.yearsLived>=field(s.country,'le',73)+12,
};
export const ACHIEVEMENTS = CONTENT.achievements.map(a=>({...a,check:checks[a.id]}));
export function getNewAchievements(s) {return ACHIEVEMENTS.filter(a=>!s.unlockedAchievements.includes(a.id)&&a.check(s));}
export function newLife(ctx,era='current') {
 const s=newBirthIdentity(ctx,selectCountry(ctx),era);s.peers=newPeerBabies(ctx);s.alive=true;s.pendingDecision=null;s.pendingReflection=null;s.newlyUnlocked=null;s.log=[];
 s.lifeId=`life_${ctx.seed}_${s.birthYear}_${s.country.id}_${s.name.full}_${ctx.getRngState()}`;
 const by=s.birthYear,cid=s.country.id,en=ctx.data.countryEn[cid]||cid,ja=ctx.data.countryJa[cid]||en,zh=ctx.data.countryZh[cid]||en;
 s.log.push(entry(0,'birth',text(31,{by,en,ja,zh,billions:by<1980?'4':'8',population:by<1980?'40':'80',placeEn:s.urban?s.cityNameEn:'a rural area',placeJa:s.urban?s.cityNameEn:'農村地域',placeZh:s.urban?s.cityNameEn:'乡村地区'})));
 return s;
}
export function eventEligible(s,event) {
 const r=event.requirements;if(!r)return true;
 if(r.minQuintile&&s.q<r.minQuintile||r.maxQuintile&&s.q>r.maxQuintile||r.maxPpp&&s.country.ppp>r.maxPpp||r.rural&&s.urban)return false;
 if(r.countries&&!r.countries.includes(s.country.id)||r.regions&&!r.regions.includes(s.country.p)||r.inSchool&&!s.jobId?.startsWith('student_')||r.sex&&s.sex!==r.sex)return false;
 if(r.children&&!s.family.children.length||r.grandchildren&&!s.family.grandchildrenCount||r.siblings&&!(s.family.olderSiblings+s.family.youngerSiblings))return false;
 return true;
}
function causeAt(ctx,age,next,country,peer=false) {if(age===0)return ctx.pick(CONTENT.causesInfant);if(age<5)return ctx.pick(CONTENT.causesChild);if(peer?age<50:age<=50)return ctx.pick(CONTENT.causesYouth);if(!peer&&next>=field(country,'le',75)+8)return CONTENT.causesElder.at(-1);return ctx.pick(CONTENT.causesElder);}
export function stepPeers(ctx,peers,currentAge,nextAge) {
 for(const p of peers||[]){if(!p.alive)continue;const c=p.country;let risk=getLifeTable(c,p.sex||'M').q[clamp(currentAge,0,110)];if(currentAge>=15&&currentAge<50)risk+=field(c,'road',15)/150000+Number(c.war||0)*.003;if(nextAge>=115)risk=1;
 if(ctx.chance(risk)){p.alive=false;p.deathAge=nextAge;p.deathCause=causeAt(ctx,currentAge,nextAge,c,true);continue;}
 let status=p.status;const fixed={3:44,6:45,12:46,15:47,62:58};if(fixed[nextAge]!==undefined)status=text(fixed[nextAge]);
 if(nextAge===18)status=text(ctx.pick([48,49,50]));if(nextAge===25)status=text(ctx.pick([51,52,53,54,55,56]));if(nextAge===30&&!status?.en?.includes('Married'))status=text(57,{status:status||{en:'',ja:'',zh:''}});p.status=status;
 }
}
export function stepYear(ctx,s) {
 if(!s.alive||s.pendingDecision||s.pendingReflection)return false;
 const age=s.yearsLived,nextAge=age+1;s.yearsLived=nextAge;const c=s.country,logs=[];let p=getLifeTable(c,s.sex||'M').q[clamp(age,0,110)];
 if(age>=15&&age<50)p+=field(c,'road',15)/150000+Number(c.war||0)*.003+field(c,'hom',3)/150000;
 p*=clamp((100-s.stats.health)/50,.3,2.5);if(s.currentFocus==='health')p*=.75;if(nextAge>=115)p=1;
 if(ctx.chance(p)){s.alive=false;s.causeOfDeath=causeAt(ctx,age,nextAge,c);s.stats.health=0;addLogs(s,[entry(nextAge,'death',text(32,{nextAge,cause:s.causeOfDeath}))]);return true;}
 if(nextAge===1)logs.push(entry(1,'event',text(33)));
 else if(nextAge===7&&s.stats.educationLevel===0&&['hi','eca'].includes(c.p)){s.stats.educationLevel=1;s.job='Học sinh tiểu học';s.jobId='student_prim';logs.push(entry(7,'event',text(34)));}
 switch(s.currentFocus||'study'){
 case 'study':s.stats.smarts=clamp(s.stats.smarts+ctx.int(2,4),10,100);s.stats.happiness=clamp(s.stats.happiness-1,10,100);break;
 case 'work':if(nextAge>=16){s.stats.wealth+=jsRound(field(c,'ppp',15000)/12*.25*(.6+s.q*.2));if(nextAge>=35)s.stats.health=clamp(s.stats.health-1,10,100);}break;
 case 'family':s.stats.social=clamp(s.stats.social+3,10,100);s.stats.happiness=clamp(s.stats.happiness+3,10,100);break;
 case 'health':s.stats.health=clamp(s.stats.health+ctx.int(3,5),10,100);break;
 case 'hobby':s.stats.happiness=clamp(s.stats.happiness+ctx.int(4,6),10,100);break;
 }
 if(nextAge>=18){const pct=clamp(((s.q||3)-.5)/5+(s.stats.educationLevel||2)*.06-.08,.02,.98);s.stats.wealth+=jsRound(getIncomeAt(c,pct)*.14);
 if(nextAge===23&&s.jobId==='student_uni'){s.job='Cử nhân / Chuyên viên';s.jobId='specialist';logs.push(entry(23,'event',text(35)));}
 else if(nextAge===40&&s.jobId!=='owner'){s.job='Quản lý cấp cao';logs.push(entry(40,'event',text(36)));}
 else if(nextAge===65&&!s.flags.retired){s.flags.retired=true;s.job='Nghỉ hưu';s.jobId='retired';logs.push(entry(65,'event',text(37)));}}
 if(s.family.partner?.alive&&nextAge>=23&&nextAge<=38&&s.family.children.length<Math.max(1,jsRound(field(c,'tfr',2)))&&ctx.chance(.28)){const gender=ctx.chance(.51)?'M':'F';s.family.children.push({name:newPersonName(ctx,s.country.id,gender).full,gender,bornAtAge:nextAge,alive:true});s.stats.happiness+=12;logs.push(entry(nextAge,'family',text(38)));}
 if(nextAge>=55&&s.family.children.length&&ctx.chance(.2)&&s.family.grandchildrenCount<4){s.family.grandchildrenCount++;s.stats.happiness+=10;logs.push(entry(nextAge,'family',text(39)));}
 for(const [key,chance,idx] of [['mom',.08,40],['dad',.09,41]]){const parent=s.family[key];if(parent?.alive){parent.age++;if(parent.age>=75&&ctx.chance(chance)){parent.alive=false;s.stats.happiness-=15;logs.push(entry(nextAge,'family',text(idx,{[key]:parent})));}}}
 if(nextAge>=60)s.stats.health=Math.max(10,s.stats.health-ctx.int(1,3));
 const calYear=Number(s.birthYear)+nextAge;if(CONTENT.historicalEvents[calYear]&&!s.flags[`hist_${calYear}`]){s.flags[`hist_${calYear}`]=true;logs.push(entry(nextAge,'event',CONTENT.historicalEvents[calYear],text(42,{calYear})));}
 const eligible=ctx.data.events.filter(ev=>nextAge>=ev.minAge&&nextAge<=ev.maxAge&&!s.flags[`ev_${ev.id}`]&&eventEligible(s,ev));if(eligible.length&&ctx.chance(.45)){const ev=ctx.weighted(eligible,eligible.map(ev=>field(ev,'weight',1)));s.flags[`ev_${ev.id}`]=nextAge;for(const k of ['health','happiness','smarts','social'])if(ev.statEffects?.[k])s.stats[k]=clamp(s.stats[k]+ev.statEffects[k],5,100);logs.push(entry(nextAge,ev.cat==='family'?'family':'event',ev.text,ev.fact));}
 stepPeers(ctx,s.peers,age,nextAge);
 const decision=Object.values(DECISIONS).find(d=>d.age===nextAge&&!s.flags[`dec_${d.id}`]);if(decision){s.pendingDecision=decision;s.flags[`dec_${decision.id}`]=true;}
 const refl=ctx.data.reflections[nextAge];if(refl&&!s.flags[`refl_${nextAge}`]){s.pendingReflection=refl;s.flags[`refl_${nextAge}`]=true;}
 const newly=getNewAchievements(s);for(const a of newly){s.unlockedAchievements.push(a.id);try{ctx.saveAchievement?.(a.id);}catch{}logs.push(entry(nextAge,'achievement',text(43,{a})));}s.newlyUnlocked=newly[0]||null;
 limitStats(s);addLogs(s,logs);return true;
}
export function invokeDecision(ctx,s,choiceOrId) {
 if(!s.alive||!s.pendingDecision)return false;const canonical=DECISIONS[s.pendingDecision.id];if(!canonical)return false;
 const id=typeof choiceOrId==='string'?choiceOrId:choiceOrId?.id;const choice=canonical.choices.find(c=>c.id===id);if(!choice)return false;
 if(['civil_service','donate_cause','volunteer'].includes(id))s.flags.charitable=true;
 const result=choice.apply(s,ctx);s.pendingDecision=null;limitStats(s);addLogs(s,[entry(s.yearsLived,'decision',result)]);return result;
}
export function invokeReflection(ctx,s,optionOrIndex) {
 if(!s.alive||!s.pendingReflection)return false;const canonical=ctx.data.reflections[s.yearsLived];if(!canonical)return false;
 const options=canonical.questions.flatMap(q=>q.options);const opt=typeof optionOrIndex==='number'?options[optionOrIndex]:options.find(o=>o.id===(typeof optionOrIndex==='string'?optionOrIndex:optionOrIndex?.id));if(!opt)return false;
 s.pendingReflection=null;for(const [k,v] of Object.entries(opt.stat||{}))if(Object.hasOwn(s.stats,k)&&Number.isFinite(v))s.stats[k]=Math.max(0,s.stats[k]+v);limitStats(s);addLogs(s,[entry(s.yearsLived,'reflection',text(59,{y:s.yearsLived,opt}))]);return true;
}
export function getShopCost(item) {return item?.effects?.wealth?Math.abs(Number(item.effects.wealth)):200;}
export function canBuy(s,item){return !!(item&&s.alive&&s.stats.wealth>=getShopCost(item)&&s.yearsLived>=item.minAge);}
export function buyItem(ctx,s,itemOrId){const item=ctx.data.shop.find(it=>it.id===(typeof itemOrId==='string'?itemOrId:itemOrId?.id));if(!canBuy(s,item))return false;s.stats.wealth=Math.max(0,s.stats.wealth-getShopCost(item));for(const k of ['happiness','health','smarts','social'])if(item.effects?.[k])s.stats[k]+=item.effects[k];if(item.id==='pet')s.flags.pet='d';if(item.id==='abroad')s.flags.abroad=true;if(item.id==='donate')s.flags.charitable=true;limitStats(s);addLogs(s,[entry(s.yearsLived,'joy',text(60,{item}))]);return true;}
export function getLifeArchetype(s){let idx=73,icon='>';if(s.yearsLived>=85){idx=61;icon='*';}else if(s.stats.wealth>=50000||s.jobId==='owner'){idx=63;icon='$';}else if(s.stats.smarts>=80||s.stats.educationLevel>=4){idx=65;icon='#';}else if(s.family.children.length>=2&&(s.family.grandchildrenCount>=1||s.stats.social>=75)){idx=67;icon='^';}else if(s.stats.happiness>=80){idx=69;icon='~';}else if(s.yearsLived<=5){idx=71;icon='+';}return{icon,title:text(idx),desc:text(idx+1)};}
export function getOutlivedPercentile(s){if(s.yearsLived<=1)return 3;if(s.yearsLived<=5)return 8;return clamp(jsRound(100/(1+Math.exp(-1.6*(s.yearsLived-field(s.country,'le',73))/14))),1,99);}

