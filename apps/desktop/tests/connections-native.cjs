// Synthetic, read-only fixture against the actual main process and preload.
const {app, BrowserWindow, net}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'semantic-connections-native-'));
app.setPath('userData',path.join(fixture,'profile'));
fs.writeFileSync(path.join(fixture,'graph.json'),'{}');
process.env.SEMANTIC_LINEAGE_SNAPSHOT=path.join(fixture,'graph.json');
process.env.SEMANTIC_ZENDESK_SNAPSHOT=fixture;
async function fetchFixture(raw){
  const url=String(raw);
  if(url==='http://127.0.0.1:5056/health')return new Response(JSON.stringify({status:'ok',tracking_uri:'http://127.0.0.1:5055/secret?credential=private#hidden',experiment_id:'hidden',project_root:'/private'}));
  const key=url.includes('/agents')?'agents':url.includes('/page-plugins')?'plugins':'research';
  return new Response(JSON.stringify({[key]:[]}));
}
globalThis.fetch=fetchFixture;net.fetch=fetchFixture;
let finished=false;
const deadline=setTimeout(()=>{console.error('Native connection fixture timed out.');app.exit(1);},30000);
app.on('browser-window-created',(_event,win)=>{
 win.webContents.once('did-finish-load',async()=>{
  try{
   const bridge=await win.webContents.executeJavaScript(`(async()=>{
    const data=await window.semantic.read({operation:'connections.list'});
    let rejected=false;try{await window.semantic.read({operation:'connections.list',url:'https://example.com'});}catch{rejected=true;}
    return {count:data.connections.length,safe:!JSON.stringify(data).match(/secret|private|hidden/),rejected,isolated:typeof require==='undefined'&&typeof process==='undefined'};
   })()`);
   assert.deepEqual(bridge,{count:7,safe:true,rejected:true,isolated:true});
   const output=path.resolve(__dirname,'../../../var/qa');fs.mkdirSync(output,{recursive:true});
   for(const label of ['Connections','Integrations']){
    await win.webContents.executeJavaScript(`document.querySelector('nav button.active')?.blur();[...document.querySelectorAll('nav button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);
    for(let i=0;i<100;i++){
     if(await win.webContents.executeJavaScript(`document.querySelectorAll('.connection-card').length===7`))break;
     await new Promise(resolve=>setTimeout(resolve,20));
    }
    const count=await win.webContents.executeJavaScript(`document.querySelectorAll('.connection-card').length`);assert.equal(count,7);
    await win.webContents.executeJavaScript(`document.fonts.ready`);
    fs.writeFileSync(path.join(output,`${label.toLowerCase()}.png`),(await win.webContents.capturePage()).toPNG());
   }
   const nav=await win.webContents.executeJavaScript(`[...document.querySelectorAll('nav button')].map(b=>b.textContent)`);
   for(const name of ['Research','Proposals','Codex','Semantic Layer'])assert.ok(nav.includes(name));
   const resized=new Promise(resolve=>win.once('resize',resolve));win.setSize(900,900);await resized;
   const layout=await win.webContents.executeJavaScript(`({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,cards:document.querySelectorAll('.connection-card').length})`);
   assert.ok(layout.scroll<=layout.width,'The desktop page must fit its minimum width.');assert.equal(layout.cards,7);
   console.log('PASS: actual preload inventory, malformed request rejection, safe endpoints, desktop isolation, preserved navigation and synthetic screen captures.');
   finished=true;clearTimeout(deadline);app.exit(0);
  }catch{console.error('Native connection fixture failed.');clearTimeout(deadline);app.exit(1);}
 });
});
app.on('will-quit',()=>{if(finished)fs.rmSync(fixture,{recursive:true,force:true});});
require(path.resolve(__dirname,'../dist-electron/main.cjs'));
