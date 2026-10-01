import { t as tr } from "./i18n";
import { ClipToolbar } from "./editor/EditingTools";
import { TrimHandle, type TrimDraft } from "./editor/TrimHandle";
import { SequencePreview } from "./editor/SequencePreview";
import { useRef, useState } from "react";
import { useWorkspace } from "./context";
import { Photo, Icon, IconButton, clockTime } from "./Primitives";
import { duration, shotLength, locate } from "./demo";
import type { AudioClip } from "./types";
function Waveform({ audio }: { audio: AudioClip }) {
  const values = audio.peaks.length
    ? audio.peaks
    : Array.from(
        { length: 200 },
        (_, i) =>
          (0.13 + Math.abs(Math.sin(i * 1.89) * Math.cos(i * 0.19)) * 0.84) *
          (i < 12 ? i / 12 : 1),
      );
  return (
    <svg
      className="mw-waveform"
      viewBox="0 0 600 32"
      preserveAspectRatio="none"
      aria-label={tr(
        audio.demo ? "Illustrative waveform · demo track" : "Audio waveform",
      )}
    >
      {values.map((n, i) => (
        <path
          key={i}
          d={`M${(i * 600) / values.length} ${16 - n * 14}v${n * 28}`}
          stroke="currentColor"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}
export function Timeline({ compact = false }: { compact?: boolean }) {
  const w = useWorkspace(),
    [trimDraft, setTrimDraft] = useState<TrimDraft | null>(null),
    p = trimDraft
      ? {
          ...w.project,
          shots: w.project.shots.map((s) =>
            s.id === trimDraft.shotId
              ? { ...s, trimStart: trimDraft.start, trimEnd: trimDraft.end }
              : s,
          ),
        }
      : w.project,
    [zoom, setZoom] = useState(1),
    panel = useRef<HTMLElement>(null),
    total = duration(p);
  let at = 0;
  const clips = p.shots.map((s) => {
    const c = { shot: s, start: at, length: shotLength(s) };
    at += c.length;
    return c;
  });
  const selected = clips.find((c) => c.shot.id === w.shot.id)!,
    pos = (n: number) => (n / total) * 100 + "%";
  const seek = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    w.setTime(
      Math.min(
        total - 0.01,
        Math.max(0, ((e.clientX - r.left) / r.width) * total),
      ),
    );
    w.setPlaying(false);
  };
  return (
    <section
      ref={panel}
      className={"mw-timeline " + (compact ? "compact" : "")}
      aria-label={tr("时间线编辑器")}
    >
      <header className="mw-panel-title">
        {compact && (
          <>
            <span className="mw-link-disc">
              <Icon name="link" size={21} />
            </span>
            <h2>{tr("Timeline")}</h2>
            <p>{tr("Final assembly · Synchronized with all views")}</p>
          </>
        )}
        <div className="mw-timeline-controls">
          <IconButton
            icon="skip"
            label={tr("Go to beginning")}
            onClick={() => {
              w.setTime(0);
              w.setPlaying(false);
            }}
          />
          <button
            className="mw-play-round"
            aria-label={tr(w.playing ? "Pause preview" : "Play preview")}
            onClick={() => w.setPlaying(!w.playing)}
          >
            <Icon name={w.playing ? "pause" : "play"} size={17} />
          </button>
          <button
            className="mw-icon mw-next"
            aria-label={tr("Next shot")}
            onClick={() =>
              w.setTime(clips.find((c) => c.start > w.time + 0.1)?.start || 0)
            }
          >
            <Icon name="skip" size={15} />
          </button>
          <strong>
            {tr(clockTime(w.time))} <span>/ {tr(clockTime(total))}</span>
          </strong>
        </div>
        <div className="mw-timeline-zoom">
          <Icon name="search" size={14} />
          <input
            type="range"
            aria-label={tr("Timeline zoom")}
            min={1}
            max={4}
            step={0.25}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <Icon name="search" size={17} />
          <button onClick={() => setZoom(1)}>{tr("Fit")}</button>
          <IconButton
            icon="expand"
            label={tr("Fullscreen timeline")}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void panel.current?.requestFullscreen();
            }}
          />
        </div>
      </header>
      <ClipToolbar />
      <div className="mw-tracks-scroll">
        <div className="mw-tracks" style={{ minWidth: 620 * zoom }}>
          <div className="mw-track-labels">
            <span />
            <span>
              <Icon name="video" size={15} />
              {tr("Video")}
            </span>
            <button
              onClick={() => {
                w.setSelectedAudio(
                  p.audio.find((a) => a.kind === "voice")?.id || "",
                );
                w.setModal("audio");
              }}
            >
              <Icon name="music" size={15} />
              {tr("Voice")}
            </button>
            <button onClick={() => w.setInspectorTab("settings")}>
              <Icon name="text" size={15} />
              {tr("Text")}
            </button>
            <button
              onClick={() => {
                w.setSelectedAudio(
                  p.audio.find((a) => a.kind === "music")?.id || "",
                );
                w.setModal("audio");
              }}
            >
              <Icon name="music" size={15} />
              {tr("Music")}
            </button>
            <button
              onClick={() => {
                w.setSelectedAudio(
                  p.audio.find((a) => a.kind === "sfx")?.id || "",
                );
                w.setModal("audio");
              }}
            >
              <Icon name="music" size={15} />
              {tr("SFX")}
            </button>
          </div>
          <div className="mw-track-lanes">
            <div
              className="mw-ruler"
              role="slider"
              tabIndex={0}
              aria-label={tr("Sequence position")}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={w.time}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  w.setTime(
                    Math.max(
                      0,
                      Math.min(
                        total - 0.01,
                        w.time + (e.key === "ArrowRight" ? 0.1 : -0.1),
                      ),
                    ),
                  );
                }
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                seek(e);
              }}
              onPointerMove={(e) => {
                if (e.buttons === 1) seek(e);
              }}
            >
              {Array.from({ length: Math.ceil(total / 5) + 1 }, (_, i) =>
                i * 5 <= total ? (
                  <span key={i} style={{ left: pos(i * 5) }}>
                    {tr(i * 5)}
                    {tr("s")}
                  </span>
                ) : null,
              )}
            </div>
            <div className="mw-video-track">
              {clips.map((c, i) => (
                <div
                  key={c.shot.id}
                  className={
                    "mw-timeline-clip " +
                    (w.selected === c.shot.id ? "selected" : "")
                  }
                  style={{
                    left: pos(c.start),
                    width: `calc(${pos(c.length)} - 4px)`,
                  }}
                  role="group"
                  aria-label={tr("Timeline shot ") + c.shot.title}
                  draggable={!trimDraft}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("mouva/shot", c.shot.id)
                  }
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("mouva/shot");
                    if (id && id !== c.shot.id)
                      w.execute([
                        { tool: "clip.move", targetId: id, args: { index: i } },
                      ]);
                  }}
                >
                  <button
                    className="mw-clip-select"
                    aria-label={tr("Select clip ") + c.shot.title}
                    onClick={() => w.select(c.shot.id)}
                  >
                    <div>
                      <strong>
                        {String(i + 1).padStart(2, "0")} {c.shot.title}
                      </strong>
                      <small>
                        {c.length.toFixed(1)}
                        {tr("s")}
                        {tr(
                          c.shot.speed !== 1 ? " · " + c.shot.speed + "×" : "",
                        )}
                      </small>
                    </div>
                    <Photo media={c.shot.image} />
                    {c.shot.binding === "pinned" && (
                      <span className="mw-clip-pin">
                        <Icon name="pin" size={11} />
                      </span>
                    )}
                  </button>
                  {(["in", "out"] as const).map((edge) => (
                    <TrimHandle
                      key={edge}
                      shot={c.shot}
                      edge={edge}
                      total={total}
                      onStart={() => {
                        w.select(c.shot.id);
                        w.setPlaying(false);
                      }}
                      onPreview={setTrimDraft}
                      onCommit={(draft) =>
                        w.execute([
                          {
                            tool: "clip.trim",
                            targetId: draft.shotId,
                            args: { start: draft.start, end: draft.end },
                          },
                        ])
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
            {["voice", "text", "music", "sfx"].map((kind) => (
              <div key={kind} className={"mw-audio-lane " + kind}>
                {kind === "text"
                  ? clips.flatMap((c) =>
                      c.shot.layers.flatMap((layer, index) => {
                        const start = Math.max(layer.start, c.shot.trimStart),
                          end = Math.min(layer.end, c.shot.trimEnd);
                        if (end <= start) return [];
                        return (
                          <button
                            key={c.shot.id + ":" + layer.id}
                            className="mw-text-clip"
                            title={
                              layer.text +
                              " · " +
                              start.toFixed(2) +
                              "–" +
                              end.toFixed(2) +
                              tr(" source s")
                            }
                            style={{
                              left: pos(
                                c.start +
                                  (start - c.shot.trimStart) / c.shot.speed,
                              ),
                              width: pos((end - start) / c.shot.speed),
                              top: Math.min(index, 2) * 3,
                              zIndex: index + 1,
                            }}
                            onClick={() => {
                              w.setTime(
                                c.start +
                                  (start - c.shot.trimStart) / c.shot.speed,
                              );
                              w.setPlaying(false);
                              w.setInspectorTab("settings");
                              w.setInspectorOpen(true);
                            }}
                          >
                            {layer.text}
                          </button>
                        );
                      }),
                    )
                  : p.audio
                      .filter((a) => a.kind === kind && a.start < total)
                      .map((a) => (
                        <button
                          key={a.id}
                          className={
                            "mw-audio-clip " + (a.muted ? "muted" : "")
                          }
                          style={{
                            left: pos(a.start),
                            width: pos(Math.min(a.duration, total - a.start)),
                          }}
                          title={
                            (a.demo ? tr("Demo track · ") : "") +
                            tr("Edit ") +
                            a.name
                          }
                          onClick={() => {
                            w.setSelectedAudio(a.id);
                            w.setModal("audio");
                          }}
                        >
                          <Waveform audio={a} />
                          <span>
                            {kind === "music" && (
                              <Icon name="music" size={13} />
                            )}
                            {tr(" ")}
                            {a.name}
                          </span>
                        </button>
                      ))}
                {kind !== "text" && !p.audio.some((a) => a.kind === kind) && (
                  <button
                    className="mw-empty-track"
                    onClick={() => w.setModal("audio")}
                  >
                    {tr("＋ Add")}
                    {tr(
                      {
                        voice: "Voice",
                        music: "Music",
                        sfx: "Sound effects",
                        text: "Text",
                      }[kind],
                    )}
                  </button>
                )}
              </div>
            ))}
            {w.inspectorTab === "repair" &&
              w.shot.repair.end > w.shot.trimStart &&
              w.shot.repair.start < w.shot.trimEnd && (
                <button
                  className="mw-range-overlay"
                  title={tr("Edit repair range")}
                  style={{
                    left: pos(
                      selected.start +
                        (Math.max(w.shot.repair.start, w.shot.trimStart) -
                          w.shot.trimStart) /
                          w.shot.speed,
                    ),
                    width: pos(
                      (Math.min(w.shot.repair.end, w.shot.trimEnd) -
                        Math.max(w.shot.repair.start, w.shot.trimStart)) /
                        w.shot.speed,
                    ),
                  }}
                  onClick={() => w.setInspectorOpen(true)}
                >
                  <i />
                  <span>
                    {tr("Repair")}
                    {w.shot.repair.start.toFixed(1)}
                    {tr("s –")}
                    {tr(" ")}
                    {w.shot.repair.end.toFixed(1)}
                    {tr("s")}
                  </span>
                  <i />
                </button>
              )}
            <div className="mw-playhead" style={{ left: pos(w.time) }}>
              <i />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
export function PreviewPlayer({ large = false }: { large?: boolean }) {
  const w = useWorkspace(),
    hit = locate(w.project, w.time),
    s = hit?.shot || w.shot,
    take =
      s.takes.find(
        (t) => t.id === (w.playing ? s.adoptedTakeId : s.viewingTakeId),
      ) || s.takes[0];
  return (
    <div className={"mw-preview-player " + (large ? "large" : "")}>
      <SequencePreview
        project={w.project}
        time={w.time}
        preview={!w.playing}
        playing={w.playing}
      />
      <span className="mw-preview-time">
        {tr(clockTime(w.time))} / {tr(clockTime(duration(w.project)))}
      </span>
      {!take.videoUrl && (
        <span className="mw-storyboard-label">
          {tr(take.scene ? "Editable 3D preview" : "Storyboard preview")}
        </span>
      )}
      <button
        className="mw-preview-play"
        aria-label={tr(w.playing ? "Pause storyboard" : "Play storyboard")}
        onClick={() => w.setPlaying(!w.playing)}
      >
        <Icon name={w.playing ? "pause" : "play"} size={25} />
      </button>
    </div>
  );
}
export function TimelineView() {
  const w = useWorkspace(),
    p = w.project;
  return (
    <div className="mw-timeline-page">
      <div className="mw-assembly-stages">
        {[
          ["故事", "脚本与创意", "check"],
          ["镜头", p.shots.length + " " + tr("个镜头"), "check"],
          ["时间线", "预览与剪辑", "play"],
          ["成片", "导出电影", "video"],
        ].map(([name, description, icon], i) => (
          <div
            key={name}
            className={i < 2 ? "complete" : i === 2 ? "current" : ""}
          >
            <span>
              <Icon name={icon} size={17} />
            </span>
            <div>
              <strong>{tr(name)}</strong>
              <small>{tr(description)}</small>
            </div>
            {i < 3 && <i />}
          </div>
        ))}
      </div>
      <div className="mw-sequence-overview">
        <PreviewPlayer large />
        <section className="mw-sequence-info">
          <p>{tr("时间线 · 当前成片")}</p>
          <h1>{p.name}</h1>
          <div>
            {w.time.toFixed(1)}
            {tr("s")}
            {tr(" ")}
            <span>
              {tr("/ 共")}
              {duration(p).toFixed(1)}
              {tr("s")}
            </span>
          </div>
          <div className="mw-sequence-progress">
            <i style={{ width: (w.time / duration(p)) * 100 + "%" }} />
          </div>
          <div className="mw-tags">
            <span>{tr(w.shot.resolution)}</span>
            <span>{tr(w.shot.aspectRatio)}</span>
            <span>
              {p.shots.length} {tr("个镜头")}
            </span>
            <span>{tr("已采用版本")}</span>
          </div>
          <blockquote>“{p.description}”</blockquote>
        </section>
      </div>
      <Timeline />
    </div>
  );
}
export function MiniTimeline() {
  const w = useWorkspace(),
    total = duration(w.project);
  return (
    <div className="mw-mini-timeline">
      <button
        className="mw-play-round"
        aria-label={tr("Play sequence")}
        onClick={() => w.setPlaying(!w.playing)}
      >
        <Icon name={w.playing ? "pause" : "play"} size={17} />
      </button>
      <span>
        {tr(clockTime(w.time))}
        <small> / {tr(clockTime(total))}</small>
      </span>
      <div>
        {w.project.shots.map((s, i) => (
          <button
            key={s.id}
            className={s.id === w.selected ? "selected" : ""}
            onClick={() => w.select(s.id)}
            style={{ flex: shotLength(s) }}
          >
            <small>{String(i + 1).padStart(2, "0")}</small>
            <Photo media={s.image} />
          </button>
        ))}
      </div>
      <IconButton
        icon="timeline"
        label={tr("Expand timeline")}
        onClick={() => w.setView("timeline")}
      />
    </div>
  );
}
