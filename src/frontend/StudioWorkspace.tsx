import { t as tr, text } from "./i18n";
import { useRef, useState, type CSSProperties } from "react";
import { useWorkspace } from "./context";
import { Icon, IconButton } from "./Primitives";
import { Sidebar } from "./Sidebar";
import { Inspector } from "./Inspector";
import { CreativeGraph } from "./CreativeGraph";
import { TimelineView } from "./Timeline";
import { StreamView, AssetsPage, CharactersPage, LibraryPage } from "./Pages";
import { SceneStudio, NativeInspector } from "./native/SceneStudio";
import { workingScene } from "./native/templates";
import { WorkspaceViews } from "./WorkspaceViews";
import { AgentPanel } from "./agent/AgentPanel";
import { CreditBalance } from "./native/CreditBalance";
import { workspaceKey } from "./auth/session";
import "./studio-workspace.css";
import "./timeline.css";
import { CanvasLearning } from "./learning/CanvasLearning";
import { useLearning } from "./learning/LearningContext";
import { AccountMenu } from "./auth/AccountMenu";

export function StudioRail() {
  const w = useWorkspace();
  const learning = useLearning();
  return (
    <nav className="mw-studio-rail" aria-label={tr("工作区工具")}>
      <button
        aria-label={tr("镜头与项目")}
        title={tr("镜头与项目")}
        aria-pressed={w.sidebarOpen && w.section === "create"}
        onClick={() => {
          w.setSection("create");
          w.setSidebarOpen(w.section !== "create" || !w.sidebarOpen);
        }}
      >
        <Icon name="stream" size={20} />
      </button>
      {[
        ["assets", "box", "素材库"],
        ["characters", "camera", "角色"],
        ["library", "layers", "资源库"],
      ].map(([section, icon, label]) => (
        <button
          key={section}
          title={tr(label)}
          aria-label={tr(label)}
          aria-pressed={w.section === section}
          onClick={() =>
            w.setSection(section as "assets" | "characters" | "library")
          }
        >
          <Icon name={icon} size={20} />
        </button>
      ))}
      <button
        title={tr("生成任务")}
        aria-label={tr("生成任务")}
        onClick={() => w.setModal("jobs")}
      >
        <Icon name="history" size={20} />
      </button>
      <div />
      <button
        title={text("学习中心", "Learning center")}
        aria-label={text("学习中心", "Learning center")}
        aria-pressed={learning.centerOpen || learning.state.open}
        onClick={learning.showCenter}
      >
        <Icon name="book" size={20} />
      </button>
      <button
        title={tr("服务设置")}
        aria-label={tr("服务设置")}
        onClick={() => w.setModal("ai-settings")}
      >
        <Icon name="sliders" size={20} />
      </button>
    </nav>
  );
}

function savedAgentWidth() {
  try {
    const width = Number(
      localStorage.getItem(workspaceKey("mouva-agent-width")),
    );
    return Number.isFinite(width) && width >= 300 && width <= 560 ? width : 360;
  } catch {
    return 360;
  }
}

export function StudioWorkspace() {
  const w = useWorkspace();
  const learning = useLearning();
  const [width, setWidth] = useState(savedAgentWidth);
  const resize = useRef<{ x: number; width: number } | null>(null);
  const rightOpen = w.agentOpen || w.inspectorOpen;
  const scene = w.sceneOpen && workingScene(w.shot);
  function rememberWidth(value: number) {
    setWidth(value);
    try {
      localStorage.setItem(workspaceKey("mouva-agent-width"), String(value));
    } catch {}
  }
  return (
    <div
      className="mw-studio"
      style={{ "--mw-agent-width": width + "px" } as CSSProperties}
    >
      <header className="mw-studio-header">
        <div className="mw-studio-project">
          <button
            className="mw-studio-brand"
            aria-label={tr("项目菜单")}
            onClick={() => w.setModal("project")}
          >
            mouva
            <b>studio</b>
            <span>⌄</span>
          </button>
          <i />
          <button
            className="mw-studio-project-name"
            onClick={() => w.setModal("project")}
          >
            <span>{w.project.name}</span>
            <Icon name="chevron" size={12} />
          </button>
          <button
            className="mw-studio-new-project"
            onClick={() => w.setModal("new-project")}
            title={text("新建视频项目", "New video project")}
            aria-label={text("新建视频项目", "New video project")}
          >
            <Icon name="plus" size={16} />
            <span>{text("新建项目", "New project")}</span>
          </button>
        </div>
        <WorkspaceViews />
        <div className="mw-studio-actions">
          <CreditBalance />
          <IconButton
            icon="undo"
            label={tr("撤销")}
            onClick={w.undo}
            disabled={!w.canUndo}
          />
          <IconButton
            icon="redo"
            label={tr("重做")}
            onClick={w.redo}
            disabled={!w.canRedo}
          />
          <button
            aria-label={tr("图片生成")}
            title={tr("图片生成")}
            onClick={() => w.openImage()}
          >
            <Icon name="image" size={16} />
            <span>{tr("图片生成")}</span>
          </button>
          <button
            aria-label={tr("候选卡组")}
            title={tr("候选卡组")}
            onClick={() => w.setModal("takes")}
          >
            <Icon name="layers" size={16} />
            <span>{tr("候选卡组")}</span>
          </button>
          <button
            aria-label={tr("导出")}
            title={tr("导出")}
            onClick={() => w.setModal("export")}
          >
            <Icon name="download" size={16} />
            <span>{tr("导出")}</span>
          </button>
          <button
            className={w.agentOpen && !w.inspectorOpen ? "active" : ""}
            aria-label={tr("切换 Agent 侧栏")}
            aria-pressed={
              w.agentOpen && !w.inspectorOpen && w.section !== "learn"
            }
            onClick={() => {
              w.setSection("create");
              w.setAgentOpen(!w.agentOpen || w.inspectorOpen);
              w.setInspectorOpen(false);
            }}
          >
            <Icon name="spark" size={16} />
            <span>Agent</span>
          </button>
          <AccountMenu />
        </div>
      </header>
      <div className="mw-studio-body">
        <StudioRail />
        {w.section === "create" && w.sidebarOpen && <Sidebar />}
        <main
          className={
            "mw-studio-main mw-main " +
            (w.section === "create" ? w.view : "resources")
          }
          aria-label={tr("创作工作区")}
        >
          {(learning.centerOpen || learning.state.open) && <CanvasLearning />}
          <div className="mw-studio-surface">
            {w.section === "learn" ? (
              <CreativeGraph />
            ) : w.section === "assets" ? (
              <AssetsPage />
            ) : w.section === "characters" ? (
              <CharactersPage />
            ) : w.section === "library" ? (
              <LibraryPage />
            ) : scene ? (
              <SceneStudio key={w.shot.id} />
            ) : w.view === "canvas" ? (
              <CreativeGraph />
            ) : w.view === "timeline" ? (
              <TimelineView />
            ) : (
              <StreamView />
            )}
          </div>
        </main>
        <aside
          className="mw-studio-right"
          hidden={!rightOpen}
          aria-label={tr("Agent 与镜头属性")}
        >
          <div
            className="mw-agent-resize"
            role="separator"
            aria-label={tr("调整 Agent 宽度")}
            aria-orientation="vertical"
            aria-valuemin={300}
            aria-valuemax={560}
            aria-valuenow={width}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              rememberWidth(
                Math.max(
                  300,
                  Math.min(560, width + (e.key === "ArrowLeft" ? 20 : -20)),
                ),
              );
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              resize.current = { x: e.clientX, width };
              e.currentTarget.setPointerCapture(e.pointerId);
              e.preventDefault();
            }}
            onPointerMove={(e) => {
              if (!resize.current) return;
              const limit = Math.min(
                560,
                Math.max(300, window.innerWidth - 420),
              );
              setWidth(
                Math.max(
                  300,
                  Math.min(
                    limit,
                    resize.current.width + resize.current.x - e.clientX,
                  ),
                ),
              );
            }}
            onPointerUp={() => {
              resize.current = null;
              rememberWidth(width);
            }}
            onPointerCancel={() => {
              resize.current = null;
            }}
            onLostPointerCapture={() => {
              resize.current = null;
            }}
          />
          <nav className="mw-studio-panel-tabs" aria-label={tr("侧栏内容")}>
            <button
              className={!w.inspectorOpen ? "active" : ""}
              aria-pressed={!w.inspectorOpen}
              onClick={() => {
                w.setInspectorOpen(false);
                w.setAgentOpen(true);
              }}
            >
              <Icon name="spark" size={14} />
              Agent
            </button>
            <button
              className={w.inspectorOpen ? "active" : ""}
              aria-pressed={w.inspectorOpen}
              onClick={() => {
                w.setInspectorOpen(true);
              }}
            >
              <Icon name="sliders" size={14} />
              {tr("镜头属性")}
            </button>
            <button
              className={
                learning.state.open || learning.centerOpen ? "active" : ""
              }
              aria-pressed={learning.state.open || learning.centerOpen}
              onClick={learning.showCenter}
            >
              <Icon name="book" size={14} />
              {text("教程", "Learn")}
            </button>
            <IconButton
              icon="close"
              label={tr("关闭侧栏")}
              onClick={() => {
                w.setAgentOpen(false);
                w.setInspectorOpen(false);
              }}
            />
          </nav>
          <div className="mw-studio-agent-content" hidden={w.inspectorOpen}>
            <AgentPanel key={w.project.id} />
          </div>
          {w.inspectorOpen && (
            <div className="mw-studio-inspector-content">
              {scene ? <NativeInspector key={w.shot.id} /> : <Inspector />}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
