import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
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
