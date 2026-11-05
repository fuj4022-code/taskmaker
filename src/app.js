import {
  STATUSES,
  PROGRESS,
  columns,
  resizeRange,
  calendarDays,
  dateRangeValid,
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
  timelineRunway,
  timelineFrom,
  dateAtOffset,
  TIMELINE_BUFFER,
  ganttBar,
  deadlineState,
  deadlineLabel,
  calendarWeeks,
} from "./schedule.js";
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
  edit: "M16 3l5 5-12 12-6 1 1-6z M14 5l5 5",
  archive: "M3 4h18v5H3z M5 9v12h14V9 M10 13h4",
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
  view = "board",
  search = "",
  tag = "",
  statusFilter = "",
  navOpen = false,
  sidebarHidden = localStorage.getItem("taskly-sidebar-hidden") === "true",
  archiveMode = false,
  dayWidth = Math.min(
    80,
    Math.max(24, Number(localStorage.getItem("taskly-day-width")) || 40),
  ),
  calendarMonth = dateKey().slice(0, 7) + "-01",
  activeResize = null,
  ganttRunway = null,
  timelineSavedScroll = null,
  timelineRequestedScroll = null,
  ganttUnit =
    localStorage.getItem("taskly-gantt-unit") === "day" ? "day" : "week",
  weekWidth = Math.min(
    140,
    Math.max(56, Number(localStorage.getItem("taskly-week-width")) || 84),
  ),
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
function statusLabel(id) {
  return columns(state).find((s) => s.id === id).label;
}
function progressBadge(t) {
  const p = PROGRESS.find((p) => p.id === (t.progress || "ontrack"));
  return `<span class="progress-badge ${p.id}">${p.label}</span>`;
}
function tasks() {
  return activeTasks(state, { includeArchived: true })
    .filter((t) => Boolean(t.archived) === archiveMode)
    .filter(
      (t) =>
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
  if (activeResize) return;
  const previous = app.querySelector(".gantt-scroll");
  const scroll = previous
    ? { left: previous.scrollLeft, top: previous.scrollTop }
    : timelineSavedScroll;
  if (previous) timelineSavedScroll = scroll;
  const all = activeTasks(state),
    list = tasks(),
    title = archiveMode ? "アーカイブ" : "すべてのタスク";
  const tags = [
    ...new Set(
      activeTasks(state, { includeArchived: true })
        .filter((t) => Boolean(t.archived) === archiveMode)
        .flatMap((t) => t.tags),
    ),
  ].sort();
  const done = list.filter((t) => t.status === "done").length,
    overdue = list.filter(
      (t) => t.due && t.due < dateKey() && t.status !== "done",
    ).length;
  app.innerHTML = `<div class="layout ${navOpen ? "nav-open" : ""} ${sidebarHidden ? "sidebar-hidden" : ""}"><button class="nav-shade" data-action="nav" aria-label="メニューを閉じる"></button><aside class="sidebar" ${window.matchMedia("(max-width:760px)").matches ? (!navOpen ? "inert" : "") : sidebarHidden ? "inert" : ""}><a href="#" class="brand" data-action="home"><span class="brand-mark">${icon("leaf")}</span>taskly<span class="brand-dot">.</span></a><button class="icon-button sidebar-close" data-action="nav" aria-label="サイドバーを閉じる">${icon("close")}</button><div class="workspace"><span class="workspace-avatar">M</span><div><strong>マイワークスペース</strong><small>自分らしく、進めよう</small></div><span class="workspace-chevron">${icon("down")}</span></div><p class="nav-label">ワークスペース</p><button class="nav-item ${!archiveMode ? "active" : ""}" data-action="home">${icon("grid")}<span>すべてのタスク</span><span class="nav-count">${all.length}</span></button><button class="nav-item ${archiveMode ? "active" : ""}" data-action="archive">${icon("archive")}<span>アーカイブ</span><span class="nav-count">${activeTasks(state, { includeArchived: true }).filter((t) => t.archived).length}</span></button><div class="sidebar-bottom"><div class="little-note"><span>${icon("sun")}</span><strong>小さな一歩が、大きな前進。</strong><p>今日の「できた」を増やそう。</p><div class="note-art"><i></i><i></i><i></i></div></div><button class="nav-item" data-action="settings">${icon("settings")}<span>設定・データ同期</span></button><div class="profile"><span class="profile-avatar">M</span><div><strong>マイアカウント</strong><small>${getAuth() ? "クラウド同期が有効" : "ローカルワークスペース"}</small></div><span class="online-dot"></span></div></div></aside><main><header class="topbar"><button class="icon-button sidebar-toggle" data-action="nav" aria-label="メニュー" aria-expanded="${window.matchMedia("(max-width:760px)").matches ? navOpen : !sidebarHidden}" title="サイドバーを開く・閉じる">${icon("menu")}</button><div class="breadcrumb">ワークスペース ${icon("chevron")} <span>${esc(title)}</span></div><div class="top-actions"><span class="connection"><span class="online-dot"></span><span data-connection>${connectionText()}</span></span><button class="icon-button" data-action="settings" aria-label="同期と設定">${icon("cloud")}</button><span class="top-avatar">M</span></div></header><div class="content"><div class="page-heading"><div><div class="eyebrow">YOUR SPACE, YOUR PACE</div><div class="project-title-line"><h1>${esc(title)}<span class="heading-dot" style="--dot:#4d8b78"></span></h1></div><p>今日やることも、これからの計画も。ここから始めよう。</p></div>${archiveMode ? `<span class="archive-heading-note">完了したタスクを保管しています</span>` : `<button class="button primary new-task" data-action="new">${icon("plus")}タスクを追加</button>`}</div><div class="stats"><div class="stat"><span class="stat-icon total">${icon("list")}</span><div><span>すべてのタスク</span><strong>${list.length}<small>件</small></strong></div><div class="mini-bars"><i></i><i></i><i></i><i></i><i></i></div></div><div class="stat"><span class="stat-icon progress">${icon("clock")}</span><div><span>進行中</span><strong>${list.filter((t) => t.status === "doing").length}<small>件</small></strong></div><span class="stat-note">少しずつ前へ</span></div><div class="stat"><span class="stat-icon complete">${icon("check")}</span><div><span>完了</span><strong>${done}<small>件</small></strong></div><span class="completion-ring" style="--progress:${list.length ? (done / list.length) * 100 : 0}%"><span>${list.length ? Math.round((done / list.length) * 100) : 0}%</span></span></div><div class="stat"><span class="stat-icon deadline">${icon("calendar")}</span><div><span>期限超過</span><strong>${overdue}<small>件</small></strong></div><span class="stat-note">${overdue ? "日程を見直そう" : "順調なペースです"}</span></div></div><div class="view-toolbar">${archiveMode ? '<div class="archive-filter-label">保管済みタスク</div>' : `<div class="view-tabs" role="tablist" aria-label="表示形式"><button role="tab" aria-selected="${view === "board"}" class="${view === "board" ? "selected" : ""}" data-view="board">${icon("board")}かんばん</button><button role="tab" aria-selected="${view === "gantt"}" class="${view === "gantt" ? "selected" : ""}" data-view="gantt">${icon("gantt")}ガントチャート</button><button role="tab" aria-selected="${view === "calendar"}" class="${view === "calendar" ? "selected" : ""}" data-view="calendar">${icon("calendar")}カレンダー</button></div>`}<div class="toolbar-right"><label class="search-box">${icon("search")}<input id="search" placeholder="タスクを検索…" aria-label="タスクを検索" value="${esc(search)}"><kbd>/</kbd></label><label class="filter-select"><span class="sr-only">状態で絞り込み</span><select id="status-filter"><option value="">すべての状態</option>${STATUSES.map((s) => `<option value="${s.id}" ${s.id === statusFilter ? "selected" : ""}>${esc(statusLabel(s.id))}</option>`).join("")}</select>${icon("down")}</label></div></div><div class="tag-toolbar"><div class="tag-filters">${icon("tag")}<button class="tag-filter ${!tag ? "selected" : ""}" data-tag="">すべて</button>${tags.map((t) => `<button class="tag-filter ${tag === t ? "selected" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div><span class="result-count">${list.length} 件のタスク</span></div>${archiveMode ? archiveList(list) : view === "board" ? board(list) : view === "gantt" ? gantt(list) : calendar(list)}${!archiveMode ? '<p class="deadline-legend"><span class="deadline-key soon"></span>期限まで3日以内 <span class="deadline-key overdue"></span>期限超過</p>' : ""}<footer class="page-footer"><span>${icon("check")}変更はこの端末に自動保存されます</span><span>Make room for what matters.</span></footer></div></main></div>`;

  bind();
  const scroller = app.querySelector(".gantt-scroll");
  if (scroller) {
    const position = timelineRequestedScroll || scroll;
    if (position) {
      scroller.scrollLeft = position.left;
      scroller.scrollTop = position.top;
    }
    timelineRequestedScroll = null;
    timelineSavedScroll = {
      left: scroller.scrollLeft,
      top: scroller.scrollTop,
    };
    updateTimelineLabel(scroller);
  }
  updateConnection();
}
function board(list) {
  return `<div class="board">${STATUSES.map(
    (s) =>
      `<section class="board-column" data-column="${s.id}" aria-label="${esc(statusLabel(s.id))}"><header class="column-heading"><span class="column-status ${s.id}">${statusIcon(s.id)}</span><h2>${esc(statusLabel(s.id))}</h2><button class="icon-button column-rename" data-rename-column="${s.id}" aria-label="${esc(statusLabel(s.id))}の列名を変更">${icon("edit")}</button><span class="column-count">${list.filter((t) => t.status === s.id).length}</span><button class="icon-button" data-add-status="${s.id}" aria-label="${esc(statusLabel(s.id))}のタスクを追加">${icon("plus")}</button></header><div class="column-cards">${list
        .filter((t) => t.status === s.id)
        .map(card)
        .join(
          "",
        )}</div><button class="column-add" data-add-status="${s.id}">${icon("plus")}タスクを追加</button></section>`,
  ).join("")}</div>`;
}
function card(t) {
  const checked = t.checklist.filter((c) => c.done).length,
    urgency = deadlineState(t);
  return `<article class="task-card card-compact ${t.status === "done" ? "is-done" : ""} ${urgency ? "deadline-" + urgency : ""}" data-task="${t.id}" draggable="true" tabindex="0" aria-label="${esc(t.title)}を開く">${t.images.length ? `<div class="card-cover"><img src="${t.images[0].data}" alt="${esc(t.images[0].name)}" draggable="false"></div>` : ""}<div class="card-body"><div class="card-heading"><h3>${esc(t.title)}</h3><button class="status-quick ${t.status}" data-cycle="${t.id}" aria-label="${esc(t.title)}：${esc(statusLabel(t.status))}。次の状態へ変更" title="ワンタッチで状態を変更">${statusIcon(t.status)}</button></div>
 ${
   t.tags.length
     ? `<div class="task-tags">${t.tags
         .slice(0, 3)
         .map(
           (tag) =>
             `<span class="task-tag tag-${tagColor(tag)}">${esc(tag)}</span>`,
         )
         .join(
           "",
         )}${t.tags.length > 3 ? `<span class="extra-tags" aria-label="ほか${t.tags.length - 3}個のタグ">+${t.tags.length - 3}</span>` : ""}</div>`
     : ""
 }
 ${t.description ? `<p class="card-description">${esc(t.description)}</p>` : ""}<div class="card-compact-progress">${t.checklist.length ? `<span class="check-summary" aria-label="チェックリスト ${checked}/${t.checklist.length}">${icon("list")}${checked}/${t.checklist.length}</span><div class="progress-track"><span style="width:${(checked / t.checklist.length) * 100}%"></span></div>` : ""}${progressBadge(t)}</div>
 <div class="card-footer"><span class="due" title="${deadlineLabel(t)}">${icon("calendar")}${formatDate(t.due)}${urgency ? `<strong class="deadline-label">${deadlineLabel(t)}</strong>` : ""}</span><div class="card-meta">${t.images.length ? `<span>${icon("image")}${t.images.length}</span>` : ""}${t.status === "done" ? `<button class="icon-button" data-archive-task="${t.id}" aria-label="${esc(t.title)}をアーカイブ" title="アーカイブ">${icon("archive")}</button>` : ""}</div></div></div></article>`;
}
function tagColor(t) {
  let n = 0;
  for (const c of t) n += c.charCodeAt(0);
  return n % 5;
}
function timeline() {
  if (!ganttRunway) {
    ganttRunway = timelineRunway(dateKey(), ganttUnit);
    timelineRequestedScroll = { left: TIMELINE_BUFFER * columnWidth(), top: 0 };
  }
  return ganttRunway;
}
function resetTimeline(focus = dateKey()) {
  ganttRunway = timelineRunway(focus, ganttUnit);
  timelineRequestedScroll = {
    left: TIMELINE_BUFFER * columnWidth(),
    top: timelineSavedScroll?.top || 0,
  };
}
function columnWidth() {
  return ganttUnit === "week" ? weekWidth : dayWidth;
}
function pixelsPerDay() {
  return columnWidth() / (ganttUnit === "week" ? 7 : 1);
}
function ganttGeometry(start, end) {
  return ganttBar(start, end, timeline(), columnWidth());
}
function ganttRow(t, check = null) {
  const item = check || t,
    start = item.start || item.due,
    end = item.due || item.start,
    status = check ? (check.done ? "done" : "todo") : t.status;
  const title = check ? check.text : t.title,
    geo = start ? ganttGeometry(start, end) : null,
    w = timeline();
  const attrs = `data-resize-task="${t.id}" ${check ? `data-resize-check="${check.id}"` : ""}`;
  const urgency = deadlineState(
    check ? { ...check, status: t.status === "done" ? "done" : status } : t,
  );
  const period = start
    ? `${start.slice(0, 4) !== dateKey().slice(0, 4) ? start.slice(0, 4) + "年 " : ""}${formatDate(start)}〜${end.slice(0, 4) !== start.slice(0, 4) ? end.slice(0, 4) + "年 " : ""}${formatDate(end)}`
    : "期間未設定";
  return `<div class="gantt-title gantt-task ${check ? "gantt-subtask" : ""}" data-row-task="${t.id}" ${check ? `data-row-check="${check.id}"` : ""}>
 ${check ? `<input type="checkbox" class="gantt-check-toggle" data-gantt-check-task="${t.id}" data-gantt-check-id="${check.id}" ${check.done ? "checked" : ""} aria-label="${esc(title)}を完了">` : `<span class="column-status ${status}">${statusIcon(status)}</span>`}
 <button class="gantt-row-name" data-open="${t.id}" ${check ? `data-focus-check="${check.id}"` : ""} title="${esc(title)}${check ? " · " + period : ""}"><span>${esc(title)}</span>${check ? `<small class="gantt-check-period">${period}</small>` : ""}</button>
 ${check ? "" : `<select class="gantt-status-select" data-gantt-status="${t.id}" aria-label="${esc(title)}のステータス">${STATUSES.map((s) => `<option value="${s.id}" ${s.id === t.status ? "selected" : ""}>${esc(statusLabel(s.id))}</option>`).join("")}</select>`}</div>
 <div class="gantt-row ${check ? "subtask-row" : ""}">${w.columns.map((d) => `<span class="gantt-cell ${dateKey() >= d && dateKey() <= addDays(d, w.daysPerColumn - 1) ? "today" : ""} ${ganttUnit === "day" && [0, 6].includes(new Date(d + "T12:00:00").getDay()) ? "weekend" : ""}"></span>`).join("")}
 ${geo?.visible ? `<div class="gantt-bar ${status} ${urgency ? "deadline-" + urgency : ""}" data-bar-task="${t.id}" ${check ? `data-bar-check="${check.id}"` : ""} data-start="${start}" data-end="${end}" style="left:${geo.left}px;width:${geo.width}px" title="${esc(title)} ${period}">${geo.hasStart ? `<button class="gantt-resize start" data-resize="start" ${attrs} aria-label="${esc(title)}の開始日を調整" title="ドラッグまたは左右キーで開始日を調整"></button>` : ""}<button class="gantt-bar-label" data-open="${t.id}" ${check ? `data-focus-check="${check.id}"` : ""}>${esc(title)}</button>${geo.hasEnd ? `<button class="gantt-resize due" data-resize="due" ${attrs} aria-label="${esc(title)}の期限日を調整" title="ドラッグまたは左右キーで期限日を調整"></button>` : ""}</div>` : start ? `<button class="unscheduled" data-gantt-jump="${start}">${period} · この期間へ移動 ${icon("arrow")}</button>` : `<button class="unscheduled" data-open="${t.id}" ${check ? `data-focus-check="${check.id}"` : ""}>期間を設定する ${icon("arrow")}</button>`}</div>`;
}
function gantt(list) {
  const w = timeline(),
    groups = [],
    width = columnWidth();
  for (const d of w.columns) {
    const key = d.slice(0, 7),
      last = groups.at(-1);
    if (last?.key === key) last.count++;
    else groups.push({ key, count: 1 });
  }
  return `<section class="gantt-section" style="--day-width:${width}px;--timeline-width:${w.columns.length * width}px" data-unit="${ganttUnit}" data-range-start="${w.start}" data-range-end="${w.end}">
 <div class="gantt-tools"><div class="timeline-navigation"><button class="icon-button back" data-gantt-step="-1" aria-label="前の期間">${icon("chevron")}</button><strong class="gantt-visible-period"></strong><button class="icon-button" data-gantt-step="1" aria-label="次の期間">${icon("chevron")}</button><button class="button small" data-action="today">今日</button></div>
 <div class="gantt-controls"><label class="compact-field">表示単位<select id="gantt-unit" aria-label="ガントの表示単位"><option value="day" ${ganttUnit === "day" ? "selected" : ""}>日ごと</option><option value="week" ${ganttUnit === "week" ? "selected" : ""}>週ごと</option></select></label><label class="gantt-width">列幅<input type="range" id="day-width" aria-label="ガントの列幅" min="${ganttUnit === "week" ? 56 : 24}" max="${ganttUnit === "week" ? 140 : 80}" step="4" value="${width}"><output id="day-width-value">${width}px</output></label></div></div>
 <p class="resize-feedback" role="status">横スクロールで前後の日付へ移動。帯の両端で期間、行の選択欄でステータスを変更できます。</p>
 <div class="gantt-scroll"><div class="gantt-grid"><div class="gantt-title gantt-corner">タスク / チェックリスト</div><div class="gantt-dates"><div class="gantt-months">${groups.map((g) => `<div style="width:${g.count * width}px" data-column-count="${g.count}"><span>${g.key.replace("-", "年")}月</span></div>`).join("")}</div><div class="gantt-date-cells">${w.columns.map((d) => `<div class="gantt-day ${dateKey() >= d && dateKey() <= addDays(d, w.daysPerColumn - 1) ? "today" : ""}">${ganttUnit === "week" ? `<strong>${formatDate(d)}</strong><small>〜${formatDate(addDays(d, 6))}</small>` : `<small>${["日", "月", "火", "水", "木", "金", "土"][new Date(d + "T12:00:00").getDay()]}</small><strong>${Number(d.slice(8))}</strong>`}</div>`).join("")}</div></div>
 ${list.map((t) => ganttRow(t) + t.checklist.map((c) => ganttRow(t, c)).join("")).join("")}${!list.length ? '<div class="gantt-empty">表示するタスクはありません。</div>' : ""}</div></div></section>`;
}
function updateTimelineLabel(scroller) {
  const first = dateAtOffset(timeline(), scroller.scrollLeft, columnWidth()),
    nameWidth =
      Number.parseFloat(
        getComputedStyle(app.querySelector(".gantt-section")).getPropertyValue(
          "--task-width",
        ),
      ) || 260;
  const last = addDays(
    first,
    Math.max(
      1,
      Math.floor((scroller.clientWidth - nameWidth) / pixelsPerDay()),
    ) - 1,
  );
  app.querySelector(".gantt-visible-period").textContent =
    `${first.slice(0, 4)}年 ${formatDate(first)}〜${last.slice(0, 4) !== first.slice(0, 4) ? last.slice(0, 4) + "年 " : ""}${formatDate(last)}`;
}
function bindContinuousScroll() {
  const scroller = app.querySelector(".gantt-scroll");
  if (!scroller) return;
  scroller.addEventListener("scroll", () => {
    if (!scroller.isConnected) return;
    timelineSavedScroll = {
      left: scroller.scrollLeft,
      top: scroller.scrollTop,
    };
    updateTimelineLabel(scroller);
    if (activeResize || modal.open) return;
    const width = columnWidth(),
      max = scroller.scrollWidth - scroller.clientWidth;
    const direction =
      scroller.scrollLeft < width * 3
        ? -1
        : max - scroller.scrollLeft < width * 3
          ? 1
          : 0;
    if (!direction) return;
    const delta = direction * TIMELINE_BUFFER;
    ganttRunway = timelineFrom(
      addDays(timeline().start, delta * timeline().daysPerColumn),
      ganttUnit,
    );
    timelineRequestedScroll = {
      left: scroller.scrollLeft - delta * width,
      top: scroller.scrollTop,
    };
    render();
  });
}
function calendar(list) {
  const weeks = calendarWeeks(list, calendarMonth),
    month = calendarMonth.slice(0, 7),
    today = dateKey();
  return `<section class="calendar-section"><header class="calendar-toolbar"><h2>${new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(new Date(calendarMonth + "T12:00:00"))}</h2><div><button class="icon-button back" data-month-shift="-1" aria-label="前の月">${icon("chevron")}</button><button class="button small" data-action="today">今日</button><button class="icon-button" data-month-shift="1" aria-label="次の月">${icon("chevron")}</button></div></header><div class="calendar-weekdays">${["月", "火", "水", "木", "金", "土", "日"].map((d) => `<span>${d}</span>`).join("")}</div>
 <div class="month-grid">${weeks
   .map(
     (w) =>
       `<div class="calendar-week" data-week-start="${w.days[0]}"><div class="calendar-date-grid">${w.days.map((day) => `<div class="calendar-day ${day.slice(0, 7) !== month ? "other-month" : ""} ${day === today ? "today" : ""}" data-day="${day}"><div class="calendar-day-heading"><span>${Number(day.slice(8))}</span><button class="icon-button" data-date-new="${day}" aria-label="${day}にタスクを追加">${icon("plus")}</button></div></div>`).join("")}</div><div class="calendar-week-events" style="grid-template-rows:repeat(${Math.max(1, w.laneCount)},26px)">${w.segments
         .map((s) => {
           const t = s.task,
             urgency = deadlineState(t);
           return `<button class="calendar-event ${t.status} ${s.before ? "continues-before" : ""} ${s.after ? "continues-after" : ""} ${urgency ? "deadline-" + urgency : ""}" data-open="${t.id}" data-calendar-task="${t.id}" data-start="${t.start || t.due}" data-end="${t.due || t.start}" style="grid-column:${s.col + 1}/span ${s.span};grid-row:${s.lane + 1}" title="${esc(t.title)} · ${formatDate(t.start || t.due)}〜${formatDate(t.due || t.start)} · ${PROGRESS.find((p) => p.id === (t.progress || "ontrack")).label}${urgency ? " · " + deadlineLabel(t) : ""}"><span>${s.before ? "‹ " : ""}${esc(t.title)}${s.after ? " ›" : ""}</span></button>`;
         })
         .join("")}</div></div>`,
   )
   .join("")}</div>
 <div class="calendar-unscheduled"><h3>日程未設定 <span>${list.filter((t) => !t.start && !t.due).length}</span></h3>${
   list
     .filter((t) => !t.start && !t.due)
     .map(
       (t) =>
         `<button class="button small" data-open="${t.id}">${esc(t.title)}</button>`,
     )
     .join("") || "<p>日程未設定のタスクはありません。</p>"
 }</div></section>`;
}
function archiveList(list) {
  return `<section class="archive-list"><h2>${icon("archive")}アーカイブしたタスク <span>${list.length}件</span></h2>${list.map((t) => `<div class="archive-row"><button class="archive-task-name" data-open="${t.id}">${icon("check")}<span>${esc(t.title)}<small>${formatDate(t.due)}</small></span></button>${progressBadge(t)}<button class="button small" data-restore-task="${t.id}">元に戻す</button></div>`).join("") || '<p class="empty-message">まだアーカイブはありません。完了したタスクのアーカイブボタンから保管できます。</p>'}</section>`;
}
function bindSchedule() {
  app.querySelectorAll("[data-month-shift]").forEach(
    (b) =>
      (b.onclick = () => {
        const d = new Date(calendarMonth + "T12:00:00");
        d.setMonth(d.getMonth() + Number(b.dataset.monthShift));
        calendarMonth = dateKey(d);
        render();
      }),
  );
  app
    .querySelectorAll("[data-date-new]")
    .forEach(
      (b) => (b.onclick = () => openTask(null, "todo", b.dataset.dateNew)),
    );
  bindContinuousScroll();
  app.querySelectorAll("[data-gantt-step]").forEach(
    (b) =>
      (b.onclick = () => {
        const scroller = app.querySelector(".gantt-scroll");
        scroller.scrollLeft +=
          Number(b.dataset.ganttStep) *
          Math.max(columnWidth() * 3, scroller.clientWidth - 260);
      }),
  );
  app.querySelectorAll("[data-gantt-jump]").forEach(
    (b) =>
      (b.onclick = () => {
        resetTimeline(b.dataset.ganttJump);
        render();
      }),
  );
  app
    .querySelectorAll("[data-gantt-status]")
    .forEach(
      (el) =>
        (el.onchange = () => changeStatus(el.dataset.ganttStatus, el.value)),
    );
  app.querySelectorAll("[data-gantt-check-id]").forEach(
    (el) =>
      (el.onchange = async () => {
        try {
          await mutate((s) => {
            const t = s.tasks.find((t) => t.id === el.dataset.ganttCheckTask),
              c = t.checklist.find((c) => c.id === el.dataset.ganttCheckId);
            c.done = el.checked;
            t.updatedAt = Math.max(Date.now(), t.updatedAt + 1);
          });
        } catch {}
      }),
  );
  const unit = app.querySelector("#gantt-unit");
  if (unit)
    unit.onchange = () => {
      const scroller = app.querySelector(".gantt-scroll"),
        focus = dateAtOffset(timeline(), scroller.scrollLeft, columnWidth());
      ganttUnit = unit.value;
      localStorage.setItem("taskly-gantt-unit", ganttUnit);
      resetTimeline(focus);
      render();
    };
  const width = app.querySelector("#day-width");
  if (width)
    width.oninput = () => {
      const scroller = app.querySelector(".gantt-scroll"),
        offset = scroller.scrollLeft / columnWidth();
      if (ganttUnit === "week") {
        weekWidth = Number(width.value);
        localStorage.setItem("taskly-week-width", String(weekWidth));
      } else {
        dayWidth = Number(width.value);
        localStorage.setItem("taskly-day-width", String(dayWidth));
      }
      const currentWidth = columnWidth();
      const section = app.querySelector(".gantt-section");
      section.style.setProperty("--day-width", currentWidth + "px");
      section.style.setProperty(
        "--timeline-width",
        timeline().columns.length * currentWidth + "px",
      );
      app
        .querySelectorAll("[data-column-count]")
        .forEach(
          (g) =>
            (g.style.width =
              Number(g.dataset.columnCount) * currentWidth + "px"),
        );
      app.querySelector("#day-width-value").textContent = currentWidth + "px";
      app.querySelectorAll(".gantt-bar").forEach((bar) => {
        const g = ganttGeometry(bar.dataset.start, bar.dataset.end);
        bar.style.left = g.left + "px";
        bar.style.width = g.width + "px";
      });
      scroller.scrollLeft = offset * currentWidth;
      updateTimelineLabel(scroller);
    };
  app.querySelectorAll("[data-resize]").forEach((handle) => {
    handle.onkeydown = async (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const t = state.tasks.find((t) => t.id === handle.dataset.resizeTask),
        item = handle.dataset.resizeCheck
          ? t.checklist.find((c) => c.id === handle.dataset.resizeCheck)
          : t;
      try {
        const range = resizeRange(
          item.start,
          item.due,
          handle.dataset.resize,
          e.key === "ArrowRight" ? 1 : -1,
        );
        await saveRange(t.id, handle.dataset.resizeCheck, range);
        const checkSelector = handle.dataset.resizeCheck
          ? `[data-resize-check="${handle.dataset.resizeCheck}"]`
          : ":not([data-resize-check])";
        app
          .querySelector(
            `[data-resize-task="${t.id}"][data-resize="${handle.dataset.resize}"]${checkSelector}`,
          )
          ?.focus({ preventScroll: true });
        toast("期間を変更しました");
      } catch (e) {
        toast(e.message);
      }
    };
    handle.onpointerdown = (e) => beginResize(e, handle);
  });
}
async function saveRange(taskId, checkId, range) {
  return mutate((s) => {
    const t = s.tasks.find((t) => t.id === taskId);
    if (!t || t.deleted || t.archived)
      throw Error("このタスクは編集できません。");
    const item = checkId ? t.checklist.find((c) => c.id === checkId) : t;
    if (!item) throw Error("チェック項目が見つかりません。");
    Object.assign(item, range);
    t.updatedAt = Math.max(Date.now(), t.updatedAt + 1);
  });
}
function beginResize(e, handle) {
  if (e.button !== 0 || activeResize) return;
  e.preventDefault();
  e.stopPropagation();
  const t = state.tasks.find((t) => t.id === handle.dataset.resizeTask),
    checkId = handle.dataset.resizeCheck,
    item = checkId ? t.checklist.find((c) => c.id === checkId) : t;
  const original = { start: item.start, due: item.due },
    bar = handle.closest(".gantt-bar"),
    scroller = handle.closest(".gantt-scroll");
  const startX = e.clientX,
    initialScroll = scroller.scrollLeft;
  let range = original,
    delta = 0;
  activeResize = { taskId: t.id };
  handle.setPointerCapture(e.pointerId);
  bar.classList.add("resizing");
  function move(event) {
    if (event.pointerId !== e.pointerId) return;
    const rect = scroller.getBoundingClientRect();
    if (event.clientX > rect.right - 24) scroller.scrollLeft += 16;
    if (event.clientX < rect.left + 24) scroller.scrollLeft -= 16;
    delta = Math.round(
      (event.clientX - startX + scroller.scrollLeft - initialScroll) /
        pixelsPerDay(),
    );
    try {
      range = resizeRange(
        original.start,
        original.due,
        handle.dataset.resize,
        delta,
      );
    } catch {
      return;
    }
    const g = ganttGeometry(range.start, range.due);
    bar.style.left = g.left + "px";
    bar.style.width = Math.max(8, g.width) + "px";
    app.querySelector(".resize-feedback").textContent =
      `${item.text || t.title}：${formatDate(range.start)} 〜 ${formatDate(range.due)}`;
  }
  async function finish(event) {
    if (event.pointerId !== e.pointerId) return;
    const canceled = event.type !== "pointerup";
    activeResize = null;
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", finish);
    handle.removeEventListener("pointercancel", finish);
    handle.removeEventListener("lostpointercapture", finish);
    if (handle.hasPointerCapture(e.pointerId))
      handle.releasePointerCapture(e.pointerId);
    if (
      !canceled &&
      (range.start !== original.start || range.due !== original.due)
    ) {
      try {
        await saveRange(t.id, checkId, range);
        toast("期間を変更しました");
      } catch {
        render();
      }
    } else render();
  }
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  handle.addEventListener("lostpointercapture", finish);
}
async function archiveTask(id, archived) {
  try {
    await mutate((s) => {
      const t = s.tasks.find((t) => t.id === id);
      if (!t || t.deleted || t.status !== "done")
        throw Error("完了したタスクだけアーカイブできます。");
      t.archived = archived;
      t.updatedAt = Math.max(Date.now(), t.updatedAt + 1);
    });
    toast(archived ? "タスクをアーカイブしました" : "タスクを元に戻しました");
    return true;
  } catch {
    return false;
  }
}
function renameColumns(focusId = "todo") {
  showModal(
    `<form class="simple-modal" id="columns-form"><header><h2>かんばんの列名を変更</h2><button type="button" class="icon-button" data-close aria-label="閉じる">${icon("close")}</button></header><p>状態の順番はそのまま、わかりやすい名前を付けられます。</p>${STATUSES.map((s) => `<label class="field">${s.label}の列名<input name="${s.id}" value="${esc(statusLabel(s.id))}" required maxlength="30"></label>`).join("")}<p class="form-error" role="alert"></p><footer><button type="button" class="button" data-close>キャンセル</button><button class="button primary" type="submit">列名を保存</button></footer></form>`,
    "center-modal",
  );
  modal
    .querySelectorAll("[data-close]")
    .forEach((b) => (b.onclick = closeModal));
  modal.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    if (STATUSES.some((s) => !data.get(s.id).trim())) {
      modal.querySelector(".form-error").textContent =
        "列名を入力してください。";
      return;
    }
    try {
      await mutate((s) => {
        s.columns = columns(s).map((c) => ({
          ...c,
          label: data.get(c.id).trim(),
          updatedAt: Math.max(Date.now(), c.updatedAt + 1),
        }));
      });
      closeModal();
      toast("列名を保存しました");
    } catch {}
  };
  modal.querySelector(`[name="${focusId}"]`).focus();
}
function bind() {
  bindSchedule();
  app
    .querySelectorAll("[data-rename-column]")
    .forEach((b) => (b.onclick = () => renameColumns(b.dataset.renameColumn)));
  app.querySelectorAll("[data-archive-task]").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        archiveTask(b.dataset.archiveTask, true);
      }),
  );
  app
    .querySelectorAll("[data-restore-task]")
    .forEach(
      (b) => (b.onclick = () => archiveTask(b.dataset.restoreTask, false)),
    );
  app.querySelectorAll("[data-action]").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.preventDefault();
        const a = b.dataset.action;
        if (a === "new") openTask();
        if (a === "settings") settings();
        if (a === "archive") {
          archiveMode = true;
          tag = "";
          statusFilter = "";
          navOpen = false;
          render();
        }
        if (a === "home") {
          navOpen = false;
          archiveMode = false;
          render();
        }
        if (a === "nav") {
          if (window.matchMedia("(max-width:760px)").matches)
            navOpen = !navOpen;
          else {
            sidebarHidden = !sidebarHidden;
            localStorage.setItem(
              "taskly-sidebar-hidden",
              String(sidebarHidden),
            );
          }
          render();
        }
        if (a === "today") {
          if (view === "gantt") resetTimeline(dateKey());
          calendarMonth = dateKey().slice(0, 7) + "-01";
          render();
        }
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
    .forEach(
      (b) =>
        (b.onclick = () =>
          openTask(b.dataset.open, "todo", "", b.dataset.focusCheck || "")),
    );
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
    if (status !== "done") t.archived = false;
    t.updatedAt = Math.max(Date.now(), t.updatedAt + 1);
  })
    .then(() => toast(`${statusLabel(status)}に変更しました`))
    .catch(() => {});
}
let backgroundScroll = 0,
  lastRenderedDay = dateKey();
function updateDialogViewport() {
  if (!modal.open) return;
  const viewport = window.visualViewport;
  modal.style.setProperty(
    "--dialog-height",
    (viewport?.height || window.innerHeight) + "px",
  );
  modal.style.setProperty("--dialog-top", (viewport?.offsetTop || 0) + "px");
}
window.visualViewport?.addEventListener("resize", updateDialogViewport);
window.visualViewport?.addEventListener("scroll", updateDialogViewport);
function showModal(html, cls = "") {
  backgroundScroll = window.scrollY;
  modal.className = cls;
  modal.innerHTML = html;
  modal.showModal();
  document.body.style.top = -backgroundScroll + "px";
  document.body.classList.add("modal-open");
  document.documentElement.classList.add("modal-open");
  updateDialogViewport();
}
function closeModal() {
  modal.close();
  modal.innerHTML = "";
  draft = null;
  dirty = false;
  document.body.classList.remove("modal-open");
  document.documentElement.classList.remove("modal-open");
  document.body.style.top = "";
  modal.style.removeProperty("--dialog-height");
  modal.style.removeProperty("--dialog-top");
  window.scrollTo(0, backgroundScroll);
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
function openTask(id, status = "todo", date = "", focusCheck = "") {
  const t = id
    ? state.tasks.find((t) => t.id === id)
    : newTask(state.projects[0].id);
  draft = structuredClone(t);
  if (!id) {
    draft.status = status;
    if (date) {
      draft.start = date;
      draft.due = date;
    }
  }
  dirty = false;
  showModal(
    `<form id="task-form"><header class="drawer-header"><span>${icon("list")}${id ? "タスクの詳細" : "新しいタスク"}</span><button type="button" class="icon-button" id="close-modal" aria-label="閉じる">${icon("close")}</button></header><div class="drawer-body"><label class="sr-only" for="task-title">タスク名</label><input id="task-title" class="title-input" placeholder="タスク名" maxlength="200" required value="${esc(draft.title)}"><div class="field"><label>ステータス</label><div class="status-options">${STATUSES.map((s) => `<button type="button" data-status="${s.id}" class="status-option ${s.id === draft.status ? "selected" : ""} ${s.id}">${statusIcon(s.id)}${esc(statusLabel(s.id))}</button>`).join("")}</div></div><label class="field">進行度<select id="task-progress">${PROGRESS.map((p) => `<option value="${p.id}" ${draft.progress === p.id ? "selected" : ""}>${p.label}</option>`).join("")}</select></label><div class="date-fields"><label class="field">開始日<input type="date" id="task-start" value="${draft.start}" max="9999-12-31"></label><label class="field">期限日<input type="date" id="task-due" value="${draft.due}" max="9999-12-31"></label></div><div class="field"><label for="tag-input">タグ <span>複数追加できます</span></label><div id="draft-tags" class="draft-tags"></div><div class="inline-add"><input id="tag-input" placeholder="タグを入力して Enter" maxlength="30" list="existing-tags"><button type="button" class="button small" id="add-tag">追加</button></div><datalist id="existing-tags">${[...new Set(activeTasks(state).flatMap((t) => t.tags))].map((t) => `<option value="${esc(t)}">`).join("")}</datalist></div><label class="field">メモ<textarea id="task-description" placeholder="補足を入力" maxlength="20000" rows="3">${esc(draft.description)}</textarea></label><div class="field"><label class="section-label">${icon("list")}チェックリスト <span id="check-count"></span></label><div id="draft-checklist"></div><div class="inline-add"><input id="check-input" placeholder="チェック項目を追加…" maxlength="300"><button type="button" class="icon-button bordered" id="add-check" aria-label="チェック項目を追加">${icon("plus")}</button></div></div><div class="field"><label class="section-label">${icon("image")}添付画像 <span>最大8枚・各10MBまで</span></label><div id="draft-images"></div><label class="upload-area">${icon("image")}<strong>画像を選択して添付</strong><span>JPEG・PNG・WebP / 自動で圧縮します</span><input type="file" id="image-input" accept="image/jpeg,image/png,image/webp" multiple></label></div><p id="form-error" class="form-error" role="alert"></p></div><footer class="drawer-footer">${id ? `<button type="button" class="icon-button danger" id="delete-task" aria-label="タスクを削除">${icon("trash")}</button>` : ""}${id ? `<button type="button" class="icon-button" id="archive-task" aria-label="${draft.archived ? "アーカイブから戻す" : "タスクをアーカイブ"}" title="${draft.archived ? "アーカイブから戻す" : "完了したタスクをアーカイブ"}" ${draft.status !== "done" ? "disabled" : ""}>${icon("archive")}</button>` : ""}<span class="save-hint">${id ? "変更後は保存してください" : ""}</span><button type="button" class="button" id="cancel-task">キャンセル</button><button type="submit" class="button primary" id="save-task">${id ? "変更を保存" : "タスクを作成"}</button></footer></form>`,
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
        if (id)
          modal.querySelector("#archive-task").disabled =
            draft.status !== "done";
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
    draft.checklist.push({ id: uid(), text, done: false, start: "", due: "" });
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
    draft.progress = modal.querySelector("#task-progress").value;
    if (draft.status !== "done") draft.archived = false;
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
    const invalidCheck = draft.checklist.find(
      (c) => !dateRangeValid(c.start, c.due),
    );
    if (invalidCheck) {
      error.textContent = `チェック項目「${invalidCheck.text}」の期限日は開始日以降にしてください。`;
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
  if (id)
    modal.querySelector("#archive-task").onclick = async () => {
      if (dirty) {
        toast("先に変更を保存してからアーカイブ操作を行ってください。");
        return;
      }
      if (await archiveTask(id, !draft.archived)) closeModal();
    };
  renderDraftTags();
  renderChecklist();
  renderImages();
  if (!id) modal.querySelector("#task-title").focus();
  else if (focusCheck) {
    const index = draft.checklist.findIndex((c) => c.id === focusCheck);
    const input = modal.querySelector(`[data-check-start="${index}"]`);
    if (input)
      requestAnimationFrame(() => {
        input.scrollIntoView({ block: "center" });
        input.focus({ preventScroll: true });
      });
  }
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
        `<div class="check-row ${c.done ? "checked" : ""}"><input type="checkbox" data-check="${i}" ${c.done ? "checked" : ""} aria-label="${esc(c.text)}を完了"><input class="check-text" data-check-text="${i}" value="${esc(c.text)}" maxlength="300" aria-label="チェック項目の内容"><button type="button" class="icon-button" data-remove-check="${i}" aria-label="チェック項目を削除">${icon("close")}</button></div><div class="check-dates"><label>開始日<input type="date" data-check-start="${i}" aria-label="${esc(c.text)}の開始日" value="${c.start || ""}" max="9999-12-31"></label><span>〜</span><label>期限日<input type="date" data-check-due="${i}" aria-label="${esc(c.text)}の期限日" value="${c.due || ""}" max="9999-12-31"></label></div>`,
    )
    .join("");
  for (const edge of ["start", "due"])
    modal.querySelectorAll(`[data-check-${edge}]`).forEach(
      (el) =>
        (el.oninput = () => {
          draft.checklist[
            Number(el.dataset[edge === "start" ? "checkStart" : "checkDue"])
          ][edge] = el.value;
          dirty = true;
        }),
    );
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
function settings() {
  const config = getConfig(),
    auth = getAuth();
  showModal(
    `<div class="simple-modal settings-modal"><header><div><p class="eyebrow">STAY CONNECTED</p><h2>設定・データ同期</h2></div><button class="icon-button" data-close aria-label="閉じる">${icon("close")}</button></header><div class="settings-scroll"><div class="local-banner">${icon("check")}<div><strong>オフラインでも、いつものように。</strong><p>タスクと画像はこの端末に保存されます。初回表示後はネットがなくても利用できます。</p></div></div><h3>${icon("cloud")}端末間の同期</h3><p>Windows・Chromebook・Android・iPadで、同じ公開URLとアカウントを使って共有できます。</p><p><a class="guide-link" href="https://github.com/fuj4022-code/taskmaker/blob/main/docs/SHARING.md" target="_blank" rel="noopener noreferrer">初心者向け・端末間共有ガイドを開く ↗</a></p><details><summary>はじめて接続する場合</summary><ol><li>自分のSupabaseプロジェクトを作り、リポジトリの <code>supabase.sql</code> をSQL Editorで実行します。</li><li>Email / Password認証を有効にし、下でProject URLと公開用キーを保存します。service_roleキーは使用しないでください。</li><li>アカウントを作成し、確認メールを開いてログインします。すべての端末で同じ設定を使ってください。</li></ol><p>タスク単位で最新の更新を採用します。同じタスクを同時編集した場合は後の変更が優先されます。端末の時計を自動設定にしてください。</p></details><form id="cloud-config"><label class="field">Project URL<input name="url" type="url" placeholder="https://your-project.supabase.co" value="${esc(config?.url || "")}" required></label><label class="field">Publishable key / anon key<input name="key" type="password" placeholder="公開用キー" value="${esc(config?.key || "")}" required autocomplete="off"></label><button class="button" type="submit">接続設定を保存</button></form>${auth ? `<div class="signed-in"><span>${icon("check")}${esc(auth.user?.email || "ログイン中")}</span><button class="button small" id="logout">ログアウト</button></div><button class="button primary" id="sync-now">${icon("cloud")}今すぐ同期</button><p class="settings-status" data-connection>${esc(connectionText())}</p>` : `<form id="login-form"><div class="divider"></div><label class="field">メールアドレス<input name="email" type="email" required autocomplete="email"></label><label class="field">パスワード<input name="password" type="password" minlength="8" required autocomplete="current-password"></label><div class="auth-actions"><button class="button primary" type="submit">ログイン</button><button class="button" type="button" id="signup">アカウントを作成</button></div></form>`}<p id="settings-error" class="form-error" role="status"></p><div class="divider"></div><h3>${icon("download")}バックアップ</h3><p>画像・チェックリストも含めてJSONファイルに保存します。ブラウザーのデータを消す前に書き出してください。</p><div class="backup-actions"><button class="button" id="export">${icon("download")}書き出す</button><label class="button">${icon("upload")}読み込む<input id="import-file" type="file" accept="application/json,.json" hidden></label></div><p class="fine-print">読み込みは既存データと統合します。画像を含むため、ファイルは大切に保管してください。</p><div class="divider"></div><h3>アプリとして使う</h3><p>HTTPSの公開先を開き、Chromeの「アプリをインストール」、iPadのSafariの「ホーム画面に追加」から利用できます。</p><button class="button" id="request-persist">端末内データの保持をリクエスト</button><p id="persist-result" class="fine-print"></p></div></div>`,
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
window.matchMedia("(max-width:760px)").addEventListener("change", () => {
  navOpen = false;
  render();
});
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
setInterval(() => {
  if (lastRenderedDay !== dateKey() && !modal.open && !activeResize) {
    lastRenderedDay = dateKey();
    render();
  }
}, 60000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    if (!modal.open && !activeResize) render();
    synchronize(true);
  }
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
