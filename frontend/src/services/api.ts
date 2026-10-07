export type Place = {
  id: string;
  name: string;
  category: string;
  category_id?: number;
  old_map_id?: number;
  historical: boolean;
  snapshot?: boolean;
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
async function readResponse(res: Response) {
  if (!res.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "The campus service is unavailable. Please try again shortly.",
    );
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error ?? "The request could not be completed.");
  return data;
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = options.method ?? "GET";
  if (!["GET", "HEAD"].includes(method) && !csrf) {
    const res = await fetch("/api/csrf", {
      credentials: "include",
      signal: AbortSignal.timeout(15000),
    });
    const data = await readResponse(res);
    if (typeof data.token !== "string")
      throw new Error("Could not start a secure session. Please retry.");
    csrf = data.token;
  }
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    signal: options.signal ?? AbortSignal.timeout(15000),
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf,
      ...options.headers,
    },
  });
  return readResponse(res);
}
export const post = <T = any>(path: string, body: unknown, method = "POST") =>
  api<T>(path, { method, body: JSON.stringify(body) });
