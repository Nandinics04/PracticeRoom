/** Empty string = same-origin (Docker nginx proxy). Local default = Nest on :3000. */
const raw = import.meta.env.VITE_API_URL as string | undefined;

export const API_BASE =
  raw === "" || raw === "/"
    ? ""
    : (typeof raw === "string" && raw.trim() ? raw.replace(/\/$/, "") : "http://localhost:3000");

export function apiUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${suffix}`;
}
