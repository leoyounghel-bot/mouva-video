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
      s.prompt = "Two adult swordfighters in a clear two-person composition, with natural footwork, parries and counters. Keep the fighters in teal and red consistent.";
      s.location = "Rain Gate courtyard";
      s.tags = ["Practice"];
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
