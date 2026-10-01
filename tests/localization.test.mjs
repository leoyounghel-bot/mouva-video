import test from "node:test";
import assert from "node:assert/strict";
import { translate } from "../src/frontend/i18n/translator.ts";
import { describeEdit } from "../src/frontend/agent/conversation.ts";
import { demoProject } from "../src/frontend/demo.ts";

test("workspace labels use canonical singular names in either language", () => {
  for (const [zh, en] of [
    ["故事板", "Storyboard"],
    ["画布", "Canvas"],
    ["时间线", "Timeline"],
    ["视频", "Video"],
    ["格式", "Format"],
    ["分辨率", "Resolution"],
  ]) {
    assert.equal(translate(zh, "en"), en);
    assert.equal(translate(en, "zh"), zh);
  }
  assert.equal(translate("mouva studio", "zh"), "mouva studio");
});

test("labels preserve whitespace in counts and composed descriptions", () => {
  assert.equal(translate(" ", "zh"), " ");
  assert.equal(translate(" ", "en"), " ");
  assert.equal(translate("本轮 ", "en") + "2 / 4", "Round 2 / 4");
  assert.equal(translate(" · 已采用", "en"), " · Adopted");
  assert.equal(translate("Format", "zh"), "格式");
});

test("language selection preserves unknown project content and non-text React values", () => {
  const name = "用户自己的片名 · My film";
  assert.equal(translate(name, "en"), name);
  assert.equal(translate(name, "zh"), name);
  const object = { title: name };
  assert.equal(translate(object, "en"), object);
  assert.equal(translate(4, "zh"), 4);
});

test("Agent edit descriptions localize the operation while preserving the target title", () => {
  const project = structuredClone(demoProject);
  project.shots[0].title = "我的镜头";
  const command = {
    tool: "clip.speed",
    targetId: project.shots[0].id,
    args: { speed: 0.75 },
  };
  const en = describeEdit(
    command,
    project,
    (value) => translate(value, "en"),
    "en",
  );
  assert.equal(en, "Adjust playback speed to 0.75× · 我的镜头");
  assert.equal(
    describeEdit(command, project),
    "调整播放速度至 0.75 倍 · 我的镜头",
  );
  assert.equal(project.shots[0].speed, demoProject.shots[0].speed);
});

test("generated candidate labels localize without altering round identity", () => {
  assert.equal(translate("图片节点 1", "en"), "Image node 1");
  assert.equal(translate("文本节点 12", "en"), "Text node 12");
  assert.equal(translate("Image node 1", "zh"), "图片节点 1");
  assert.equal(translate("Motion reference · 1/4", "zh"), "运动参考 · 1/4");
  assert.equal(
    translate("Editable 3D scene · 2/4", "zh"),
    "可编辑 3D 场景 · 2/4",
  );
  assert.equal(
    translate("Chromium is missing. Set CHROME_PATH on the server.", "zh"),
    "渲染服务未找到浏览器，请在服务端配置 Chrome 路径。",
  );
});
