import {
  STATUSES,
  COLORS,
  uid,
  dateKey,
  addDays,
  dayDiff,
  activeTasks,
  newTask,
  merge,
  validState,
} from "./model.js";
import { load, save } from "./storage.js";
import {
  getConfig,
  getAuth,
  configure,
  login,
  logout,
  syncState,
} from "./sync.js";
const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  board: "M4 4h6v16H4z M14 4h6v10h-6z",
  gantt: "M4 5h9 M9 12h11 M5 19h10",
  plus: "M12 5v14 M5 12h14",
  search: "m21 21-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  check: "m5 12 4 4L19 6",
  circle: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  clock: "M12 8v4l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  calendar:
    "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2 M7 3v4 M17 3v4 M3 11h18",
  tag: "m3 3 8 0 10 10-8 8L3 11z M7 7h.01",
  image:
    "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1 M3 16l6-6 7 8 M14 14l3-3 4 5 M16 7h.01",
  list: "M9 6h12 M9 12h12 M9 18h12 M3 6h.01 M3 12h.01 M3 18h.01",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
  cloud:
    "M7 18a5 5 0 1 1 1-10 6 6 0 0 1 11 3 4 4 0 0 1 0 8h-3 M12 13v8 m-3-5 3-3 3 3",
  wifi: "M3 8a15 15 0 0 1 18 0 M6 12a10 10 0 0 1 12 0 M9 16a5 5 0 0 1 6 0 M12 20h.01",
  close: "m6 6 12 12 M6 18 18 6",
  trash: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  arrow: "M5 12h14 m-5-5 5 5-5 5",
  download: "M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5",
  upload: "M12 16V3 m-5 5 5-5 5 5 M4 16v5h16v-5",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  sun: "M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  info: "M12 11v6 M12 7h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  leaf: "M20 3c-11-2-19 7-12 14 7 7 15-1 12-14 M5 21 16 9",
};
const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.circle}"/></svg>`;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const app = document.querySelector("#app"),
  modal = document.querySelector("#modal");
let state,
  projectId = "all",
  view = "board",
  search = "",
  tag = "",
  statusFilter = "",
  navOpen = false,
  ganttStart = addDays(dateKey(), -4),
  draft = null,
  dirty = false,
  saving = false,
  queue = Promise.resolve(),
  syncing = false,
  syncTimer,
  syncMessage = "",
  lastSync = localStorage.getItem("taskly-last-sync") || "";
let toastTimer;
function toast(msg) {
  const t = document.querySelector("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 4500);
}
function project(id) {
  return state.projects.find((p) => p.id === id);
}
function formatDate(d) {
  return d
    ? new Intl.DateTimeFormat("ja-JP", {
        month: "numeric",
        day: "numeric",
      }).format(new Date(d + "T12:00:00"))
    : "期限なし";
}
function statusIcon(s) {
  return icon(s === "done" ? "check" : s === "doing" ? "clock" : "circle");
}
function tasks() {
  return activeTasks(state).filter(
    (t) =>
      (projectId === "all" || t.projectId === projectId) &&
      (!search ||
        [t.title, t.description, ...t.tags]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!tag || t.tags.includes(tag)) &&
      (!statusFilter || t.status === statusFilter),
  );
}
function mutate(fn, { silent = false, remote = false } = {}) {
  const result = queue.then(async () => {
    const next = structuredClone(state);
    fn(next);
    await save(next);
    state = next;
    if (!silent) render();
    if (!remote) {
      scheduleSync();
    }
    return next;
  });
  queue = result.catch((e) => {
    toast(
      "保存できませんでした。容量と入力内容を確認してください。" + e.message,
    );
  });
  return result;
}
function scheduleSync() {
  clearTimeout(syncTimer);
  if (getAuth() && navigator.onLine)
    syncTimer = setTimeout(() => synchronize(true), 1500);
}
async function synchronize(quiet = false) {
  if (syncing || !navigator.onLine || !getAuth()) return;
  syncing = true;
  syncMessage = "同期中…";
  updateConnection();
  try {
    await queue;
    const sent = state;
    const remote = await syncState(structuredClone(sent));
    await mutate((s) => Object.assign(s, merge(s, remote)), { remote: true });
    lastSync = new Date().toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
    localStorage.setItem("taskly-last-sync", lastSync);
    syncMessage = "";
    if (!quiet) toast("すべての端末と同期しました");
    if (sent !== state && JSON.stringify(state) !== JSON.stringify(remote))
      scheduleSync();
  } catch (e) {
    syncMessage = "同期を再試行してください";
    if (!quiet) toast(e.message);
  } finally {
    syncing = false;
    updateConnection();
  }
}
function connectionText() {
  return !navigator.onLine
    ? "オフライン · 端末に保存"
    : syncMessage ||
        (getAuth()
          ? lastSync
            ? `${lastSync} に同期済み`
            : "同期を待っています"
          : "端末に自動保存");
}
function updateConnection() {
  document.querySelectorAll("[data-connection]").forEach((el) => {
    el.textContent = connectionText();
  });
  document
    .querySelectorAll(".online-dot")
    .forEach((el) => el.classList.toggle("offline", !navigator.onLine));
}
function render() {
  const all = activeTasks(state),
    list = tasks(),
    selected = project(projectId),
    title = selected?.name || "すべてのタスク";
  const tags = [
    ...new Set(
      all
        .filter((t) => projectId === "all" || t.projectId === projectId)
        .flatMap((t) => t.tags),
    ),
  ].sort();
  const done = list.filter((t) => t.status === "done").length,
    overdue = list.filter(
      (t) => t.due && t.due < dateKey() && t.status !== "done",
    ).length;
  app.innerHTML = `<div class="layout ${navOpen ? "nav-open" : ""}"><button class="nav-shade" data-action="nav" aria-label="メニューを閉じる"></button><aside class="sidebar"><a href="#" class="brand" data-action="home"><span class="brand-mark">${icon("leaf")}</span>taskly<span class="brand-dot">.</span></a><div class="workspace"><span class="workspace-avatar">M</span><div><strong>マイワークスペース</strong><small>自分らしく、進めよう</small></div><span class="workspace-chevron">${icon("down")}</span></div><p class="nav-label">ワークスペース</p><button class="nav-item ${projectId === "all" ? "active" : ""}" data-project="all">${icon("grid")}<span>すべてのタスク</span><span class="nav-count">${all.length}</span></button><div class="nav-label project-label"><span>プロジェクト</span><button class="icon-button" data-action="project-new" aria-label="プロジェクトを追加">${icon("plus")}</button></div><nav class="project-nav">${state.projects.map((p) => `<button class="nav-item ${projectId === p.id ? "active" : ""}" data-project="${p.id}"><span class="project-dot" style="--dot:${p.color}"></span><span>${esc(p.name)}</span><span class="nav-count">${all.filter((t) => t.projectId === p.id).length}</span></button>`).join("")}</nav><button class="add-project" data-action="project-new">${icon("plus")}新しいプロジェクト</button><div class="sidebar-bottom"><div class="little-note"><span>${icon("sun")}</span><strong>小さな一歩が、大きな前進。</strong><p>今日の「できた」を増やそう。</p><div class="note-art"><i></i><i></i><i></i></div></div><button class="nav-item" data-action="settings">${icon("settings")}<span>設定・データ同期</span></button><div class="profile"><span class="profile-avatar">M</span><div><strong>マイアカウント</strong><small>${getAuth() ? "クラウド同期が有効" : "ローカルワークスペース"}</small></div><span class="online-dot"></span></div></div></aside><main><header class="topbar"><button class="icon-button mobile-menu" data-action="nav" aria-label="メニュー">${icon("menu")}</button><div class="breadcrumb">ワークスペース ${icon("chevron")} <span>${esc(title)}</span></div><div class="top-actions"><span class="connection"><span class="online-dot"></span><span data-connection>${connectionText()}</span></span><button class="icon-button" data-action="settings" aria-label="同期と設定">${icon("cloud")}</button><span class="top-avatar">M</span></div></header><div class="content"><div class="page-heading"><div><div class="eyebrow">YOUR SPACE, YOUR PACE</div><h1>${esc(title)}<span class="heading-dot" style="--dot:${selected?.color || "#4d8b78"}"></span></h1><p>${selected ? "アイデアを整理して、ひとつずつ形に。" : "今日やることも、これからの計画も。ここから始めよう。"}</p></div><button class="button primary new-task" data-action="new">${icon("plus")}タスクを追加</button></div><div class="stats"><div class="stat"><span class="stat-icon total">${icon("list")}</span><div><span>すべてのタスク</span><strong>${list.length}<small>件</small></strong></div><div class="mini-bars"><i></i><i></i><i></i><i></i><i></i></div></div><div class="stat"><span class="stat-icon progress">${icon("clock")}</span><div><span>進行中</span><strong>${list.filter((t) => t.status === "doing").length}<small>件</small></strong></div><span class="stat-note">少しずつ前へ</span></div><div class="stat"><span class="stat-icon complete">${icon("check")}</span><div><span>完了</span><strong>${done}<small>件</small></strong></div><span class="completion-ring" style="--progress:${list.length ? (done / list.length) * 100 : 0}%"><span>${list.length ? Math.round((done / list.length) * 100) : 0}%</span></span></div><div class="stat"><span class="stat-icon deadline">${icon("calendar")}</span><div><span>期限超過</span><strong>${overdue}<small>件</small></strong></div><span class="stat-note">${overdue ? "日程を見直そう" : "順調なペースです"}</span></div></div><div class="view-toolbar"><div class="view-tabs" role="tablist" aria-label="表示形式"><button role="tab" aria-selected="${view === "board"}" class="${view === "board" ? "selected" : ""}" data-view="board">${icon("board")}かんばん</button><button role="tab" aria-selected="${view === "gantt"}" class="${view === "gantt" ? "selected" : ""}" data-view="gantt">${icon("gantt")}ガントチャート</button></div><div class="toolbar-right"><label class="search-box">${icon("search")}<input id="search" placeholder="タスクを検索…" aria-label="タスクを検索" value="${esc(search)}"><kbd>/</kbd></label><label class="filter-select"><span class="sr-only">状態で絞り込み</span><select id="status-filter"><option value="">すべての状態</option>${STATUSES.map((s) => `<option value="${s.id}" ${s.id === statusFilter ? "selected" : ""}>${s.label}</option>`).join("")}</select>${icon("down")}</label></div></div><div class="tag-toolbar"><div class="tag-filters">${icon("tag")}<button class="tag-filter ${!tag ? "selected" : ""}" data-tag="">すべて</button>${tags.map((t) => `<button class="tag-filter ${tag === t ? "selected" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div><span class="result-count">${list.length} 件のタスク</span></div>${view === "board" ? board(list) : gantt(list)}<footer class="page-footer"><span>${icon("check")}変更はこの端末に自動保存されます</span><span>Make room for what matters.</span></footer></div></main></div>`;
  bind();
  updateConnection();
}
function board(list) {
  return `<div class="board">${STATUSES.map(
    (s) =>
      `<section class="board-column" data-column="${s.id}" aria-label="${s.label}"><header class="column-heading"><span class="column-status ${s.id}">${statusIcon(s.id)}</span><h2>${s.label}</h2><span class="column-count">${list.filter((t) => t.status === s.id).length}</span><button class="icon-button" data-add-status="${s.id}" aria-label="${s.label}のタスクを追加">${icon("plus")}</button></header><div class="column-cards">${list
        .filter((t) => t.status === s.id)
        .map(card)
        .join(
          "",
        )}</div><button class="column-add" data-add-status="${s.id}">${icon("plus")}タスクを追加</button></section>`,
  ).join("")}</div>`;
}
function card(t) {
  const checked = t.checklist.filter((c) => c.done).length,
    late = t.due && t.due < dateKey() && t.status !== "done";
  return `<article class="task-card ${t.status === "done" ? "is-done" : ""}" data-task="${t.id}" draggable="true" tabindex="0" aria-label="${esc(t.title)}を開く">${t.images.length ? `<div class="card-cover"><img src="${t.images[0].data}" alt="${esc(t.images[0].name)}" draggable="false"></div>` : ""}<div class="card-body"><div class="card-top"><div class="task-tags">${t.tags.map((tag) => `<span class="task-tag tag-${tagColor(tag)}">${esc(tag)}</span>`).join("")}${!t.tags.length ? '<span class="untagged">タスク</span>' : ""}</div><button class="status-quick ${t.status}" data-cycle="${t.id}" aria-label="${esc(t.title)}：${STATUSES.find((s) => s.id === t.status).label}。次の状態へ変更" title="ワンタッチで状態を変更">${statusIcon(t.status)}</button></div><h3>${esc(t.title)}</h3>${t.description ? `<p class="card-description">${esc(t.description)}</p>` : ""}${t.checklist.length ? `<div class="card-progress"><div><span>${icon("list")}チェックリスト</span><span>${checked}/${t.checklist.length}</span></div><div class="progress-track"><span style="width:${(checked / t.checklist.length) * 100}%"></span></div></div>` : ""}<div class="card-footer"><span class="due ${late ? "late" : ""}">${icon("calendar")}${formatDate(t.due)}</span><div class="card-meta">${t.images.length ? `<span>${icon("image")}${t.images.length}</span>` : ""}<span class="task-avatar" style="--dot:${project(t.projectId)?.color}">M</span></div></div></div></article>`;
}
function tagColor(t) {
  let n = 0;
  for (const c of t) n += c.charCodeAt(0);
  return n % 5;
}
function gantt(list) {
  const days = Array.from({ length: 35 }, (_, i) => addDays(ganttStart, i));
  const today = dateKey();
  return `<section class="gantt-section"><div class="gantt-tools"><div><strong>${new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(new Date(ganttStart + "T12:00:00"))}</strong><span>35日間のスケジュール</span></div><div><button class="icon-button back" data-shift="-14" aria-label="前の期間">${icon("chevron")}</button><button class="button small" data-action="today">今日</button><button class="icon-button" data-shift="14" aria-label="次の期間">${icon("chevron")}</button></div></div><div class="gantt-scroll"><div class="gantt-grid"><div class="gantt-title gantt-corner">タスク名 <span>${list.length}</span></div><div class="gantt-dates">${days.map((d) => `<div class="gantt-day ${d === today ? "today" : ""} ${[0, 6].includes(new Date(d + "T12:00:00").getDay()) ? "weekend" : ""}"><small>${["日", "月", "火", "水", "木", "金", "土"][new Date(d + "T12:00:00").getDay()]}</small><strong>${Number(d.slice(8))}</strong></div>`).join("")}</div>${list
    .map((t) => {
      const start = t.start || t.due,
        end = t.due || t.start;
      const left = start ? dayDiff(ganttStart, start) : 0,
        right = end ? dayDiff(ganttStart, end) : 0,
        visible = start && right >= 0 && left < 35;
      return `<button class="gantt-title gantt-task" data-open="${t.id}"><span class="column-status ${t.status}">${statusIcon(t.status)}</span><span>${esc(t.title)}</span></button><div class="gantt-row">${days.map((d) => `<span class="gantt-cell ${d === today ? "today" : ""} ${[0, 6].includes(new Date(d + "T12:00:00").getDay()) ? "weekend" : ""}"></span>`).join("")}${visible ? `<button class="gantt-bar ${t.status}" data-open="${t.id}" style="left:${Math.max(0, left) * 40 + 4}px;width:${(Math.min(34, right) - Math.max(0, left) + 1) * 40 - 8}px" title="${esc(t.title)} ${formatDate(start)}〜${formatDate(end)}">${esc(t.title)}</button>` : `<button class="unscheduled" data-open="${t.id}">${start ? "表示期間外 · 日程を確認" : "日程を設定する"} ${icon("arrow")}</button>`}</div>`;
    })
    .join(
      "",
    )}${!list.length ? '<div class="gantt-empty">表示するタスクがありません。タスクを追加してください。</div>' : ""}</div></div><div class="gantt-legend">${STATUSES.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join("")}<span class="legend-hint">バーをタップして日程を編集</span></div></section>`;
}
function bind() {
  app.querySelectorAll("[data-action]").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.preventDefault();
        const a = b.dataset.action;
        if (a === "new") openTask();
        if (a === "settings") settings();
        if (a === "project-new") newProject();
        if (a === "home") {
          projectId = "all";
          render();
        }
        if (a === "nav") {
          navOpen = !navOpen;
          render();
        }
        if (a === "today") {
          ganttStart = addDays(dateKey(), -4);
          render();
        }
      }),
  );
  app.querySelectorAll("[data-project]").forEach(
    (b) =>
      (b.onclick = () => {
        projectId = b.dataset.project;
        tag = "";
        navOpen = false;
        render();
      }),
  );
  app.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        view = b.dataset.view;
        render();
      }),
  );
  app.querySelectorAll("[data-tag]").forEach(
    (b) =>
      (b.onclick = () => {
        tag = b.dataset.tag;
        render();
      }),
  );
  app.querySelectorAll("[data-shift]").forEach(
    (b) =>
      (b.onclick = () => {
        ganttStart = addDays(ganttStart, Number(b.dataset.shift));
        render();
      }),
  );
  app
    .querySelectorAll("[data-add-status]")
    .forEach((b) => (b.onclick = () => openTask(null, b.dataset.addStatus)));
  app.querySelectorAll("[data-cycle]").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        const t = state.tasks.find((t) => t.id === b.dataset.cycle),
          next =
            STATUSES[(STATUSES.findIndex((s) => s.id === t.status) + 1) % 3];
        changeStatus(t.id, next.id);
      }),
  );
  app.querySelectorAll("[data-task]").forEach((el) => {
    el.onclick = () => openTask(el.dataset.task);
    el.onkeydown = (e) => {
      if (e.target === el && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        openTask(el.dataset.task);
      }
    };
    el.ondragstart = (e) => {
      e.dataTransfer.setData("text/plain", el.dataset.task);
      e.dataTransfer.effectAllowed = "move";
    };
  });
  app
    .querySelectorAll("[data-open]")
    .forEach((b) => (b.onclick = () => openTask(b.dataset.open)));
  app.querySelectorAll("[data-column]").forEach((col) => {
    col.ondragover = (e) => {
      e.preventDefault();
      col.classList.add("drag-over");
    };
    col.ondragleave = (e) => {
      if (!col.contains(e.relatedTarget)) col.classList.remove("drag-over");
    };
    col.ondrop = (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      if (state.tasks.some((t) => t.id === id && !t.deleted))
        changeStatus(id, col.dataset.column);
    };
  });
  const input = app.querySelector("#search");
  input.oninput = () => {
    const pos = input.selectionStart;
    search = input.value;
    render();
    const next = app.querySelector("#search");
    next.focus();
    next.setSelectionRange(pos, pos);
  };
  app.querySelector("#status-filter").onchange = (e) => {
    statusFilter = e.target.value;
    render();
  };
}
function changeStatus(id, status) {
  mutate((s) => {
    const t = s.tasks.find((t) => t.id === id);
    t.status = status;
    t.updatedAt = Math.max(Date.now(), t.updatedAt + 1);
  })
    .then(() =>
      toast(`${STATUSES.find((s) => s.id === status).label}に変更しました`),
    )
    .catch(() => {});
}
function showModal(html, cls = "") {
  modal.className = cls;
  modal.innerHTML = html;
  modal.showModal();
  document.body.classList.add("modal-open");
}
function closeModal() {
  modal.close();
  modal.innerHTML = "";
  draft = null;
  dirty = false;
  document.body.classList.remove("modal-open");
}
function tryClose() {
  if (saving) return;
  if (dirty) {
    if (!confirm("保存していない変更を破棄しますか？")) return;
  }
  closeModal();
}
modal.addEventListener("cancel", (e) => {
  e.preventDefault();
  tryClose();
});
modal.addEventListener("click", (e) => {
  if (e.target === modal && e.offsetX < 0) tryClose();
});
function openTask(id, status = "todo") {
  const t = id
    ? state.tasks.find((t) => t.id === id)
    : newTask(projectId === "all" ? state.projects[0].id : projectId);
  draft = structuredClone(t);
  if (!id) draft.status = status;
  dirty = false;
  showModal(
    `<form id="task-form"><header class="drawer-header"><span>${icon("list")}${id ? "タスクの詳細" : "新しいタスク"}</span><button type="button" class="icon-button" id="close-modal" aria-label="閉じる">${icon("close")}</button></header><div class="drawer-body"><label class="sr-only" for="task-title">タスク名</label><input id="task-title" class="title-input" placeholder="何をしますか？" maxlength="200" required value="${esc(draft.title)}"><div class="field"><label>ステータス</label><div class="status-options">${STATUSES.map((s) => `<button type="button" data-status="${s.id}" class="status-option ${s.id === draft.status ? "selected" : ""} ${s.id}">${statusIcon(s.id)}${s.label}</button>`).join("")}</div></div><label class="field">プロジェクト<select id="task-project">${state.projects.map((p) => `<option value="${p.id}" ${p.id === draft.projectId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label><div class="date-fields"><label class="field">開始日<input type="date" id="task-start" value="${draft.start}" max="9999-12-31"></label><label class="field">期限日<input type="date" id="task-due" value="${draft.due}" max="9999-12-31"></label></div><div class="field"><label for="tag-input">タグ <span>複数追加できます</span></label><div id="draft-tags" class="draft-tags"></div><div class="inline-add"><input id="tag-input" placeholder="タグを入力して Enter" maxlength="30" list="existing-tags"><button type="button" class="button small" id="add-tag">追加</button></div><datalist id="existing-tags">${[...new Set(activeTasks(state).flatMap((t) => t.tags))].map((t) => `<option value="${esc(t)}">`).join("")}</datalist></div><label class="field">メモ<textarea id="task-description" placeholder="アイデアや補足を書き留める…" maxlength="20000" rows="3">${esc(draft.description)}</textarea></label><div class="field"><label class="section-label">${icon("list")}チェックリスト <span id="check-count"></span></label><div id="draft-checklist"></div><div class="inline-add"><input id="check-input" placeholder="チェック項目を追加…" maxlength="300"><button type="button" class="icon-button bordered" id="add-check" aria-label="チェック項目を追加">${icon("plus")}</button></div></div><div class="field"><label class="section-label">${icon("image")}添付画像 <span>最大8枚・各10MBまで</span></label><div id="draft-images"></div><label class="upload-area">${icon("image")}<strong>画像を選択して添付</strong><span>JPEG・PNG・WebP / 自動で圧縮します</span><input type="file" id="image-input" accept="image/jpeg,image/png,image/webp" multiple></label></div><p id="form-error" class="form-error" role="alert"></p></div><footer class="drawer-footer">${id ? `<button type="button" class="icon-button danger" id="delete-task" aria-label="タスクを削除">${icon("trash")}</button>` : ""}<span class="save-hint">${id ? "変更後は保存してください" : "小さな一歩から始めよう。"}</span><button type="button" class="button" id="cancel-task">キャンセル</button><button type="submit" class="button primary" id="save-task">${id ? "変更を保存" : "タスクを作成"}</button></footer></form>`,
    "task-drawer",
  );
  const form = modal.querySelector("form");
  form.oninput = () => (dirty = true);
  modal.querySelector("#close-modal").onclick = tryClose;
  modal.querySelector("#cancel-task").onclick = tryClose;
  modal.querySelectorAll("[data-status]").forEach(
    (b) =>
      (b.onclick = () => {
        draft.status = b.dataset.status;
        dirty = true;
        modal
          .querySelectorAll("[data-status]")
          .forEach((x) => x.classList.toggle("selected", x === b));
      }),
  );
  const addTag = () => {
    const el = modal.querySelector("#tag-input"),
      value = el.value.trim();
    if (!value) return;
    if (draft.tags.length >= 20) return toast("タグは20個までです");
    if (!draft.tags.includes(value)) draft.tags.push(value);
    el.value = "";
    dirty = true;
    renderDraftTags();
  };
  modal.querySelector("#add-tag").onclick = addTag;
  modal.querySelector("#tag-input").onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  };
  const addCheck = () => {
    const el = modal.querySelector("#check-input"),
      text = el.value.trim();
    if (!text) return;
    if (draft.checklist.length >= 100)
      return toast("チェック項目は100件までです");
    draft.checklist.push({ id: uid(), text, done: false });
    el.value = "";
    dirty = true;
    renderChecklist();
  };
  modal.querySelector("#add-check").onclick = addCheck;
  modal.querySelector("#check-input").onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCheck();
    }
  };
  modal.querySelector("#image-input").onchange = async (e) => {
    const files = [...e.target.files];
    if (draft.images.length + files.length > 8) {
      e.target.value = "";
      return toast("添付できる画像は8枚までです");
    }
    saving = true;
    modal.querySelector("#save-task").disabled = true;
    try {
      const images = [];
      for (const f of files) images.push(await compressImage(f));
      draft.images.push(...images);
      dirty = true;
      renderImages();
    } catch (err) {
      toast(
        err.name === "InvalidStateError"
          ? "画像を読み込めませんでした。別の画像を選んでください。"
          : err.message,
      );
    } finally {
      saving = false;
      modal.querySelector("#save-task").disabled = false;
      e.target.value = "";
    }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    addTag();
    addCheck();
    draft.title = modal.querySelector("#task-title").value.trim();
    draft.description = modal.querySelector("#task-description").value;
    draft.projectId = modal.querySelector("#task-project").value;
    draft.start = modal.querySelector("#task-start").value;
    draft.due = modal.querySelector("#task-due").value;
    const error = modal.querySelector("#form-error");
    if (!draft.title) {
      error.textContent = "タスク名を入力してください。";
      return;
    }
    if (draft.start && draft.due && draft.start > draft.due) {
      error.textContent = "期限日は開始日以降にしてください。";
      return;
    }
    draft.updatedAt = Math.max(Date.now(), draft.updatedAt + 1);
    const value = structuredClone(draft);
    saving = true;
    modal.querySelector("#save-task").disabled = true;
    try {
      await mutate((s) => {
        const i = s.tasks.findIndex((t) => t.id === value.id);
        if (i >= 0) s.tasks[i] = value;
        else s.tasks.unshift(value);
      });
      closeModal();
      toast(id ? "タスクを保存しました" : "新しいタスクを追加しました");
    } catch (err) {
      error.textContent = err.message;
      modal.querySelector("#save-task").disabled = false;
    } finally {
      saving = false;
    }
  };
  if (id)
    modal.querySelector("#delete-task").onclick = async () => {
      if (
        !confirm(
          "このタスクを削除しますか？チェックリストと画像も削除されます。",
        )
      )
        return;
      try {
        await mutate((s) => {
          const t = s.tasks.find((t) => t.id === id);
          t.deleted = true;
          t.images = [];
          t.updatedAt = Math.max(Date.now(), t.updatedAt + 1);
        });
        closeModal();
        toast("タスクを削除しました");
      } catch {}
    };
  renderDraftTags();
  renderChecklist();
  renderImages();
  if (!id) modal.querySelector("#task-title").focus();
}
function renderDraftTags() {
  modal.querySelector("#draft-tags").innerHTML = draft.tags
    .map(
      (t, i) =>
        `<span class="task-tag tag-${tagColor(t)}">${esc(t)}<button type="button" data-remove-tag="${i}" aria-label="${esc(t)}タグを削除">${icon("close")}</button></span>`,
    )
    .join("");
  modal.querySelectorAll("[data-remove-tag]").forEach(
    (b) =>
      (b.onclick = () => {
        draft.tags.splice(Number(b.dataset.removeTag), 1);
        dirty = true;
        renderDraftTags();
      }),
  );
}
function renderChecklist() {
  modal.querySelector("#check-count").textContent =
    `${draft.checklist.filter((c) => c.done).length} / ${draft.checklist.length}`;
  modal.querySelector("#draft-checklist").innerHTML = draft.checklist
    .map(
      (c, i) =>
        `<div class="check-row ${c.done ? "checked" : ""}"><input type="checkbox" data-check="${i}" ${c.done ? "checked" : ""} aria-label="${esc(c.text)}を完了"><input class="check-text" data-check-text="${i}" value="${esc(c.text)}" maxlength="300" aria-label="チェック項目の内容"><button type="button" class="icon-button" data-remove-check="${i}" aria-label="チェック項目を削除">${icon("close")}</button></div>`,
    )
    .join("");
  modal.querySelectorAll("[data-check]").forEach(
    (b) =>
      (b.onchange = () => {
        draft.checklist[Number(b.dataset.check)].done = b.checked;
        dirty = true;
        renderChecklist();
      }),
  );
  modal.querySelectorAll("[data-check-text]").forEach(
    (b) =>
      (b.oninput = () => {
        draft.checklist[Number(b.dataset.checkText)].text = b.value;
        dirty = true;
      }),
  );
  modal.querySelectorAll("[data-remove-check]").forEach(
    (b) =>
      (b.onclick = () => {
        draft.checklist.splice(Number(b.dataset.removeCheck), 1);
        dirty = true;
        renderChecklist();
      }),
  );
}
function renderImages() {
  modal.querySelector("#draft-images").innerHTML = draft.images
    .map(
      (im, i) =>
        `<div class="image-preview"><a href="${im.data}" download="${esc(im.name)}" title="画像を保存"><img src="${im.data}" alt="${esc(im.name)}"></a><span>${esc(im.name)}</span><button type="button" class="icon-button" data-remove-image="${i}" aria-label="画像を削除">${icon("close")}</button></div>`,
    )
    .join("");
  modal.querySelectorAll("[data-remove-image]").forEach(
    (b) =>
      (b.onclick = () => {
        draft.images.splice(Number(b.dataset.removeImage), 1);
        dirty = true;
        renderImages();
      }),
  );
}
async function compressImage(file) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw Error("JPEG・PNG・WebPの10MB以下の画像を選択してください。");
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 60000000) {
    bitmap.close();
    throw Error("画像の解像度が大きすぎます。縮小して再度お試しください。");
  }
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const data = canvas.toDataURL("image/jpeg", 0.8);
  if (data.length > 2500000)
    throw Error("画像をさらに縮小してお試しください。");
  return { id: uid(), name: file.name.slice(0, 200), data };
}
function newProject() {
  showModal(
    `<form id="project-form" class="simple-modal"><header><div><p class="eyebrow">A FRESH START</p><h2>新しいプロジェクト</h2></div><button type="button" class="icon-button" data-close aria-label="閉じる">${icon("close")}</button></header><p>やりたいことに、ひとつの場所を。</p><label class="field">プロジェクト名<input name="name" placeholder="例：新しいアイデア" required maxlength="100"></label><fieldset class="color-options"><legend>カラー</legend>${COLORS.map((c, i) => `<label style="--dot:${c}"><input type="radio" name="color" value="${c}" ${i === 0 ? "checked" : ""}><span>${icon("check")}</span></label>`).join("")}</fieldset><footer><button type="button" class="button" data-close>キャンセル</button><button type="submit" class="button primary">作成する</button></footer></form>`,
    "center-modal",
  );
  modal
    .querySelectorAll("[data-close]")
    .forEach((b) => (b.onclick = closeModal));
  modal.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const data = new FormData(e.target),
      name = data.get("name").trim();
    if (!name) return;
    const p = {
      id: uid(),
      name,
      color: data.get("color"),
      updatedAt: Date.now(),
    };
    try {
      await mutate((s) => s.projects.push(p));
      projectId = p.id;
      tag = "";
      navOpen = false;
      closeModal();
      render();
      toast("プロジェクトを作成しました");
    } catch {}
  };
}
function settings() {
  const config = getConfig(),
    auth = getAuth();
  showModal(
    `<div class="simple-modal settings-modal"><header><div><p class="eyebrow">STAY CONNECTED</p><h2>設定・データ同期</h2></div><button class="icon-button" data-close aria-label="閉じる">${icon("close")}</button></header><div class="settings-scroll"><div class="local-banner">${icon("check")}<div><strong>オフラインでも、いつものように。</strong><p>タスクと画像はこの端末に保存されます。初回表示後はネットがなくても利用できます。</p></div></div><h3>${icon("cloud")}端末間の同期</h3><p>Windows・Chromebook・Android・iPadで、同じ公開URLとアカウントを使って共有できます。</p><details><summary>はじめて接続する場合</summary><ol><li>自分のSupabaseプロジェクトを作り、リポジトリの <code>supabase.sql</code> をSQL Editorで実行します。</li><li>Email / Password認証を有効にし、下でProject URLと公開用キーを保存します。service_roleキーは使用しないでください。</li><li>アカウントを作成し、確認メールを開いてログインします。すべての端末で同じ設定を使ってください。</li></ol><p>タスク単位で最新の更新を採用します。同じタスクを同時編集した場合は後の変更が優先されます。端末の時計を自動設定にしてください。</p></details><form id="cloud-config"><label class="field">Project URL<input name="url" type="url" placeholder="https://your-project.supabase.co" value="${esc(config?.url || "")}" required></label><label class="field">Publishable key / anon key<input name="key" type="password" placeholder="公開用キー" value="${esc(config?.key || "")}" required autocomplete="off"></label><button class="button" type="submit">接続設定を保存</button></form>${auth ? `<div class="signed-in"><span>${icon("check")}${esc(auth.user?.email || "ログイン中")}</span><button class="button small" id="logout">ログアウト</button></div><button class="button primary" id="sync-now">${icon("cloud")}今すぐ同期</button><p class="settings-status" data-connection>${esc(connectionText())}</p>` : `<form id="login-form"><div class="divider"></div><label class="field">メールアドレス<input name="email" type="email" required autocomplete="email"></label><label class="field">パスワード<input name="password" type="password" minlength="8" required autocomplete="current-password"></label><div class="auth-actions"><button class="button primary" type="submit">ログイン</button><button class="button" type="button" id="signup">アカウントを作成</button></div></form>`}<p id="settings-error" class="form-error" role="status"></p><div class="divider"></div><h3>${icon("download")}バックアップ</h3><p>画像・チェックリストも含めてJSONファイルに保存します。ブラウザーのデータを消す前に書き出してください。</p><div class="backup-actions"><button class="button" id="export">${icon("download")}書き出す</button><label class="button">${icon("upload")}読み込む<input id="import-file" type="file" accept="application/json,.json" hidden></label></div><p class="fine-print">読み込みは既存データと統合します。画像を含むため、ファイルは大切に保管してください。</p><div class="divider"></div><h3>アプリとして使う</h3><p>HTTPSの公開先を開き、Chromeの「アプリをインストール」、iPadのSafariの「ホーム画面に追加」から利用できます。</p><button class="button" id="request-persist">端末内データの保持をリクエスト</button><p id="persist-result" class="fine-print"></p></div></div>`,
    "center-modal",
  );
  modal.querySelector("[data-close]").onclick = closeModal;
  const error = modal.querySelector("#settings-error");
  modal.querySelector("#cloud-config").onsubmit = (e) => {
    e.preventDefault();
    try {
      const d = new FormData(e.target),
        key = d.get("key").trim();
      if (!key) throw Error("公開用キーを入力してください。");
      if (key.startsWith("sb_secret_"))
        throw Error("公開用キーを使用してください。");
      if (
        getConfig() &&
        !confirm(
          "接続設定を変更するとログアウトします。端末内のタスクは残ります。続けますか？",
        )
      )
        return;
      configure(d.get("url").trim(), key);
      closeModal();
      settings();
      toast("接続設定を保存しました");
    } catch (e) {
      error.textContent = e.message;
    }
  };
  const authAction = async (signup) => {
    const f = modal.querySelector("#login-form");
    if (!f.reportValidity()) return;
    const d = new FormData(f);
    f.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      const ok = await login(d.get("email"), d.get("password"), signup);
      if (ok) {
        closeModal();
        settings();
        render();
        await synchronize();
      } else error.textContent = "確認メールを開いてからログインしてください。";
    } catch (e) {
      error.textContent = e.message;
    } finally {
      f.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  };
  if (!auth) {
    modal.querySelector("#login-form").onsubmit = (e) => {
      e.preventDefault();
      authAction(false);
    };
    modal.querySelector("#signup").onclick = () => authAction(true);
  } else {
    modal.querySelector("#sync-now").onclick = () => synchronize();
    modal.querySelector("#logout").onclick = async () => {
      try {
        await logout();
      } catch {}
      closeModal();
      render();
      settings();
    };
  }
  modal.querySelector("#export").onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `taskly-backup-${dateKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("バックアップを書き出しました");
  };
  modal.querySelector("#import-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024)
        throw Error("50MB以下のバックアップを選択してください。");
      const data = JSON.parse(await file.text());
      if (!validState(data))
        throw Error(
          "Tasklyのバックアップではないか、データ形式が正しくありません。",
        );
      await mutate((s) => Object.assign(s, merge(s, data)));
      toast("バックアップを統合しました");
    } catch (e) {
      error.textContent = e.message;
    } finally {
      e.target.value = "";
    }
  };
  modal.querySelector("#request-persist").onclick = async () => {
    const ok = await navigator.storage?.persist?.();
    modal.querySelector("#persist-result").textContent = ok
      ? "データの保持が許可されました。"
      : "このブラウザーでは保持を許可できませんでした。定期的にバックアップしてください。";
  };
}
window.addEventListener("beforeunload", (e) => {
  if (dirty || saving) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("online", () => {
  updateConnection();
  synchronize(true);
});
window.addEventListener("offline", updateConnection);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") synchronize(true);
});
window.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !modal.open &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    document.querySelector("#search")?.focus();
  }
});
try {
  state = await load();
  render();
  if ("serviceWorker" in navigator)
    navigator.serviceWorker
      .register("/sw.js")
      .catch(() =>
        toast(
          "オフライン用ファイルを準備できませんでした。オンラインで再読み込みしてください。",
        ),
      );
  setInterval(() => synchronize(true), 60000);
  scheduleSync();
} catch (e) {
  app.innerHTML = `<div class="startup-error"><h1>データを開けませんでした</h1><p>ブラウザーの保存領域が使えるか確認し、再読み込みしてください。</p><p>${esc(e.message)}</p><button class="button" onclick="location.reload()">再読み込み</button></div>`;
}
