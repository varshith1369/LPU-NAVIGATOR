import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const html=readFileSync('dist/index.html','utf8');
const js=readFileSync('dist'+html.match(/src="([^"]+\.js)"/)[1],'utf8');
const pause=()=>new Promise(r=>setTimeout(r,150));
for(const query of ['', '?view=conversations&room=1']) {
  const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(html,{url:'https://lpu-campus-navigator-lpu.vercel.app/'+query,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
  const w=dom.window;
  w.ResizeObserver=class{observe(){}disconnect(){}};
  w.SVGSVGElement.prototype.createSVGRect=()=>({});
  let notes=0,closed=0;
  w.AudioContext=class{
    currentTime=0;destination={};
    async resume(){} async close(){closed++;}
    createGain(){return {gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}
    createOscillator(){return {frequency:{value:0},connect(){},start(){notes++;},stop(){}};}
  };
  w.fetch=async path=> {
    if(path.endsWith('/profile'))return Response.json({error:'Sign in'},{status:401});
    if(path.endsWith('/locations'))return Response.json({items:JSON.parse(readFileSync('frontend/src/data/campus.json','utf8')).mapped});
    return Response.json([]);
  };
  try {
    w.eval(js);await pause();
    assert.equal(notes,0,'No sound before user interaction');
    if(!query){
      assert.ok(w.document.querySelector('.campus-opening').textContent.includes('Y VARSHITH REDDY'));
      assert.ok(w.document.querySelector('[inert]'));
      [...w.document.querySelectorAll('button')].find(b=>b.textContent.includes('Enter with music')).click();await pause();
      assert.equal(w.document.querySelector('.campus-opening'),null);
      assert.equal(w.document.querySelector('[inert]'),null);
      assert.equal(notes,8);
      w.document.querySelector('.welcome-sound').click();await pause();
      assert.equal(closed,1);
    }else assert.equal(w.document.querySelector('.campus-opening'),null,'Notification links bypass intro');
    assert.deepEqual(errors,[]);
  }finally{w.close();}
}
console.log('Opening credit, enter/skip behavior, opt-in music, stop control and notification-link bypass passed.');
