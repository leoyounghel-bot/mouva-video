import { useEffect, useState } from "react";
import { text, useLanguage } from "../i18n";
import { Icon } from "../Primitives";
import { LearningCenter } from "./LearningCenter";
import { LessonPanel } from "./LessonPanel";
import { useLearning } from "./LearningContext";
import "./learning.css";

/** A reserved lane inside the canvas workspace: never covers nodes or the prompt. */
export function CanvasLearning() {
  useLanguage();
  const learn = useLearning();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(
    () => setCollapsed(false),
    [learn.centerOpen, learn.state.open, learn.state.courseId],
  );
  return (
    <aside
      className={"mw-canvas-learning" + (collapsed ? " collapsed" : "")}
      aria-label={text("画布教程", "Canvas lessons")}
    >
      <header className="mw-canvas-learning-bar">
        <button
          className="mw-canvas-learning-title"
          aria-expanded={!collapsed}
          aria-label={
            collapsed
              ? text("展开教程", "Expand lessons")
              : text("收起教程", "Minimize lessons")
          }
          title={
            collapsed
              ? text("展开教程", "Expand lessons")
              : text("收起教程", "Minimize lessons")
          }
          onClick={() => setCollapsed(!collapsed)}
        >
          <Icon name="book" size={17} />
          {!collapsed && <span>{text("边做边学", "Learn as you create")}</span>}
        </button>
        {!collapsed && (
          <button
            aria-label={text("关闭教程", "Close lessons")}
            title={text("关闭教程", "Close lessons")}
            onClick={learn.hide}
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </header>
      {!collapsed && (
        <div className="mw-canvas-learning-body">
          {learn.centerOpen ? <LearningCenter /> : <LessonPanel />}
        </div>
      )}
    </aside>
  );
}
