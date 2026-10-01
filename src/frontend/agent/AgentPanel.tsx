import { t as tr, text as localeText, currentLanguage } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "../context";
import { Icon } from "../Primitives";
import { uid } from "../demo";
import { studioAI, type AIStatus } from "../native/api";
import { useProduction } from "../native/useProduction";
import { workingScene } from "../native/templates";
import { canvasInputs } from "../canvas/model";
import { type EditCommand } from "../editor/commands";
import { describeEdit, editingInstruction } from "./conversation";
import type { CandidateCount } from "../native/rounds";
import "./agent.css";
import { AgentEditTools } from "./AgentEditTools";
import { workspaceKey } from "../auth/session";
import { readConversation, saveConversation, type ConversationRecord } from "./history";

type Message = ConversationRecord & {
  plan?: {
    commands: EditCommand[];
    descriptions: string[];
    base: string;
    projectId: string;
  };
  jobIds?: string[];
  shotId?: string;
};

export function AgentPanel() {
  const w = useWorkspace();
  const live = useRef(w);
  live.current = w;
  const historyKey = workspaceKey("mouva-agent-conversation-" + w.project.id);
  const [saved] = useState(() => readConversation(localStorage, historyKey));
  const [messages, setMessages] = useState<Message[]>(saved.messages);
  const [draft, setDraft] = useState(saved.draft);
  const [mode, setMode] = useState<"edit" | "generate">(w.agentMode);
  const [output, setOutput] = useState<"scene" | "reference" | "finish">(
    "finish",
  );
  const [count, setCount] = useState<CandidateCount>(2);
  const [preserve, setPreserve] = useState(true);
  const [auto, setAuto] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [checking, setChecking] = useState(false);
  const request = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const intentShot = useRef(w.shot.id);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const production = useProduction(w.shot);
  const source =
    workingScene(w.shot) || canvasInputs(w.project, w.shot.id).scene;
  const busy = planning || production.busy;
  const conversation = useRef({ messages, draft, busy });
  conversation.current = { messages, draft, busy };
  useEffect(() => {
    const timer = window.setTimeout(() =>
      saveConversation(localStorage, historyKey, messages, draft, busy), 250);
    return () => window.clearTimeout(timer);
  }, [historyKey, messages, draft, busy]);
  useEffect(() => {
    const flush = () => {
      const { messages, draft, busy } = conversation.current;
      saveConversation(localStorage, historyKey, messages, draft, busy);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [historyKey]);
  const editPreviewBlocked =
    mode === "edit" && w.shot.viewingTakeId !== w.shot.adoptedTakeId;
  const missing =
    mode === "edit"
      ? status && !status.orchestratorReady
        ? ["编辑模型连接"]
        : []
      : status
        ? [
            ...((output === "scene" ||
              !source ||
              !preserve ||
              output === "finish") &&
            !status.orchestratorReady
              ? ["AI 连接"]
              : []),
            ...((output === "scene" || !source || !preserve) &&
            !status.sceneReady
              ? ["场景模型"]
              : []),
            ...(output === "finish" && !status.videoReady ? ["视频模型"] : []),
            ...(output === "finish" && !status.publisherReady
              ? ["运动参考发布服务"]
              : []),
          ]
        : [];

  async function checkStatus() {
    setChecking(true);
    setStatusError("");
    try {
      setStatus(await studioAI.status());
    } catch (error: any) {
      setStatus(null);
      setStatusError(error.message);
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    let active = true;
    studioAI
      .status()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((error) => {
        if (active) setStatusError(error.message);
      });
    return () => {
      active = false;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    setMode(w.agentMode);
    intentShot.current = w.shot.id;
    if (w.directorIntent?.instruction !== undefined)
      setDraft(w.directorIntent.instruction);
    if (w.directorIntent?.mode) setOutput(w.directorIntent.mode);
    if (w.directorIntent?.candidateCount)
      setCount(w.directorIntent.candidateCount);
    if (w.directorIntent?.reviseScene !== undefined)
      setPreserve(!w.directorIntent.reviseScene);
    if (w.agentRequest) input.current?.focus();
  }, [w.agentRequest]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);

  function patch(id: string, value: Partial<Message>) {
    setMessages((list) =>
      list.map((message) =>
        message.id === id ? { ...message, ...value } : message,
      ),
    );
  }
  function applyNative(command: EditCommand) {
    const base = w.project.updatedAt;
    const description = describeEdit(command, w.project, tr, currentLanguage());
    if (!w.execute([command], base)) return false;
    setMessages((list) => [
      ...list,
      {
        id: uid(),
        role: "assistant",
        text: tr("即时剪辑已应用。"),
        state: "applied",
        shot: w.shot.title,
        plan: {
          commands: [command],
          descriptions: [description],
          base,
          projectId: w.project.id,
        },
      },
    ]);
    return true;
  }
  async function submit() {
    if (
      !draft.trim() ||
      locked.current ||
      !status ||
      missing.length ||
      editPreviewBlocked
    )
      return;
    locked.current = true;
    const instruction = draft.trim();
    const snapshot = w;
    const id = uid();
    const history = messages.map(({ role, text, state }) => ({
      role,
      text: state
        ? `${text}（${state === "applied" ? "已应用" : state === "pending" ? "尚未应用" : state}）`
        : text,
    }));
    setMessages((list) => [
      ...list,
      { id: uid(), role: "user", text: instruction, shot: snapshot.shot.title },
      {
        id,
        role: "assistant",
        shotId: snapshot.shot.id,
        text:
          mode === "edit" ? "正在理解要求并检查项目…" : "正在提交这一轮候选…",
      },
    ]);
    setDraft("");
    if (mode === "edit") {
      setPlanning(true);
      const controller = new AbortController();
      request.current = controller;
      try {
        const result = await studioAI.editorPlan(
          {
            instruction:
              localeText(
                "请用中文回复并说明修改。\n",
                "Reply and explain your edits in English.\n",
              ) + editingInstruction(history, instruction),
            project: snapshot.project,
            selectedShotId: snapshot.shot.id,
            playhead: snapshot.time,
          },
          controller.signal,
        );
        if (controller.signal.aborted) {
          patch(id, {
            text: "本次编辑已停止，未应用任何操作。",
            state: "cancelled",
          });
          return;
        }
        const plan = {
          commands: result.commands,
          descriptions: result.commands.map((command) =>
            describeEdit(command, snapshot.project, tr, currentLanguage()),
          ),
          base: snapshot.project.updatedAt,
          projectId: snapshot.project.id,
        };
        // Generating/exporting needs an explicit action; only native edits can auto-apply.
        const canAutoApply =
          auto &&
          result.commands.every(
            (command) =>
              !command.tool.startsWith("ai.") &&
              command.tool !== "render.export",
          );
        if (live.current.project.id !== snapshot.project.id) return;
        const applied =
          canAutoApply &&
          result.commands.length > 0 &&
          live.current.execute(result.commands, plan.base);
        patch(id, {
          text: result.summary || "已检查当前项目。",
          plan: result.commands.length ? plan : undefined,
          state: result.commands.length
            ? applied
              ? "applied"
              : canAutoApply
                ? "stale"
                : "pending"
            : undefined,
        });
      } catch (error: any) {
        patch(id, {
          text: controller.signal.aborted
            ? "本次编辑已停止，未应用任何操作。"
            : error.message || "请求未完成，请重试。",
          state: controller.signal.aborted ? "cancelled" : "error",
        });
      } finally {
        if (request.current === controller) request.current = null;
        setPlanning(false);
        locked.current = false;
      }
    } else {
      try {
        const jobs = await production.submitBatch({
          instruction,
          mode: output,
          reviseScene: output === "scene" || !source || !preserve,
          count: output === "finish" ? count : 1,
          ...(intentShot.current === snapshot.shot.id
            ? {
                scope: w.directorIntent?.scope,
                objectId: w.directorIntent?.objectId,
                referenceIds: w.directorIntent?.referenceAssetIds,
              }
            : {}),
        });
        if (jobs)
          patch(id, {
            text: localeText(
              `已提交 ${jobs.length} 个${output === "scene" ? "3D 场景" : output === "reference" ? "运动预览" : "视频候选"}。完成后可以比较、采用或继续重抽。`,
              `Submitted ${jobs.length} ${output === "scene" ? "3D scenes" : output === "reference" ? "motion previews" : "video candidates"}. Compare, adopt or try again when ready.`,
            ),
            state: "submitted",
            jobIds: jobs.map((job) => job.id),
          });
        else
          patch(id, {
            text: "这一轮未完成提交。查看下方错误，原来的版本仍然保留。",
            state: "error",
          });
      } finally {
        locked.current = false;
      }
    }
  }

  return (
    <section className="mw-agent" aria-label={tr("Mouva Agent 对话")}>
      <header className="mw-agent-heading">
        <div>
          <span className="mw-agent-orb" />
          <strong>Mouva Agent</strong>
        </div>
        <span>{busy ? tr("处理中") : ""}</span>
        <button
          aria-label={tr("新建 Agent 对话")}
          title={tr("新建对话")}
          disabled={busy}
          onClick={() => {
            setMessages([]);
            setDraft("");
            input.current?.focus();
          }}
        >
          <Icon name="plus" size={15} />
        </button>
      </header>
      <div
        className="mw-agent-context"
        title={tr("发送时附带当前镜头与项目上下文")}
      >
        <Icon name="video" size={14} />
        <span>{w.shot.title}</span>
        <small>
          {tr(
            w.view === "canvas"
              ? "Canvas"
              : w.view === "stream"
                ? "故事板"
                : "时间线",
          )}
        </small>
      </div>
      <div
        className="mw-agent-messages"
        role="log"
        aria-label={tr("Agent 对话记录")}
        aria-live="polite"
        aria-relevant="additions text"
      >
        {!messages.length && (
          <div className="mw-agent-welcome">
            <Icon name="spark" size={27} />
            <h2>{tr("把想法，变成下一步。")}</h2>
            <p>
              {tr(
                "描述你想调整的画面或剪辑。Agent 会结合当前镜头，帮你修改项目或探索新版本。",
              )}
            </p>
            {[
              ["调整速度", "把当前镜头的播放速度改为 0.75 倍", "edit"],
              ["剪掉开头", "把当前镜头的开头裁掉 0.5 秒，保留其余内容", "edit"],
              ["添加字幕", "给当前镜头加上标题：新的开始", "edit"],
              [
                "调整色彩",
                "为当前镜头增加一点对比度和饱和度，保持自然",
                "edit",
              ],
              [
                "再探索一组",
                "保留当前主体、构图与运镜，探索更自然的电影感视频",
                "generate",
              ],
            ].map(([label, text, nextMode]) => (
              <button
                key={label}
                onClick={() => {
                  setDraft(tr(text));
                  setMode(nextMode as typeof mode);
                  input.current?.focus();
                }}
              >
                <span>{tr(label)}</span>
                <Icon name="arrow" size={14} />
              </button>
            ))}
          </div>
        )}
        {messages.map((message) => (
          <article
            key={message.id}
            className={"mw-agent-message " + message.role}
          >
            <header>
              {message.role === "user" ? (
                tr("你")
              ) : (
                <>
                  <Icon name="spark" size={12} />
                  Agent
                </>
              )}
              {message.shot && <small>{tr(message.shot)}</small>}
            </header>
            <p>{message.role === "user" ? message.text : tr(message.text)}</p>
            {message.plan && (
              <details open={message.state === "pending"}>
                <summary>
                  {tr(message.plan.commands.length)}
                  {tr("项操作")}
                </summary>
                <ul>
                  {message.plan.descriptions.map((text, index) => (
                    <li key={index}>{tr(text)}</li>
                  ))}
                </ul>
              </details>
            )}
            {message.state === "pending" && message.plan && (
              <button
                className="mw-agent-apply"
                onClick={() => {
                  const plan = message.plan!;
                  const applied =
                    w.project.id === plan.projectId &&
                    w.execute(plan.commands, plan.base);
                  patch(message.id, { state: applied ? "applied" : "stale" });
                }}
              >
                <Icon name="check" size={14} />
                {tr("应用修改")}
              </button>
            )}
            {message.state === "applied" && (
              <div className="mw-agent-result">
                <Icon name="check" size={13} />
                {tr(message.restored ? "已恢复的操作记录" : "已应用 · 可用顶部撤销恢复")}
              </div>
            )}
            {message.state === "stale" && (
              <div className="mw-agent-result">
                {tr("项目已变化，请按最新状态重新规划。")}
              </div>
            )}
            {(message.state === "error" || message.state === "stale") && (
              <button
                onClick={() => {
                  const index = messages.findIndex((m) => m.id === message.id);
                  const previous = messages[index - 1];
                  if (previous?.role === "user") setDraft(previous.text);
                  input.current?.focus();
                }}
              >
                {tr("重新编辑要求")}
                <Icon name="arrow" size={13} />
              </button>
            )}
            {message.jobIds && (
              <div className="mw-agent-jobs">
                {message.jobIds.map((id) => {
                  const job = w.jobs.find((item) => item.id === id);
                  return (
                    <button key={id} onClick={() => w.setModal("jobs")}>
                      <Icon
                        name={job?.status === "succeeded" ? "check" : "video"}
                        size={13}
                      />
                      <span>
                        {tr(
                          job?.status === "succeeded"
                            ? "候选已完成"
                            : job?.status === "failed"
                              ? "生成失败"
                              : job?.status === "cancelled"
                                ? "已取消"
                                : job?.phase || "已提交",
                        )}
                      </span>
                      <small>
                        {tr(
                          job?.progress ??
                            (job?.status === "succeeded" ? 100 : 0),
                        )}
                        %
                      </small>
                    </button>
                  );
                })}
                <button
                  className="mw-agent-apply"
                  disabled={
                    !w.project.shots.some((shot) => shot.id === message.shotId)
                  }
                  onClick={() => {
                    if (message.shotId) w.select(message.shotId);
                    w.setModal("takes");
                  }}
                >
                  <Icon name="layers" size={13} />
                  {tr("查看候选卡组")}
                </button>
              </div>
            )}
          </article>
        ))}
        <div ref={end} />
      </div>
      <div className="mw-agent-composer">
        <div
          className="mw-agent-mode"
          role="group"
          aria-label={tr("Agent 模式")}
        >
          {(["edit", "generate"] as const).map((value) => (
            <button
              key={value}
              disabled={busy}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              <Icon name={value === "edit" ? "cursor" : "spark"} size={13} />
              {tr(value === "edit" ? "编辑" : "生成")}
            </button>
          ))}
          <button
            className="mw-agent-options"
            title={tr("服务设置")}
            aria-label={tr("Agent 服务设置")}
            onClick={() => w.setModal("ai-settings")}
          >
            <Icon name="sliders" size={14} />
          </button>
        </div>
        {mode === "edit" && (
          <AgentEditTools busy={busy} onApply={applyNative} />
        )}
        {mode === "generate" && (
          <div className="mw-agent-generation">
            <button
              type="button"
              onClick={() => w.setModal("images")}
              disabled={busy}
            >
              <Icon name="image" size={14} />
              {tr("图片生成")}
            </button>
            <select
              aria-label={tr("Agent 生成输出")}
              value={output}
              disabled={busy}
              onChange={(e) => setOutput(e.target.value as typeof output)}
            >
              <option value="finish">{tr("视频候选")}</option>
              <option value="scene">{tr("可编辑 3D")}</option>
              <option value="reference">{tr("运动预览")}</option>
            </select>
            {output === "finish" && (
              <select
                aria-label={tr("Agent 候选数量")}
                value={count}
                disabled={busy}
                onChange={(e) =>
                  setCount(Number(e.target.value) as CandidateCount)
                }
              >
                <option value={1}>{tr("1 张")}</option>
                <option value={2}>{tr("2 张")}</option>
                <option value={4}>{tr("4 张")}</option>
              </select>
            )}
            {source && output !== "scene" && (
              <label>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={preserve}
                  onChange={(e) => setPreserve(e.target.checked)}
                />
                {tr("固定源场景")}
              </label>
            )}
          </div>
        )}
        <textarea
          ref={input}
          aria-label={tr("给 Agent 的指令")}
          value={draft}
          maxLength={4000}
          rows={4}
          placeholder={tr(
            mode === "edit"
              ? "让镜头慢一点，加个标题…"
              : "这一轮，画面怎样更好？",
          )}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
        {(!!missing.length || !!statusError) && (
          <div className="mw-agent-notice" role="status">
            {statusError ? (
              tr(statusError)
            ) : (
              <>
                {tr("需要配置：")}{" "}
                {missing.map((item) => tr(item)).join(localeText("、", ", "))}
              </>
            )}
            <button onClick={() => void checkStatus()} disabled={checking}>
              {tr(checking ? "检查中…" : "重新检查")}
            </button>
          </div>
        )}
        {mode === "generate" && production.error && (
          <p className="mw-agent-error" role="alert">
            {tr(production.error)}
          </p>
        )}
        <div className="mw-agent-send-row">
          {mode === "edit" ? (
            <label>
              <input
                type="checkbox"
                checked={auto}
                disabled={busy}
                onChange={(e) => setAuto(e.target.checked)}
              />
              {tr("自动应用编辑")}
            </label>
          ) : (
            <button
              onClick={() => {
                w.openDirector({
                  shotId: w.shot.id,
                  instruction: draft,
                  mode: output,
                  reviseScene: output === "scene" || !source || !preserve,
                  candidateCount: count,
                });
                w.setModal("production");
              }}
              disabled={busy}
            >
              {tr("详细生成设置")}
            </button>
          )}
          {planning ? (
            <button
              className="mw-agent-send"
              aria-label={tr("停止 Agent 编辑")}
              onClick={() => request.current?.abort()}
            >
              <Icon name="pause" size={15} />
            </button>
          ) : (
            <button
              className="mw-agent-send"
              aria-label={tr("发送给 Agent")}
              title={tr("发送 · ⌘ / Ctrl + Enter")}
              disabled={
                busy ||
                !draft.trim() ||
                !status ||
                !!missing.length ||
                editPreviewBlocked
              }
              onClick={() => void submit()}
            >
              <Icon name="arrow" size={17} />
            </button>
          )}
        </div>
        <p className="mw-agent-footnote">
          {tr(
            mode === "edit"
              ? "⌘ / Ctrl + Enter 发送 · 修改可撤销"
              : "每张候选独立生成，可能产生模型费用",
          )}
        </p>
      </div>
    </section>
  );
}
