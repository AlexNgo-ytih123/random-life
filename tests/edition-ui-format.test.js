import test from 'node:test';
import assert from 'node:assert/strict';
import {createContext} from '../js/edition/core.js';
import {escapeHtml,word,money,renderBirth,renderStats,renderPlayerInfo,renderPeers,renderStory,renderEnding,renderAchievements,renderPastLives} from '../js/edition/ui.js';
const localized={en:'English <b>',ja:'日本語 <b>',zh:'中文 <b>'};
function fixture(){return {name:{full:'Name <script>'},sex:'F',birthYear:1980,yearsLived:44,country:{id:'AAA',le:75,im:10,u5:15,ppp:20000,urb:60,tfr:2.2,calibration:{baselineYear:2024,kind:'modelled'},provenance:{le:{kind:'observed',sourceYears:[1980]}}},q:4,urban:true,cityNameEn:'City <img>',religion:'none',culture:{ethnicity:localized,dish:localized,sport:localized,festival:localized},hobbies:[{name:localized}],stats:{health:101,happiness:75,smarts:60,social:55,wealth:123456,educationLevel:4},family:{mom:{age:65,alive:true,job:'teacher'},dad:{age:68,alive:false,job:'doctor'},olderSiblings:1,youngerSiblings:2,siblingList:[{relation:localized,age:47}],partner:{name:'Partner <a>'},children:[{name:'Child <a>'}],grandchildrenCount:3},flags:{pet:true},job:'doctor',currentFocus:'health',peers:[{name:{full:'Peer <i>'},sex:'M',countryId:'AAA',alive:false,deathAge:10,deathCause:localized}],log:[{age:44,type:'joy',text:localized,fact:localized}],causeOfDeath:localized,unlockedAchievements:['one']};}
for(const lang of ['en','ja','zh'])test(`all screens localized and escaped: ${lang}`,()=>{
 const ctx=createContext({countries:[]},{lang});const s=fixture();
 for(const renderer of [renderBirth,renderStats,renderPlayerInfo,renderPeers,renderStory,renderEnding]){
 const html=renderer(ctx,s);assert.ok(html.length);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img>'));assert.ok(!html.includes('<b>'));assert.ok(!html.includes('<a>'));
 }
 const birth=renderBirth(ctx,s);assert.ok(birth.includes(localized[lang].replace('<b>','&lt;b&gt;')));for(const v of ['1980','2024','20,000','2.2','Q4','65','68','47'])assert.ok(birth.includes(v),v);
 const stats=renderStats(ctx,s);assert.ok(stats.includes('$123,456'));assert.ok(!stats.includes('123456%'));assert.ok(!stats.includes('width:101%'));
 const ending=renderEnding(ctx,s,{archetype:{icon:'★',title:localized,desc:localized},outlived:72,achievements:[{id:'one',title:localized,desc:localized}]});assert.ok(ending.includes('72%'));assert.ok(ending.includes('★'));assert.ok(ending.includes('1980'));assert.ok(ending.includes('2024'));
 assert.ok(renderAchievements(ctx,[{id:'one',title:localized,desc:localized}],['one']).includes('1/1'));
 const past=renderPastLives(ctx,[{name:'Past <a>',yearsLived:60,birthYear:1900,countryId:'AAA',archetype:localized,causeOfDeath:localized,timestamp:'date',urban:false}]);assert.ok(past.includes('60.0'));assert.ok(past.includes('1960'));assert.ok(past.includes('Past &lt;a&gt;'));
});
test('story has eight most recent entries, full log is chronological with facts',()=>{
 const ctx=createContext({countries:[]},{lang:'en'});const s=fixture();s.log=Array.from({length:10},(_,i)=>({age:10-i,type:'joy',text:`entry-${10-i}`,fact:`fact-${10-i}`}));
 assert.ok(!renderStory(ctx,s).includes('entry-1<'));const full=renderStory(ctx,s,{full:true});assert.ok(full.indexOf('entry-1<')<full.indexOf('entry-10<'));assert.ok(full.includes('fact-1'));
});
test('source labels and browser control words are complete',()=>{
 const keys='resume past achievements shop log nextDecision auto pause save reroll random start begin next back copy clear confirmClear language seed year birthTitle endingTitle wealth age loading loadError retry sourceNote empty focus fullLog buy paused noSave saveError close'.split(' ');
 for(const lang of ['en','ja','zh']){const ctx=createContext({countries:[]},{lang});for(const k of keys)assert.ok(word(ctx,k)&&word(ctx,k)!==k,k);}
 assert.equal(escapeHtml('<img onerror="bad">'),'&lt;img onerror=&quot;bad&quot;&gt;');assert.equal(money({},123456),'$123,456');
});
test('dashboard and ending expose complete family and demographic summaries',()=>{
 const ctx=createContext({countries:[]},{lang:'en'}),s=fixture();const info=renderPlayerInfo(ctx,s);
 for(const text of ['Health','Family','Partner','Children','Grandchildren','Cohort still alive','Years left (avg)','Education']){
 const html=text==='Health'?renderStats(ctx,s):info;assert.ok(html.includes(text),text);
 }
 for(const text of ['Mother','Father','65','†','Partner &lt;a&gt;','Child &lt;a&gt;','a pet dog'])assert.ok(info.includes(text),text);
 s.family.dad.absent=true;assert.ok(renderBirth(ctx,s).includes('Absent from the household'));
 const html=renderEnding(ctx,s,{outlived:50});for(const label of ['Cause of death','Country life expectancy','Outlived','Children','Grandchildren','Wealth','Education'])assert.ok(html.includes(label));
});
test('archive caps displayed lives and average to fifty, without mutating input',()=>{
 const ctx=createContext({countries:[]},{lang:'en'});const lives=Array.from({length:51},(_,i)=>({name:`past-${i}`,yearsLived:i===50?999:40,birthYear:1900,countryId:'A'}));
 const html=renderPastLives(ctx,lives);assert.ok(html.includes('Lives lived: 50'));assert.ok(html.includes('40.0'));assert.ok(!html.includes('past-50'));assert.equal(lives.length,51);
});

