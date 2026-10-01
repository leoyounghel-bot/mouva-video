import messages from "./messages.json" with { type: "json" };
export type Language = "zh" | "en";
const catalog = new Map<string, readonly [string, string]>();
for (const pair of messages) {
  const translated = pair as [string, string];
  if (!catalog.has(pair[0])) catalog.set(pair[0], translated);
  catalog.set(pair[1], translated);
}
// Existing task records retain their original stage labels. Only their UI copy changes.
for (const [oldZh, oldEn, zh, en] of [
  [
    "Seedance · 视频成片",
    "Seedance · Finished video",
    "视频成片",
    "Finished video",
  ],
  [
    "调整物体或相机运动，下次渲染会将修改传递给视频模型。",
    "Edit an object or camera move. The next render carries your changes into Seedance.",
    "调整物体或相机运动，修改将用于下一次视频生成。",
    "Edit an object or camera move. Your changes guide the next video.",
  ],
  [
    "智能导演规划修改，场景模型更新可编辑场景。查看效果后，再将运动参考交给视频模型。",
    "Codex plans the change. Gemini updates your editable scene. Review it here before sending its motion to Seedance.",
    "描述修改，审阅可编辑场景，再将场景运动变成视频。",
    "Describe your change, review the editable scene, then turn its motion into a video.",
  ],
  [
    "智能规划、场景创建与视频生成。",
    "Codex orchestrates. Gemini creates. Seedance finishes.",
    "规划故事，塑造场景，让灵感动起来。",
    "Plan your story. Shape your scenes. Bring them to life.",
  ],
  ["三维场景", "Three.js scene", "三维场景", "3D scene"],
  [
    "渲染当前场景，预览将用于引导视频模型的运动参考。",
    "Render this editable scene to preview exactly what Seedance will receive.",
    "预览将用于引导成片的运动效果。",
    "Preview the motion that will guide your finished video.",
  ],
  ["智能调度模型", "Codex orchestrator", "创作助手", "Creative assistant"],
  ["场景生成模型", "Gemini scene director", "3D 场景", "3D scenes"],
  ["视频生成模型", "Seedance video generation", "视频生成", "Video generation"],
  [
    "视频模型可以访问",
    "Reachable by Seedance",
    "可用于视频生成",
    "Ready for video generation",
  ],
  [
    "视频模型 · 正在重新连接任务",
    "Seedance · reconnecting to task",
    "正在重新连接视频任务",
    "Reconnecting to the video task",
  ],
  [
    "智能导演 · 正在规划镜头",
    "Codex · planning the shot",
    "正在规划镜头",
    "Planning the shot",
  ],
  [
    "场景模型 · 正在创建可编辑场景",
    "Gemini · building the editable scene",
    "正在创建可编辑场景",
    "Building the editable scene",
  ],
  [
    "正在渲染运动参考",
    "Three.js · rendering the motion reference",
    "正在渲染运动参考",
    "Rendering the motion reference",
  ],
  [
    "视频模型 · 正在提交生成任务",
    "Seedance 2.5 · submitting the referenced shot",
    "正在提交视频生成任务",
    "Submitting the video task",
  ],
  [
    "可编辑三维场景",
    "Editable Three.js scene",
    "可编辑三维场景",
    "Editable 3D scene",
  ],
  [
    "视频模型正在排队",
    "Queued at Seedance",
    "视频任务正在排队",
    "Video task queued",
  ],
  [
    "视频模型正在渲染",
    "Rendering at Seedance",
    "正在生成视频",
    "Generating video",
  ],
  [
    "正在重新连接视频任务",
    "Seedance · reconnecting to task",
    "正在重新连接视频任务",
    "Reconnecting to the video task",
  ],
] as const) {
  const pair = [zh, en] as const;
  catalog.set(oldZh, pair);
  catalog.set(oldEn, pair);
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
    const defaultNode =
      /^(图片节点|文本节点|音频节点|视频节点|3D 场景|Image node|Text node|Audio node|Video node|3D scene) (\d+)$/.exec(
        value,
      );
    if (defaultNode) {
      const kind = [
        ["图片节点", "Image node"],
        ["文本节点", "Text node"],
        ["音频节点", "Audio node"],
        ["视频节点", "Video node"],
        ["3D 场景", "3D scene"],
      ].find((pair) => pair.includes(defaultNode[1]))!;
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
