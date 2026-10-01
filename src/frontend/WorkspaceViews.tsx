import { t as tr } from "./i18n";
import { useWorkspace } from "./context";
import { Icon } from "./Primitives";
import type { View } from "./types";

const views: { id: View; label: string; title: string }[] = [
  { id: "stream", label: "故事板", title: "故事板 · 查看镜头与候选版本" },
  {
    id: "canvas",
    label: "Canvas",
    title: "Canvas · Infinite creative workspace",
  },
  { id: "timeline", label: "时间线", title: "时间线 · 剪辑与预览成片" },
];

export function WorkspaceViews({ floating = false }: { floating?: boolean }) {
  const w = useWorkspace();
  return (
    <nav
      className={"mw-workspace-tabs" + (floating ? " floating" : "")}
      aria-label={tr("工作区视图")}
    >
      {views.map(({ id, label, title }) => (
        <button
          key={id}
          className={w.view === id && w.section === "create" ? "active" : ""}
          aria-pressed={w.view === id && w.section === "create"}
          title={tr(title)}
          onClick={() => {
            w.setPlaying(false);
            w.setSceneOpen(false);
            w.setSection("create");
            w.setView(id);
          }}
        >
          <Icon name={id} size={15} />
          <span>{tr(label)}</span>
        </button>
      ))}
    </nav>
  );
}
