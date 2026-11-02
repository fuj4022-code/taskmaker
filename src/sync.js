import { merge, validState } from "./model.js";
function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}
const CONFIG = "taskly-cloud-config",
  AUTH = "taskly-cloud-auth";
export const getConfig = () => read(CONFIG);
export const getAuth = () => read(AUTH);
export function configure(url, key) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    !/^[a-z0-9-]+\.supabase\.co$/.test(u.hostname) ||
    u.port ||
    u.username ||
    u.password
  )
    throw Error(
      "SupabaseのProject URLを入力してください（https://….supabase.co）。",
    );
  if (!key || key.startsWith("sb_secret_"))
    throw Error("公開用キーを使用してください。");
  try {
    if (JSON.parse(atob(key.split(".")[1])).role === "service_role")
      throw Error("service_roleキーは使用できません。");
  } catch (e) {
    if (e.message === "service_roleキーは使用できません。") throw e;
  }
  localStorage.setItem(CONFIG, JSON.stringify({ url: u.origin, key }));
  localStorage.removeItem(AUTH);
}
async function request(
  path,
  { method = "GET", body, token, headers = {} } = {},
) {
  const c = getConfig();
  if (!c) throw Error("先に接続設定を保存してください。");
  const res = await fetch(c.url + path, {
    method,
    headers: {
      apikey: c.key,
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw Error("サーバーから正しい応答がありません。");
  }
  if (!res.ok)
    throw Error(
      data?.msg ||
        data?.message ||
        data?.error_description ||
        "接続できませんでした。設定と通信状態を確認してください。",
    );
  return data;
}
export async function login(email, password, signup = false) {
  const data = await request(
    "/auth/v1/" + (signup ? "signup" : "token?grant_type=password"),
    { method: "POST", body: { email, password } },
  );
  if (data.access_token)
    localStorage.setItem(
      AUTH,
      JSON.stringify({
        ...data,
        expires_at: Date.now() + data.expires_in * 1000,
      }),
    );
  return !!data.access_token;
}
export async function logout() {
  const a = getAuth();
  try {
    if (a)
      await request("/auth/v1/logout", {
        method: "POST",
        token: a.access_token,
      });
  } finally {
    localStorage.removeItem(AUTH);
  }
}
async function session() {
  let a = getAuth();
  if (!a) throw Error("ログインしてください。");
  if (a.expires_at < Date.now() + 60000) {
    const d = await request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: a.refresh_token },
    });
    a = { ...d, expires_at: Date.now() + d.expires_in * 1000 };
    localStorage.setItem(AUTH, JSON.stringify(a));
  }
  return a;
}
export async function syncState(local) {
  const a = await session(),
    id = a.user.id;
  for (let i = 0; i < 4; i++) {
    const rows = await request(
      "/rest/v1/taskly_documents?id=eq." +
        encodeURIComponent(id) +
        "&select=payload,version",
      { token: a.access_token },
    );
    if (rows.length && !validState(rows[0].payload))
      throw Error("クラウドのデータ形式に問題があります。");
    const combined = rows.length ? merge(local, rows[0].payload) : local;
    if (rows.length) {
      const v = rows[0].version,
        updated = await request(
          "/rest/v1/taskly_documents?id=eq." +
            encodeURIComponent(id) +
            "&version=eq." +
            v,
          {
            method: "PATCH",
            token: a.access_token,
            headers: { Prefer: "return=representation" },
            body: { payload: combined, version: v + 1 },
          },
        );
      if (updated.length) return combined;
    } else {
      const inserted = await request(
        "/rest/v1/taskly_documents?on_conflict=id",
        {
          method: "POST",
          token: a.access_token,
          headers: {
            Prefer: "resolution=ignore-duplicates,return=representation",
          },
          body: { id, payload: combined, version: 1 },
        },
      );
      if (inserted.length) return combined;
    }
  }
  throw Error("ほかの端末が更新中です。少し待ってから再同期してください。");
}
