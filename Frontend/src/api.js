const TOKEN_KEY = "bookit_token";
// empty in dev (the Vite proxy handles /api); the backend's public URL when deployed on another domain
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status; // 0 means the request never reached the server
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function request(path, { method = "GET", body, headers = {}, auth = true } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  const token = tokenStore.get();
  if (auth && token) h.Authorization = `Bearer ${token}`;

  let res;
  try {
      res = await fetch(`${API_BASE}/api${path}`,  {
      method,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Network error. Check your connection and try again.");
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && auth && token) onUnauthorized(); // expired/invalid session
    const detail = data.errors?.map((e) => `${e.field}: ${e.message}`).join(", ");
    throw new ApiError(res.status, detail || data.message || "Something went wrong");
  }
  return data;
}

const qs = (params = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const api = {
  register: (b) => request("/auth/register", { method: "POST", body: b, auth: false }),
  login: (b) => request("/auth/login", { method: "POST", body: b, auth: false }),
  me: () => request("/auth/me"),

  listSlots: (params) => request(`/slots${qs(params)}`),
  myHolds: () => request("/slots/holds/me"),
  hold: (id) => request(`/slots/${id}/hold`, { method: "POST" }),
  release: (id) => request(`/slots/${id}/hold`, { method: "DELETE" }),

  confirm: (slotId, key) =>
    request("/bookings", { method: "POST", body: { slotId }, headers: { "Idempotency-Key": key } }),
  myBookings: (params) => request(`/bookings/me${qs(params)}`),

  createSlotsBulk: (b) => request("/admin/slots/bulk", { method: "POST", body: b }),
  deleteSlot: (id) => request(`/admin/slots/${id}`, { method: "DELETE" }),
};