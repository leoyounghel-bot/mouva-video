import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(root,'deliverables/wuxia-duel-20260930');
const project=JSON.parse(await fs.readFile(path.join(out,'雨门双锋-3D动作项目.json'),'utf8'));
const scene=project.shots[0].takes[0].scene;
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:960,height:540}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5193/scene-render.html');await page.waitForFunction(()=>typeof window.mouvaInitScene==='function');
  await page.evaluate(async input=>window.mouvaInitScene(input),{scene,assets:project.assets,width:960,height:540});
  const frame=async time=>Buffer.from(await page.evaluate(t=>window.mouvaSceneFrame(t),time),'base64');
  const zero=await frame(0),hit=await frame(5.7),ending=await frame(32),rewound=await frame(0),again=await frame(5.7);
  const hash=b=>createHash('sha256').update(b).digest('hex');
  assert.notEqual(hash(zero),hash(hit),'GLB animation must visibly move the two fighters');
  assert.notEqual(hash(hit),hash(ending),'Animation must continue beyond the first clash');
  assert.equal(hash(zero),hash(rewound),'Seeking backwards after the clip finishes must restore the initial pose');
  assert.equal(hash(hit),hash(again),'Export and scrub must produce the same pose for the same time');
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'native-animation-proof.png'),hit);
  await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({nativeAnimation:true,seekAfterEnd:true,deterministic:true,pageErrors:errors,verifiedAt:new Date().toISOString()},null,2));
  console.log('PASS: animated GLB, end-frame, reverse seeking and deterministic frame export.');
} finally {await browser.close();}
