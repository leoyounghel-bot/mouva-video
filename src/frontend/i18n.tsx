import { useSyncExternalStore } from "react";
import { translate, type Language } from "./i18n/translator";
export type { Language } from "./i18n/translator";

const storageKey = "mouva-cut-language";
const listeners = new Set<() => void>();
let language: Language = readLanguage();
function readLanguage(): Language {
  try {
    const requested = new URLSearchParams(location.search).get("lang");
    if (requested === "zh" || requested === "en") {
      localStorage.setItem(storageKey, requested);
      return requested;
    }
    return localStorage.getItem(storageKey) === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}

export function setLanguage(next: Language) {
  if (next === language) return;
  language = next;
  try {
    localStorage.setItem(storageKey, next);
  } catch {}
  document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  for (const notify of listeners) notify();
}
export function currentLanguage() {
  return language;
}
export function useLanguage() {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    currentLanguage,
    currentLanguage,
  );
}
if (typeof document !== "undefined")
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey) setLanguage(readLanguage());
  });

/** Translate interface copy; non-text React children and user content pass through. */
export function t<T>(value: T): T {
  return translate(value, language);
}
export function text(zh: string, en: string) {
  return language === "zh" ? zh : en;
}

export function LanguageControl() {
  const selected = useLanguage();
  return (
    <label
      className="mw-language-control"
      title={text("界面语言", "Interface language")}
    >
      <span aria-hidden="true">◎</span>
      <select
        aria-label={text("界面语言", "Interface language")}
        value={selected}
        onChange={(event) => setLanguage(event.target.value as Language)}
      >
        <option value="zh">中文</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
