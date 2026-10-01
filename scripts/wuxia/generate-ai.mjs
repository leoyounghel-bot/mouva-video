import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {configuration,createVideo,getVideo} from '../../bridge/providers.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
process.loadEnvFile(path.join(root,'.env.ai'));
const config=configuration(),out=path.join(root,'deliverables/wuxia-duel-20260930'),recordFile=path.join(out,'ai-generation.json');
const prompt=`Create a 12-second premium live-action wuxia action-film sequence, photorealistic real adult performers, cinematic 16:9 composition. Title concept: Two Blades at the Rain Gate.
Exactly TWO clearly distinct fictional adult East Asian swordsmen fight each other in an ancient Chinese courtyard on a rainy night. Azure: a lean 28-year-old man with tied black hair and a dark midnight-blue layered robe, silver-trimmed bracers, one straight Chinese jian sword. Crimson: a strong 38-year-old man with tied black hair and a deep burgundy layered robe, aged-gold bracers, one straight jian sword. Keep their faces, clothing, weapons and identities consistent throughout. No extras. Both fighters must be plainly visible in the combat shots.
0–2 seconds: medium-wide lateral dolly. Azure stands screen left and Crimson screen right, facing each other. They raise their swords into a guard. Wet stone paving, timber courtyard gate and tiled eaves, bamboo silhouettes, warm paper lanterns, cold moonlight, fine rain and drifting mist. Their faces are readable and properly exposed.
2–7 seconds: one continuous full-body lateral tracking shot showing a carefully rehearsed three-beat sword exchange. Azure advances with a diagonal slash, Crimson visibly meets the blade with a parry and counters, Azure steps back and blocks. Then Azure lunges, Crimson pivots and deflects the thrust. Swords make physically coherent contact with short sparks; hands grip hilts correctly. Clear anticipation, impact, recoil and weight transfer. Athletic, controlled human motion, believable feet firmly contacting the wet paving. Maintain left/right screen geography and keep BOTH fighters in frame.
7–10 seconds: a lower three-quarter angle follows Crimson's sweeping counterattack; Azure ducks and rotates into a rising counter. Robes snap and water splashes at each planted step. Fast but readable choreography, no giant jumps, no impossible acrobatics. Subtle speed ramp only around the decisive blade contact.
10–12 seconds: tight two-shot as both swords lock between them, sparks light two determined faces, visible rain droplets and breathing. Slowly push in, end on a powerful balanced tableau of BOTH opponents without killing either. No blood or gore.
Film craft: practical-looking sets, tactile woven silk and weathered steel, natural anatomy and expressive human faces, anamorphic cinema lenses, restrained motion blur, premium blue-and-amber lighting, high dynamic range, fine film grain. No cartoon, no game rendering, no robotic mannequins. No subtitles or title text. Original dramatic low taiko pulses, subtle tense bowed strings, clear synchronized steel clashes, sword whooshes, cloth movement and rain ambience; no dialogue. Deliver a finished action-film shot sequence rather than a slideshow.`;
let record;
try {record=JSON.parse(await fs.readFile(recordFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(!record){
  const task=await createVideo({projectId:'wuxia-rain-gate-20260930',shotId:'live-action-duel',operation:'generate',prompt,duration:12,resolution:'720p',ratio:'16:9',generateAudio:true,references:[]},{config,signal:AbortSignal.timeout(60000)});
  record={id:task.id,model:config.seedanceModel,prompt,requestedDuration:12,requestedResolution:'720p',createdAt:new Date().toISOString(),status:'queued'};
  await fs.writeFile(recordFile,JSON.stringify(record,null,2));console.log('Submitted ONE authorized 12-second video:',record.id);
}else console.log('Resuming existing task; no additional generation:',record.id);
for(let i=0;i<180;i++){
  let result;
  try{result=await getVideo(record.id,{config,signal:AbortSignal.timeout(30000)});}catch(e){console.log('Status check unavailable:',e.code||'network');await new Promise(r=>setTimeout(r,10000));continue;}
  record.status=result.status;record.checkedAt=new Date().toISOString();
  if(result.error)record.error=result.error.message;
  await fs.writeFile(recordFile,JSON.stringify(record,null,2));console.log('Video status:',result.status);
  if(result.status==='succeeded'){
    const response=await fetch(result.content.video_url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw new Error('Video download failed: '+response.status);
    const bytes=Buffer.from(await response.arrayBuffer());await fs.writeFile(path.join(out,'雨门双锋-真人风格AI原片.mp4'),bytes);
    record.actualDuration=result.duration;record.resolution=result.resolution;record.downloadBytes=bytes.length;record.completedAt=new Date().toISOString();
    if(result.usage)record.usage=result.usage;
    await fs.writeFile(recordFile,JSON.stringify(record,null,2));console.log('Actual AI video downloaded:',Math.round(bytes.length/1024)+' KB');break;
  }
  if(['failed','expired','cancelled'].includes(result.status))throw new Error('Video generation ended: '+(record.error||result.status));
  await new Promise(r=>setTimeout(r,10000));
}
