import { spawn } from "node:child_process";
const children = [];
const launch = (args, env = {}) => {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on("exit", (code) => {
    if (code) stop(code);
  });
  return child;
};
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
launch(["bridge/server.mjs"], { MOUVA_RENDER_ORIGIN: "http://127.0.0.1:5173" });
launch([
  "node_modules/vite/bin/vite.js",
  "--config",
  "vite.production.config.ts",
  "--host",
  "127.0.0.1",
  "--port",
  "5173",
  "--strictPort",
]);
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
