import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthGate } from "./auth/AuthGate";
// Previous native prototype is an explicit, separate entry point.
if (
  new URLSearchParams(location.search).has("native") ||
  new URLSearchParams(location.search).has("render")
) {
  location.replace("/native.html" + location.search);
} else {
  createRoot(document.getElementById("root")!).render(<AuthGate><App /></AuthGate>);
}
