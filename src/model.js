export const STATUSES = [
  { id: "todo", label: "未着手", color: "#8390a2" },
  { id: "doing", label: "進行中", color: "#d7a447" },
  { id: "done", label: "完了", color: "#499484" },
];
export const COLORS = ["#4d8b78", "#657bb5", "#b382a8", "#cb9562", "#7e85ae"];
export const uid = () => crypto.randomUUID();
export function dateKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(date, n) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
export function dayDiff(a, b) {
  return Math.round(
    (Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000,
  );
}
export function initialState() {
  const now = 1,
    today = dateKey(),
    id = "project-demo-website";
  const projects = [
    { id, name: "Webサイトリニューアル", color: COLORS[0], updatedAt: now },
    {
      id: "project-demo-daily",
      name: "日々のタスク",
      color: COLORS[1],
      updatedAt: now,
    },
  ];
  const samples = [
    [
      "リサーチをまとめる",
      "todo",
      -2,
      2,
      ["リサーチ", "企画"],
      ["競合サイトを調べる", "ユーザーの声を整理する", "インサイトをまとめる"],
      1,
      "まずは目的とユーザーの課題を整理。気づいたことをここに残しましょう。",
    ],
    [
      "トップページのデザイン",
      "doing",
      -1,
      5,
      ["デザイン"],
      ["ワイヤーフレームを作る", "デザインを作る", "レビューを依頼する"],
      1,
      "心地よく、迷わず使えるトップページを目指します。",
    ],
    [
      "コンテンツの構成を考える",
      "todo",
      1,
      6,
      ["企画", "コンテンツ"],
      ["必要なページを洗い出す", "サイトマップを作る"],
      0,
      "伝えたいことの優先順位を考えましょう。",
    ],
    [
      "コンポーネントの整理",
      "doing",
      -3,
      3,
      ["デザイン", "開発"],
      [
        "ボタンのルールを整理",
        "フォームのパターンを整理",
        "スタイルガイドにまとめる",
      ],
      2,
      "再利用できるパーツを、少しずつ揃えていきます。",
    ],
    [
      "プロジェクトのキックオフ",
      "done",
      -5,
      -3,
      ["企画"],
      ["ゴールを決める", "スケジュールを共有する"],
      2,
      "新しいプロジェクトがスタートしました。",
    ],
    [
      "公開前チェックリストを作る",
      "todo",
      5,
      10,
      ["開発"],
      [],
      0,
      "表示・操作・アクセシビリティを確認します。",
    ],
    [
      "参考サイトを集める",
      "done",
      -4,
      -1,
      ["リサーチ", "デザイン"],
      [],
      0,
      "好きな表現や使いやすい構成を集めました。",
    ],
  ];
  return {
    schema: 2,
    projects,
    tasks: samples.map(
      (
        [title, status, start, due, tags, items, checked, description],
        sampleIndex,
      ) => ({
        id: "task-demo-" + sampleIndex,
        projectId: id,
        title,
        status,
        start: addDays(today, start),
        due: addDays(today, due),
        tags,
        description,
        checklist: items.map((text, i) => ({
          id: "check-demo-" + sampleIndex + "-" + i,
          text,
          done: i < checked,
        })),
        images: [],
        createdAt: now,
        updatedAt: now,
        deleted: false,
      }),
    ),
  };
}
export const activeTasks = (s) => s.tasks.filter((t) => !t.deleted);
const isDate = (s) =>
  s === "" ||
  (typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !isNaN(Date.parse(s + "T12:00:00")) &&
    dateKey(new Date(s + "T12:00:00")) === s);
const validId = (s) =>
  typeof s === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(s);
const str = (s, n) => typeof s === "string" && s.length <= n;
export function validState(s) {
  if (
    !s ||
    s.schema !== 2 ||
    !Array.isArray(s.projects) ||
    !Array.isArray(s.tasks) ||
    s.tasks.length > 10000 ||
    s.projects.length > 200
  )
    return false;
  const projectIds = new Set(),
    taskIds = new Set();
  for (const p of s.projects) {
    if (
      !validId(p.id) ||
      projectIds.has(p.id) ||
      !str(p.name, 100) ||
      !p.name.trim() ||
      !/^#[a-fA-F0-9]{6}$/.test(p.color) ||
      !Number.isFinite(p.updatedAt)
    )
      return false;
    projectIds.add(p.id);
  }
  for (const t of s.tasks) {
    if (
      !validId(t.id) ||
      taskIds.has(t.id) ||
      !projectIds.has(t.projectId) ||
      !str(t.title, 200) ||
      !t.title.trim() ||
      !STATUSES.some((x) => x.id === t.status) ||
      !str(t.description, 20000) ||
      !isDate(t.start) ||
      !isDate(t.due) ||
      (t.start && t.due && t.start > t.due) ||
      !Number.isFinite(t.updatedAt) ||
      !Number.isFinite(t.createdAt) ||
      typeof t.deleted !== "boolean" ||
      !Array.isArray(t.tags) ||
      t.tags.length > 20 ||
      !t.tags.every((x) => str(x, 30) && x.trim()) ||
      !Array.isArray(t.checklist) ||
      t.checklist.length > 100 ||
      !t.checklist.every(
        (x) =>
          x && validId(x.id) && str(x.text, 300) && typeof x.done === "boolean",
      ) ||
      !Array.isArray(t.images) ||
      t.images.length > 8 ||
      !t.images.every(
        (x) =>
          x &&
          validId(x.id) &&
          str(x.name, 200) &&
          str(x.data, 2500000) &&
          /^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(x.data),
      )
    )
      return false;
    taskIds.add(t.id);
  }
  return true;
}
// Same-task concurrent edits use the latest timestamp; deletions remain as tombstones.
export function merge(a, b) {
  if (!validState(a) || !validState(b))
    throw Error("データ形式が正しくありません。");
  const combine = (xs, ys) => {
    const m = new Map();
    for (const v of [...xs, ...ys]) {
      const old = m.get(v.id);
      if (
        !old ||
        v.updatedAt > old.updatedAt ||
        (v.updatedAt === old.updatedAt &&
          JSON.stringify(v) > JSON.stringify(old))
      )
        m.set(v.id, structuredClone(v));
    }
    return [...m.values()];
  };
  const result = {
    schema: 2,
    projects: combine(a.projects, b.projects),
    tasks: combine(a.tasks, b.tasks),
  };
  if (!validState(result)) throw Error("統合後のデータが上限を超えています。");
  return result;
}
export function newTask(projectId) {
  const now = Date.now();
  return {
    id: uid(),
    projectId,
    title: "",
    description: "",
    status: "todo",
    start: dateKey(),
    due: "",
    tags: [],
    checklist: [],
    images: [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };
}
