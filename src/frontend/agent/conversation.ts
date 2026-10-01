export type ConversationTurn = { role: "user" | "assistant"; text: string };
import type { EditCommand } from "../editor/commands";
import type { Project } from "../types";

const actions: Record<string, string> = {
  "clip.add": "添加镜头",
  "clip.split": "分割镜头",
  "clip.duplicate": "复制镜头",
  "clip.remove": "移除镜头",
  "clip.move": "调整镜头顺序",
  "clip.trim": "裁剪镜头",
  "clip.speed": "调整播放速度",
  "clip.update": "更新镜头设置",
  "clip.effects": "调整画面与声音",
  "text.add": "添加标题",
  "text.update": "调整标题",
  "text.remove": "移除标题",
  "audio.add": "添加音频",
  "audio.update": "调整音频",
  "audio.remove": "移除音频",
  "take.preview": "预览候选",
  "take.adopt": "采用候选",
  "asset.reference": "设置画面参考",
  "scene.update": "调整 3D 场景",
  "scene.object.update": "调整场景物体",
  "scene.object.add": "添加场景物体",
  "scene.object.remove": "移除场景物体",
  "project.update": "更新项目信息",
  "character.update": "调整角色",
  "graph.move": "移动画布节点",
  "ui.select": "选择镜头",
  "ui.view": "切换工作区视图",
  "ui.seek": "调整播放位置",
  "ui.play": "调整播放状态",
  "history.undo": "撤销上一步",
  "history.redo": "恢复上一步",
  "render.export": "导出成片",
  "ai.generate": "准备生成候选",
};

export function describeEdit(
  command: EditCommand,
  project: Project,
  translate: (value: string) => string = (value) => value,
  language: "zh" | "en" = "zh",
) {
  const target =
    project.shots.find((shot) => shot.id === command.targetId)?.title ||
    project.audio.find((audio) => audio.id === command.targetId)?.name;
  const detail =
    command.tool === "clip.speed"
      ? language === "en"
        ? ` to ${command.args?.speed}×`
        : `至 ${command.args?.speed} 倍`
      : "";
  return `${translate(actions[command.tool] || "调整项目")}${detail}${target ? ` · ${target}` : ""}`;
}

export function editingInstruction(
  history: ConversationTurn[],
  instruction: string,
) {
  const latest = instruction.trim();
  if (!latest || latest.length > 4000)
    throw new Error("请输入最多 4000 字的编辑要求。");
  const recent = history
    .slice(-6)
    .map(
      (turn) =>
        `${turn.role === "user" ? "用户" : "Agent"}: ${turn.text.slice(0, 600)}`,
    )
    .join("\n");
  return recent
    ? `以下为最近的对话背景，当前项目数据为准：\n${recent}\n\n本次用户要求：\n${latest}`
    : latest;
}
