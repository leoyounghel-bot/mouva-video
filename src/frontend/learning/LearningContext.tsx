import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWorkspace } from "../context";
import { currentLanguage, text, useLanguage } from "../i18n";
import { workspaceKey } from "../auth/session";
import {
  getFile,
  storeFile,
  hydrateMedia,
  validateProject,
} from "../persistence";
import { courseById } from "./catalog";
import {
  readLearningState,
  preparePracticeProject,
  isPracticeProject,
  localizePracticeProject,
} from "./state";

function read(key: string) {
  try {
    return localStorage.getItem(workspaceKey(key));
  } catch {
    return null;
  }
}
const backupKey = () => workspaceKey("mouva-learning-backup");
const practiceKey = () => workspaceKey("mouva-learning-practice");
type Learning = ReturnType<typeof useLearningController>;
const LearningContext = createContext<Learning | null>(null);
function useLearningController() {
  const language = useLanguage();
  const w = useWorkspace(),
    workspace = useRef(w);
  workspace.current = w;
  const [state, setState] = useState(() =>
    readLearningState(read("mouva-learning-state-v1")),
  );
  const [centerOpen, setCenterOpen] = useState(false);
  const [busy, setBusy] = useState(false),
    [backupName, setBackupName] = useState(
      () => read("mouva-learning-backup-name") || "",
    );
  useEffect(() => {
    try {
      localStorage.setItem(
        workspaceKey("mouva-learning-state-v1"),
        JSON.stringify(state),
      );
    } catch {}
  }, [state]);
  const course = courseById(state.courseId)!;
  useEffect(() => {
    const current = workspace.current;
    if (!isPracticeProject(current.project)) return;
    const localized = localizePracticeProject(current.project, language);
    if (JSON.stringify(localized) !== JSON.stringify(current.project))
      current.update(
        (p) => Object.assign(p, localizePracticeProject(p, language)),
        "Change lesson language",
      );
  }, [language, w.project.id]);
  useEffect(() => {
    if (w.section === "learn") showCenter();
  }, [w.section]);
  function openCourse(id: string, step?: number) {
    const c = courseById(id);
    if (!c) return;
    setCenterOpen(false);
    setState((s) => ({
      ...s,
      courseId: id,
      open: true,
      step: Math.min(
        c.steps.length - 1,
        Math.max(0, step ?? (s.courseId === id ? s.step : 0)),
      ),
    }));
  }
  function showCenter() {
    w.setPlaying(false);
    w.setSection("create");
    w.setView("canvas");
    w.setSceneOpen(false);
    setCenterOpen(true);
    w.setModal(null);
    setState((s) => ({ ...s, open: false }));
  }
  const hide = () => {
    setCenterOpen(false);
    setState((s) => ({ ...s, open: false }));
  };
  function selectStep(step: number) {
    setState((s) => ({
      ...s,
      step: Math.max(0, Math.min(course.steps.length - 1, step)),
    }));
  }
  function completeStep(done: boolean) {
    setState((s) => {
      const set = new Set(s.completed[s.courseId] || []);
      done ? set.add(s.step) : set.delete(s.step);
      return { ...s, completed: { ...s.completed, [s.courseId]: [...set] } };
    });
  }
  async function startPractice() {
    if (busy) return;
    if (isPracticeProject(workspace.current.project)) {
      workspace.current.setSection("create");
      workspace.current.setView("canvas");
      openCourse("wuxia");
      return;
    }
    setBusy(true);
    try {
      const savedPractice = await getFile(practiceKey());
      let project;
      if (savedPractice) {
        const value = JSON.parse(await savedPractice.text());
        validateProject(value);
        project = localizePracticeProject(
          await hydrateMedia(value),
          currentLanguage(),
        );
      } else {
        const response = await fetch("/learn/wuxia/lesson-project.json");
        if (!response.ok)
          throw new Error(
            text(
              "练习素材暂时无法读取，请稍后再试。",
              "The practice media could not be loaded. Please try again.",
            ),
          );
        const template = await response.json();
        project = preparePracticeProject(
          template,
          location.origin,
          currentLanguage(),
          "learn-wuxia-" + crypto.randomUUID(),
        );
        validateProject(project);
      }
      const before = structuredClone(workspace.current.project);
      await storeFile(
        backupKey(),
        new File([JSON.stringify(before)], "original-project.json", {
          type: "application/json",
        }),
      );
      if (
        workspace.current.project.updatedAt !== before.updatedAt ||
        workspace.current.project.id !== before.id
      )
        throw new Error(
          text(
            "当前项目刚有修改，请再次打开练习。",
            "Your project changed while loading. Please open the practice again.",
          ),
        );
      localStorage.setItem(
        workspaceKey("mouva-learning-backup-name"),
        before.name,
      );
      setBackupName(before.name);
      const next = workspace.current;
      next.replaceProject(project);
      next.setSceneOpen(false);
      next.setSection("create");
      next.setView("canvas");
      next.setModal(null);
      next.setSidebarOpen(false);
      openCourse("wuxia", savedPractice ? undefined : 0);
      next.notify(
        text(
          "练习项目已打开。原项目已保存，可随时返回。",
          "Practice opened. Your original project is saved and can be restored.",
        ),
      );
    } catch (e) {
      workspace.current.notify(
        e instanceof Error
          ? e.message
          : text("无法打开练习项目。", "Could not open the practice project."),
      );
    } finally {
      setBusy(false);
    }
  }
  async function restoreProject() {
    if (busy) return;
    setBusy(true);
    try {
      const file = await getFile(backupKey());
      if (!file)
        throw new Error(
          text(
            "未找到原项目快照。",
            "The original project snapshot was not found.",
          ),
        );
      const value = JSON.parse(await file.text());
      validateProject(value);
      const original = await hydrateMedia(value);
      const current = structuredClone(workspace.current.project);
      if (isPracticeProject(current))
        await storeFile(
          practiceKey(),
          new File([JSON.stringify(current)], "practice-project.json", {
            type: "application/json",
          }),
        );
      if (
        workspace.current.project.updatedAt !== current.updatedAt ||
        workspace.current.project.id !== current.id
      )
        throw new Error(
          text(
            "项目刚有修改，请再次返回。",
            "Your project changed. Please try returning again.",
          ),
        );
      const next = workspace.current;
      next.replaceProject(original);
      next.setSceneOpen(false);
      next.setSection("create");
      next.setView("canvas");
      hide();
      next.notify(
        text(
          "已返回原项目，练习修改也已保留。",
          "Original project restored. Your practice edits were saved too.",
        ),
      );
    } catch (e) {
      workspace.current.notify(
        e instanceof Error
          ? e.message
          : text("无法恢复原项目。", "Could not restore the original project."),
      );
    } finally {
      setBusy(false);
    }
  }
  return {
    state,
    centerOpen,
    course,
    busy,
    backupName,
    openCourse,
    showCenter,
    hide,
    selectStep,
    completeStep,
    startPractice,
    restoreProject,
  };
}
export function LearningProvider({ children }: { children: ReactNode }) {
  const value = useLearningController();
  return (
    <LearningContext.Provider value={value}>
      {children}
    </LearningContext.Provider>
  );
}
export function useLearning() {
  const value = useContext(LearningContext);
  if (!value) throw new Error("Learning provider missing");
  return value;
}
