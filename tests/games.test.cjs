// Run with: node --test tests/games.test.cjs (no dependencies).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const engineSource=source.slice(0,source.indexOf('    const $ ='));
const context=vm.createContext({performance});vm.runInContext(engineSource,context);
const rules=vm.runInContext('createRules()',context),chooseAI=vm.runInContext('chooseAI',context);
const plain=v=>JSON.parse(JSON.stringify(v));
const empty=()=>Array(25).fill('');
const put=(xs,os)=>{const b=empty();xs.forEach(i=>b[i]='X');os.forEach(i=>b[i]='O');return b;};
const move=(from,to,captured=null)=>({from,to,captured});
test('Reference topology: exactly 25 points, 56 undirected edges and exact 24-piece arrangement',()=>{
 const graph=rules.graphs.twelve;
 assert.equal(graph.length,25);assert.equal(graph.reduce((sum,a)=>sum+a.length,0)/2,56);
 // Independent explicit diagonal segments read from the supplied image.
 const diagonals=[[0,6],[2,6],[2,8],[4,8],[6,10],[6,12],[8,12],[8,14],[10,16],[12,16],[12,18],[14,18],[16,20],[16,22],[18,22],[18,24]];
 const expected=new Set(diagonals.map(([a,b])=>`${a}:${b}`));
 for(let r=0;r<5;r++)for(let c=0;c<5;c++){
  const i=r*5+c;if(c<4)expected.add(`${i}:${i+1}`);if(r<4)expected.add(`${i}:${i+5}`);
 }
 const actual=new Set();graph.forEach((ns,a)=>ns.forEach(b=>{assert(graph[b].includes(a));if(a<b)actual.add(`${a}:${b}`)}));
 assert.deepEqual([...actual].sort(),[...expected].sort());
 const b=rules.initial('twelve');assert.equal(b.filter(x=>x==='X').length,12);assert.equal(b.filter(x=>x==='O').length,12);
 assert.deepEqual(plain(b.slice(0,12)),Array(12).fill('X'));assert.equal(b[12],'');assert.deepEqual(plain(b.slice(13)),Array(12).fill('O'));
 assert(!graph[1].includes(7),'No nonexistent diagonal');assert(graph[0].includes(6));
});
test('Three Men\'s Morris: exhaustive four-line detection and adjacency remain unchanged',()=>{
 const allowed=[[3,4,5],[1,4,7],[0,4,8],[2,4,6]];
 for(let code=0;code<19683;code++){
  let n=code;const b=Array.from({length:9},()=>{let v=n%3;n=Math.floor(n/3);return ['','X','O'][v]});
  const expected=allowed.find(l=>b[l[0]]&&l.every(i=>b[i]===b[l[0]]));
  assert.deepEqual(plain(rules.line('morris',b)||null),expected||null);
 }
 assert(!rules.line('morris',rules.initial('morris')));
 const expected=[[1,3,4],[0,2,4],[1,4,5],[0,4,6],[0,1,2,3,5,6,7,8],[2,4,8],[3,4,7],[4,6,8],[4,5,7]];
 rules.graphs.morris.forEach((a,i)=>assert.deepEqual(plain(a).sort((a,b)=>a-b),expected[i]));
 assert(rules.moves('morris',rules.initial('morris'),'X').every(m=>m.captured===null));
});
test('Forced capture, empty landing, valid straight segments, no multiple occupied jumps',()=>{
 const b=put([0,24],[1,7,23]);
 const legal=plain(rules.moves('twelve',b,'X'));
 assert(legal.some(m=>m.from===0&&m.to===2&&m.captured===1));
 assert(legal.every(m=>m.captured!==null),'Slides forbidden while a capture exists');
 assert(!legal.some(m=>m.from===0&&m.to===4),'Cannot jump two opponents');
 const next=rules.apply(b,legal[0],'X');assert.equal(next[legal[0].captured],'');
 assert(!rules.moves('twelve',put([0,2],[1]),'X').some(m=>m.from===0&&m.to===2));
 assert(!rules.captures('twelve',put([1],[7]),'X').some(m=>m.to===13),'Missing diagonal must not capture');
 assert(!rules.captures('twelve',put([0],[1,2]),'X').some(m=>m.to===2),'Occupied landing');
});
test('Capture chains stay on one piece, change direction, and enumerate every complete branch',()=>{
 const b=put([0,20],[1,7,13,21]);
 const actions=rules.turns('twelve',b,'X');
 const chain=actions.find(a=>a.steps[0].from===0&&a.steps[0].to===2&&a.steps[1]?.to===12&&a.steps[2]?.to===14);
 assert(chain,'Three jumps with changes in direction must exist');
 assert.deepEqual(plain(chain.steps),[move(0,2,1),move(2,12,7),move(12,14,13)]);
 assert.equal(chain.board.filter(x=>x==='O').length,1);
 for(const action of actions){
  let state=b;
  for(let i=0;i<action.steps.length;i++){
   const step=action.steps[i];if(i)assert.equal(step.from,action.steps[i-1].to);
   assert(rules.moves('twelve',state,'X',i?step.from:null).some(m=>m.from===step.from&&m.to===step.to));
   state=rules.apply(state,step,'X');
  }
  assert.equal(rules.captures('twelve',state,'X',action.steps.at(-1).to).length,0);
 }
 // Both a shorter complete chain and a longer one remain legal choices.
 assert(new Set(actions.map(a=>a.steps.length)).size>1);
});
test('Both AI sides and all levels obey mandatory complete capture sequences',()=>{
 for(const ai of ['X','O'])for(const level of ['easy','medium','hard']){
  const b=put([0,20],[1,7,13,21]);const state=ai==='X'?b:b.map(v=>v?rules.other(v):'');
  const steps=chooseAI(rules,{game:'twelve',board:state,turn:ai,level,budget:40});
  assert(steps.length>=1);let current=state,forced=null;
  for(const step of steps){assert(rules.moves('twelve',current,ai,forced).some(m=>JSON.stringify(m)===JSON.stringify(step)));current=rules.apply(current,step,ai);forced=step.to;}
  assert.equal(rules.captures('twelve',current,ai,forced).length,0);
 }
});
test('Winners, blocked positions and repeat/quiet draws',()=>{
 assert.equal(rules.outcome('twelve',put([0],[]),'O').winner,'X');
 assert.equal(rules.outcome('twelve',put([0],[1,2,5,6,10,12]),'X').winner,'O');
 const b=rules.initial('twelve'),seen=new Map([[rules.key(b,'X'),3]]);
 assert.equal(rules.outcome('twelve',b,'X',seen).winner,'draw');
 assert.equal(rules.outcome('twelve',b,'X',new Map(),100).winner,'draw');
});
test('Full matches at every difficulty, both games and both computer sides remain legal and finite',()=>{
 for(const game of ['morris','twelve'])for(const level of ['easy','medium','hard'])for(const ai of ['X','O']){
  let b=rules.initial(game),turn='X',quiet=0,seen=new Map([[rules.key(b,turn),1]]),finished=false;
  for(let ply=0;ply<2600;ply++){
   const result=rules.outcome(game,b,turn,seen,quiet);if(result){finished=true;break;}
   const steps=turn===ai?chooseAI(rules,{game,board:b,turn,level,history:[...seen],quiet,budget:20}):rules.turns(game,b,turn)[ply%rules.turns(game,b,turn).length].steps;
   let forced=null,captured=false;
   for(const step of steps){
    assert(rules.moves(game,b,turn,forced).some(m=>JSON.stringify(m)===JSON.stringify(step)));
    b=rules.apply(b,step,turn);captured ||= step.captured!==null;forced=step.captured!==null?step.to:null;
   }
   if(forced!==null)assert.equal(rules.captures(game,b,turn,forced).length,0);
   if(game==='morris')assert.equal(b.filter(Boolean).length,6);
   quiet=captured?0:quiet+1;turn=rules.other(turn);const key=rules.key(b,turn);seen.set(key,(seen.get(key)||0)+1);
  }
  assert(finished,`${game}/${level}/${ai} must finish`);
 }
});

// Small DOM/audio/worker fakes exercise the actual inline application, not a copy.
function browserHarness({preferences=null,results=null,storageBlocked=false,worker=false,audio=true}={}) {
  const timers=new Map(),intervals=new Map(),elements={},documentEvents={},workerEvents=[],urls=new Map(),notes=[];
  let serial=0,contexts=0;const stored={};
  if(preferences)stored['woodland-classics-preferences-v1']=JSON.stringify(preferences);
  if(results)stored['woodland-classics-results-v1']=JSON.stringify(results);
  function element() {
    const classes=new Set();let content='';
    return {value:'',checked:false,hidden:false,disabled:false,children:[],dataset:{},events:{},attributes:{},style:{values:{},setProperty(k,v){this.values[k]=v}},
      className:'',textContent:'',focus(){},append(child){this.children.push(child)},setAttribute(k,v){this.attributes[k]=v},
      addEventListener(k,fn){this.events[k]=fn},
      get innerHTML(){return content},set innerHTML(value){content=value;this.children=[];},
      classList:{add(c){classes.add(c)},toggle(c,on){on?classes.add(c):classes.delete(c)},contains:c=>classes.has(c)}};
  }
  const get=s=>elements[s] ||= element();
  const document={hidden:false,title:'',documentElement:element(),querySelector:get,createElement:element,
    querySelectorAll:s=>s==='.palette-choice'?get('#palette-options').children:[],addEventListener(k,fn){(documentEvents[k] ||= []).push(fn)}};
  for(const [id,value] of [['game','morris'],['mode','pvp'],['difficulty','easy'],['colors','redblue'],['side','X']])get('#'+id).value=value;
  for(const id of ['setup-screen','game-screen','audio-note'])if(new RegExp('id=\"'+id+'\" hidden').test(html))get('#'+id).hidden=true;
  class AudioContext {
    constructor(){contexts++;this.state='suspended';this.currentTime=1;this.destination={};}
    resume(){this.state='running';return Promise.resolve();}
    createGain(){return {gain:{value:0,setValueAtTime(v){this.value=v},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
    createOscillator(){return {frequency:{value:0},connect(){},disconnect(){},start(){notes.push(this.frequency.value)},stop(){}};}
  }
  class Blob {constructor(parts){this.source=parts.join('');}}
  class Worker {
    constructor(url){this.source=urls.get(url).source;this.terminated=false;}
    postMessage(job){
      const ctx=vm.createContext({performance,postMessage:data=>workerEvents.push(()=>this.onmessage?.({data}))});
      vm.runInContext(this.source,ctx);ctx.job=job;vm.runInContext('onmessage({data:job})',ctx);
    }
    terminate(){this.terminated=true;}
  }
  const localStorage={getItem(k){if(storageBlocked)throw Error('blocked');return stored[k]||null;},setItem(k,v){if(storageBlocked)throw Error('blocked');stored[k]=v;}};
  const c=vm.createContext({document,window:audio?{AudioContext}:{},localStorage,performance,
    setTimeout:fn=>{timers.set(++serial,fn);return serial},clearTimeout:id=>timers.delete(id),
    setInterval:fn=>{intervals.set(++serial,fn);return serial},clearInterval:id=>intervals.delete(id),
    ...(worker?{Worker,Blob,URL:{createObjectURL(blob){const url='blob:'+ ++serial;urls.set(url,blob);return url},revokeObjectURL(url){urls.delete(url)}}}:{})});
  vm.runInContext(source,c);
  const run=s=>vm.runInContext(s,c),call=(fn,...args)=>{c.args=args;return run(`${fn}(...args)`)};
  const flush=()=>{const entry=timers.entries().next().value;assert(entry,'Pending timer expected');timers.delete(entry[0]);entry[1]();};
  return {c,run,call,get,document,documentEvents,timers,intervals,workerEvents,urls,notes,flush,stored:()=>stored['woodland-classics-preferences-v1'],results:()=>JSON.parse(stored['woodland-classics-results-v1']||'null'),contexts:()=>contexts};
}
test('Setup, six previews, English-only interface and safe local preferences',async()=>{
  assert(!/[\u0980-\u09ff]/.test(html),'No Bengali text anywhere in the page');
  const t=browserHarness({preferences:{game:'twelve',mode:'computer',level:'hard',palette:'orangesky',side:'O',sound:false,music:true}});
  assert.equal(t.run('active'),false);assert.equal(t.contexts(),0);
  assert.equal(t.get('#game').value,'twelve');assert.equal(t.get('#colors').value,'orangesky');assert.equal(t.get('#palette-options').children.length,6);
  assert.equal(t.get('#difficulty-field').hidden,false);assert.equal(t.run('musicEnabled'),true);assert.equal(t.run('soundEnabled'),false);
  for(const key of t.run('Object.keys(palettes)')){
    t.get('#colors').value=key;t.call('setupChanged');assert.equal(JSON.parse(t.stored()).palette,key);
    const selected=t.get('#palette-options').children.filter(b=>b.attributes['aria-pressed']==='true');assert.equal(selected.length,1);assert.equal(selected[0].dataset.palette,key);
  }
  t.get('#mode').value='pvp';t.call('setupChanged');assert.equal(t.get('#difficulty-field').hidden,true);
  t.call('playGame');assert.equal(t.get('#board').children.length,25);assert.equal(t.get('#game-title').textContent,'Twelve Guti');assert.equal(t.get('#setup-screen').hidden,true);
  assert.equal(t.run("board.filter(v=>v==='X').length"),12);assert.equal(t.run("board.filter(v=>v==='O').length"),12);
  const reload=browserHarness({preferences:JSON.parse(t.stored())});assert.equal(reload.get('#colors').value,t.get('#colors').value);
  const blocked=browserHarness({storageBlocked:true});blocked.call('setupChanged');blocked.call('playGame');assert.equal(blocked.run('active'),true);
  await Promise.resolve();
});
test('Human capture chain locks same piece, counts captures immediately and switches only after final jump',()=>{
  const t=browserHarness();t.get('#game').value='twelve';t.call('playGame');
  t.c.fixture=put([0,20],[1,7,13,21]);t.run("board=fixture.slice();turn='X';history=new Map();render()");
  t.call('makeMove',0);t.call('makeMove',2);
  assert.equal(t.run('forced'),2);assert.equal(t.run('turn'),'X');assert.equal(t.run('turnNumber'),0);assert.equal(t.run('board[1]'),'');
  assert(t.get('#capture-count').textContent.includes('captured 9'));
  t.call('makeMove',20);assert.equal(t.run('selected'),2,'Cannot switch piece during chain');
  t.call('makeMove',3);assert.equal(t.run('forced'),2,'Cannot end chain with a slide');
  t.call('makeMove',12);assert.equal(t.run('forced'),12);assert.equal(t.run('board[7]'),'');
  t.call('makeMove',14);assert.equal(t.run('forced'),null);assert.equal(t.run('turn'),'O');assert.equal(t.run('turnNumber'),1);assert.equal(t.run("board.filter(v=>v==='O').length"),1);
  assert.equal(t.run('quiet'),0);assert(t.get('#capture-count').textContent.includes('captured 11'));
  t.call('restartGame');assert.equal(t.run('board.filter(Boolean).length'),24);assert.equal(t.run('forced'),null);
});
test('Human invalid/occupied/nonexistent moves never change game state; Morris cannot capture',()=>{
  for(const game of ['morris','twelve']){
    const t=browserHarness();t.get('#game').value=game;t.call('playGame');
    const before=t.run('JSON.stringify(board)');
    t.call('makeMove',0);t.call('makeMove',1);assert.equal(t.run('JSON.stringify(board)'),before);
    assert.equal(t.call('commitStep',move(0,game==='morris'?8:24)),false);
    assert.equal(t.run('JSON.stringify(board)'),before);
  }
});
test('Computer applies full chains with visible intermediate jumps, for every level and either side',()=>{
  for(const side of ['X','O'])for(const level of ['easy','medium','hard']){
    const t=browserHarness({worker:true});t.get('#game').value='twelve';t.get('#mode').value='computer';t.get('#difficulty').value=level;t.get('#side').value=rules.other(side);t.call('playGame');t.call('cancelComputer');
    const fixture=put([0],[1,7,13]);t.c.fixture=side==='X'?fixture:fixture.map(v=>v?rules.other(v):'');
    t.run(`board=fixture.slice();turn='${side}';gameOver=false;history=new Map();scheduleComputer()`);
    t.flush();assert.equal(t.workerEvents.length,1);t.workerEvents.shift()();
    assert.equal(t.run('forced'),2);assert.equal(t.run('turn'),side);assert.equal(t.run('board[1]'),'');
    t.flush();assert.equal(t.run('forced'),12);assert.equal(t.run('board[7]'),'');
    t.flush();assert.equal(t.run('gameOver'),true);assert.equal(t.run(`currentScores().${side}`),1);assert.equal(t.run('board[13]'),'');assert.equal(t.urls.size,0);
  }
});
test('Completed-match alternation, Next Match, unfinished restart, isolated scores and stale worker cancellation',()=>{
  for(const game of ['morris','twelve'])for(const mode of ['pvp','computer'])for(const side of ['X','O']){
    const t=browserHarness({worker:true});t.get('#game').value=game;t.get('#mode').value=mode;t.get('#side').value=side;t.call('playGame');
    assert.equal(t.run('turn'),side);t.call('restartGame');assert.equal(t.run('turn'),side);
    t.call('finish',{winner:'draw',reason:'test'});t.call('finish',{winner:'draw',reason:'duplicate'});t.call('render');
    assert.equal(t.run(`completed.${game}`),1);assert.equal(t.run('currentScores().draw'),1);assert.equal(t.get('#next-match').hidden,false);
    assert.equal(t.call('commitStep',move(0,4)),false);
    t.get('#next-match').events.click();assert.equal(t.run('turn'),rules.other(side));t.call('restartGame');assert.equal(t.run('turn'),rules.other(side));
    if(mode==='computer'){
      assert.equal(t.timers.size,1);t.flush();assert.equal(t.workerEvents.length,1);t.call('backToSetup');const before=t.run('JSON.stringify(board)');t.workerEvents.shift()();assert.equal(t.run('JSON.stringify(board)'),before);assert.equal(t.timers.size,0);assert.equal(t.urls.size,0);
    }else t.call('backToSetup');
    t.get('#game').value=game==='morris'?'twelve':'morris';t.call('playGame');assert.equal(t.run('currentScores().draw'),0);assert.equal(t.run('turn'),side);
    t.call('backToSetup');t.get('#game').value=game;t.call('playGame');assert.equal(t.run('currentScores().draw'),1);assert.equal(t.run('turn'),rules.other(side));
    t.get('#reset-scores').events.click();assert.equal(t.run(`completed.${game}`),1);
  }
});
test('AI Worker cancellation/fallback and strict search budgets remain responsive',()=>{
  const t=browserHarness();t.get('#game').value='twelve';t.get('#mode').value='computer';t.call('playGame');t.call('finish',{winner:'draw',reason:'test'});t.call('restartGame');
  const start=performance.now();t.flush();assert(performance.now()-start<500);assert.equal(t.run('turn'),'X');
  const fallback=chooseAI(rules,{game:'twelve',board:put([0],[1,7,13]),turn:'X',level:'hard',budget:0});assert.equal(fallback.length,3,'Even an expired search must produce a complete legal chain');
});
test('Audio effects, distinct capture sound, independent sound/music, mobile unlock and saved settings',async()=>{
  const t=browserHarness();assert.equal(t.contexts(),0);t.documentEvents.pointerdown[0]();await Promise.resolve();assert.equal(t.contexts(),1);
  const before=t.notes.length;t.call('playSound','capture');assert.deepEqual(t.notes.slice(before),[220,440,660]);
  await t.get('#music-toggle').events.click();assert.equal(t.intervals.size,1);assert.equal(t.get('#setup-music').checked,true);
  await t.get('#sound-toggle').events.click();assert.equal(t.run('soundEnabled'),false);assert.equal(t.intervals.size,1);assert.equal(JSON.parse(t.stored()).sound,false);
  const muted=t.notes.length;t.call('playSound','move');assert.equal(t.notes.length,muted);
  t.document.hidden=true;t.documentEvents.visibilitychange[0]();assert.equal(t.intervals.size,0);
  t.document.hidden=false;t.documentEvents.visibilitychange[0]();assert.equal(t.intervals.size,1);
  await t.get('#music-toggle').events.click();assert.equal(t.intervals.size,0);
  const unsupported=browserHarness({audio:false});unsupported.documentEvents.keydown[0]();await Promise.resolve();assert(unsupported.get('#audio-note').textContent.includes('unavailable'));unsupported.call('playGame');assert.equal(unsupported.run('active'),true);
});

test('Three distinct screens: selection has exactly two cards, no settings, and accurate engine-built previews',()=>{
  const t=browserHarness();
  assert.equal(t.get('#selection-screen').hidden,false);assert.equal(t.get('#setup-screen').hidden,true);assert.equal(t.get('#game-screen').hidden,true);assert.equal(t.get('#audio-note').hidden,true);
  const selection=html.slice(html.indexOf('<section id="selection-screen"'),html.indexOf('<section id="setup-screen"'));
  assert.equal((selection.match(/<button /g)||[]).length,2);assert(!/<select|<input/.test(selection));
  for(const game of ['morris','twelve']){
    const preview=t.get('#preview-'+game).innerHTML;
    const path=preview.match(/<path d="([^"]*)"/)[1];
    assert.equal((path.match(/M/g)||[]).length,rules.graphs[game].reduce((n,links)=>n+links.length,0)/2);
    assert.equal((preview.match(/<use href="#petal-flower"/g)||[]).length,game==='morris'?6:24);
    t.get('#select-'+game).events.click();
    assert.equal(t.get('#selection-screen').hidden,true);assert.equal(t.get('#setup-screen').hidden,false);assert.equal(t.get('#game-screen').hidden,true);
    assert.equal(t.get('#game').value,game);assert.equal(t.get('#setup-game-title').textContent,game==='morris'?"Three Men's Morris":'Twelve Guti');
    assert.equal(t.get('#select-'+game).attributes['aria-pressed'],'true');
    t.get('#play-game').events.click();assert.equal(t.get('#setup-screen').hidden,true);assert.equal(t.get('#game-screen').hidden,false);
    assert.equal(t.get('#board').children.length,game==='morris'?9:25);
    t.get('#back-setup').events.click();assert.equal(t.get('#setup-screen').hidden,false);assert.equal(t.get('#game-screen').hidden,true);
    t.get('#back-selection').events.click();assert.equal(t.get('#selection-screen').hidden,false);assert.equal(t.get('#setup-screen').hidden,true);assert.equal(t.get('#audio-note').hidden,true);
  }
  assert.equal(t.contexts(),1); // Only Play (a user action) unlocked audio.
});
test('All game/mode/difficulty/color/side setups keep selected colors, legal first turns and no stale computation',()=>{
  const t=browserHarness({worker:true});let combinations=0;
  for(const game of ['morris','twelve'])for(const mode of ['pvp','computer'])for(const level of ['easy','medium','hard'])for(const color of ['redblue','greengold','blackwhite','purplesilver','browncream','orangesky'])for(const side of ['X','O']){
    t.call('selectGame',game);t.get('#mode').value=mode;t.get('#difficulty').value=level;t.get('#colors').value=color;t.get('#side').value=side;t.call('setupChanged');
    assert.equal(t.get('#difficulty-field').hidden,mode==='pvp');t.call('playGame');
    assert.equal(t.run('config.game'),game);assert.equal(t.run('currentPalette'),color);assert.equal(t.run('turn'),side);
    const colors=t.run('palettes[currentPalette].values');assert.notEqual(colors[0],colors[3]);
    assert.deepEqual(plain(t.run('board')),plain(rules.initial(game)));assert.equal(t.timers.size,0);
    // Completing one round makes Player 2/the computer start; all screens can still cancel it.
    t.call('finish',{winner:'draw',reason:'fixture'});t.call('restartGame');assert.equal(t.run('turn'),rules.other(side));
    if(mode==='computer'){assert.equal(t.timers.size,1);t.flush();const callback=t.workerEvents.shift();assert(callback);t.call('backToSetup');t.call('backToSelection');const before=t.run('JSON.stringify(board)');callback();assert.equal(t.run('JSON.stringify(board)'),before);}
    else {t.call('backToSetup');t.call('backToSelection');}
    // Isolate each setup combination while still testing the actual turn/score lifecycle.
    t.run(`completed.${game}=0`);combinations++;
  }
  assert.equal(combinations,144);assert.equal(t.urls.size,0);
});
test('Scores and starter sequences survive reload, remain per-game, validate corrupt data and reset safely',()=>{
  const t=browserHarness();t.call('selectGame','morris');t.call('playGame');t.call('finish',{winner:'X',reason:'test'});
  t.call('backToSetup');t.call('backToSelection');t.call('selectGame','twelve');t.call('playGame');t.call('finish',{winner:'draw',reason:'test'});
  const reloaded=browserHarness({preferences:JSON.parse(t.stored()),results:t.results()});
  assert.equal(reloaded.get('#selection-screen').hidden,false);assert.equal(reloaded.get('#setup-screen').hidden,true);
  reloaded.call('selectGame','morris');reloaded.call('playGame');assert.equal(reloaded.run('currentScores().X'),1);assert.equal(reloaded.run('turn'),'O');
  reloaded.call('restartGame');assert.equal(reloaded.run('completed.morris'),1);assert.equal(reloaded.run('turn'),'O');
  reloaded.get('#reset-scores').events.click();assert.equal(reloaded.run('currentScores().X'),0);assert.equal(reloaded.results().completed.morris,1);assert.equal(reloaded.results().scores['morris:pvp::X'].X,0);
  reloaded.call('backToSetup');reloaded.call('selectGame','twelve');reloaded.call('playGame');assert.equal(reloaded.run('currentScores().draw'),1);
  const corrupt=browserHarness({results:{completed:{morris:-1,twelve:'bad'},scores:{'morris:pvp::X':{X:-1,O:0,draw:0},'__proto__':{X:5,O:5,draw:5},'twelve:computer:easy:O':{X:2,O:3,draw:1}}}});
  assert.equal(corrupt.run('completed.morris'),0);assert.equal(corrupt.run('Object.keys(scores).length'),2); // valid Twelve record plus initialized Morris score
  const blocked=browserHarness({storageBlocked:true});blocked.call('selectGame','twelve');blocked.call('playGame');blocked.call('finish',{winner:'draw',reason:'test'});assert.equal(blocked.run('completed.twelve'),1);
});
test('Both games share a 9%-of-board visible piece scale while full cells remain touch targets; capture ghosts fade',()=>{
  assert(html.includes('width: calc(var(--board-size,3) * 9%)'));
  assert(!/\.board-wrap\.twelve \.cell \.token \{ width:/.test(html));
  // At the supported 320px viewport, even the 5-point board has >=44px cells.
  const available=320-24-4-24-6;assert(available/5>=44);
  const t=browserHarness();t.call('selectGame','twelve');t.call('playGame');t.c.fixture=put([0,20],[1,7,13,21]);t.run("board=fixture.slice();turn='X';render()");t.call('makeMove',0);t.call('makeMove',2);
  assert.equal(t.run('board[1]'),'');assert(t.get('#board').children[1].innerHTML.includes('token o capture-ghost'));
  assert(html.includes('@keyframes captured-piece'));assert(html.includes('animation: none !important'));
});
