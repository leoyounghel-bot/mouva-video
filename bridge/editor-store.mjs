import {mkdir,readFile,writeFile,rename,readdir} from "node:fs/promises";
import {randomUUID,randomBytes,createHash,timingSafeEqual} from "node:crypto";
import path from "node:path";
import {ApiError} from "./providers.mjs";
import {renderReference} from "./render.mjs";
import {validateExport,mixExportAudio} from "./editor-export.mjs";
const equal=(a,b)=>typeof a==="string"&&typeof b==="string"&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export class EditorStore{
 constructor(config,deps={}){this.config=config;this.deps=deps;this.root=path.join(config.dataDir,"editor");this.jobs=new Map();this.uploads=new Map();this.busy=false;this.closed=false;this.controllers=new Map();}
 async init(){
  await mkdir(path.join(this.root,"jobs"),{recursive:true});await mkdir(path.join(this.root,"uploads"),{recursive:true});
  for(const file of await readdir(path.join(this.root,"jobs"))){if(!file.endsWith(".json"))continue;try{const j=JSON.parse(await readFile(path.join(this.root,"jobs",file),"utf8"));if(["queued","running"].includes(j.status)){j.status="queued";j.phase="Resuming local export";}this.jobs.set(j.id,j)}catch{}}
  this.pump();return this;
 }
 async save(j){const file=path.join(this.root,"jobs",j.id+".json");await writeFile(file+".tmp",JSON.stringify(j));await rename(file+".tmp",file);}
 public(j){return{id:j.id,projectId:j.input.project.id,kind:"export",provider:"editor",status:j.status,progress:j.progress,phase:j.phase,error:j.error,outputUrl:j.status==="succeeded"?"/api/ai/editor/results/"+j.id+"/movie."+j.input.settings.format+"?token="+j.token:undefined};}
 list(id,ownerId="local"){return [...this.jobs.values()].filter(j=>j.input.project.id===id&&(j.ownerId||"local")===ownerId).map(j=>this.public(j))}
 get(id,ownerId){const j=this.jobs.get(id);if(!j||(ownerId!==undefined&&(j.ownerId||"local")!==ownerId))throw new ApiError(404,"Export task not found.");return j}
 async upload(req,ownerId="local"){
  let total=0;const chunks=[];for await(const chunk of req){total+=chunk.length;if(total>150*1024*1024)throw new ApiError(413,"Media exceeds 150 MB.");chunks.push(chunk)}
  if(!total)throw new ApiError(400,"Empty media file.");
  const id=randomUUID(),token=randomBytes(24).toString("hex"),type=(req.headers["content-type"]||"application/octet-stream").split(";")[0];
  if(!/^(image\/(png|jpeg|webp|svg\+xml|gif)|video\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+|model\/gltf-binary|application\/octet-stream)$/i.test(type))throw new ApiError(415,"Unsupported media type.");
  const meta={id,token,type,size:total,ownerId};await writeFile(path.join(this.root,"uploads",id+".bin"),Buffer.concat(chunks));await writeFile(path.join(this.root,"uploads",id+".json"),JSON.stringify(meta));this.uploads.set(id,meta);
  return {url:"/api/ai/editor/media/"+id+"?token="+token,size:total};
 }
 async uploadMeta(id){if(!/^[a-f0-9-]{36}$/.test(id))throw new ApiError(404,"Invalid media ID.");if(!this.uploads.has(id)){try{this.uploads.set(id,JSON.parse(await readFile(path.join(this.root,"uploads",id+".json"),"utf8")))}catch{throw new ApiError(404,"Media file not found.")}}return this.uploads.get(id)}
 async mediaFile(id,token,ownerId){const m=await this.uploadMeta(id);if(ownerId!==undefined&&(m.ownerId||"local")!==ownerId)throw new ApiError(404,"Media file not found.");if(!equal(token,m.token))throw new ApiError(401,"Invalid media link.");return{file:path.join(this.root,"uploads",id+".bin"),type:m.type}}
 async fileForUrl(url,ownerId){let u;try{u=new URL(url,"http://local")}catch{throw new ApiError(400,"Invalid media URL.")}
  if(!url.startsWith("/api/ai/editor/media/"))throw new ApiError(400,"Upload media to this workspace before exporting.");
  const m=/^\/api\/ai\/editor\/media\/([a-f0-9-]{36})$/.exec(u.pathname);if(!m)throw new ApiError(400,"Invalid media reference.");return(await this.mediaFile(m[1],u.searchParams.get("token"),ownerId)).file;
 }
 async create(body,ownerId="local"){
  const input=validateExport(body);if(typeof input.requestId!=="string"||input.requestId.length>100)throw new ApiError(400,"Missing export request ID.");
  const signature=createHash("sha256").update(JSON.stringify(body)).digest("hex");
  for(const j of this.jobs.values())if(j.input.requestId===input.requestId&&(j.ownerId||"local")===ownerId){if(j.signature!==signature)throw new ApiError(409,"This request ID already has different export settings.");return this.public(j)}
  if([...this.jobs.values()].filter(j=>["running","queued"].includes(j.status)).length>=8)throw new ApiError(429,"Export queue is full.");
  const mediaRef=async(ref)=>{if(!ref)throw new ApiError(400,"Missing image reference.");if("url"in ref)await this.fileForUrl(ref.url,ownerId);else if(!["canvas","timeline"].includes(ref.sheet)||!Array.isArray(ref.rect)||ref.rect.length!==4||!ref.rect.every(Number.isFinite))throw new ApiError(400,"Invalid storyboard image.")};
  for(const a of input.project.assets)if(a.url)await this.fileForUrl(a.url,ownerId);
  for(const shot of input.project.shots){const take=shot.takes.find(t=>t.id===shot.adoptedTakeId);if(take.videoUrl)await this.fileForUrl(take.videoUrl,ownerId);else if(!take.scene)await mediaRef(take.image||shot.image);}
  const j={id:randomUUID(),ownerId,signature,token:randomBytes(24).toString("hex"),status:"queued",phase:"Waiting to render",progress:0,input:structuredClone(input)};
  this.jobs.set(j.id,j);await this.save(j);this.pump();return this.public(j);
 }
 pump(){if(this.busy||this.closed)return;const j=[...this.jobs.values()].find(j=>j.status==="queued");if(!j)return;this.busy=true;this.running=this.run(j).finally(()=>{this.busy=false;this.pump()});}
 async run(j){
  const controller=new AbortController();this.controllers.set(j.id,controller);
  const dir=path.join(this.root,"jobs",j.id),ext=j.input.settings.format;
  try{
   await mkdir(dir,{recursive:true});j.status="running";j.phase="Rendering sequence";await this.save(j);
   await(this.deps.renderExport||renderReference)({project:j.input.project,settings:j.input.settings,assets:j.input.project.assets,output:path.join(dir,"silent."+ext),config:this.config,signal:controller.signal,onProgress:async n=>{j.progress=Math.round(n*.95);await this.save(j)}});
   controller.signal.throwIfAborted();j.phase="Mixing audio tracks";j.progress=96;await this.save(j);
   await(this.deps.mixExport||mixExportAudio)({project:j.input.project,settings:j.input.settings,duration:j.input.duration,silent:path.join(dir,"silent."+ext),output:path.join(dir,"movie."+ext),config:this.config,signal:controller.signal,fileForUrl:u=>this.fileForUrl(u,j.ownerId||"local")});
   controller.signal.throwIfAborted();j.status="succeeded";j.progress=100;j.phase="Movie ready";
  }catch(e){j.status=controller.signal.aborted?"cancelled":"failed";j.error=controller.signal.aborted?"Export cancelled.":e.message;j.phase=j.status;}
  finally{this.controllers.delete(j.id);await this.save(j)}
 }
 async cancel(id,ownerId="local"){const j=this.get(id,ownerId);if(j.status==="running"){this.controllers.get(id)?.abort();}else if(j.status==="queued"){j.status="cancelled";j.phase="Export cancelled";await this.save(j)}return this.public(j)}
 result(id,token,format){const j=this.get(id);if(!equal(token,j.token)||format!==j.input.settings.format)throw new ApiError(401,"Invalid result link.");if(j.status!=="succeeded")throw new ApiError(409,"Export is not complete.");return path.join(this.root,"jobs",j.id,"movie."+format);}
 async close(){this.closed=true;for(const c of this.controllers.values())c.abort();await this.running;}
}
