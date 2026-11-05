import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  autoArchiveCompleted,
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
  assert.equal(activeTasks(c).length, 4);
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
  assert.equal(activeTasks(c).length, 5);
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

test("continuous timeline preserves the visible date when its bounded runway shifts", async () => {
  const { timelineRunway, timelineFrom, dateAtOffset, TIMELINE_BUFFER } =
    await import("../src/schedule.js");
  const weekly = timelineRunway("2026-11-05", "week");
  assert.equal(weekly.columns.length, 180);
  assert.equal(new Date(weekly.start + "T12:00:00").getDay(), 1);
  assert.equal(dateAtOffset(weekly, TIMELINE_BUFFER * 84, 84), "2026-11-02");
  const shifted = timelineFrom(addDays(weekly.start, 60 * 7), "week");
  const offset = 150 * 84;
  assert.equal(
    dateAtOffset(weekly, offset, 84),
    dateAtOffset(shifted, offset - 60 * 84, 84),
  );
  const daily = timelineRunway("2028-02-29", "day");
  assert.equal(dateAtOffset(daily, TIMELINE_BUFFER * 40, 40), "2028-02-29");
  assert.equal(daily.columns.length, 180);
});
test("weekly geometry keeps day-level positions and clips long ranges", async () => {
  const { timelineFrom, ganttBar } = await import("../src/schedule.js");
  const w = timelineFrom("2026-10-26", "week");
  const bar = ganttBar("2026-11-02", "2026-11-15", w, 84);
  assert.equal(bar.left, 86);
  assert.equal(bar.width, 164);
  assert.ok(bar.visible);
  const clipped = ganttBar("2026-01-01", "2035-12-01", w, 84);
  assert.equal(clipped.hasStart, false);
  assert.equal(clipped.hasEnd, false);
  assert.equal(clipped.width, w.columns.length * 84 - 4);
  assert.equal(ganttBar("2040-02-01", "2040-02-02", w, 84).visible, false);
});
test("deadline highlighting uses inclusive three-day threshold and excludes completed tasks", async () => {
  const { deadlineState, deadlineLabel } = await import("../src/schedule.js");
  const t = { status: "todo", due: "2026-11-08" };
  assert.equal(deadlineState(t, "2026-11-05"), "soon");
  assert.equal(deadlineState(t, "2026-11-04"), "");
  assert.equal(deadlineState(t, "2026-11-09"), "overdue");
  assert.equal(deadlineState({ ...t, status: "done" }, "2026-11-09"), "");
  assert.equal(deadlineState({ ...t, archived: true }, "2026-11-09"), "");
  assert.equal(deadlineLabel(t, "2026-11-08"), "今日が期限");
  assert.equal(deadlineState({ ...t, due: "" }, "2026-11-05"), "");
});
test("calendar packs overlapping ranges into separate lanes with week continuations", async () => {
  const { calendarWeeks } = await import("../src/schedule.js");
  const tasks = [
    { id: "a", start: "2026-11-02", due: "2026-11-05" },
    { id: "b", start: "2026-11-04", due: "2026-11-10" },
    { id: "c", start: "", due: "2026-11-06" },
    { id: "none", start: "", due: "" },
  ];
  const weeks = calendarWeeks(tasks, "2026-11-01"),
    first = weeks.find((w) => w.days[0] === "2026-11-02"),
    second = weeks.find((w) => w.days[0] === "2026-11-09");
  assert.equal(first.segments.length, 3);
  assert.equal(first.segments.find((s) => s.task.id === "a").span, 4);
  assert.notEqual(
    first.segments.find((s) => s.task.id === "a").lane,
    first.segments.find((s) => s.task.id === "b").lane,
  );
  assert.equal(
    first.segments.find((s) => s.task.id === "c").lane,
    first.segments.find((s) => s.task.id === "a").lane,
  );
  assert.equal(first.segments.find((s) => s.task.id === "b").after, true);
  assert.equal(second.segments.find((s) => s.task.id === "b").before, true);
  assert.equal(second.segments.find((s) => s.task.id === "b").span, 2);
});

test("completion automatically archives legacy data without changing task content or timestamps", () => {
  const old = initialState(),
    task = old.tasks[4];
  task.archived = false;
  task.images = [
    { id: "im", name: "example.png", data: "data:image/png;base64,YWJj" },
  ];
  const before = structuredClone(task),
    next = normalize(old);
  assert.equal(next.tasks[4].archived, true);
  assert.equal(next.tasks[4].status, "done");
  assert.equal(next.tasks[4].updatedAt, before.updatedAt);
  assert.deepEqual(next.tasks[4].images, before.images);
  assert.deepEqual(next.tasks[4].checklist, before.checklist);
  assert.equal(old.tasks[4].archived, false);
});
test("new completions archive and an explicit status change can reopen without stale resurrection", () => {
  const old = initialState();
  old.tasks[0].status = "done";
  old.tasks[0].updatedAt = 20;
  autoArchiveCompleted(old);
  assert.equal(old.tasks[0].archived, true);
  const resumed = structuredClone(old);
  resumed.tasks[0].status = "todo";
  resumed.tasks[0].archived = false;
  resumed.tasks[0].updatedAt = 30;
  const result = merge(old, resumed);
  assert.equal(result.tasks[0].status, "todo");
  assert.equal(result.tasks[0].archived, false);
  assert.equal(
    activeTasks(result).some((t) => t.id === result.tasks[0].id),
    true,
  );
});
test("Gantt groups pending periods above and undated items below, excluding completed checklist entries", async () => {
  const { ganttPlan } = await import("../src/schedule.js");
  const t = initialState().tasks[0];
  t.start = "";
  t.due = "";
  t.checklist = [
    {
      id: "dated",
      text: "Dated",
      done: false,
      start: "2026-11-01",
      due: "2026-11-02",
    },
    { id: "undated", text: "Undated", done: false, start: "", due: "" },
    {
      id: "done",
      text: "Done",
      done: true,
      start: "2026-11-01",
      due: "2026-11-02",
    },
  ];
  const plan = ganttPlan([t]);
  assert.equal(plan.scheduled.length, 1);
  assert.equal(plan.scheduled[0].own, false);
  assert.deepEqual(
    plan.scheduled[0].checks.map((c) => c.id),
    ["dated"],
  );
  assert.deepEqual(
    plan.unscheduled[0].checks.map((c) => c.id),
    ["undated"],
  );
  assert.equal(plan.unscheduled[0].own, true);
  const closed = ganttPlan([t], () => false);
  assert.equal(closed.scheduled[0].checks.length, 0);
  assert.equal(closed.unscheduled[0].checks.length, 0);
  assert.equal(t.checklist.length, 3);
});
