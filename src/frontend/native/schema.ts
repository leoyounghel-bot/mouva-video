export type Vec3 = [number, number, number];
export type SceneTemplate = "cards" | "brand" | "product";
export const shapeGeometries = [
  "torusKnot",
  "box",
  "sphere",
  "cylinder",
  "cone",
  "torus",
  "plane",
] as const;
export type ShapeGeometry = (typeof shapeGeometries)[number];
export type SceneObject = {
  geometry?: ShapeGeometry;
  id: string;
  name: string;
  kind: "card" | "text" | "model" | "shape";
  position: Vec3;
  rotation: Vec3;
  scale: number;
  color: string;
  opacity: number;
  visible: boolean;
  assetId: string | null;
  text: string;
  motion: {
    preset: "none" | "rise" | "float" | "spin";
    start: number;
    end: number;
    amount: number;
  };
};
export type SceneSpec = {
  schemaVersion: 1;
  engine: "three";
  template: SceneTemplate;
  title: string;
  duration: number;
  fps: 24 | 30 | 60;
  seed: number;
  background: string;
  accent: string;
  light: number;
  camera: {
    azimuth: number;
    elevation: number;
    distance: number;
    fov: number;
    orbit: number;
  };
  objects: SceneObject[];
};
const str = { type: "string" },
  num = { type: "number" };
const enumOf = (values: string[]) => ({ type: "string", enum: values });
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const vec = {
  type: "array",
  items: num,
  description: "Exactly three finite numbers: x, y, z.",
};
export const sceneJsonSchema = obj({
  schemaVersion: { type: "integer", enum: [1] },
  engine: enumOf(["three"]),
  template: enumOf(["cards", "brand", "product"]),
  title: str,
  duration: { ...num, description: "Duration in seconds, 1 to 120." },
  fps: { type: "integer", enum: [24, 30, 60] },
  seed: { type: "integer" },
  background: str,
  accent: str,
  light: num,
  camera: obj({
    azimuth: num,
    elevation: num,
    distance: num,
    fov: num,
    orbit: num,
  }),
  objects: {
    type: "array",
    description:
      "1 to 32 objects. Stable unique IDs. Colors must be #RRGGBB. Only supplied asset IDs.",
    items: obj({
      id: str,
      name: str,
      kind: enumOf(["card", "text", "model", "shape"]),
      geometry: {
        ...enumOf([...shapeGeometries]),
        description:
          "Geometry for shape objects. Use torusKnot to preserve a legacy shape. Ignored for cards, text and imported models.",
      },
      position: vec,
      rotation: vec,
      scale: num,
      color: str,
      opacity: num,
      visible: { type: "boolean" },
      assetId: { type: ["string", "null"] },
      text: str,
      motion: obj({
        preset: enumOf(["none", "rise", "float", "spin"]),
        start: num,
        end: num,
        amount: num,
      }),
    }),
  },
});
function check(test: unknown, message: string): asserts test {
  if (!test) throw new Error("Invalid scene: " + message);
}
function keys(value: any, allowed: string[], optional: string[] = []) {
  check(
    value && typeof value === "object" && !Array.isArray(value),
    "expected an object",
  );
  check(
    Object.keys(value).every(
      (k) => allowed.includes(k) || optional.includes(k),
    ) && allowed.every((k) => k in value),
    "unexpected or missing fields",
  );
}
function number(value: unknown, min: number, max: number) {
  check(
    typeof value === "number" &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max,
    "number out of range",
  );
}
function text(value: unknown, max: number) {
  check(typeof value === "string" && value.length <= max, "text too long");
}
function color(value: unknown) {
  check(
    typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value),
    "expected #RRGGBB color",
  );
}
export function validateScene(
  value: unknown,
  assetIds?: Set<string>,
): asserts value is SceneSpec {
  const s = value as SceneSpec;
  keys(s, [
    "schemaVersion",
    "engine",
    "template",
    "title",
    "duration",
    "fps",
    "seed",
    "background",
    "accent",
    "light",
    "camera",
    "objects",
  ]);
  check(
    s.schemaVersion === 1 &&
      s.engine === "three" &&
      ["cards", "brand", "product"].includes(s.template),
    "unsupported scene version",
  );
  text(s.title, 120);
  number(s.duration, 1, 120);
  check([24, 30, 60].includes(s.fps), "unsupported fps");
  number(s.seed, 0, 2147483647);
  check(Number.isInteger(s.seed), "seed must be an integer");
  color(s.background);
  color(s.accent);
  number(s.light, 0, 5);
  keys(s.camera, ["azimuth", "elevation", "distance", "fov", "orbit"]);
  number(s.camera.azimuth, -360, 360);
  number(s.camera.elevation, -60, 85);
  number(s.camera.distance, 2, 40);
  number(s.camera.fov, 15, 90);
  number(s.camera.orbit, -720, 720);
  check(
    Array.isArray(s.objects) && s.objects.length > 0 && s.objects.length <= 32,
    "use 1–32 objects",
  );
  const ids = new Set<string>();
  for (const o of s.objects) {
    keys(
      o,
      [
        "id",
        "name",
        "kind",
        "position",
        "rotation",
        "scale",
        "color",
        "opacity",
        "visible",
        "assetId",
        "text",
        "motion",
      ],
      ["geometry"],
    );
    if (o.geometry !== undefined)
      check(shapeGeometries.includes(o.geometry), "unknown shape geometry");
    check(
      typeof o.id === "string" &&
        /^[a-zA-Z0-9_-]{1,80}$/.test(o.id) &&
        !ids.has(o.id),
      "duplicate or invalid object ID",
    );
    ids.add(o.id);
    text(o.name, 80);
    check(
      ["card", "text", "model", "shape"].includes(o.kind),
      "unknown object type",
    );
    for (const [v, limit] of [
      [o.position, 30],
      [o.rotation, 720],
    ] as const) {
      check(Array.isArray(v) && v.length === 3, "vector must have 3 values");
      v.forEach((n) => number(n, -limit, limit));
    }
    number(o.scale, 0.05, 10);
    number(o.opacity, 0, 1);
    color(o.color);
    check(typeof o.visible === "boolean", "visibility must be boolean");
    text(o.text, 500);
    check(
      o.assetId === null ||
        (typeof o.assetId === "string" &&
          /^[a-zA-Z0-9_-]{1,160}$/.test(o.assetId)),
      "invalid asset ID",
    );
    if (assetIds && o.assetId)
      check(assetIds.has(o.assetId), "unknown asset ID " + o.assetId);
    keys(o.motion, ["preset", "start", "end", "amount"]);
    check(
      ["none", "rise", "float", "spin"].includes(o.motion.preset),
      "unknown animation",
    );
    number(o.motion.start, 0, s.duration);
    number(o.motion.end, 0, s.duration);
    check(o.motion.end > o.motion.start, "animation end must follow start");
    number(o.motion.amount, -10, 10);
  }
}
export function objectAt(o: SceneObject, time: number) {
  const t = Math.max(0, time),
    m = o.motion,
    u = Math.max(0, Math.min(1, (t - m.start) / (m.end - m.start))),
    ease = 1 - Math.pow(1 - u, 3);
  const position = [...o.position] as Vec3,
    rotation = [...o.rotation] as Vec3;
  let opacity = o.opacity;
  if (m.preset === "rise") {
    position[1] -= (1 - ease) * m.amount;
    opacity *= ease;
  }
  if (m.preset === "float")
    position[1] += Math.sin(u * Math.PI * 2) * m.amount * 0.18;
  if (m.preset === "spin") rotation[1] += u * 360 * m.amount;
  return { position, rotation, opacity };
}

export function sceneKey(value: SceneSpec): string {
  const stable = (v: any): any =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, stable(v[k])]),
          )
        : v;
  const input = JSON.stringify(stable(value));
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return "scene-v1-" + (hash >>> 0).toString(16);
}
