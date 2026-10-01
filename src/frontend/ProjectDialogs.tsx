import { useState } from "react";
import { useWorkspace } from "./context";
import { text, currentLanguage } from "./i18n";
import { Field, Icon, Modal } from "./Primitives";
import { createVideoProject } from "./project-model";
import { loadProjectCopy, savedProjects } from "./persistence";

export function NewProjectDialog() {
  const w = useWorkspace();
  const [name, setName] = useState("");
  const [ratio, setRatio] = useState("16:9");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title={text("新建视频项目", "New video project")}
      subtitle={text(
        "给下一部作品一个新的画布。",
        "A new canvas for your next film.",
      )}
      onClose={() => {
        if (!busy) w.setModal(null);
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !name.trim()) return;
          setBusy(true);
          setError("");
          try {
            await w.switchProject(createVideoProject(name, ratio));
            w.notify(text("视频项目已创建。", "Video project created."));
          } catch {
            setError(
              text(
                "未能保存或切换项目，请检查浏览器存储后重试。",
                "Could not save or switch projects. Check browser storage and try again.",
              ),
            );
            setBusy(false);
          }
        }}
      >
        <Field label={text("项目名称", "Project name")}>
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            disabled={busy}
            placeholder={text(
              "例如：我的第一部短片",
              "e.g. My first short film",
            )}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={text("画面比例", "Aspect ratio")}>
          <select
            value={ratio}
            disabled={busy}
            onChange={(e) => setRatio(e.target.value)}
          >
            <option value="16:9">
              {text("16:9 · 横屏", "16:9 · Landscape")}
            </option>
            <option value="9:16">
              {text("9:16 · 竖屏", "9:16 · Portrait")}
            </option>
            <option value="1:1">{text("1:1 · 方形", "1:1 · Square")}</option>
          </select>
        </Field>
        <div className="mw-new-project-note">
          <Icon name="canvas" size={24} />
          <div>
            <strong>
              {text("从一个空白视频节点开始", "Start with a blank video node")}
            </strong>
            <p>
              {text(
                "在 Canvas 添加视频、音频、图片和 3D 场景，拖动连接点组合你的创作。",
                "Add video, audio, images and 3D scenes to Canvas. Drag between ports to connect your work.",
              )}
            </p>
          </div>
        </div>
        <p className="mw-help">
          {text(
            "当前项目会先保存，可从项目菜单切换回来。项目保存在当前浏览器。",
            "Your current project is saved first. Return to it from the project menu. Projects stay in this browser.",
          )}
        </p>
        {error && (
          <p className="mw-project-error" role="alert">
            {error}
          </p>
        )}
        <div className="mw-dialog-actions">
          <button
            type="button"
            className="mw-secondary"
            disabled={busy}
            onClick={() => w.setModal(null)}
          >
            {text("取消", "Cancel")}
          </button>
          <button
            type="submit"
            className="mw-primary"
            disabled={busy || !name.trim()}
          >
            <Icon name="plus" size={16} />
            {busy
              ? text("正在保存并创建…", "Saving and creating…")
              : text("创建视频项目", "Create video project")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function SavedProjectList() {
  const w = useWorkspace();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [records] = useState(() => {
    try {
      return savedProjects();
    } catch {
      return [];
    }
  });
  const projects = [
    {
      id: w.project.id,
      name: w.project.name,
      updatedAt: w.project.updatedAt,
      shots: w.project.shots.length,
    },
    ...records.filter((p) => p.id !== w.project.id),
  ];
  return (
    <section
      className="mw-saved-projects"
      aria-label={text("我的视频项目", "My video projects")}
    >
      <header>
        <h3>{text("我的视频项目", "My video projects")}</h3>
        <button
          className="mw-primary"
          onClick={() => w.setModal("new-project")}
          disabled={!!busy}
        >
          <Icon name="plus" size={15} />
          {text("新建视频项目", "New video project")}
        </button>
      </header>
      <div className="mw-project-list">
        {projects.map((p) => (
          <button
            key={p.id}
            className="mw-saved-project"
            aria-current={p.id === w.project.id ? "true" : undefined}
            disabled={!!busy || p.id === w.project.id}
            onClick={async () => {
              setBusy(p.id);
              setError("");
              try {
                await w.switchProject(await loadProjectCopy(p.id));
              } catch {
                setError(
                  text(
                    "无法打开此项目，当前项目仍然保留。",
                    "Could not open this project. Your current project is preserved.",
                  ),
                );
                setBusy("");
              }
            }}
          >
            <Icon name="video" size={20} />
            <span>
              <strong>{p.name}</strong>
              <small>
                {p.shots} {text("个镜头", "shots")} ·{" "}
                {new Date(p.updatedAt).toLocaleDateString(
                  currentLanguage() === "zh" ? "zh-CN" : "en-US",
                )}
              </small>
            </span>
            <em>
              {p.id === w.project.id
                ? text("当前项目", "Current")
                : busy === p.id
                  ? text("正在打开…", "Opening…")
                  : text("打开", "Open")}
            </em>
          </button>
        ))}
      </div>
      {error && (
        <p className="mw-project-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
