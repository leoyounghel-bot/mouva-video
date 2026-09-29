import { useState, useEffect } from "react";
import { useWorkspace } from "../context";
import { Modal, Icon, Toggle } from "../Primitives";
import { studioAI } from "../native/api";
import { commandSummary, toolCatalog, type EditCommand } from "./commands";
export function AssistantDialog() {
  const w = useWorkspace(),
    [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ready, setReady] = useState<boolean | null>(null),
    [auto, setAuto] = useState(true),
    [plan, setPlan] = useState<{
      summary: string;
      commands: EditCommand[];
      base: string;
    } | null>(null),
    [result, setResult] = useState("");
  useEffect(() => {
    studioAI
      .status()
      .then((s) => setReady(s.orchestratorReady))
      .catch((e) => {
        setReady(false);
        setError(e.message);
      });
  }, []);
  async function submit() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError("");
    setResult("");
    setPlan(null);
    const base = w.project.updatedAt;
    try {
      const planned = await studioAI.editorPlan({
        instruction: prompt,
        project: w.project,
        selectedShotId: w.shot.id,
        playhead: w.time,
      });
      const next = { ...planned, base };
      setPlan(next);
      if (auto) {
        if (w.execute(next.commands, base))
          setResult("Applied. Undo restores the project before these edits.");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="AI editor"
      subtitle="One set of tools. Edit by hand or describe what you want."
      onClose={() => w.setModal(null)}
    >
      <div className="mw-ai-context">
        <Icon name="video" size={16} />
        <strong>{w.shot.title}</strong>
        <span>
          {w.time.toFixed(2)}s · {w.project.shots.length} shots
        </span>
      </div>
      {ready === false && (
        <div className="mw-ai-notice">
          AI editing needs a server model connection. Your manual editing and
          local exports are ready.
          <button
            className="mw-text-button"
            onClick={() => w.setModal("ai-settings")}
          >
            Server connection →
          </button>
        </div>
      )}
      <textarea
        className="mw-ai-prompt"
        aria-label="AI editing instruction"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="例如：把当前镜头调成黑白，速度改为 0.75 倍，加上标题「A quiet morning」，结尾淡出 0.5 秒。"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
        }}
      />
      <div className="mw-ai-examples">
        {[
          "当前镜头变成黑白，结尾淡出 0.5 秒",
          "把当前镜头复制一份，放到影片最后",
          "给当前镜头加上标题：A new beginning",
        ].map((t) => (
          <button key={t} onClick={() => setPrompt(t)}>
            {t}
          </button>
        ))}
      </div>
      <Toggle
        label="Apply reversible edits automatically"
        checked={auto}
        onChange={setAuto}
      />
      <button
        className="mw-primary full"
        disabled={busy || !prompt.trim() || ready !== true}
        onClick={() => void submit()}
      >
        <Icon name="spark" size={17} />
        {busy ? "Planning edits…" : "Run AI editor"}
      </button>
      {error && (
        <p role="alert" className="mw-editor-error">
          {error}
        </p>
      )}
      {plan && (
        <div className="mw-ai-result">
          <strong>{plan.summary}</strong>
          <ol>
            {plan.commands.map((c, i) => (
              <li key={i}>{commandSummary(c, w.project)}</li>
            ))}
          </ol>
          {!result && (
            <button
              className="mw-secondary"
              onClick={() => {
                if (w.execute(plan.commands, plan.base))
                  setResult("Applied. You can undo these edits.");
              }}
            >
              Apply edits
            </button>
          )}
        </div>
      )}
      {result && (
        <div role="status" className="mw-ai-result">
          {result} Use the workspace Undo button to undo the latest project
          edit.
        </div>
      )}
      <details className="mw-ai-catalog">
        <summary>{toolCatalog.length} available tools</summary>
        <div>
          {toolCatalog.map(([name, description]) => (
            <p key={name}>
              <strong>{name}</strong>
              <span>{description}</span>
            </p>
          ))}
        </div>
      </details>
    </Modal>
  );
}
