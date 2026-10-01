import type {
  Project,
  Shot,
  ClipEdit,
  TextLayer,
  AudioClip,
} from "../types.ts";
import { createScene, sceneThumbnail } from "../native/templates.ts";
import { validateScene } from "../native/schema.ts";

export const defaults: ClipEdit = {
  scale: 1,
  x: 0,
  y: 0,
  rotation: 0,
  flipX: false,
  flipY: false,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  blur: 0,
  opacity: 1,
  fadeIn: 0,
  fadeOut: 0,
  volume: 1,
  muted: false,
  fit: "cover",
};
export const effects = (s: Shot): ClipEdit => ({ ...defaults, ...s.edit });
export type EditCommand = {
  tool: string;
  targetId?: string;
  args?: Record<string, any>;
};
export const toolCatalog = [
  [
    "clip.add",
    "Add a shot from an imported assetId (image/video), or template cards/brand/product. Args: title?, duration?, assetId?, template?.",
  ],
  [
    "clip.split",
    "Split a shot without changing its source or speed. Args: sourceTime in source seconds, optional newId.",
  ],
  [
    "clip.duplicate",
    "Duplicate a shot and its edits. Args: index? (zero-based insertion position, project shot count appends at the end).",
  ],
  ["clip.remove", "Remove a shot; keep at least one shot."],
  ["clip.move", "Reorder a shot. Args: index (zero-based final position)."],
  [
    "clip.trim",
    "Set source trim points. Args: start and end, in source seconds.",
  ],
  [
    "clip.speed",
    "Change playback speed while retaining source trim. Args: speed, 0.25–4.",
  ],
  [
    "clip.update",
    "Edit shot title, description, prompt, location, resolution, aspectRatio, characterId, characterStrength, preserveCharacter, binding or tags.",
  ],
  [
    "clip.effects",
    "Set any of scale 0.1–5, x/y -100–100 percent, rotation -180–180 degrees, flipX/flipY, brightness/contrast/saturation 0–2, blur 0–20, opacity 0–1, fadeIn/fadeOut in clip seconds, volume 0–1, muted, fit contain/cover.",
  ],
  [
    "text.add",
    "Add native text to a shot. Args: text, optional start/end in source seconds, x/y 0–100%, fontSize 8–200, color #RRGGBB, opacity 0–1.",
  ],
  [
    "text.update",
    "Update native text. Args: id and any text/start/end/x/y/fontSize/color/opacity.",
  ],
  ["text.remove", "Remove native text. Args: id."],
  [
    "audio.add",
    "Insert an imported audio asset. Args: assetId, kind voice/music/sfx, start in sequence seconds, duration?, gain?.",
  ],
  [
    "audio.update",
    "Edit an audio clip (targetId). Args: name, kind, start, duration, sourceStart, gain 0–1, pan -1–1, fadeIn/fadeOut, muted, solo.",
  ],
  ["audio.remove", "Remove an audio clip (targetId)."],
  ["audio.split", "Split an audio clip at sequence time. Args: time."],
  [
    "audio.duplicate",
    "Duplicate an audio clip. Args: start? in sequence seconds.",
  ],
  ["take.preview", "Preview a candidate without adopting it. Args: takeId."],
  [
    "take.adopt",
    "Adopt an existing candidate. Args: takeId, fitDuration? (explicitly reset clip range to the candidate duration).",
  ],
  [
    "asset.reference",
    "Use an imported image as a shot reference. Args: assetId.",
  ],
  [
    "scene.update",
    "Edit native scene title/background/accent/light/camera. Args: fields to change (camera is an object).",
  ],
  [
    "scene.object.update",
    "Edit a native object. Args: objectId and fields name, geometry (shape only), position, rotation, scale, color, opacity, visible, text, motion.",
  ],
  [
    "scene.object.add",
    "Add a native object. Args: object with id/name/kind/optional geometry/position/rotation/scale/color/opacity/visible/assetId/text/motion.",
  ],
  [
    "scene.object.remove",
    "Remove a native object. Args: objectId. Keep at least one object.",
  ],
  ["project.update", "Update project name, description or tags."],
  [
    "character.update",
    "Edit character (targetId): name, role, description, strength.",
  ],
  ["graph.move", "Move a graph node for the shot. Args: x, y."],
  ["ui.select", "Select a shot (targetId)."],
  ["ui.view", "Open stream, canvas or timeline. Args: view."],
  ["ui.seek", "Seek sequence playhead. Args: time in sequence seconds."],
  ["ui.play", "Play or pause. Args: playing boolean."],
  ["history.undo", "Undo the last project edit."],
  ["history.redo", "Redo the last undone project edit."],
  [
    "render.export",
    "Export the current sequence. Args: format mp4/webm, resolution 720p/1080p/4K, aspectRatio 16:9/9:16/1:1, fps 24/25/30/60, includeAudio/includeSubtitles booleans.",
  ],
  [
    "ai.generate",
    "Open production for the selected shot. Args: prompt?. Generative work requires configured provider credentials.",
  ],
] as const;
export const projectTools = new Set(
  toolCatalog
    .map(([name]) => name)
    .filter((n) => !/^(ui\.|history\.|render\.|ai\.)/.test(n)),
);
const fail = (message: string): never => {
  throw new Error(message);
};
const number = (n: unknown, lo: number, hi: number, name: string) => {
  if (typeof n !== "number" || !Number.isFinite(n) || n < lo || n > hi)
    fail(name + " must be between " + lo + " and " + hi + ".");
  return n as number;
};
const text = (s: unknown, name: string, max = 8000) => {
  if (typeof s !== "string" || s.length > max) fail("Invalid " + name + ".");
  return s as string;
};
const allowed = (a: Record<string, any>, keys: string[]) => {
  if (Object.keys(a).some((k) => !keys.includes(k)))
    fail("Unknown or unsupported tool parameter.");
};
const length = (s: Shot) => (s.trimEnd - s.trimStart) / s.speed;
function validateText(l: TextLayer, s: Shot) {
  text(l.text, "text", 2000);
  number(l.start, 0, s.duration, "Text start");
  number(l.end, l.start + 0.001, s.duration, "Text end");
  number(l.x, 0, 100, "Text X");
  number(l.y, 0, 100, "Text Y");
  number(l.fontSize, 8, 200, "Font size");
  number(l.opacity, 0, 1, "Opacity");
  if (!/^#[0-9a-f]{6}$/i.test(l.color)) fail("Use a six-digit text color.");
}
export function validateEffects(e: ClipEdit, s: Shot) {
  for (const [k, lo, hi] of [
    ["scale", 0.1, 5],
    ["x", -100, 100],
    ["y", -100, 100],
    ["rotation", -180, 180],
    ["brightness", 0, 2],
    ["contrast", 0, 2],
    ["saturation", 0, 2],
    ["blur", 0, 20],
    ["opacity", 0, 1],
    ["volume", 0, 1],
    ["fadeIn", 0, length(s)],
    ["fadeOut", 0, length(s)],
  ] as const)
    number(e[k], lo, hi, k);
  for (const k of ["flipX", "flipY", "muted"] as const)
    if (typeof e[k] !== "boolean") fail("Invalid " + k);
  if (!["cover", "contain"].includes(e.fit)) fail("Invalid frame fit.");
}
function capFades(s: Shot) {
  if (s.edit) {
    s.edit.fadeIn = Math.min(s.edit.fadeIn, length(s));
    s.edit.fadeOut = Math.min(s.edit.fadeOut, length(s));
  }
}
export function runCommands(
  project: Project,
  commands: EditCommand[],
): Project {
  if (!Array.isArray(commands) || commands.length > 100)
    fail("Use at most 100 editing operations at a time.");
  const p = structuredClone(project);
  for (const command of commands) {
    if (!projectTools.has(command.tool as any))
      fail("Unknown editing tool: " + command.tool);
    const a = command.args || {},
      s = p.shots.find((s) => s.id === command.targetId);
    if (
      (command.tool.startsWith("clip.") && command.tool !== "clip.add") ||
      /^(text\.|take\.|scene\.|asset\.reference)/.test(command.tool)
    )
      if (!s) fail("The target shot no longer exists.");
    switch (command.tool) {
      case "clip.add": {
        allowed(a, ["assetId", "template", "duration", "title"]);
        if (p.shots.length >= 100)
          fail("This project already contains 100 shots.");
        const asset = p.assets.find((x) => x.id === a.assetId);
        if (a.assetId && (!asset || !["image", "video"].includes(asset.kind)))
          fail("Choose an imported image or video.");
        const sourceDuration =
          asset?.kind === "video" ? asset.duration : undefined;
        if (asset?.kind === "video" && (!asset.url || !sourceDuration))
          fail("Re-import this video so its source duration can be read.");
        const seconds = number(
          a.duration ?? sourceDuration ?? 6,
          0.04,
          a.template ? 120 : 3600,
          "Duration",
        );
        if (sourceDuration && seconds > sourceDuration)
          fail("The clip cannot exceed the imported video duration.");
        const scene = a.template ? createScene(a.template, seconds) : undefined;
        if (a.template && !["cards", "brand", "product"].includes(a.template))
          fail("Unknown scene template.");
        const image = scene
          ? sceneThumbnail(scene)
          : asset?.image ||
            (asset?.kind === "image" && asset.url
              ? { url: asset.url }
              : p.shots[0].image);
        const id = crypto.randomUUID(),
          takeId = crypto.randomUUID();
        const shot: Shot = {
          ...structuredClone(p.shots[0]),
          id,
          title: text(a.title ?? asset?.name ?? "New shot", "title", 200),
          kind: scene ? "native" : "video",
          description: "",
          prompt: "",
          duration: sourceDuration ?? seconds,
          trimStart: 0,
          trimEnd: seconds,
          speed: 1,
          image,
          status: "succeeded",
          layers: [],
          edit: { ...defaults },
          nativeDraft: undefined,
          referenceAssetIds: asset ? [asset.id] : [],
          adoptedTakeId: takeId,
          viewingTakeId: takeId,
          binding: "follow",
          repair: {
            start: 0,
            end: Math.min(1, seconds),
            tool: "range",
            prompt: "",
          },
          takes: [
            {
              id: takeId,
              label: scene ? "Editable scene" : "Imported media",
              image,
              status: "succeeded",
              createdAt: new Date().toISOString(),
              scene,
              assetId: asset?.id,
              duration: sourceDuration ?? seconds,
              videoUrl: asset?.kind === "video" ? asset.url : undefined,
            },
          ],
        };
        p.shots.push(shot);
        break;
      }
      case "clip.split": {
        allowed(a, ["sourceTime", "newId"]);
        const time = number(
          a.sourceTime,
          s!.trimStart + 0.04,
          s!.trimEnd - 0.04,
          "Split point",
        );
        const right = structuredClone(s!);
        right.id = a.newId
          ? text(a.newId, "new shot ID", 100)
          : crypto.randomUUID();
        if (p.shots.some((x) => x.id === right.id) || p.shots.length >= 100)
          fail("Cannot add another shot with this ID.");
        right.title += " · B";
        right.trimStart = time;
        s!.trimEnd = time;
        capFades(s!);
        capFades(right);
        p.shots.splice(p.shots.indexOf(s!) + 1, 0, right);
        break;
      }
      case "clip.duplicate": {
        allowed(a, ["index"]);
        if (p.shots.length >= 100) fail("Maximum 100 shots.");
        const index = number(
          a.index ?? p.shots.indexOf(s!) + 1,
          0,
          p.shots.length,
          "Position",
        );
        if (!Number.isInteger(index)) fail("Position must be a whole number.");
        const copy = structuredClone(s!);
        copy.id = crypto.randomUUID();
        copy.title += " · Copy";
        p.shots.splice(index, 0, copy);
        break;
      }
      case "clip.remove": {
        if (p.shots.length <= 1)
          fail("Keep at least one shot in the sequence.");
        p.shots = p.shots.filter((x) => x.id !== s!.id);
        delete p.graph[s!.id];
        if (p.canvas) {
          p.canvas.edges = p.canvas.edges.filter(
            (e) => e.source !== s!.id && e.target !== s!.id,
          );
          for (const item of p.canvas.items)
            if (item.members)
              item.members = item.members.filter((id) => id !== s!.id);
        }
        break;
      }
      case "clip.move": {
        const index = number(a.index, 0, p.shots.length - 1, "Position");
        if (!Number.isInteger(index)) fail("Position must be a whole number.");
        p.shots.splice(p.shots.indexOf(s!), 1);
        p.shots.splice(index, 0, s!);
        break;
      }
      case "clip.trim": {
        allowed(a, ["start", "end"]);
        const start = number(a.start, 0, s!.duration - 0.04, "Trim start"),
          end = number(a.end, start + 0.04, s!.duration, "Trim end");
        s!.trimStart = start;
        s!.trimEnd = end;
        capFades(s!);
        break;
      }
      case "clip.speed": {
        s!.speed = number(a.speed, 0.25, 4, "Playback speed");
        capFades(s!);
        break;
      }
      case "clip.update": {
        allowed(a, [
          "title",
          "description",
          "prompt",
          "location",
          "resolution",
          "aspectRatio",
          "characterId",
          "characterStrength",
          "preserveCharacter",
          "binding",
          "tags",
        ]);
        for (const k of [
          "title",
          "description",
          "prompt",
          "location",
          "resolution",
          "aspectRatio",
        ])
          if (k in a) text(a[k], k);
        if (
          "characterId" in a &&
          a.characterId !== null &&
          !p.characters.some((c) => c.id === a.characterId)
        )
          fail("Unknown character.");
        if ("characterStrength" in a)
          number(a.characterStrength, 0, 1, "Character strength");
        if (
          "preserveCharacter" in a &&
          typeof a.preserveCharacter !== "boolean"
        )
          fail("Invalid character option.");
        if ("binding" in a && !["follow", "pinned"].includes(a.binding))
          fail("Invalid binding.");
        if (
          "tags" in a &&
          (!Array.isArray(a.tags) ||
            a.tags.some((v: any) => typeof v !== "string"))
        )
          fail("Invalid tags.");
        Object.assign(s!, a);
        break;
      }
      case "clip.effects": {
        allowed(a, Object.keys(defaults));
        const e = { ...effects(s!), ...a };
        validateEffects(e, s!);
        s!.edit = e;
        break;
      }
      case "text.add":
      case "text.update":
      case "text.remove": {
        allowed(a, [
          "id",
          "text",
          "start",
          "end",
          "x",
          "y",
          "fontSize",
          "color",
          "opacity",
        ]);
        if (command.tool === "text.remove") {
          if (!s!.layers.some((l) => l.id === a.id))
            fail("Text no longer exists.");
          s!.layers = s!.layers.filter((l) => l.id !== a.id);
          break;
        }
        const current =
          command.tool === "text.update"
            ? s!.layers.find((l) => l.id === a.id)
            : {
                id: crypto.randomUUID(),
                text: "Your title",
                start: s!.trimStart,
                end: s!.trimEnd,
                x: 50,
                y: 82,
                fontSize: 40,
                color: "#ffffff",
                opacity: 1,
              };
        if (!current) fail("Text no longer exists.");
        if (command.tool === "text.add" && s!.layers.length >= 100)
          fail("Maximum 100 text layers per shot.");
        const l = { ...current!, ...a } as TextLayer;
        if (
          typeof l.id !== "string" ||
          (command.tool === "text.add" && s!.layers.some((x) => x.id === l.id))
        )
          fail("Text layer IDs must be unique.");
        validateText(l, s!);
        if (command.tool === "text.add") s!.layers.push(l);
        else Object.assign(current!, l);
        break;
      }
      case "audio.add": {
        allowed(a, ["assetId", "kind", "start", "duration", "gain"]);
        const asset = p.assets.find(
          (x) => x.id === a.assetId && x.kind === "audio",
        );
        if (!asset?.url || !asset.duration) fail("Import an audio file first.");
        const clip: AudioClip = {
          id: crypto.randomUUID(),
          name: asset!.name,
          kind: a.kind || "music",
          start: a.start ?? 0,
          duration: a.duration ?? asset!.duration,
          sourceStart: 0,
          gain: a.gain ?? 0.7,
          pan: 0,
          fadeIn: 0,
          fadeOut: 0,
          muted: false,
          solo: false,
          assetId: asset!.id,
          peaks: [...(asset!.peaks || [])],
          demo: false,
        };
        p.audio.push(clip);
        validateAudio(clip, asset!.duration);
        break;
      }
      case "audio.split":
      case "audio.duplicate": {
        const clip = p.audio.find((x) => x.id === command.targetId);
        if (!clip) fail("Audio clip no longer exists.");
        const copy = structuredClone(clip!);
        copy.id = crypto.randomUUID();
        if (command.tool === "audio.split") {
          allowed(a, ["time"]);
          const cut = number(
            a.time,
            clip!.start + 0.04,
            clip!.start + clip!.duration - 0.04,
            "Audio split time",
          );
          copy.start = cut;
          copy.sourceStart = (clip!.sourceStart || 0) + cut - clip!.start;
          copy.duration = clip!.start + clip!.duration - cut;
          clip!.duration = cut - clip!.start;
          clip!.fadeOut = 0;
          clip!.fadeIn = Math.min(clip!.fadeIn, clip!.duration);
          copy.fadeIn = 0;
          copy.fadeOut = Math.min(copy.fadeOut, copy.duration);
        } else {
          allowed(a, ["start"]);
          copy.start = a.start ?? clip!.start + clip!.duration;
        }
        validateAudio(
          copy,
          p.assets.find((x) => x.id === copy.assetId)?.duration,
        );
        p.audio.push(copy);
        break;
      }
      case "audio.update":
      case "audio.remove": {
        const clip = p.audio.find((x) => x.id === command.targetId);
        if (!clip) fail("Audio clip no longer exists.");
        if (command.tool === "audio.remove") {
          p.audio = p.audio.filter((x) => x.id !== clip!.id);
          break;
        }
        allowed(a, [
          "name",
          "kind",
          "start",
          "duration",
          "sourceStart",
          "gain",
          "pan",
          "fadeIn",
          "fadeOut",
          "muted",
          "solo",
        ]);
        Object.assign(clip!, a);
        validateAudio(
          clip!,
          p.assets.find((x) => x.id === clip!.assetId)?.duration,
        );
        break;
      }
      case "take.preview":
      case "take.adopt": {
        const take = s!.takes.find((t) => t.id === a.takeId);
        if (!take) fail("Candidate no longer exists.");
        s!.viewingTakeId = take!.id;
        if (command.tool === "take.adopt") {
          if (take!.status !== "succeeded") fail("Candidate is not ready.");
          if (a.fitDuration !== undefined && typeof a.fitDuration !== "boolean")
            fail("Invalid duration option.");
          if (a.fitDuration) {
            const seconds = number(
              take!.duration ?? take!.scene?.duration ?? s!.duration,
              0.04,
              3600,
              "Candidate duration",
            );
            s!.duration = seconds;
            s!.trimStart = 0;
            s!.trimEnd = seconds;
            s!.repair.start = 0;
            s!.repair.end = Math.min(1, seconds);
            s!.layers = s!.layers
              .filter((l) => l.start < seconds)
              .map((l) => ({ ...l, end: Math.min(l.end, seconds) }));
            capFades(s!);
          }
          if (
            (take!.duration ?? take!.scene?.duration ?? s!.duration) + 0.001 <
            s!.trimEnd
          )
            fail(
              "Candidate is too short for this clip. Trim the clip before adopting it.",
            );
          s!.adoptedTakeId = take!.id;
          s!.image = take!.image;
          s!.nativeDraft = undefined;
        }
        break;
      }
      case "asset.reference": {
        const asset = p.assets.find(
          (x) => x.id === a.assetId && x.kind === "image",
        );
        if (!asset?.image) fail("Choose an image asset.");
        s!.image = asset!.image!;
        break;
      }
      case "scene.update":
      case "scene.object.update":
      case "scene.object.add":
      case "scene.object.remove": {
        const take = s!.takes.find((t) => t.id === s!.viewingTakeId),
          source =
            s!.nativeDraft?.baseTakeId === s!.viewingTakeId
              ? s!.nativeDraft.scene
              : take?.scene;
        if (!source) fail("Open an editable 3D shot first.");
        const scene = structuredClone(source!);
        if (command.tool === "scene.update") {
          allowed(a, ["title", "background", "accent", "light", "camera"]);
          Object.assign(scene, {
            ...a,
            camera: { ...scene.camera, ...a.camera },
          });
        } else if (command.tool === "scene.object.add")
          scene.objects.push(a.object);
        else if (command.tool === "scene.object.remove") {
          if (!scene.objects.some((o) => o.id === a.objectId))
            fail("Unknown object.");
          scene.objects = scene.objects.filter((o) => o.id !== a.objectId);
        } else {
          const o = scene.objects.find((o) => o.id === a.objectId);
          if (!o) fail("Unknown object.");
          const { objectId, ...patch } = a;
          allowed(patch, [
            "name",
            "geometry",
            "position",
            "rotation",
            "scale",
            "color",
            "opacity",
            "visible",
            "text",
            "motion",
          ]);
          Object.assign(o!, patch);
        }
        validateScene(scene, new Set(p.assets.map((x) => x.id)));
        s!.nativeDraft = { baseTakeId: s!.viewingTakeId, scene };
        break;
      }
      case "project.update": {
        allowed(a, ["name", "description", "tags"]);
        if ("name" in a) text(a.name, "project name", 200);
        if ("description" in a) text(a.description, "description");
        if (
          "tags" in a &&
          (!Array.isArray(a.tags) ||
            a.tags.some((v: any) => typeof v !== "string"))
        )
          fail("Invalid tags.");
        Object.assign(p, a);
        break;
      }
      case "character.update": {
        const c = p.characters.find((x) => x.id === command.targetId);
        if (!c) fail("Unknown character.");
        allowed(a, ["name", "role", "description", "strength"]);
        for (const k of ["name", "role", "description"])
          if (k in a) text(a[k], k);
        if ("strength" in a) number(a.strength, 0, 1, "Strength");
        Object.assign(c!, a);
        break;
      }
      case "graph.move": {
        if (!p.shots.some((x) => x.id === command.targetId))
          fail("Unknown graph shot.");
        p.graph[command.targetId!] = {
          x: number(a.x, -10000, 10000, "X"),
          y: number(a.y, -10000, 10000, "Y"),
        };
        break;
      }
    }
  }
  p.updatedAt = new Date().toISOString();
  return p;
}
export function validateAudio(a: AudioClip, sourceDuration?: number) {
  text(a.name, "audio name", 300);
  if (!["voice", "music", "sfx"].includes(a.kind)) fail("Invalid audio track.");
  number(a.start, 0, MAX_MOVIE_SECONDS, "Audio start");
  number(a.duration, 0.01, MAX_MOVIE_SECONDS, "Audio duration");
  number(a.sourceStart ?? 0, 0, MAX_MOVIE_SECONDS, "Source offset");
  if (
    sourceDuration &&
    (a.sourceStart ?? 0) + a.duration > sourceDuration + 0.03
  )
    fail("Audio exceeds the source file duration.");
  number(a.gain, 0, 1, "Volume");
  number(a.pan, -1, 1, "Pan");
  number(a.fadeIn, 0, a.duration, "Fade in");
  number(a.fadeOut, 0, a.duration, "Fade out");
  if (typeof a.muted !== "boolean" || typeof a.solo !== "boolean")
    fail("Invalid audio mute/solo.");
}
export function commandSummary(c: EditCommand, p: Project) {
  const target =
    p.shots.find((s) => s.id === c.targetId)?.title ||
    p.audio.find((a) => a.id === c.targetId)?.name;
  return c.tool.replaceAll(".", " · ") + (target ? " — " + target : "");
}
import { MAX_MOVIE_SECONDS } from "../moviePolicy.ts";
