export type Place = {
  id: string;
  name: string;
  category: string;
  category_id?: number;
  old_map_id?: number;
  historical: boolean;
  verification_status: string;
  latitude: number | null;
  longitude: number | null;
  source_id: string;
  source_url?: string;
  source_title?: string;
  description?: string;
  opening_hours?: unknown;
  website?: string;
  phone?: string;
  version?: number;
  distance_m?: number;
  image_x_px?: number | null;
  image_y_px?: number | null;
  facilities?: { name: string; verification_status: string }[];
  announcements?: { id: number; title: string; description: string }[];
};
export type User = { id: number; email: string; role: string };
let csrf = "";
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = options.method ?? "GET";
  if (!["GET", "HEAD"].includes(method) && !csrf) {
    const res = await fetch("/api/csrf", { credentials: "include" });
    const data = await res.json();
    csrf = data.token;
  }
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf,
      ...options.headers,
    },
  });
  const data = await res
    .json()
    .catch(() => ({ error: "The server returned an unexpected response." }));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}
export const post = <T = any>(path: string, body: unknown, method = "POST") =>
  api<T>(path, { method, body: JSON.stringify(body) });
