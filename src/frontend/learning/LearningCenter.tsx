import { useState } from "react";
import { useLanguage, text } from "../i18n";
import { useWorkspace } from "../context";
import { Icon } from "../Primitives";
import { courses, type Copy } from "./catalog";
import { useLearning } from "./LearningContext";
import { isPracticeProject } from "./state";
import "./learning.css";
const copy = (c: Copy) => text(c[0], c[1]);
export function LearningCenter() {
  useLanguage();
  const w = useWorkspace(),
    learn = useLearning();
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [film, setFilm] = useState<"3d" | "ai">("3d");
  const visible = courses.filter(
    (c) =>
      (filter === "all" || c.category === filter) &&
      (copy(c.title) + copy(c.description))
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <div className="mw-learning-center">
      <header className="mw-learning-heading">
        <div>
          <span className="mw-eyebrow">
            {text("MOUVA 学习中心", "MOUVA LEARNING CENTER")}
          </span>
          <h1>
            {text(
              "从一个想法，到你的第一段成片。",
              "From an idea to your first film.",
            )}
          </h1>
          <p>
            {text(
              "在工作区里学习，用实际素材练习。",
              "Learn in your workspace and practice with real media.",
            )}
          </p>
        </div>
        <button className="mw-secondary" onClick={learn.hide}>
          <Icon name="arrow" size={15} />
          {text("继续创作", "Keep creating")}
        </button>
      </header>
      <section
        className="mw-learning-feature"
        aria-label={text("雨门双锋教学案例", "Rain Gate teaching case")}
      >
        <div className="mw-learning-screen">
          <div
            className="mw-learning-film-tabs"
            role="tablist"
            aria-label={text("案例样片", "Case samples")}
          >
            {(["3d", "ai"] as const).map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={film === id}
                onClick={() => setFilm(id)}
              >
                {id === "3d"
                  ? text("3D电影版 · 32秒", "3D film · 32s")
                  : text("真人AI样片 · 12秒", "AI sample · 12s")}
              </button>
            ))}
          </div>
          <video
            key={film}
            controls
            playsInline
            preload="metadata"
            poster={`/learn/wuxia/${film === "3d" ? "3d" : "ai"}-poster.jpg`}
            src={`/learn/wuxia/${film === "3d" ? "3d" : "ai"}-film.mp4`}
            aria-label={
              film === "3d"
                ? text("32秒双人3D武打短片", "32-second two-fighter 3D film")
                : text("12秒真人风格AI样片", "12-second AI film sample")
            }
          />
        </div>
        <div className="mw-learning-feature-copy">
          <span className="mw-learning-pill">
            {text("案例 001 · 双人武打", "CASE 001 · TWO FIGHTERS")}
          </span>
          <h2>{text("雨门·双锋", "Rain Gate")}</h2>
          <p>
            {text(
              "两位剑客，一场雨夜交锋。用8个现成镜头，练习速度、标题、候选比较与成片导出。",
              "Two fighters clash in a rainy courtyard. Use eight finished shots to practice speed, titles, candidate comparison and export.",
            )}
          </p>
          <div className="mw-learning-facts">
            <span>
              <Icon name="video" size={15} />
              {text("8镜头", "8 shots")}
            </span>
            <span>
              <Icon name="clock" size={15} />
              {text("9个步骤", "9 steps")}
            </span>
            <span>
              <Icon name="box" size={15} />
              {text("可编辑3D", "Editable 3D")}
            </span>
          </div>
          <button
            className="mw-primary"
            disabled={learn.busy}
            onClick={() => void learn.startPractice()}
          >
            <Icon name="play" size={16} />
            {learn.busy
              ? text("正在准备…", "Preparing…")
              : isPracticeProject(w.project)
                ? text("继续我的练习", "Continue my practice")
                : text("打开练习项目", "Open practice project")}
          </button>
          <button
            className="mw-text-button"
            onClick={() => learn.openCourse("wuxia")}
          >
            {text("先看制作步骤", "Read the steps first")}
            <Icon name="arrow" size={15} />
          </button>
          <small>
            {text(
              "使用已有视频与模型，不会重新生成。原项目会先保存，练习后可返回。",
              "Uses existing video and models without regenerating. Your original project is saved first, so you can return afterward.",
            )}
          </small>
        </div>
      </section>
      <div className="mw-learning-browse">
        <div
          className="mw-learning-filters"
          role="group"
          aria-label={text("课程分类", "Course categories")}
        >
          {[
            ["all", text("全部", "All")],
            ["basics", text("基础操作", "Basics")],
            ["generation", text("生成与迭代", "Generation")],
            ["editing", text("剪辑与导出", "Editing")],
            ["case", text("案例实战", "Cases")],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="mw-learning-search">
          <Icon name="search" size={16} />
          <input
            aria-label={text("搜索教程", "Search lessons")}
            placeholder={text("搜索教程…", "Search lessons…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="mw-learning-grid">
        {visible.map((c) => {
          const n = learn.state.completed[c.id]?.length || 0;
          return (
            <button
              className="mw-learning-card"
              key={c.id}
              onClick={() => learn.openCourse(c.id)}
            >
              <div className={`mw-learning-card-art ${c.category}`}>
                <Icon name={c.icon} size={32} />
                <span>{c.id === "wuxia" ? "001" : "mouva"}</span>
              </div>
              <div className="mw-learning-card-copy">
                <span className="mw-learning-card-meta">
                  {text("约", "About ")}
                  {c.minutes}
                  {text("分钟", " min")} · {c.steps.length}
                  {text("步", " steps")}
                </span>
                <h3>{copy(c.title)}</h3>
                <p>{copy(c.description)}</p>
                <footer>
                  <span>
                    {n
                      ? text(
                          `已完成 ${n}/${c.steps.length} 步`,
                          `${n}/${c.steps.length} steps complete`,
                        )
                      : text("开始学习", "Start learning")}
                  </span>
                  <Icon
                    name={n === c.steps.length ? "check" : "arrow"}
                    size={16}
                  />
                </footer>
              </div>
            </button>
          );
        })}
      </div>
      {!visible.length && (
        <div className="mw-learning-empty">
          {text(
            "没有匹配的教程，换个关键词或分类试试。",
            "No lessons match. Try another keyword or category.",
          )}
        </div>
      )}
      <p className="mw-learning-provenance">
        {text(
          "真人样片与3D动画分别制作。真人样片独立通过文字生成，3D动作由程序编排。",
          "The AI sample and 3D animation were produced separately. The AI sample used text-to-video; the 3D motion was programmed.",
        )}
      </p>
    </div>
  );
}
