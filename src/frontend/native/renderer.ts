import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { objectAt, validateScene } from "./schema";
import type { SceneSpec } from "./schema";
export type RenderAsset = {
  id: string;
  kind: string;
  url?: string;
  name: string;
};
let fontReady: Promise<FontFace> | undefined;
export async function createSceneRenderer(
  canvas: HTMLCanvasElement,
  spec: SceneSpec,
  assets: RenderAsset[],
) {
  validateScene(spec);
  fontReady ??= new FontFace("MouvaScene", "url(/fonts/NotoSansSC.ttf)")
    .load()
    .then((font) => {
      document.fonts.add(font);
      return font;
    });
  await fontReady;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(spec.background);
  const camera = new THREE.PerspectiveCamera(spec.camera.fov, 16 / 9, 0.1, 100);
  const pmrem = new THREE.PMREMGenerator(renderer),
    room = new RoomEnvironment(),
    environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = spec.light * 0.4;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.AmbientLight(0xffffff, spec.light * 0.6));
  const key = new THREE.DirectionalLight(0xffffff, spec.light * 2.5);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const fill = new THREE.PointLight(spec.accent, 25);
  fill.position.set(-4, 2, 2);
  scene.add(fill);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(18, 64),
    new THREE.MeshStandardMaterial({
      color: spec.background,
      roughness: 0.75,
      metalness: 0.15,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.32;
  floor.receiveShadow = true;
  scene.add(floor);
  if (spec.template === "product") {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.65, 1.72, 0.22, 96),
      new THREE.MeshStandardMaterial({
        color: spec.background,
        roughness: 0.4,
        metalness: 0.1,
      }),
    );
    base.position.y = -1.25;
    base.receiveShadow = true;
    base.castShadow = true;
    scene.add(base);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.69, 0.018, 8, 96),
      new THREE.MeshBasicMaterial({ color: spec.accent }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -1.2;
    scene.add(ring);
  }
  const nodes = new Map<string, THREE.Group>(),
    textures: THREE.Texture[] = [];
  let disposed = false;
  const trackTexture = (t: THREE.Texture) => {
    textures.push(t);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    return t;
  };
  function textTexture(value: string, color: string) {
    const c = document.createElement("canvas");
    c.width = 2048;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    g.textAlign = "center";
    g.textBaseline = "middle";
    let font = 160;
    g.font = `600 ${font}px "MouvaScene", sans-serif`;
    while (g.measureText(value).width > 1950 && font > 24) {
      font -= 4;
      g.font = `600 ${font}px "MouvaScene", sans-serif`;
    }
    g.fillStyle = color;
    g.fillText(value, 1024, 128);
    return trackTexture(new THREE.CanvasTexture(c));
  }
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry?.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of materials) {
          for (const v of Object.values(m))
            if (v instanceof THREE.Texture) v.dispose();
          m.dispose();
        }
      }
    });
    for (const t of textures) t.dispose();
    environment.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
  try {
    for (const source of spec.objects) {
      const group = new THREE.Group();
      group.userData.nodeId = source.id;
      scene.add(group);
      nodes.set(source.id, group);
      if (source.kind === "text") {
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(6.4, 0.8),
          new THREE.MeshBasicMaterial({
            map: textTexture(source.text, source.color),
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
          }),
        );
        group.add(mesh);
      } else if (source.kind === "card") {
        const frame = new THREE.Mesh(
          new RoundedBoxGeometry(3.9, 2.32, 0.11, 3, 0.08),
          new THREE.MeshStandardMaterial({
            color: source.color,
            roughness: 0.35,
            metalness: 0.1,
          }),
        );
        group.add(frame);
        frame.castShadow = true;
        const asset = assets.find((a) => a.id === source.assetId);
        if (asset?.url) {
          const texture = trackTexture(
            await new THREE.TextureLoader().loadAsync(asset.url),
          );
          const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(3.73, 2.1),
            new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
          );
          screen.position.z = 0.061;
          group.add(screen);
        }
      } else if (source.kind === "model") {
        const asset = assets.find((a) => a.id === source.assetId);
        if (!asset?.url)
          throw new Error("Select an imported GLB for " + source.name + ".");
        const manager = new THREE.LoadingManager();
        manager.setURLModifier((url) => {
          if (
            url === asset.url ||
            url.startsWith("blob:") ||
            url.startsWith("data:")
          )
            return url;
          throw new Error("Use a self-contained GLB with embedded textures.");
        });
        const gltf = await new GLTFLoader(manager).loadAsync(asset.url);
        const root = gltf.scene;
        root.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(root),
          size = bounds.getSize(new THREE.Vector3()),
          center = bounds.getCenter(new THREE.Vector3());
        const fit = 2.15 / Math.max(size.x, size.y, size.z, 0.001);
        root.scale.setScalar(fit);
        root.position.copy(center).multiplyScalar(-fit);
        root.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            const materials = Array.isArray(o.material)
              ? o.material
              : [o.material];
            for (const material of materials) {
              if ("color" in material)
                (material as THREE.MeshStandardMaterial).color.multiply(
                  new THREE.Color(source.color),
                );
            }
          }
        });
        group.add(root);
      } else {
        const geometry = (() => {
          switch (source.geometry) {
            case "box":
              return new THREE.BoxGeometry(1.5, 1.5, 1.5);
            case "sphere":
              return new THREE.SphereGeometry(0.9, 48, 32);
            case "cylinder":
              return new THREE.CylinderGeometry(0.8, 0.8, 1.6, 48);
            case "cone":
              return new THREE.ConeGeometry(0.9, 1.8, 48);
            case "torus":
              return new THREE.TorusGeometry(0.8, 0.18, 24, 96);
            case "plane":
              return new THREE.PlaneGeometry(2, 2);
            default:
              return new THREE.TorusKnotGeometry(0.78, 0.14, 160, 20, 2, 3);
          }
        })();
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshPhysicalMaterial({
            color: source.color,
            metalness: 0.5,
            roughness: 0.2,
            clearcoat: 1,
            side: THREE.DoubleSide,
          }),
        );
        mesh.castShadow = true;
        group.add(mesh);
      }
    }
  } catch (e) {
    dispose();
    throw e;
  }
  function draw(time: number, width?: number, height?: number) {
    if (disposed) return;
    if (width && height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    const t = Math.max(0, Math.min(spec.duration, time));
    for (const source of spec.objects) {
      const node = nodes.get(source.id)!,
        value = objectAt(source, t);
      node.position.fromArray(value.position);
      node.rotation.set(
        ...(value.rotation.map(THREE.MathUtils.degToRad) as [
          number,
          number,
          number,
        ]),
      );
      node.scale.setScalar(source.scale);
      node.visible = source.visible && value.opacity > 0.001;
      node.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          for (const m of Array.isArray(o.material)
            ? o.material
            : [o.material]) {
            m.opacity = value.opacity;
            m.transparent = source.kind === "text" || value.opacity < 1;
          }
        }
      });
    }
    const angle = THREE.MathUtils.degToRad(
        spec.camera.azimuth + (spec.camera.orbit * t) / spec.duration,
      ),
      e = THREE.MathUtils.degToRad(spec.camera.elevation),
      d = spec.camera.distance;
    camera.position.set(
      Math.sin(angle) * Math.cos(e) * d,
      Math.sin(e) * d,
      Math.cos(angle) * Math.cos(e) * d,
    );
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
  function pick(x: number, y: number) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x, y), camera);
    for (const hit of ray.intersectObjects([...nodes.values()], true)) {
      let o: THREE.Object3D | null = hit.object;
      while (o) {
        if (o.userData.nodeId) return String(o.userData.nodeId);
        o = o.parent;
      }
    }
    return "";
  }
  return { draw, pick, dispose };
}
