import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import * as T from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createDuel,duration} from './scene.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.join(root,'deliverables/wuxia-duel-20260930');
await fs.mkdir(output,{recursive:true});
// Node has Blob but not FileReader. GLTFExporter only needs these two methods.
globalThis.FileReader=class {
  readAsArrayBuffer(blob){blob.arrayBuffer().then(b=>{this.result=b;this.onloadend?.();});}
  readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result=`data:${blob.type};base64,${Buffer.from(b).toString('base64')}`;this.onloadend?.();});}
};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');let file;
    if(url.pathname==='/')file=path.join(root,'scripts/wuxia/preview.html');
    else if(url.pathname==='/scene.mjs')file=path.join(root,'scripts/wuxia/scene.mjs');
    else if(url.pathname==='/font.ttf')file=path.join(root,'public/fonts/NotoSansSC.ttf');
    else if(url.pathname.startsWith('/three/')) {
      const base=path.join(root,'node_modules/three');file=path.resolve(base,url.pathname.slice(7));if(!file.startsWith(base+path.sep))throw new Error('Invalid path');
    } else if(url.pathname.startsWith('/film/')) {
      file=path.resolve(output,decodeURIComponent(url.pathname.slice(6)));if(!file.startsWith(output+path.sep))throw new Error('Invalid path');
    } else {res.writeHead(404);res.end();return;}
    const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.ttf':'font/ttf','.mp4':'video/mp4','.jpg':'image/jpeg','.json':'application/json','.glb':'model/gltf-binary'};
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(await fs.readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(5191,'127.0.0.1',resolve);});
console.log('Film preview: http://127.0.0.1:5191/');
const args=new Set(process.argv.slice(2));
if(args.has('--glb')) {
  const film=createDuel(),objects=[];film.fighters.forEach(f=>f.root.traverse(o=>objects.push(o)));
  const times=Array.from({length:duration*12+1},(_,i)=>i/12),values=new Map(objects.map(o=>[o,{p:[],q:[],s:[]}])) ;
  for(const t of times) {film.draw(t);for(const o of objects){const v=values.get(o);v.p.push(...o.position.toArray());v.q.push(...o.quaternion.toArray());v.s.push(...o.scale.toArray());}}
  const tracks=[];
  for(const o of objects){const v=values.get(o);for(const [key,prop,size,Type]of[['p','position',3,T.VectorKeyframeTrack],['q','quaternion',4,T.QuaternionKeyframeTrack],['s','scale',3,T.VectorKeyframeTrack]]){
    if(v[key].some((n,i)=>Math.abs(n-v[key][i%size])>1e-5))tracks.push(new Type(`${o.name}.${prop}`,times,v[key]));
  }}
  film.draw(0);const clip=new T.AnimationClip('雨门双锋_完整双人动作',duration,tracks);
  const glb=await new GLTFExporter().parseAsync(film.world,{binary:true,animations:[clip],onlyVisible:true});
  await fs.writeFile(path.join(output,'雨门双锋-可编辑动作.glb'),Buffer.from(glb));
  console.log(`Animated GLB: ${tracks.length} tracks, ${Math.round(glb.byteLength/1024)} KB`);
}
if(args.has('--stills')||args.has('--render')) {
  const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
    page.on('pageerror',e=>console.error('Render error:',e.message));
    await page.goto('http://127.0.0.1:5191/?render');await page.waitForFunction(()=>window.filmReady,{timeout:60000});
    for(const t of [2.5,5.7,12.2,16.0,22.25,28.25]) {await page.evaluate(t=>window.renderFrame(t),t);await page.screenshot({path:path.join(output,`frame-${String(t).replace('.','-')}.jpg`),type:'jpeg',quality:92});}
    console.log('Six review frames saved.');
    if(args.has('--render')) {
      const silent=path.join(output,'silent.mp4'),fps=24;
      const encoder=spawn('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-vcodec','png','-framerate',String(fps),'-i','pipe:0','-an','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',silent],{stdio:['pipe','ignore','pipe']});
      let errors='';encoder.stderr.on('data',d=>errors+=d);
      const completion=once(encoder,'close');
      for(let i=0;i<duration*fps;i++) {
        await page.evaluate(t=>window.renderFrame(t),i/fps);
        const buffer=await page.screenshot({type:'png'});
        if(!encoder.stdin.write(buffer))await once(encoder.stdin,'drain');
        if(i%(fps*2)===0)console.log(`Rendering ${i/fps}s / ${duration}s`);
      }
      encoder.stdin.end();const [code]=await completion;if(code!==0)throw new Error(errors);console.log('Silent film complete.');
    }
  }finally{await browser.close();}
}
if(args.has('--serve'))console.log('Preview remains available; stop with Ctrl+C.');
else server.close();
