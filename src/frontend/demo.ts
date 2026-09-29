import type { Project, MediaRef, Shot } from "./types";
export const media: Record<string, MediaRef> = {
  opening: { sheet: "canvas", rect: [402, 327, 121, 67] },
  cafe: { sheet: "canvas", rect: [578, 327, 116, 68] },
  street: { sheet: "timeline", rect: [382, 170, 540, 246] },
  gallery: { sheet: "canvas", rect: [996, 327, 119, 68] },
  finale: { sheet: "canvas", rect: [1180, 327, 111, 69] },
  lily: { sheet: "canvas", rect: [543, 152, 69, 59] },
  paris: { sheet: "canvas", rect: [765, 152, 71, 59] },
  style: { sheet: "canvas", rect: [977, 151, 70, 60] },
  cafeLocation: { sheet: "canvas", rect: [187, 372, 74, 53] },
  galleryLocation: { sheet: "canvas", rect: [275, 373, 71, 53] },
};
const items = [
  ["Opening", "The city wakes up", 4.2, "opening"],
  ["Lily in the cafe", "A new idea", 5.6, "cafe"],
  ["Walk through streets", "Discovering beauty", 6, "street"],
  ["Art gallery", "Unexpected encounter", 5, "gallery"],
  ["Finale", "A new beginning", 7.2, "finale"],
] as const;
const prompts = [
  "A cinematic establishing shot of Paris at sunrise, warm golden light over the Eiffel Tower, soft morning haze, slow camera push in, 35mm film.",
  "Lily sits beside the window in a cozy Parisian cafe, watching the morning light, a cup of coffee on the table, intimate cinematic framing.",
  "Lily walks through a Parisian street, soft sunlight, cinematic camera movement, feeling inspired, shallow depth of field, film look.",
  "Lily quietly explores an art gallery in Paris, warm light falls across the paintings, she pauses to look closer, a gentle tracking shot.",
  "The Eiffel Tower at golden hour, a quiet panoramic view across the rooftops, warm cinematic tones, a hopeful ending.",
];
export const demoProject: Project = {
  schemaVersion: 1,
  id: "paris-demo",
  name: "A Day in Paris",
  description:
    "A young woman travels to Paris, finds inspiration in everyday moments, and creates something beautiful.",
  tags: ["Paris", "Coming of age", "Cinematic"],
  updatedAt: new Date().toISOString(),
  shots: items.map(
    ([title, description, duration, key], i): Shot => ({
      id: "shot-" + (i + 1),
      title,
      description,
      prompt: prompts[i],
      duration,
      image: media[key],
      model: "Seedance 2.5",
      resolution: "1080p",
      aspectRatio: "16:9",
      status: i < 3 ? "succeeded" : "idle",
      characterId: "lily",
      characterStrength: 0.8,
      preserveCharacter: true,
      location: i === 1 ? "Cafe" : i === 3 ? "Art Gallery" : "Paris Street",
      tags: ["cinematic", "soft light", "handheld", "paris street"],
      trimStart: 0,
      trimEnd: duration,
      speed: 1,
      adoptedTakeId: "take-" + (i + 1) + "-a",
      viewingTakeId: "take-" + (i + 1) + "-a",
      binding: "follow",
      takes: (i === 2 ? ["A", "B", "C"] : ["A"]).map((letter) => ({
        id: "take-" + (i + 1) + "-" + letter.toLowerCase(),
        label: "Take " + letter,
        image: media[key],
        status: "succeeded",
        createdAt: "2026-09-27T00:00:00Z",
      })),
      repair: {
        start: i === 2 ? 3.2 : 0,
        end: i === 2 ? 4.1 : Math.min(1, duration),
        tool: "range",
        prompt: "",
      },
      layers: [
        {
          id: "subtitle-" + i,
          text: description,
          start: 0,
          end: duration,
          x: 50,
          y: 86,
          fontSize: 28,
          color: "#ffffff",
          opacity: 1,
        },
      ],
    }),
  ),
  characters: [
    {
      id: "lily",
      name: "Lily",
      role: "Main character",
      description:
        "A curious young creative discovering a new side of Paris. Warm, natural expressions and a soft, cinematic style.",
      image: media.lily,
      strength: 0.8,
    },
  ],
  assets: [
    ...Object.entries(media).map(([name, image], i) => ({
      id: "reference-" + i,
      name:
        name === "lily"
          ? "Lily · Character"
          : name === "paris"
            ? "Paris Street"
            : name[0].toUpperCase() + name.slice(1),
      kind: "image" as const,
      image,
      folder: "project" as const,
    })),
  ],
  graph: {},
  audio: [
    {
      id: "voice-1",
      name: "Lily · Paris Morning",
      kind: "voice",
      start: 0,
      duration: 28,
      gain: 0.85,
      pan: 0,
      fadeIn: 0.2,
      fadeOut: 0.5,
      muted: false,
      solo: false,
      peaks: [],
      demo: true,
    },
    {
      id: "music-1",
      name: "Paris Morning",
      kind: "music",
      start: 0,
      duration: 28,
      gain: 0.45,
      pan: 0,
      fadeIn: 1,
      fadeOut: 2,
      muted: false,
      solo: false,
      peaks: [],
      demo: true,
    },
    {
      id: "sfx-1",
      name: "City ambience",
      kind: "sfx",
      start: 0,
      duration: 9.8,
      gain: 0.5,
      pan: -0.1,
      fadeIn: 0,
      fadeOut: 1,
      muted: false,
      solo: false,
      peaks: [],
      demo: true,
    },
    {
      id: "sfx-2",
      name: "Footsteps",
      kind: "sfx",
      start: 10,
      duration: 9,
      gain: 0.65,
      pan: 0,
      fadeIn: 0.1,
      fadeOut: 0.1,
      muted: false,
      solo: false,
      peaks: [],
      demo: true,
    },
    {
      id: "sfx-3",
      name: "Gallery room tone",
      kind: "sfx",
      start: 20,
      duration: 8,
      gain: 0.35,
      pan: 0.1,
      fadeIn: 0.2,
      fadeOut: 0.5,
      muted: false,
      solo: false,
      peaks: [],
      demo: true,
    },
  ],
};
export const shotLength = (s: Shot) => (s.trimEnd - s.trimStart) / s.speed;
export const duration = (p: Project) =>
  p.shots.reduce((sum, s) => sum + shotLength(s), 0);
export function locate(p: Project, time: number) {
  let at = 0;
  for (let i = 0; i < p.shots.length; i++) {
    const shot = p.shots[i],
      length = shotLength(shot);
    if (time < at + length || i === p.shots.length - 1)
      return {
        shot,
        index: i,
        start: at,
        local: shot.trimStart + (time - at) * shot.speed,
      };
    at += length;
  }
  return null;
}
export const uid = () => crypto.randomUUID();
