import { useEffect, useRef, useState } from "react";
import type { MediaRef } from "./types";
const paths: Record<string, string> = {
  scissors: "M6 6a3 3 0 1 0 0 .1M6 18a3 3 0 1 0 0 .1M8 8l13 13M8 16 21 3",
  copy: "M8 8h12v13H8zM16 8V3H3v13h5",
  sliders: "M4 5h16M4 12h16M4 19h16M8 2v6M16 9v6M10 16v6",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  hand: "M8 12V5a2 2 0 0 1 4 0v6M12 9a2 2 0 0 1 4 0v3M16 10a2 2 0 0 1 4 0v6a6 6 0 0 1-6 6h-2a5 5 0 0 1-4-2l-5-7a2 2 0 0 1 3-2l2 2",
  cursor: "M5 3v17l5-5 4 7 3-2-4-7h7L5 3",
  minus: "M5 12h14",
  expand: "M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5",
  more: "M12 5h.01M12 12h.01M12 19h.01",
  skip: "M5 5v14M18 5 7 12l11 7V5",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6",
  video: "M3 4h18v16H3zM3 8h18M7 4v4M12 4v4M17 4v4",
  spark: "m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3",
  stream: "M4 5h16M4 12h12M4 19h16",
  canvas: "M4 4h6v6H4zM14 14h6v6h-6zM14 4h6v6h-6zM4 14h6v6H4z",
  timeline: "M4 5v14M9 5v14M14 5v14M19 5v14M3 9h18M3 16h13",
  box: "m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 9 9-4M12 12 3 8m9 4v10",
  plus: "M12 5v14M5 12h14",
  play: "m8 4 12 8-12 8Z",
  pause: "M8 4v16M16 4v16",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  undo: "M8 4 3 9l5 5M3 9h11a6 6 0 0 1 0 12",
  redo: "m16 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12",
  check: "m4 12 5 5L20 6",
  chevron: "m9 5 7 7-7 7",
  close: "m6 6 12 12M18 6 6 18",
  text: "M4 5h16M12 5v15M8 20h8",
  image: "M3 4h18v16H3zM3 15l5-5 6 6 3-3 4 4M15 8h.01",
  camera: "M3 7h13v12H3zM16 11l5-3v10l-5-3M6 4h7",
  layers: "m12 3 10 6-10 6L2 9l10-6Zm-9 11 9 6 9-6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l4 2",
  pin: "m8 3 8 0-1 6 4 4H5l4-4-1-6Zm4 10v8",
  upload: "M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  music:
    "M9 18V5l11-2v13M9 8l11-2M9 18a3 3 0 1 1-3-3c1 0 3 0 3 3Zm11-2a3 3 0 1 1-3-3c1 0 3 0 3 3Z",
  move: "M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4",
  history: "M3 11a9 9 0 1 1 3 8M3 4v7h7M12 7v5l3 3",
  save: "M4 3h13l4 4v14H3V3h1Zm3 0v7h10V3M7 21v-7h10v7",
  target:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.spark} />
    </svg>
  );
}
export function Photo({
  media,
  className = "",
  label = "",
  style,
}: {
  media: MediaRef;
  className?: string;
  label?: string;
  style?: React.CSSProperties;
}) {
  return "url" in media ? (
    <img
      className={"mw-photo " + className}
      src={media.url}
      alt={label}
      style={style}
      draggable={false}
    />
  ) : (
    <svg
      className={"mw-photo " + className}
      viewBox={media.rect.join(" ")}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label}
      style={style}
    >
      <image
        href={"/reference/" + media.sheet + ".png"}
        width="1672"
        height="941"
      />
    </svg>
  );
}
export function IconButton({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={"mw-icon " + (active ? "active" : "")}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} size={17} />
    </button>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const box = ref.current;
    const all = () =>
      box?.querySelectorAll<HTMLElement>(
        'button,input,select,textarea,a[href],[tabindex="0"]',
      );
    all()?.[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const controls = all();
        if (!controls?.length) return;
        const first = controls[0],
          last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="mw-overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={"mw-dialog " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton icon="close" label="Close dialog" onClick={onClose} />
        </header>
        {children}
      </div>
    </div>
  );
}
export const clockTime = (seconds: number) => {
  const n = Math.max(0, seconds);
  return (
    Math.floor(n / 60)
      .toString()
      .padStart(2, "0") +
    ":" +
    (n % 60).toFixed(1).padStart(4, "0")
  );
};
export function Badge({
  children,
  tone = "purple",
}: {
  children: React.ReactNode;
  tone?: "purple" | "green" | "gray";
}) {
  return <span className={"mw-badge " + tone}>{children}</span>;
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mw-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(3))));
  useEffect(() => setDraft(String(Number(value.toFixed(3)))), [value]);
  const commit = () => {
    const number = draft.trim() ? Number(draft) : NaN;
    const next = Number.isFinite(number)
      ? Math.min(max ?? Infinity, Math.max(min ?? -Infinity, number))
      : value;
    setDraft(String(Number(next.toFixed(3))));
    if (next !== value) onChange(next);
  };
  return (
    <Field label={label}>
      <input
        type="number"
        disabled={disabled}
        value={draft}
        aria-label={label}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setDraft(e.currentTarget.value);
          const n = e.currentTarget.valueAsNumber;
          if (
            Number.isFinite(n) &&
            n >= (min ?? -Infinity) &&
            n <= (max ?? Infinity) &&
            n !== value
          )
            onChange(n);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setDraft(String(value));
            e.stopPropagation();
          }
        }}
      />
    </Field>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="mw-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" />
      <span>{label}</span>
    </label>
  );
}
export function EmptyState({
  icon = "box",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mw-empty">
      <span>
        <Icon name={icon} size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
