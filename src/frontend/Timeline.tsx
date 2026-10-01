import { t as tr } from "./i18n";
import { ClipToolbar } from "./editor/EditingTools";
import { TrimHandle, type TrimDraft } from "./editor/TrimHandle";
import { SequencePreview } from "./editor/SequencePreview";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "./context";
import { Photo, Icon, IconButton, clockTime } from "./Primitives";
import { duration, shotLength, locate } from "./demo";
import type { AudioClip } from "./types";
import { AudioTimelineClip } from "./editor/AudioTimelineClip";
import { rulerInterval, timelineRows } from "./editor/timelineEditing";
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
  const scroll = useRef<HTMLDivElement>(null),
    [viewportWidth, setViewportWidth] = useState(800);
  useEffect(() => {
    const element = scroll.current!;
    const observer = new ResizeObserver(() =>
      setViewportWidth(element.clientWidth),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const labelWidth = 112,
    laneWidth = Math.max(400, viewportWidth - labelWidth - 24 - 9) * zoom;
  const interval = rulerInterval(total, laneWidth);
  const audioLayout = Object.fromEntries(
    (["voice", "music", "sfx"] as const).map((kind) => [
      kind,
      timelineRows(p.audio.filter((a) => a.kind === kind && a.start < total)),
    ]),
  );
  const textCount = Math.max(1, ...p.shots.map((s) => s.layers.length));
  const trackRows = `28px 80px ${audioLayout.voice.count * 48}px ${textCount * 36}px ${audioLayout.music.count * 48}px ${audioLayout.sfx.count * 48}px`;
  useEffect(() => {
    const element = scroll.current;
    if (!element || !w.playing) return;
    const x = (w.time / total) * laneWidth;
    if (
      x < element.scrollLeft ||
      x > element.scrollLeft + element.clientWidth - labelWidth - 40
    )
      element.scrollLeft = Math.max(
        0,
        x - (element.clientWidth - labelWidth) / 2,
      );
  }, [w.time, w.playing, laneWidth, total]);
  const previousZoom = useRef(zoom);
  useEffect(() => {
    const element = scroll.current;
    if (!element || previousZoom.current === zoom) return;
    const offset =
      (((w.time / total) * laneWidth) / zoom) * previousZoom.current -
      element.scrollLeft;
    const visibleWidth = element.clientWidth - labelWidth - 24;
    element.scrollLeft = Math.max(
      0,
      (w.time / total) * laneWidth -
        (offset >= 0 && offset <= visibleWidth ? offset : visibleWidth / 2),
    );
    previousZoom.current = zoom;
  }, [zoom, laneWidth, total, w.time]);
  const audioInput = useRef<HTMLInputElement>(null),
    importKind = useRef<AudioClip["kind"]>("music");
  function importAudio(kind: AudioClip["kind"]) {
    importKind.current = kind;
    audioInput.current?.click();
  }
  function openAudio(kind: AudioClip["kind"]) {
    const track = p.audio.find((a) => a.kind === kind);
    if (!track) return importAudio(kind);
    w.setSelectedAudio(track.id);
    w.setModal("audio");
  }
  let at = 0;
  const clips = p.shots.map((s) => {
    const c = { shot: s, start: at, length: shotLength(s) };
    at += c.length;
    return c;
  });
  const selected = clips.find((c) => c.shot.id === w.shot.id)!,
    pos = (n: number) => (n / total) * 100 + "%";
  const seek = (e: React.PointerEvent) => {
    const r = e.currentTarget
      .closest(".mw-track-lanes")!
      .getBoundingClientRect();
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
      <input
        ref={audioInput}
        type="file"
        hidden
        multiple
        accept="audio/*"
        aria-label={tr("导入时间线音频")}
        onChange={(e) => {
          if (e.target.files)
            void w.upload(
              Array.from(e.target.files),
              undefined,
              importKind.current,
            );
          e.target.value = "";
        }}
      />
      <ClipToolbar />
      <div className="mw-tracks-scroll" ref={scroll}>
        <div
          className="mw-tracks"
          style={
            {
              width: laneWidth + labelWidth + 9,
              minWidth: "100%",
              "--mw-track-rows": trackRows,
            } as React.CSSProperties
          }
        >
          <div className="mw-track-labels">
            <span />
            <span>
              <Icon name="video" size={15} />
              {tr("Video")}
            </span>
            <div className="mw-track-heading">
              <button onClick={() => openAudio("voice")}>
                <Icon name="music" size={15} />
                {tr("Voice")}
              </button>
              <button
                className="mw-track-add"
                aria-label={tr("添加人声音频")}
                onClick={() => importAudio("voice")}
              >
                <Icon name="plus" size={14} />
              </button>
            </div>
            <button
              onClick={() => {
                w.setInspectorTab("settings");
                w.setInspectorOpen(true);
              }}
            >
              <Icon name="text" size={15} />
              {tr("Text")}
            </button>
            <div className="mw-track-heading">
              <button onClick={() => openAudio("music")}>
                <Icon name="music" size={15} />
                {tr("Music")}
              </button>
              <button
                className="mw-track-add"
                aria-label={tr("添加音乐音频")}
                onClick={() => importAudio("music")}
              >
                <Icon name="plus" size={14} />
              </button>
            </div>
            <div className="mw-track-heading">
              <button onClick={() => openAudio("sfx")}>
                <Icon name="music" size={15} />
                {tr("SFX")}
              </button>
              <button
                className="mw-track-add"
                aria-label={tr("添加音效音频")}
                onClick={() => importAudio("sfx")}
              >
                <Icon name="plus" size={14} />
              </button>
            </div>
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
              style={{
                backgroundImage:
                  "linear-gradient(to right, #555d4e 1px, transparent 1px), linear-gradient(to right, #3f443b 1px, transparent 1px)",
                backgroundSize: `${(interval / total) * 100}% 12px, ${(interval / total / 5) * 100}% 6px`,
                backgroundRepeat: "repeat-x",
                backgroundPosition: "left bottom",
              }}
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
              {Array.from(
                { length: Math.floor(total / interval) + 1 },
                (_, i) =>
                  i * interval <= total ? (
                    <span
                      key={i}
                      style={{
                        left: pos(i * interval),
                        transform:
                          i === 0
                            ? "none"
                            : i * interval === total
                              ? "translateX(-100%)"
                              : undefined,
                      }}
                    >
                      {tr(Number((i * interval).toFixed(2)))}
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
                  onDragStart={(e) => {
                    w.setPlaying(false);
                    w.setSelectedAudio("");
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("mouva/shot", c.shot.id);
                  }}
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
                    onClick={(e) => {
                      w.setSelectedAudio("");
                      w.select(c.shot.id);
                      const rect = e.currentTarget.getBoundingClientRect();
                      w.setTime(
                        c.start +
                          Math.max(
                            0,
                            Math.min(
                              0.999,
                              (e.clientX - rect.left) / rect.width,
                            ),
                          ) *
                            c.length,
                      );
                    }}
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
                        w.setSelectedAudio("");
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
              <div
                key={kind}
                className={"mw-audio-lane " + kind}
                data-audio-kind={kind !== "text" ? kind : undefined}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) seek(e);
                }}
                onDragOver={(e) => {
                  if (
                    kind !== "text" &&
                    (e.dataTransfer.types.includes("Files") ||
                      e.dataTransfer.types.includes("mouva/asset"))
                  )
                    e.preventDefault();
                }}
                onDrop={(e) => {
                  if (kind === "text") return;
                  e.preventDefault();
                  seek(e as unknown as React.PointerEvent);
                  const trackKind = kind as AudioClip["kind"],
                    assetId = e.dataTransfer.getData("mouva/asset");
                  if (assetId) w.addAudio(assetId, trackKind);
                  else
                    void w.upload(
                      Array.from(e.dataTransfer.files).filter((f) =>
                        f.type.startsWith("audio/"),
                      ),
                      undefined,
                      trackKind,
                    );
                }}
              >
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
                              top: index * 36 + 2,
                              height: 32,
                              zIndex: index + 1,
                            }}
                            onClick={() => {
                              w.setSelectedAudio("");
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
                        <AudioTimelineClip
                          key={a.id}
                          clip={a}
                          total={total}
                          row={audioLayout[kind].rows.get(a.id) || 0}
                          boundaries={[
                            0,
                            total,
                            w.time,
                            ...clips.flatMap((c) => [
                              c.start,
                              c.start + c.length,
                            ]),
                            ...p.audio
                              .filter((other) => other.id !== a.id)
                              .flatMap((other) => [
                                other.start,
                                other.start + other.duration,
                              ]),
                          ]}
                        />
                      ))}
                {kind !== "text" && !p.audio.some((a) => a.kind === kind) && (
                  <button
                    className="mw-empty-track"
                    onClick={() => importAudio(kind as AudioClip["kind"])}
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
              <button
                className="mw-playhead-grip"
                aria-label={tr("拖动播放头")}
                title={tr("拖动播放头")}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  seek(e);
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(e);
                }}
              />
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
    take = s.takes.find((t) => t.id === s.adoptedTakeId) || s.takes[0];
  return (
    <div className={"mw-preview-player " + (large ? "large" : "")}>
      <SequencePreview
        project={w.project}
        time={w.time}
        preview={false}
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
