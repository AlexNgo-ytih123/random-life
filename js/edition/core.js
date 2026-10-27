import {LABELS} from './identity-labels.js';
export const clamp=(v,min,max)=>Math.min(Math.max(v,min),max);
export const jsRound=v=>Math.floor(v+.5);
export const copyCountry=c=>structuredClone(c);
export const testEra=(era,year=new Date().getFullYear())=>['current','random'].includes(String(era))||(/^\d+$/.test(String(era))&&+era>=1950&&+era<=year);
export function resolveBirthYear(ctx,era='current'){if(!testEra(era,ctx.year))throw new RangeError(`Invalid era ${era}`);return era==='current'?ctx.year:era==='random'?ctx.int(1950,ctx.year):+era;}
export function createContext(data,{seed=42,lang='zh',year=2026}={}){
 let state=Number(seed)>>>0;
 const ctx={data,lang,year,seed,byId:Object.fromEntries((data.countries||[]).map(c=>[c.id,c]))};
 ctx.rnd=()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 ctx.getRngState=()=>state;ctx.setRngState=v=>{if(!Number.isInteger(v)||v<0||v>4294967295)throw new RangeError('Invalid RNG state');state=v>>>0;};
 ctx.int=(min,max)=>Math.floor(ctx.rnd()*(max-min+1))+min;ctx.chance=p=>ctx.rnd()<p;ctx.pick=a=>a?.length?a[Math.floor(ctx.rnd()*a.length)]:null;
 ctx.weighted=(items,weights)=>{if(!items.length)return null;let r=ctx.rnd()*weights.reduce((s,w)=>s+Number(w),0);for(let i=0;i<items.length;i++){if(r<weights[i])return items[i];r-=weights[i];}return items.at(-1);};
 ctx.weightedKey=obj=>ctx.weighted(Object.keys(obj),Object.values(obj));ctx.t=o=>o==null?'':typeof o==='string'?o:String(o[ctx.lang]||o.en||'');ctx.l=(en,ja,zh)=>ctx.t({en,ja,zh});
 ctx.countryName=id=>(data[ctx.lang==='ja'?'countryJa':ctx.lang==='zh'?'countryZh':'countryEn']||{})[id]||id;
 ctx.jobName=job=>job?ctx.t(LABELS[job]||job):'-';ctx.parentJobName=job=>ctx.t(LABELS[job]||job);ctx.statName=k=>ctx.t(LABELS[k]||k);ctx.religionName=k=>ctx.t(LABELS[k]||{en:'None',ja:'なし',zh:'无'});
 ctx.educationName=level=>{const labels=level>=5?['Postgraduate','大学院','研究生']:level>=4?['University','大学','大学']:level>=3?['High school','高校','高中']:level>=2.5?['Vocational school','職業学校','职业学校']:level>=2?['Middle school','中学校','初中']:level>=1?['Primary school','小学校','小学']:['None','なし','无'];return ctx.l(...labels);};return ctx;
}
