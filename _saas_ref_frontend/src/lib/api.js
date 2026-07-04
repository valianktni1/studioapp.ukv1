import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API = `${BASE}/api`;

export const TENANT_TOKEN_KEY = "studio_tenant_token";
export const SUPER_TOKEN_KEY = "studio_super_token";

function makeClient(tokenKey) {
  const c = axios.create({ baseURL: API });
  c.interceptors.request.use((cfg) => {
    const t = localStorage.getItem(tokenKey);
    if (t) cfg.headers.Authorization = `Bearer ${t}`;
    return cfg;
  });
  return c;
}

export const tenantApi = makeClient(TENANT_TOKEN_KEY);
export const superApi = makeClient(SUPER_TOKEN_KEY);
export const pub = axios.create({ baseURL: API });

export const mediaUrl = (kind, gid, slug, filename) =>
  `${API}/media/${kind}/${gid}/${slug}/${encodeURIComponent(filename)}`;

export function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i >= 3 ? 1 : 0)} ${units[i]}`;
}

export function apiError(e) {
  const status = e?.response?.status;
  if (status === 502 || status === 503 || status === 504) return "The server took too long to respond. If sending email, check your SMTP settings and try again.";
  const d = e?.response?.data?.detail;
  if (typeof d === "string") {
    if (d.trim().startsWith("<")) return "Something went wrong on the server. Please try again.";
    return d;
  }
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join(" ");
  return e?.message || "Something went wrong";
}
