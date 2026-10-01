import { text, useLanguage } from "../i18n";
import { useWorkspace } from "../context";
import { Icon } from "../Primitives";
import { duration, shotLength } from "../demo";
import { useLearning } from "./LearningContext";
import { isPracticeProject } from "./state";
import type { Copy, LessonAction } from "./catalog";
const copy = (c: Copy) => text(c[0], c[1]);
export function LessonPanel() {
  useLanguage();
  const w = useWorkspace(),
    learn = useLearning(),
    c = learn.course,
    step = c.steps[learn.state.step];
  const completed = learn.state.completed[c.id] || [],
    isCase = isPracticeProject(w.project),
    third = w.project.shots[2];
  const caseNeeded = c.id === "wuxia" && !isCase;
  function createView(view: "canvas" | "timeline" | "stream") {
    w.setSceneOpen(false);
    w.setSection("create");
    w.setView(view);
  }
  function action(kind: LessonAction) {
    if (caseNeeded && kind !== "practice") {
      void learn.startPractice();
      return;
    }
    if (kind === "practice") {
      void learn.startPractice();
      return;
    }
    if (kind === "canvas") createView("canvas");
    if (kind === "storyboard") createView("stream");
    if (kind === "timeline") createView("timeline");
    if (kind === "assets") w.setSection("assets");
    if (kind === "images") w.setModal("images");
    if (kind === "export") w.setModal("export");
    if (kind === "takes") {
      createView("canvas");
      w.setModal("takes");
    }
    if (kind === "agent") {
      w.openAgent("edit");
    }
    if (kind === "native") {
      const s = w.shot,
        take = s.takes.find((t) => t.scene);
      if (!take) {
        w.notify(
          text(
            "当前镜头没有3D候选。可先打开雨门双锋练习。",
            "This shot has no 3D take. Open the Rain Gate practice to try one.",
          ),
        );
        return;
      }
      w.update((p) => {
        p.shots.find((x) => x.id === s.id)!.viewingTakeId = take.id;
      }, "Preview 3D take");
      w.openScene(s.id);
      w.setInspectorOpen(false);
    }
    if (kind === "third-shot" || kind === "slow-third") {
      if (!third) return;
      createView("timeline");
      w.select(third.id);
      if (kind === "slow-third")
        w.execute([
          {
            tool: "take.preview",
            targetId: third.id,
            args: { takeId: third.adoptedTakeId },
          },
          { tool: "clip.speed", targetId: third.id, args: { speed: 0.75 } },
        ]);
    }
    if (kind === "title") {
      const first = w.project.shots[0];
      createView("timeline");
      w.select(first.id);
      const title = text("第一幕 · 雨夜对峙", "Act I · Standoff");
      if (!first.layers.some((l) => l.text === title))
        w.execute([
          {
            tool: "text.add",
            targetId: first.id,
            args: {
              text: title,
              start: first.trimStart,
              end: Math.min(first.trimEnd, first.trimStart + 3),
              x: 76,
              y: 13,
              fontSize: 28,
              color: "#ffffff",
            },
          },
        ]);
    }
  }
  return (
    <section
      className="mw-lesson-panel"
      aria-label={text("教程步骤", "Lesson steps")}
    >
      <header>
        <button className="mw-text-button" onClick={learn.showCenter}>
          <Icon name="book" size={14} />
          {text("所有教程", "All lessons")}
        </button>
        <h2>{copy(c.title)}</h2>
        <div className="mw-lesson-progress">
          <span>
            {completed.length}/{c.steps.length}{" "}
            {text("步已完成", "steps complete")}
          </span>
          <progress
            max={c.steps.length}
            value={completed.length}
            aria-label={text("学习进度", "Learning progress")}
          />
        </div>
        <label className="mw-lesson-step-select">
          <span>{text("当前步骤", "Current step")}</span>
          <select
            value={learn.state.step}
            onChange={(e) => learn.selectStep(Number(e.target.value))}
          >
            {c.steps.map((s, i) => (
              <option key={i} value={i}>
                {completed.includes(i) ? "✓ " : ""}
                {i + 1}. {copy(s.title)}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="mw-lesson-scroll" key={c.id + learn.state.step}>
        <span className="mw-eyebrow">
          {text(
            `第 ${learn.state.step + 1} 步`,
            `STEP ${learn.state.step + 1}`,
          )}
        </span>
        <h3>{copy(step.title)}</h3>
        <p>{copy(step.body)}</p>
        {step.image && (
          <img src={`/learn/wuxia/${step.image}`} alt={copy(step.title)} />
        )}
        <ol>
          {step.tasks.map((task, i) => (
            <li key={i}>{copy(task)}</li>
          ))}
        </ol>
        {step.tip && <aside>{copy(step.tip)}</aside>}
        {isCase && c.id === "wuxia" && learn.state.step === 5 && third && (
          <div className="mw-lesson-live" role="status">
            <Icon name="clock" size={16} />
            <div>
              <strong>{text("当前项目", "Current project")}</strong>
              <span>
                {text("第三镜头", "Shot three")} {third.speed}× ·{" "}
                {shotLength(third).toFixed(1)}
                {text("秒", "s")}
              </span>
              <span>
                {text("全片", "Total")} {duration(w.project).toFixed(1)}
                {text("秒", "s")}
              </span>
            </div>
          </div>
        )}
        {step.action && (
          <button
            className="mw-primary full"
            disabled={learn.busy}
            onClick={() => action(step.action!)}
          >
            <Icon name="arrow" size={15} />
            {learn.busy
              ? text("正在准备…", "Preparing…")
              : caseNeeded
                ? text("先打开练习项目", "Open the practice project first")
                : copy(step.actionLabel!)}
          </button>
        )}
        <label className="mw-lesson-check">
          <input
            type="checkbox"
            checked={completed.includes(learn.state.step)}
            onChange={(e) => learn.completeStep(e.target.checked)}
          />
          {text("我已完成这一步", "I have completed this step")}
        </label>
        {isCase && learn.backupName && (
          <div className="mw-lesson-return">
            <p>
              {text("原项目已保留：", "Original saved: ")}
              {learn.backupName}
            </p>
            <button
              className="mw-secondary full"
              disabled={learn.busy}
              onClick={() => void learn.restoreProject()}
            >
              <Icon name="undo" size={14} />
              {text("保留练习并返回原项目", "Save practice and return")}
            </button>
          </div>
        )}
      </div>
      <footer>
        <button
          className="mw-secondary"
          disabled={learn.state.step === 0}
          onClick={() => learn.selectStep(learn.state.step - 1)}
        >
          {text("上一步", "Previous")}
        </button>
        <button
          className="mw-primary"
          onClick={() => {
            if (learn.state.step === c.steps.length - 1) learn.showCenter();
            else learn.selectStep(learn.state.step + 1);
          }}
        >
          {learn.state.step === c.steps.length - 1
            ? text("返回教程目录", "All lessons")
            : text("下一步", "Next")}
          <Icon name="arrow" size={14} />
        </button>
      </footer>
    </section>
  );
}
