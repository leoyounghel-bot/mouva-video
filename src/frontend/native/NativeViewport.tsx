import { t as tr } from "../i18n";
import { useEffect, useRef, useState } from "react";
import type { SceneSpec } from "./schema";
import { sceneKey } from "./schema";
import { createSceneRenderer } from "./renderer";
import type { RenderAsset } from "./renderer";
export function NativeViewport({
  scene,
  assets,
  time,
  onSelect,
  className = "",
}: {
  scene: SceneSpec;
  assets: RenderAsset[];
  time: number;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null),
    mount = useRef<HTMLDivElement>(null),
    engine = useRef<Awaited<ReturnType<typeof createSceneRenderer>> | null>(
      null,
    ),
    timeRef = useRef(time),
    size = useRef({ width: 960, height: 540 });
  timeRef.current = time;
  const [state, setState] = useState("Loading scene…"),
    [error, setError] = useState(false);
  const signature = sceneKey(scene),
    assetSignature = JSON.stringify(
      assets
        .filter((a) => scene.objects.some((o) => o.assetId === a.id))
        .map((a) => [a.id, a.url]),
    );
  useEffect(() => {
    let active = true,
      value: Awaited<ReturnType<typeof createSceneRenderer>> | undefined;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-label", tr("Editable Three.js scene"));
    setState("Loading scene…");
    setError(false);
    const timer = setTimeout(() => {
      void createSceneRenderer(canvas, scene, assets)
        .then((result) => {
          value = result;
          if (!active) {
            value.dispose();
            return;
          }
          mount.current?.append(canvas);
          engine.current = value;
          value.draw(timeRef.current, size.current.width, size.current.height);
          setState("");
        })
        .catch((e) => {
          if (active) {
            setState(e.message || "WebGL preview is unavailable.");
            setError(true);
          }
        });
    }, 80);
    return () => {
      active = false;
      clearTimeout(timer);
      value?.dispose();
      canvas.remove();
      engine.current = null;
    };
  }, [signature, assetSignature]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      size.current = {
        width: Math.max(1, Math.round(entry.contentRect.width)),
        height: Math.max(1, Math.round(entry.contentRect.height)),
      };
      engine.current?.draw(
        timeRef.current,
        size.current.width,
        size.current.height,
      );
    });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    engine.current?.draw(time);
  }, [time]);
  return (
    <div
      ref={host}
      className={"mw-native-viewport " + className}
      style={{ background: scene.background }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const id = engine.current?.pick(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((e.clientY - rect.top) / rect.height) * 2,
        );
        if (id) onSelect?.(id);
      }}
    >
      <div ref={mount} className="mw-native-canvas-host" />
      {state && (
        <div role={error ? "alert" : "status"} className="mw-native-load">
          {tr(state)}
        </div>
      )}
    </div>
  );
}
