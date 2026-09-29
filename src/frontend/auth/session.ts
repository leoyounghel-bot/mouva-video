export const usesMouvaLogin = import.meta.env.VITE_MOUVA_AUTH_MODE === "mouva";
let ownerId = "";
export function setWorkspaceOwner(value: string) { ownerId = value; }
export function workspaceKey(key: string) {
  return usesMouvaLogin ? `${key}:${ownerId || "signed-out"}` : key;
}
export function workspaceHeaders(): Record<string, string> {
  if (usesMouvaLogin) return { "X-Mouva-Workspace": ownerId };
  const token = sessionStorage.getItem("mouva-ai-token");
  return token ? { Authorization: "Bearer " + token } : {};
}
export function requireSignIn() {
  if (usesMouvaLogin) window.dispatchEvent(new Event("mouva-auth-required"));
}
export async function signOut() {
  const response = await fetch("/api/ai/auth/logout", { method: "POST", credentials: "same-origin" });
  if (!response.ok) throw new Error("Could not sign out. Please try again.");
  localStorage.setItem("mouva-video-signout", String(Date.now()));
  requireSignIn();
}
