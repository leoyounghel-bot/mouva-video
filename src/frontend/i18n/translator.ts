import messages from "./messages.json" with { type: "json" };
export type Language = "zh" | "en";
const catalog = new Map<string, readonly [string, string]>();
for (const pair of messages) {
  const translated = pair as [string, string];
  if (!catalog.has(pair[0])) catalog.set(pair[0], translated);
  catalog.set(pair[1], translated);
}
// Canonical singular labels also serve as aliases for older interface copy.
for (const pair of [
  ["故事板", "Storyboard"],
  ["画布", "Canvas"],
  ["时间线", "Timeline"],
  ["视频", "Video"],
  ["图片", "Image"],
  ["音频", "Audio"],
  ["素材库", "Assets"],
  ["角色", "Characters"],
  ["资源库", "Library"],
  ["助手", "Agent"],
  ["生成任务", "Generation jobs"],
  ["Mouva", "Mouva"],
  ["mouva studio", "mouva studio"],
  ["格式", "Format"],
  ["分辨率", "Resolution"],
  ["WebM · VP9", "WebM · VP9"],
  ["画布 · 无限创作工作区", "Canvas · Infinite creative workspace"],
] as const) {
  catalog.set(pair[0], pair);
  catalog.set(pair[1], pair);
}

/** Interface copy only. Unknown strings (including project content) are preserved. */
export function translate<T>(value: T, language: Language): T {
  if (typeof value !== "string" || !value.trim()) return value;
  const pair = catalog.get(value) || catalog.get(value.trim());
  if (!pair) {
    const defaultNode = /^(图片节点|文本节点|音频节点|视频节点|Image node|Text node|Audio node|Video node) (\d+)$/.exec(value);
    if (defaultNode) {
      const kind = [
        ["图片节点", "Image node"], ["文本节点", "Text node"],
        ["音频节点", "Audio node"], ["视频节点", "Video node"],
      ].find(pair => pair.includes(defaultNode[1]))!;
      return `${kind[language === "zh" ? 0 : 1]} ${defaultNode[2]}` as T;
    }
    const generated =
      /^(Editable 3D scene|Motion reference|Finished video|Generated take) · (\d+\/\d+)$/.exec(
        value,
      );
    if (generated)
      return (translate(generated[1], language) + " · " + generated[2]) as T;
    return value;
  }
  const translation = pair[language === "zh" ? 0 : 1];
  // Preserve spacing around composed labels and counts.
  return ((value.match(/^\s*/)?.[0] || "") +
    translation.trim() +
    (value.match(/\s*$/)?.[0] || "")) as T;
}
