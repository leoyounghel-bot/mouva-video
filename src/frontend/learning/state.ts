import { courseById } from "./catalog.ts";
import type { Project } from "../types";
export type LearningState = {
  courseId: string;
  step: number;
  open: boolean;
  completed: Record<string, number[]>;
};
export function readLearningState(raw: string | null): LearningState {
  const clean: LearningState = {
    courseId: "wuxia",
    step: 0,
    open: false,
    completed: {},
  };
  try {
    const saved = JSON.parse(raw || "null");
    if (!saved || typeof saved !== "object") return clean;
    const course = courseById(saved.courseId);
    if (course) {
      clean.courseId = course.id;
      clean.step = Math.max(
        0,
        Math.min(
          course.steps.length - 1,
          Number.isInteger(saved.step) ? saved.step : 0,
        ),
      );
      clean.open = saved.open === true;
    }
    for (const [id, steps] of Object.entries(saved.completed || {})) {
      const c = courseById(id);
      if (c && Array.isArray(steps))
        clean.completed[id] = [
          ...new Set(
            steps.filter(
              (n): n is number =>
                Number.isInteger(n) && n >= 0 && n < c.steps.length,
            ),
          ),
        ];
    }
  } catch {}
  return clean;
}
export function isPracticeProject(p: Project) {
  return p.tags.includes("mouva-lesson-wuxia");
}
const titles = [
  "Standoff",
  "First exchange",
  "Sidestep and thrust",
  "Leaping counter",
  "Low counter",
  "Rapid exchange",
  "Locked blades",
  "Rainy farewell",
];
export function preparePracticeProject(
  template: Project,
  origin: string,
  language: "zh" | "en",
  id: string,
): Project {
  const p = structuredClone(template);
  // Only bundled lesson media is accepted; no tokens or historical server URLs travel with the template.
  const media = (url: string) => {
    if (!/^\/learn\/wuxia\/[a-z0-9.-]+$/.test(url))
      throw new Error("Invalid lesson media path.");
    return new URL(url, origin).href;
  };
  p.id = id;
  p.updatedAt = new Date().toISOString();
  p.name =
    language === "zh" ? "雨门·双锋 · 我的练习" : "Rain Gate · My practice";
  p.description =
    language === "zh"
      ? "8个镜头、32秒。练习速度、标题与导出。"
      : "Eight shots, 32 seconds. Practice speed, titles and export.";
  for (const a of p.assets) {
    if (a.url) a.url = media(a.url);
    if (a.image && "url" in a.image) a.image.url = media(a.image.url);
  }
  p.shots.forEach((s, i) => {
    if ("url" in s.image) s.image.url = media(s.image.url);
    if (language === "en") {
      s.title = titles[i] || `Shot ${i + 1}`;
      s.description = "A two-fighter exchange in a rainy courtyard.";
      s.prompt =
        "Two adult swordfighters in a clear two-person composition, with natural footwork, parries and counters. Keep the fighters in teal and red consistent.";
      s.location = "Rain Gate courtyard";
      s.tags = ["Two-fighter combat", "Rainy night", "Swordplay"];
    }
    for (const t of s.takes) {
      if ("url" in t.image) t.image.url = media(t.image.url);
      if (t.videoUrl) t.videoUrl = media(t.videoUrl);
      if (language === "en") {
        t.label = t.scene
          ? "Editable 3D · Original choreography"
          : "Rendered 3D · With soundtrack";
        if (t.scene) {
          t.scene.title = "Rain Gate · Two-fighter choreography";
          t.scene.objects.forEach(
            (o) => (o.name = "Courtyard and animated fighters"),
          );
        }
      }
    }
  });
  if (language === "en")
    p.assets.forEach(
      (a) =>
        (a.name =
          a.id === "wuxia-ai"
            ? "Rain Gate · AI film"
            : a.id === "wuxia-local"
              ? "Rain Gate · 3D film"
              : "Rain Gate · Animated model"),
    );
  return p;
}

/** Translate only supplied lesson defaults; edits and imported user content survive. */
export function localizePracticeProject(
  project: Project,
  language: "zh" | "en",
): Project {
  if (!isPracticeProject(project)) return project;
  const p = structuredClone(project);
  const pairs: [string, string][] = [
    ["雨门·双锋 · 我的练习", "Rain Gate · My practice"],
    [
      "8个镜头、32秒。练习速度、标题与导出。",
      "Eight shots, 32 seconds. Practice speed, titles and export.",
    ],
    [
      "青衣与赤衣两名剑客，在雨夜庭院以剑交锋。",
      "A two-fighter exchange in a rainy courtyard.",
    ],
    [
      "两名成年剑客，清楚的双人构图、自然脚步、格挡、反击，青衣与赤衣身份稳定。",
      "Two adult swordfighters in a clear two-person composition, with natural footwork, parries and counters. Keep the fighters in teal and red consistent.",
    ],
    ["雨夜庭院", "Rain Gate courtyard"],
    ["双人武打", "Two-fighter combat"],
    ["雨夜", "Rainy night"],
    ["剑术", "Swordplay"],
    ["3D 动作短片 · 原创配乐", "Rendered 3D · With soundtrack"],
    ["可编辑 3D · 双人原始动作", "Editable 3D · Original choreography"],
    ["雨门双锋 · 双人动作场景", "Rain Gate · Two-fighter choreography"],
    ["庭院与双人剑术动画", "Courtyard and animated fighters"],
    ["雨门双锋-真人武打.mp4", "Rain Gate · AI film"],
    ["雨门双锋-3D武打短片.mp4", "Rain Gate · 3D film"],
    ["雨门双锋-可编辑动作.glb", "Rain Gate · Animated model"],
    ...[
      "雨门对峙",
      "第一轮攻防",
      "侧步与突刺",
      "跃起反击",
      "低位反攻",
      "快速连击",
      "双剑交锋",
      "雨夜收锋",
    ].map((title, i): [string, string] => [title, titles[i]]),
  ];
  const labels = new Map(
    pairs.flatMap((pair) =>
      pair.map((label) => [label, pair[language === "zh" ? 0 : 1]] as const),
    ),
  );
  const translate = (value: string) => labels.get(value) ?? value;
  p.name = translate(p.name);
  p.description = translate(p.description);
  p.assets.forEach((a) => {
    a.name = translate(a.name);
  });
  p.shots.forEach((s) => {
    s.title = translate(s.title);
    s.description = translate(s.description);
    s.prompt = translate(s.prompt);
    s.location = translate(s.location);
    s.tags = s.tags.map(translate);
    s.takes.forEach((t) => {
      t.label = translate(t.label);
      if (t.scene) {
        t.scene.title = translate(t.scene.title);
        t.scene.objects.forEach((o) => {
          o.name = translate(o.name);
        });
      }
    });
  });
  return p;
}
