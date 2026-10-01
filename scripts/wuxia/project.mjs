import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateScene} from '../../src/frontend/native/schema.ts';
import {validateExport} from '../../bridge/editor-export.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(root,'deliverables/wuxia-duel-20260930'),origin='http://127.0.0.1:5193';
let media={};try{media=JSON.parse(await fs.readFile(path.join(out,'workspace-media.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const files=[['ai','雨门双锋-真人武打.mp4','video/mp4'],['local','雨门双锋-3D武打短片.mp4','video/mp4'],['model','雨门双锋-可编辑动作.glb','model/gltf-binary'],['audio','原创配乐与刀剑音效.wav','audio/wav']];
for(const [key,name,type]of files){if(media[key])continue;const response=await fetch(origin+'/api/ai/editor/uploads',{method:'POST',headers:{'Content-Type':type},body:await fs.readFile(path.join(out,name))});const data=await response.json();if(!response.ok)throw new Error(data.message);media[key]={name,url:data.url,size:data.size};await fs.writeFile(path.join(out,'workspace-media.json'),JSON.stringify(media,null,2));console.log('Saved workspace asset:',name);}
const thumb=async(name)=>({url:'data:image/jpeg;base64,'+(await fs.readFile(path.join(out,name))).toString('base64')});
const aiImage=await thumb('ai-poster.jpg'),localImage=await thumb('frame-5-7.jpg'),createdAt=new Date().toISOString();
const assets=files.map(([key,name])=>({id:'wuxia-'+key,name,kind:key==='model'?'model':key==='audio'?'audio':'video',url:media[key].url,size:media[key].size,folder:'project',...(key==='ai'?{duration:12.064,image:aiImage}:key==='local'?{duration:32,image:localImage}:{})}));
const scene={schemaVersion:1,engine:'three',template:'brand',title:'雨门双锋 · 双人动作场景',duration:32,fps:24,seed:73919,background:'#07131c',accent:'#8ed5ff',light:.85,camera:{azimuth:8,elevation:13,distance:8.4,fov:40,orbit:16},objects:[{id:'rain-gate-duel',name:'庭院与双人剑术动画',kind:'model',position:[0,.80,0],rotation:[0,0,0],scale:8.38,color:'#ffffff',opacity:1,visible:true,assetId:'wuxia-model',text:'',motion:{preset:'none',start:0,end:32,amount:0}}]};
validateScene(scene,new Set(assets.map(a=>a.id)));
const shot=(id,title,image,seconds,takes)=>({id,title,kind:'hybrid',description:'青衣与赤衣两名剑客，在雨夜庭院以剑交锋。',prompt:'两名成年剑客，清楚的双人构图、自然脚步、格挡、反击，青衣与赤衣身份稳定。',duration:seconds,image,model:'Seedance 2.5',resolution:'720p',aspectRatio:'16:9',status:'succeeded',characterId:null,characterStrength:.9,preserveCharacter:true,location:'雨夜庭院',tags:['双人武打','雨夜','剑术'],trimStart:0,trimEnd:seconds,speed:1,adoptedTakeId:takes[0].id,viewingTakeId:takes[0].id,binding:'follow',takes,repair:{start:0,end:Math.min(1,seconds),tool:'range',prompt:''},layers:[]});
const aiTake={id:'wuxia-ai-take',assetId:'wuxia-ai',duration:12.064,label:'真人风格 · Seedance 实际生成',image:aiImage,status:'succeeded',createdAt,videoUrl:media.ai.url};
const localTake={id:'wuxia-local-take',assetId:'wuxia-local',duration:32,label:'3D 动作短片 · 原创配乐',image:localImage,status:'succeeded',createdAt,videoUrl:media.local.url};
const nativeTake={id:'wuxia-native-take',duration:32,label:'可编辑 3D · 双人原始动作',image:localImage,status:'succeeded',createdAt,scene};
const base={schemaVersion:1,id:'wuxia-rain-gate-20260930',name:'雨门 · 双锋',description:'12 秒真人风格 AI 武打样片；另有 32 秒原创 3D 短片和可编辑动作供比较。',tags:['武侠','双人对决','Mouva Studio'],updatedAt:createdAt,assets,audio:[],characters:[],graph:{'wuxia-main':{x:120,y:110}},canvas:{version:1,items:[],edges:[]}};
const main={...base,shots:[shot('wuxia-main','雨门 · 双锋',aiImage,12.064,[aiTake,localTake,nativeTake])]};
const cuts=[0,5,9.6,14.4,17.2,20.7,26.7,29.7,32],names=['雨门对峙','第一轮攻防','侧步与突刺','跃起反击','低位反攻','快速连击','双剑交锋','雨夜收锋'];
const edit={...base,id:'wuxia-3d-edit-20260930',name:'雨门 · 双锋｜3D 分镜剪辑',description:'32 秒原创 3D 武打短片，八个镜头已分开，可逐镜头裁剪、变速、调色。',shots:[],graph:{}};
for(let i=0;i<8;i++){const id='wuxia-shot-'+i,s=shot(id,names[i],localImage,32,[{...localTake,id:id+'-video'},{...nativeTake,id:id+'-native'}]);s.trimStart=cuts[i];s.trimEnd=cuts[i+1];edit.shots.push(s);edit.graph[id]={x:100+(i%4)*620,y:100+Math.floor(i/4)*570};}
const source={...base,id:'wuxia-3d-source-20260930',name:'雨门 · 双锋｜可编辑 3D 动作',description:'两个角色、庭院与 78 条动作轨道；原生 3D 播放，附原创配乐。',shots:[shot('wuxia-native','双人剑术 · 32秒原始动作',localImage,32,[nativeTake])],graph:{'wuxia-native':{x:100,y:100}},audio:[{id:'wuxia-score',name:'原创配乐与刀剑音效',kind:'music',start:0,duration:32,gain:1,pan:0,fadeIn:0,fadeOut:0,muted:false,solo:false,assetId:'wuxia-audio',peaks:[],demo:false}]};
for(const [name,p]of[['雨门双锋-Studio项目.json',main],['雨门双锋-3D分镜项目.json',edit],['雨门双锋-3D动作项目.json',source]]){validateExport({requestId:'verify-'+p.id,project:p,settings:{resolution:'720p'}});await fs.writeFile(path.join(out,name),JSON.stringify(p,null,2));console.log('Validated project:',name);}
await fs.writeFile(path.join(out,'native-scene.json'),JSON.stringify(scene,null,2));
