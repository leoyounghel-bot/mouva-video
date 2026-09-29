import { createSequenceRenderer } from "./compositor";
const canvas=document.createElement("canvas");
document.body.append(canvas);document.body.style.margin="0";
const font=new FontFace("NotoSansSC","url(/fonts/NotoSansSC.ttf)");
const ready=font.load().then(f=>{document.fonts.add(f)});
let engine:ReturnType<typeof createSequenceRenderer>;
Object.assign(window,{
 mouvaInitSequence:async(input:any)=>{await ready;engine?.dispose();engine=createSequenceRenderer(canvas,input.project,{width:input.width,height:input.height,subtitles:input.settings.includeSubtitles});},
 mouvaSequenceFrame:async(time:number)=>{await engine.draw(time);return canvas.toDataURL("image/png").split(",")[1]},
 mouvaDisposeSequence:()=>engine?.dispose()
});
