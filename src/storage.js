import { validState, initialState, normalize } from "./model.js";
let db;
function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("taskly-data", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("documents");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function load() {
  db = await open();
  const state = await new Promise((resolve, reject) => {
    const req = db
      .transaction("documents")
      .objectStore("documents")
      .get("workspace");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (state) {
    if (!validState(state)) throw Error("保存データを読み込めません。");
    const normalized = normalize(state);
    await save(normalized);
    return normalized;
  }
  const seed = initialState();
  await save(seed);
  return seed;
}
export function save(state) {
  if (!validState(state))
    return Promise.reject(
      Error("入力内容またはデータの上限を確認してください。"),
    );
  return new Promise((resolve, reject) => {
    const tx = db.transaction("documents", "readwrite");
    tx.objectStore("documents").put(state, "workspace");
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error("保存できませんでした。"));
  });
}
