import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {duration,hits} from './scene.mjs';
const out=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../deliverables/wuxia-duel-20260930');
const rate=48000,count=duration*rate,left=new Float32Array(count),right=new Float32Array(count);
let seed=73919;const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
function add(start,length,fn,pan=0){for(let j=0;j<length*rate;j++){const i=Math.floor(start*rate)+j;if(i<0||i>=count)continue;const s=fn(j/rate,j/Math.max(1,length*rate));left[i]+=s*Math.sqrt((1-pan)/2);right[i]+=s*Math.sqrt((1+pan)/2);}}
// A quiet continuous bed of rain, with low-pass smoothing instead of white hiss.
let rainL=0,rainR=0;
for(let i=0;i<count;i++){rainL=rainL*.90+noise()*.10;rainR=rainR*.90+noise()*.10;left[i]=rainL*.13;right[i]=rainR*.13;}
// Original minor drone: slow attacks, slightly detuned bowed harmonics.
for(const [f,pan]of[[73.416,-.4],[146.832,.4],[220,-.15]])add(0,duration,(t,u)=>{
  const env=Math.min(1,t/3,(duration-t)/2);return env*.021*(Math.sin(t*f*Math.PI*2)+.30*Math.sin(t*f*4*Math.PI+.4*Math.sin(t*3))+.12*Math.sin(t*f*6*Math.PI))*(.85+.15*Math.sin(t*.7));
},pan);
const beats=[0.7,2.7,4.7,5.7,7.7,9.7,10.7,12.7,14.7,16.55,18.7,20.7,21.5,22.25,23,24,25,26.2,27.5,28.25,30.0];
for(const t of beats){add(t,.9,(s)=>.28*Math.sin(2*Math.PI*(46*s+24*(1-Math.exp(-s*15))/15))*Math.exp(-s*6));add(t,.09,(s)=>noise()*.07*Math.exp(-s*45),t%2>.8?.2:-.2);}
for(const [index,t]of hits.entries()) {
  add(t-.22,.24,(s,u)=>noise()*.12*Math.sin(Math.PI*u)**2*(.4+.6*u),index%2?.25:-.25);
  add(t,.7,(s)=>.115*(Math.sin(s*1770*Math.PI*2)+.6*Math.sin(s*2647*Math.PI*2)+.3*Math.sin(s*4211*Math.PI*2))*Math.exp(-s*16),index%2?-.25:.25);
  add(t,.15,(s)=>noise()*.13*Math.exp(-s*32));
  add(t+.06,.3,(s)=>.09*Math.sin(s*78*Math.PI*2)*Math.exp(-s*13),index%2?.3:-.3);
  // Reflections give the steel a short courtyard tail, without muddying impacts.
  for(const delay of [.07,.17,.29])add(t+delay,.6,(s)=>.027*Math.sin(s*1770*Math.PI*2)*Math.exp(-s*13),delay>.1?.45:-.45);
}
// A restrained rising accent before the airborne counter.
add(14.4,2.15,(t,u)=>.04*Math.sin(2*Math.PI*(130*t+35*t*t))*Math.sin(Math.PI*u),-.1);
let peak=0;for(let i=0;i<count;i++)peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
const gain=.88/Math.max(peak,.88),pcm=Buffer.alloc(count*4);
for(let i=0;i<count;i++){const fade=Math.min(1,i/rate/.45,(count-i)/rate/.8);pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,left[i]*gain*fade))*32767),i*4);pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,right[i]*gain*fade))*32767),i*4+2);}
const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
await fs.writeFile(path.join(out,'原创配乐与刀剑音效.wav'),Buffer.concat([header,pcm]));console.log('Original stereo soundtrack: 32s / 48kHz; 17 synchronized sword clashes.');
