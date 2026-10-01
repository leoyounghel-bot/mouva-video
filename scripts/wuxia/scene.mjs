import * as T from 'three';

// Original, deterministic choreography. No external models or textures.
export const duration = 32;
export const hits = [5.7, 6.7, 7.75, 9.0, 10.7, 12.2, 13.2, 16.55, 18.0, 19.15, 21.5, 22.25, 23, 24.0, 25.0, 26.2, 28.25];
const V = (a) => new T.Vector3(...a);
const smooth = (x) => { x = T.MathUtils.clamp(x, 0, 1); return x*x*(3-2*x); };
const lerp = T.MathUtils.lerp;
const material = (color, metalness = 0, roughness = .7) => new T.MeshStandardMaterial({color, metalness, roughness});
const up = new T.Vector3(0,1,0);
let serial = 0;
function group(parent, name) { const g = new T.Group(); g.name = name || `g_${serial++}`; parent.add(g); return g; }
function mesh(parent, geometry, mat, position = [0,0,0], scale = [1,1,1]) {
  const m = new T.Mesh(geometry, mat); m.name = `m_${serial++}`; m.position.fromArray(position); m.scale.fromArray(scale);
  m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
const box = (p,m,pos,s) => mesh(p,new T.BoxGeometry(1,1,1),m,pos,s);
const sphere = (p,m,pos,s) => mesh(p,new T.SphereGeometry(1,16,12),m,pos,s);
function segment(p, mat, r1, r2) { return mesh(p,new T.CylinderGeometry(r1,r2,1,10),mat); }
function link(m,a,b) { const va=V(a),vb=V(b),d=vb.clone().sub(va); m.position.copy(va).add(vb).multiplyScalar(.5); m.quaternion.setFromUnitVectors(up,d.clone().normalize()); m.scale.y=d.length(); }
function armElbow(shoulder, hand, side) {
  const a=V(shoulder),b=V(hand),d=b.clone().sub(a),distance=d.length();
  const axis=d.clone().normalize(), bend=V([side*.8,-.35,-.8]); bend.addScaledVector(axis,-bend.dot(axis)).normalize();
  return a.addScaledVector(d,.5).addScaledVector(bend,Math.sqrt(Math.max(.003,.46*.46-distance*distance*.25))).toArray();
}
const poses = {
  guard: {hand:[-.34,1.30,.44],tip:[-.12,2.15,.99],left:[.34,1.26,.35], lean:0, hips:0, feet:[[-.27,0,.25],[.27,0,-.32]]},
  high: {hand:[-.34,1.96,.08],tip:[-.10,2.98,-.30],left:[.24,1.55,.27],lean:-.06,hips:0,feet:[[-.28,0,.38],[.26,0,-.3]]},
  slash: {hand:[-.30,1.08,.68],tip:[.30,.58,1.39],left:[.30,1.25,.23],lean:.18,hips:-.08,feet:[[-.3,0,.65],[.27,0,-.43]]},
  parry: {hand:[-.34,1.50,.50],tip:[.46,1.92,1.0],left:[.20,1.50,.29],lean:-.09,hips:-.04,feet:[[-.3,0,.3],[.27,0,-.4]]},
  thrust: {hand:[-.18,1.30,.78],tip:[-.10,1.37,1.92],left:[.37,1.18,-.04],lean:.20,hips:-.12,feet:[[-.26,0,.72],[.28,0,-.45]]},
  low: {hand:[-.40,.90,.42],tip:[.22,.42,1.30],left:[.34,1.38,.27],lean:.20,hips:-.3,feet:[[-.4,0,.55],[.42,0,-.5]]},
  evade: {hand:[-.40,1.32,.34],tip:[-.30,2.20,.92],left:[.35,1.40,.2],lean:-.25,hips:-.2,feet:[[-.3,0,.5],[.3,0,-.58]]},
  spin: {hand:[-.58,1.28,.24],tip:[-1.4,1.48,.86],left:[.5,1.4,.2],lean:.05,hips:-.06,feet:[[-.35,0,.4],[.35,0,-.4]]},
  kick: {hand:[-.38,1.72,.24],tip:[-.25,2.7,.7],left:[.44,1.54,.28],lean:-.12,hips:0,feet:[[-.27,1.0,1.1],[.3,0,-.18]]},
  finish: {hand:[-.25,1.34,.72],tip:[-.08,2.21,1.28],left:[.27,1.36,.47],lean:.09,hips:-.08,feet:[[-.3,0,.55],[.30,0,-.35]]},
  rest: {hand:[-.43,.85,.20],tip:[-.32,.28,1.20],left:[.36,1.03,.08],lean:0,hips:0,feet:[[-.24,0,.15],[.24,0,-.1]]},
};
// Each entry: time, pose, forward distance, sidestep, facing turn, jump.
const storyA = [
  [0,'rest',2.25,0,0,0],[1.8,'guard',1.7,0,0,0],[4.5,'guard',1.25,0,0,0],
  [5.2,'high',1.22,0,0,0],[5.7,'slash',.93,0,0,0],[6.15,'guard',1.03,0,0,0],
  [6.7,'parry',1.02,0,-.12,0],[7.25,'high',1.07,0,0,0],[7.75,'thrust',.95,0,0,0],
  [8.3,'low',1.2,0,-.15,0],[9.0,'parry',1.07,0,0,0],[9.5,'guard',1.55,.25,0,0],
  [10.1,'guard',1.4,.4,0,0],[10.7,'thrust',.95,.30,0,0],[11.35,'evade',1.4,.2,0,0],
  [12.2,'parry',1.12,-.2,.2,0],[12.7,'high',1.1,-.2,0,0],[13.2,'slash',.96,-.2,0,0],
  [14.2,'guard',1.7,.0,0,0],[15.0,'low',1.45,0,0,0],[16.0,'high',1.25,0,.15,.7],
  [16.55,'slash',.95,0,0,.42],[17.0,'low',1.1,0,0,0],[17.6,'high',1.0,0,0,0],
  [18.0,'slash',.92,0,0,0],[18.5,'guard',1.1,0,0,0],[19.15,'parry',1.05,0,0,0],
  [20.0,'guard',1.55,.1,0,0],[21.0,'high',1.16,0,0,0],[21.5,'slash',.97,0,0,0],
  [21.9,'guard',1.02,0,0,0],[22.25,'parry',1.0,0,-.1,0],[22.6,'high',1.03,0,0,0],
  [23.0,'thrust',.92,0,0,0],[23.5,'low',1.03,0,0,0],[24.0,'parry',1.00,0,0,0],
  [24.5,'high',1.15,0,0,0],[25.0,'slash',.96,0,0,0],[25.6,'guard',1.2,0,0,0],
  [26.2,'parry',1.05,0,0,0],[26.9,'guard',1.6,0,0,0],[27.5,'high',1.25,0,0,.15],
  [28.25,'finish',.93,0,0,0],[29.25,'finish',.93,0,0,0],[31.0,'rest',1.45,0,0,0],[32,'rest',1.45,0,0,0],
];
const storyB = [
  [0,'rest',2.25,0,0,0],[1.8,'guard',1.7,0,0,0],[4.5,'guard',1.25,0,0,0],
  [5.2,'guard',1.25,0,0,0],[5.7,'parry',1.07,0,0,0],[6.1,'high',1.02,0,0,0],
  [6.7,'slash',.94,0,0,0],[7.25,'guard',1.1,0,0,0],[7.75,'parry',1.0,0,0,0],
  [8.3,'high',1.08,0,0,0],[9.0,'thrust',.93,0,0,0],[9.5,'guard',1.55,-.25,0,0],
  [10.1,'guard',1.4,-.4,0,0],[10.7,'parry',1.06,-.30,0,0],[11.35,'high',1.0,-.2,0,0],
  [12.2,'slash',.94,.2,-.2,0],[12.7,'guard',1.02,.2,0,0],[13.2,'parry',1.02,.2,0,0],
  [14.2,'guard',1.7,0,0,0],[15.0,'guard',1.48,0,0,0],[16.0,'high',1.22,0,0,0],
  [16.55,'parry',1.02,0,0,0],[17.0,'guard',1.12,0,0,0],[17.6,'low',1.12,0,0,0],
  [18.0,'evade',1.12,0,0,0],[18.5,'high',1.04,0,0,0],[19.15,'slash',.93,0,0,0],
  [20.0,'guard',1.55,-.1,0,0],[21.0,'guard',1.15,0,0,0],[21.5,'parry',1.0,0,0,0],
  [21.9,'high',1.01,0,0,0],[22.25,'slash',.95,0,0,0],[22.6,'guard',1.1,0,0,0],
  [23.0,'parry',1.00,0,0,0],[23.5,'high',1.05,0,0,0],[24.0,'thrust',.93,0,0,0],
  [24.5,'guard',1.1,0,0,0],[25.0,'parry',1.05,0,0,0],[25.6,'high',1.12,0,0,0],
  [26.2,'slash',.94,0,0,0],[26.9,'guard',1.6,0,0,0],[27.5,'high',1.22,0,0,0],
  [28.25,'finish',.93,0,0,0],[29.25,'finish',.93,0,0,0],[31.0,'rest',1.45,0,0,0],[32,'rest',1.45,0,0,0],
];
function sample(story,t) {
  let i=0; while(i<story.length-2 && story[i+1][0]<t)i++;
  const a=story[i],b=story[i+1],u=smooth((t-a[0])/(b[0]-a[0])),pa=poses[a[1]],pb=poses[b[1]];
  const mix=(a,b)=>Array.isArray(a)?a.map((v,i)=>mix(v,b[i])):lerp(a,b,u);
  return { ...Object.fromEntries(Object.keys(pa).map(k=>[k,mix(pa[k],pb[k])])), d:mix(a[2],b[2]), z:mix(a[3],b[3]), turn:mix(a[4],b[4]), jump:mix(a[5],b[5]) };
}
function fighter(parent, name, red) {
  const root=group(parent,name), body=group(root,`${name}_body`);
  const cloth=material(red?0x6e1424:0x122c37,.1,.8), trim=material(red?0xdca978:0x7fa4b0,.65,.35), dark=material(0x090e16,.2,.6), skin=material(0xbc977b,0,.85), steel=material(0xa8cfdd,.9,.18);
  const chest=mesh(body,new T.CylinderGeometry(.30,.23,.60,8),cloth,[0,1.36,0],[1,.98,.67]);
  box(body,dark,[0,1.28,.16],[.43,.31,.075]);
  for(let i=0;i<5;i++) box(body,trim,[0,1.24+i*.065,.21],[.34,.018,.014]);
  box(body,trim,[0,1.03,0],[.55,.10,.39]);
  box(body,dark,[0,1.045,.215],[.11,.10,.045]);
  mesh(body,new T.CylinderGeometry(.075,.10,.12,12),skin,[0,1.71,0]);
  sphere(body,skin,[0,1.89,0],[.16,.205,.15]);
  sphere(body,dark,[0,1.98,-.026],[.167,.15,.155]);
  sphere(body,dark,[0,2.12,-.08],[.105,.095,.11]);
  box(body,cloth,[0,1.86,.139],[.3,.115,.045]);
  box(body,trim,[0,1.96,.153],[.32,.042,.022]);
  for(const x of [-.065,.065]) box(body,dark,[x,1.945,.166],[.044,.022,.009]);
  // Layered side skirts and a split mantle remain readable during fast cuts.
  const skirt=[];
  for(const side of [-1,1]) {
    const s=group(body,`${name}_skirt_${side}`);s.position.set(side*.17,1.03,-.07);
    mesh(s,new T.CylinderGeometry(.18,.29,.64,4,1,true),cloth,[0,-.32,0],[.72,1,.65]); skirt.push(s);
  }
  const cape=group(body,`${name}_cape`);cape.position.set(0,1.62,-.14);
  for(let i=0;i<3;i++) {const panel=box(cape,cloth,[(i-1)*.16,-.45,-.10],[.15,.88,.028]);panel.rotation.x=.1;}
  const limbs=[];
  for(const side of [-1,1]) {
    const shoulder=sphere(body,cloth,[side*.31,1.58,0],[.20,.12,.22]);
    box(body,trim,[side*.31,1.64,.03],[.24,.025,.30]);
    const upper=segment(body,cloth,.115,.09),lower=segment(body,dark,.085,.09),cuff=segment(body,trim,.092,.10),hand=sphere(body,skin,[0,0,0],[.075,.09,.075]);
    limbs.push({side,upper,lower,cuff,hand});
  }
  const legs=[];
  for(const side of [-1,1]) {
    const upper=segment(root,cloth,.14,.11),lower=segment(root,dark,.10,.105),knee=sphere(root,trim,[0,0,0],[.12,.11,.12]),boot=box(root,dark,[0,0,0],[.20,.15,.36]);legs.push({side,upper,lower,knee,boot});
  }
  const sword=group(body,`${name}_sword`);
  mesh(sword,new T.CylinderGeometry(.025,.025,.18,8),dark,[0,-.065,0]);
  box(sword,trim,[0,.03,0],[.26,.035,.08]);
  box(sword,steel,[0,.605,0],[.047,1.12,.015]);
  const tip=mesh(sword,new T.ConeGeometry(.032,.13,4),steel,[0,1.23,0]);tip.scale.z=.35;
  // A thin cyan/gold edge keeps blade movement legible against the night.
  const edge=new T.MeshBasicMaterial({color:red?0xffcf9c:0xb0e9ff});
  box(sword,edge,[-.024,.605,0],[.006,1.12,.018]);
  function apply(t) {
    const p=sample(red?storyB:storyA,t), side=red?1:-1;
    root.position.set(side*p.d,p.jump,p.z);root.rotation.y=-side*Math.PI/2+p.turn;
    body.rotation.x=p.lean;body.position.y=p.hips;
    cape.rotation.x=-.14+Math.sin(t*6+side)*.07-p.lean*.8;
    cape.rotation.z=Math.sin(t*4+side)*.07;
    skirt.forEach((s,i)=>{s.rotation.x=.12+Math.sin(t*5+i)*.08+Math.abs(p.lean)*.7;s.rotation.z=(i?1:-1)*(.08+p.jump*.14);});
    for(const arm of limbs) {
      const shoulder=[arm.side*.33,1.60,0],hand=arm.side===-1?p.hand:p.left,elbow=armElbow(shoulder,hand,arm.side);
      link(arm.upper,shoulder,elbow);link(arm.lower,elbow,hand);
      const wrist=V(elbow).lerp(V(hand),.82).toArray();link(arm.cuff,wrist,hand);arm.hand.position.fromArray(hand);
    }
    sword.position.fromArray(p.hand);sword.quaternion.setFromUnitVectors(up,V(p.tip).sub(V(p.hand)).normalize());
    // Both blades meet the same world-space contact point. Arm poses still
    // carry the attack; this corrects the blade angle at the actual collision.
    root.updateMatrixWorld(true);
    const nearest=hits.reduce((n,h)=>Math.min(n,Math.abs(t-h)),100),contactWeight=1-smooth(nearest/.24);
    if(contactWeight>0) {
      const contact=body.worldToLocal(new T.Vector3(0,1.55,.04));
      const collision=new T.Quaternion().setFromUnitVectors(up,contact.sub(V(p.hand)).normalize());
      sword.quaternion.slerp(collision,contactWeight);
    }
    for(let i=0;i<legs.length;i++) {
      const leg=legs[i],foot=p.feet[i],hip=[leg.side*.17,.98+p.hips,0];
      const knee=V(hip).lerp(V(foot),.5);knee.z+=.16+Math.max(0,-p.hips)*.8;
      link(leg.upper,hip,knee.toArray());link(leg.lower,knee.toArray(),[foot[0],foot[1]+.12,foot[2]]);leg.knee.position.copy(knee);leg.boot.position.set(foot[0],foot[1]+.08,foot[2]+.06);
    }
    root.updateMatrixWorld(true);
  }
  return {root,apply,sword};
}

export function createDuel() {
  serial=0;
  const scene=new T.Scene();scene.background=new T.Color(0x050b14);scene.fog=new T.FogExp2(0x07131c,.037);
  const world=group(scene,'Rain_gate_duel'), stone=material(0x152b34,.4,.38),wood=material(0x121921,.05,.85),roof=material(0x10232c,.25,.55),gold=material(0xa17e47,.6,.38);
  box(world,stone,[0,-.17,0],[18,.3,18]);
  // Irregular wet paving, with narrow reflective channels.
  for(let x=-5;x<=5;x++) for(let z=-5;z<=4;z++) {
    const n=Math.sin(x*13.31+z*71.7)*.025;
    box(world,stone,[x*1.30+(z%2)*.65,-.005+n,z*1.25],[1.26,.08,1.21]);
  }
  const puddle=new T.MeshPhysicalMaterial({color:0x164150,metalness:.75,roughness:.15,transparent:true,opacity:.4});
  for(const [x,z,s] of [[-3,1,1.1],[2,-1,.85],[.5,2,.6],[-2,-2,.55]]) {const p=mesh(world,new T.CircleGeometry(s,32),puddle,[x,.05,z]);p.rotation.x=-Math.PI/2;}
  // Gate and tiled eaves form a strong silhouette behind the two performers.
  box(world,wood,[0,1.7,-5.8],[13,3.5,.25]);
  for(const x of [-5.5,-2.2,2.2,5.5]) mesh(world,new T.CylinderGeometry(.14,.19,3.8,12),wood,[x,1.9,-5.5]);
  for(const x of [-1.1,1.1]) {box(world,wood,[x,1.4,-5.5],[2.1,2.8,.16]);for(let j=0;j<7;j++)box(world,gold,[x,2.0,-5.37+(j*.001)],[.025,1.0,.02]).position.x=x-.72+j*.24;}
  for(const z of [-6.4,-5.4,-4.4]) {const e=box(world,roof,[0,3.8+(z+5.4)*-.15,z],[13.8,.18,1.1]);e.rotation.x=.17;}
  for(let i=-18;i<=18;i++) {const tile=mesh(world,new T.CylinderGeometry(.085,.085,2.8,8),roof,[i*.37,4.08,-5.3]);tile.rotation.x=Math.PI/2-.14;}
  for(const side of [-1,1]) {
    box(world,wood,[side*6.6,1.0,0],[.25,2.0,12]);
    for(let z=-4;z<6;z+=2) {box(world,wood,[side*6.3,1.45,z],[.25,2.9,.25]);box(world,gold,[side*6.3,2.7,z],[.45,.07,.45]);}
    // A few abstract bamboo stalks, kept out of the fighting area.
    for(let i=0;i<12;i++){const x=side*(5.2+((i*7)%5)*.18),z=-4.5+((i*11)%9)*.4,h=2.4+(i%4)*.4;mesh(world,new T.CylinderGeometry(.035,.05,h,7),material(0x133a38),[x,h/2,z]);for(let j=0;j<3;j++){const leaf=box(world,material(0x214f45),[x+side*.24,1+j*.6,z],[.65,.04,.10]);leaf.rotation.z=side*.35;}}
  }
  const lampMat=new T.MeshStandardMaterial({color:0xffa14a,emissive:0xff620c,emissiveIntensity:3});
  for(const x of [-4.5,-2.7,2.7,4.5]) {
    mesh(world,new T.CylinderGeometry(.20,.20,.43,10),lampMat,[x,2.65,-4.2]);
    for(const y of [2.4,2.88])mesh(world,new T.CylinderGeometry(.23,.23,.055,12),wood,[x,y,-4.2]);
    mesh(world,new T.CylinderGeometry(.017,.017,.55,8),gold,[x,3.15,-4.2]);
    const lamp=new T.PointLight(0xff9545,8,5,2);lamp.position.set(x,2.7,-4);scene.add(lamp);
  }
  scene.add(new T.HemisphereLight(0x83aec8,0x182431,1.25));
  const moon=new T.DirectionalLight(0x8ed5ff,3.0);moon.position.set(-4,7,1);moon.castShadow=true;moon.shadow.mapSize.set(1024,1024);moon.shadow.camera.left=-6;moon.shadow.camera.right=6;moon.shadow.camera.top=5;moon.shadow.camera.bottom=-5;moon.shadow.bias=-.001;scene.add(moon);
  const rim=new T.DirectionalLight(0xff995c,2.5);rim.position.set(2,4,-5);scene.add(rim);
  const front=new T.DirectionalLight(0xbfefff,1.5);front.position.set(1,3,5);scene.add(front);
  const a=fighter(world,'Azure_swordsman',false),b=fighter(world,'Crimson_swordsman',true);
  const camera=new T.PerspectiveCamera(40,16/9,.1,80);
  // Seeded rain and clash sparks are strictly seekable, including reverse seek.
  const rainCount=700, rainArray=new Float32Array(rainCount*6), rainGeo=new T.BufferGeometry();rainGeo.setAttribute('position',new T.BufferAttribute(rainArray,3));
  const rain=new T.LineSegments(rainGeo,new T.LineBasicMaterial({color:0x6da2b5,transparent:true,opacity:.30}));scene.add(rain);
  const sparkArray=new Float32Array(75*3),sparkGeo=new T.BufferGeometry();sparkGeo.setAttribute('position',new T.BufferAttribute(sparkArray,3));
  const sparks=new T.Points(sparkGeo,new T.PointsMaterial({color:0xffce73,size:.05,transparent:true,opacity:1,blending:T.AdditiveBlending,depthWrite:false}));scene.add(sparks);
  const flash=new T.PointLight(0xffb966,0,4,2);flash.position.set(0,1.55,.1);scene.add(flash);
  const trailGeos=[],trails=[];
  for(let j=0;j<2;j++){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(10*6*3),3));const m=new T.Mesh(g,new T.MeshBasicMaterial({color:j?0xffb77f:0x8edcff,side:T.DoubleSide,transparent:true,opacity:.14,blending:T.AdditiveBlending,depthWrite:false}));scene.add(m);trailGeos.push(g);trails.push(m);}
  function swordWorld(f,t){f.apply(t);const start=f.sword.localToWorld(new T.Vector3(0,.18,0)),end=f.sword.localToWorld(new T.Vector3(0,1.29,0));return [start,end];}
  const cuts=[0,5,9.6,14.4,17.2,20.7,26.7,29.7,32];
  function draw(t) {
    t=T.MathUtils.clamp(t,0,duration);a.apply(t);b.apply(t);
    for(let i=0;i<rainCount;i++) {const x=((i*37.31)%18)-9,z=((i*17.73)%17)-8.5,y=(((i*7.91)%7)-t*(6+(i%3))%7+14)%7;rainArray.set([x,y,z,x-.04,y+.24,z+.01],i*6);}rainGeo.attributes.position.needsUpdate=true;
    let last=hits.filter(h=>h<=t).at(-1),age=last===undefined?10:t-last;
    sparks.visible=age<.34;flash.intensity=age<.12?10*(1-age/.12):0;
    if(sparks.visible) for(let i=0;i<75;i++){const theta=i*2.399,velocity=1+(i%7)*.3;sparkArray.set([Math.cos(theta)*velocity*age,1.6+Math.sin(theta)*velocity*age-3*age*age,.1+Math.sin(i*11)*velocity*age],i*3);}sparkGeo.attributes.position.needsUpdate=true;
    for(let j=0;j<2;j++) {const f=j?b:a,arr=trailGeos[j].attributes.position.array;const active=t>5 && t<29.5;trails[j].visible=active;let cursor=0;for(let i=0;i<10;i++){const p=swordWorld(f,Math.max(0,t-i*.009)),q=swordWorld(f,Math.max(0,t-(i+1)*.009));for(const v of [p[0],p[1],q[1],p[0],q[1],q[0]]){arr.set(v.toArray(),cursor);cursor+=3;}}trailGeos[j].attributes.position.needsUpdate=true;f.apply(t);}
    let target=V([0,1.08,0]),position;
    if(t<5){const u=t/5;position=V([lerp(5.7,4.2,u),lerp(2.65,2.1,u),lerp(8.8,7.0,u)]);}
    else if(t<9.6){const u=(t-5)/4.6;position=V([lerp(-1.1,.75,u),1.7,5.7]);}
    else if(t<14.4){const u=(t-9.6)/4.8;position=V([lerp(2.8,3.6,u),2.0,lerp(4.8,4.1,u)]);target.y=1.32;}
    else if(t<17.2){const u=(t-14.4)/2.8;position=V([lerp(-3,-1,u),lerp(5.0,4.0,u),5.6]);target.y=.8;}
    else if(t<20.7){const u=(t-17.2)/3.5;position=V([lerp(-3.4,-2.2,u),1.65,4.7]);target.y=1.15;}
    else if(t<26.7){const u=(t-20.7)/6;position=V([Math.sin(u*.8)*4.3,1.9,Math.cos(u*.8)*5.7]);target.y=1.15;}
    else if(t<29.7){const u=(t-26.7)/3;position=V([lerp(-2.0,.3,u),1.55,lerp(4.7,4.0,u)]);target.y=1.4;}
    else {const u=(t-29.7)/2.3;position=V([lerp(.3,4,u),lerp(1.7,2.8,u),lerp(5.8,8.2,u)]);target.y=1.1;}
    const shake=age<.18?Math.sin(age*150)*.024*(1-age/.18):0;position.x+=shake;position.y+=shake*.5;
    camera.position.copy(position);camera.lookAt(target);camera.updateMatrixWorld();
    return {shot:Math.max(0,cuts.findIndex((v,i)=>t>=v&&t<(cuts[i+1]??33))),camera};
  }
  draw(0);
  return {scene,world,camera,draw,fighters:[a,b],cuts};
}
