import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  normalize,
  columns,
  resizeRange,
  calendarDays,
  occursOn,
  validState,
  merge,
  newTask,
  activeTasks,
  addDays,
  dayDiff,
} from "../src/model.js";
test("starter data has stable identities across devices and validates", () => {
  const a = initialState(),
    b = initialState();
  assert.ok(validState(a));
  assert.deepEqual(
    a.projects.map((p) => p.id),
    b.projects.map((p) => p.id),
  );
  assert.equal(merge(a, b).tasks.length, 7);
});
test("task changes and checklist/image data merge without overwriting independent tasks", () => {
  const a = initialState(),
    b = structuredClone(a);
  a.tasks[0].title = "編集したタスク";
  a.tasks[0].updatedAt = 100;
  b.tasks[1].checklist[0].done = false;
  b.tasks[1].images = [
    { id: "image", name: "test.png", data: "data:image/png;base64,YWJj" },
  ];
  b.tasks[1].updatedAt = 200;
  const c = merge(a, b);
  assert.equal(c.tasks[0].title, "編集したタスク");
  assert.equal(c.tasks[1].images.length, 1);
  assert.equal(c.tasks[1].checklist[0].done, false);
});
test("deletion tombstones prevent old device and backup resurrection", () => {
  const old = initialState(),
    next = structuredClone(old);
  next.tasks[0].deleted = true;
  next.tasks[0].updatedAt = 100;
  const c = merge(next, old);
  assert.equal(activeTasks(c).length, 6);
  assert.equal(c.tasks[0].deleted, true);
});
test("equal timestamp merging is deterministic in either order", () => {
  const a = initialState(),
    b = structuredClone(a);
  b.tasks[0].title = "Other";
  assert.deepEqual(merge(a, b), merge(b, a));
});
test("new task schema supports multiple tags, dates and checklists", () => {
  const s = initialState(),
    t = newTask(s.projects[0].id);
  t.title = "New";
  t.tags = ["仕事", "家庭"];
  t.checklist = [{ id: "c", text: "first", done: false }];
  s.tasks.push(t);
  assert.ok(validState(s));
});
test("invalid backups reject scripts, invalid ranges, duplicate IDs and unknown projects", () => {
  for (const change of [
    (s) =>
      (s.tasks[0].images = [
        { id: "i", name: "x", data: "data:image/svg+xml;base64,YWJj" },
      ]),
    (s) => (s.tasks[0].start = "2026-02-30"),
    (s) => {
      s.tasks[0].start = "2026-11-10";
      s.tasks[0].due = "2026-11-01";
    },
    (s) => s.tasks.push(s.tasks[0]),
    (s) => (s.tasks[0].projectId = "unknown"),
    (s) => (s.tasks[0].status = "maybe"),
  ]) {
    const s = initialState();
    change(s);
    assert.equal(validState(s), false);
  }
});
test("calendar arithmetic crosses months and years", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(dayDiff("2026-11-01", "2026-11-08"), 7);
});
test("old schema 2 documents migrate dates, progress and archive without changing task IDs", () => {
  const old = initialState();
  delete old.columns;
  for (const t of old.tasks) {
    delete t.archived;
    delete t.progress;
    for (const c of t.checklist) {
      delete c.start;
      delete c.due;
    }
  }
  assert.ok(validState(old));
  const next = normalize(old);
  assert.equal(next.schema, 2);
  assert.deepEqual(
    next.tasks.map((t) => t.id),
    old.tasks.map((t) => t.id),
  );
  assert.equal(next.tasks[0].progress, "ontrack");
  assert.equal(next.tasks[0].archived, false);
  assert.equal(next.tasks[0].checklist[0].start, "");
  assert.equal(columns(next).length, 3);
  assert.equal(old.tasks[0].progress, undefined);
});
test("columns, archive, progress and checklist periods survive cross-device merge", () => {
  const a = initialState(),
    b = initialState();
  a.columns[0].label = "これから";
  a.columns[0].updatedAt = 10;
  b.tasks[0].checklist[0].start = "2026-11-01";
  b.tasks[0].checklist[0].due = "2026-11-03";
  b.tasks[0].progress = "behind";
  b.tasks[0].updatedAt = 20;
  b.tasks[4].archived = true;
  b.tasks[4].updatedAt = 30;
  const c = merge(a, b);
  assert.equal(c.columns[0].label, "これから");
  assert.equal(c.tasks[0].checklist[0].due, "2026-11-03");
  assert.equal(c.tasks[0].progress, "behind");
  assert.equal(activeTasks(c).length, 6);
  assert.equal(activeTasks(c, { includeArchived: true }).length, 7);
  assert.equal(merge(c, initialState()).tasks[4].archived, true);
});
test("invalid new fields are rejected without allowing malformed backups", () => {
  for (const update of [
    (s) =>
      (s.tasks[0].checklist[0] = {
        ...s.tasks[0].checklist[0],
        start: "2026-11-05",
        due: "2026-11-01",
      }),
    (s) => (s.tasks[0].archived = true),
    (s) => (s.tasks[0].progress = "late"),
    (s) => (s.columns[0].label = " "),
    (s) => s.columns.push(s.columns[0]),
  ]) {
    const s = initialState();
    update(s);
    assert.equal(validState(s), false);
  }
});
test("resize clamps at the other edge, handles single-ended dates and crosses months", () => {
  assert.deepEqual(resizeRange("2026-11-02", "2026-11-05", "start", 20), {
    start: "2026-11-05",
    due: "2026-11-05",
  });
  assert.deepEqual(resizeRange("2026-11-02", "2026-11-05", "due", -20), {
    start: "2026-11-02",
    due: "2026-11-02",
  });
  assert.deepEqual(resizeRange("", "2026-11-30", "due", 1), {
    start: "2026-11-30",
    due: "2026-12-01",
  });
  assert.deepEqual(resizeRange("2026-11-01", "", "start", -1), {
    start: "2026-10-31",
    due: "2026-11-01",
  });
});
test("calendar uses Monday-start 42-day grids and includes all days of a task range", () => {
  const days = calendarDays("2026-11-01");
  assert.equal(days.length, 42);
  assert.equal(days[0], "2026-10-26");
  assert.equal(days[41], "2026-12-06");
  assert.equal(
    occursOn({ start: "2026-10-31", due: "2026-11-02" }, "2026-11-01"),
    true,
  );
  assert.equal(occursOn({ start: "", due: "2026-11-02" }, "2026-11-02"), true);
  assert.equal(occursOn({ start: "", due: "" }, "2026-11-02"), false);
  assert.equal(
    occursOn({ start: "2026-10-31", due: "2026-11-02" }, "2026-11-03"),
    false,
  );
});
