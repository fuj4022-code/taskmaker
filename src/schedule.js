import { addDays, dateKey, dayDiff, calendarDays } from "./model.js";

export function addMonths(month, amount) {
  const d = new Date(month.slice(0, 7) + "-01T12:00:00");
  d.setMonth(d.getMonth() + amount);
  return dateKey(d);
}
export function ganttWindow(anchor, months = 3, unit = "week") {
  const first = anchor.slice(0, 7) + "-01",
    last = addDays(addMonths(first, months), -1);
  const daysPerColumn = unit === "week" ? 7 : 1;
  const start =
    unit === "week"
      ? addDays(first, -(new Date(first + "T12:00:00").getDay() + 6) % 7)
      : first;
  const dayCount =
    Math.ceil((dayDiff(start, last) + 1) / daysPerColumn) * daysPerColumn;
  return {
    start,
    end: addDays(start, dayCount - 1),
    dayCount,
    daysPerColumn,
    columns: Array.from({ length: dayCount / daysPerColumn }, (_, i) =>
      addDays(start, i * daysPerColumn),
    ),
  };
}
export function ganttBar(start, end, window, columnWidth) {
  const first = dayDiff(window.start, start),
    last = dayDiff(window.start, end),
    pixels = columnWidth / window.daysPerColumn;
  return {
    left: Math.max(0, first) * pixels + 2,
    width: Math.max(
      22,
      (Math.min(window.dayCount - 1, last) - Math.max(0, first) + 1) * pixels -
        4,
    ),
    visible: last >= 0 && first < window.dayCount,
    hasStart: first >= 0,
    hasEnd: last < window.dayCount,
  };
}
export function deadlineState(task, today = dateKey()) {
  if (task.status === "done" || task.deleted || task.archived || !task.due)
    return "";
  const remaining = dayDiff(today, task.due);
  return remaining < 0 ? "overdue" : remaining <= 3 ? "soon" : "";
}
export function deadlineLabel(task, today = dateKey()) {
  const state = deadlineState(task, today);
  if (!state) return "";
  const remaining = dayDiff(today, task.due);
  return state === "overdue"
    ? `期限超過 ${-remaining}日`
    : remaining === 0
      ? "今日が期限"
      : `期限まで${remaining}日`;
}
// A task occupies one continuous segment per calendar week. Overlapping ranges
// get separate lanes; week-boundary continuations retain the original task ID.
export function calendarWeeks(tasks, month) {
  const days = calendarDays(month);
  return Array.from({ length: 6 }, (_, week) => {
    const dates = days.slice(week * 7, week * 7 + 7),
      start = dates[0],
      end = dates[6];
    const segments = tasks
      .filter(
        (t) =>
          (t.start || t.due) &&
          (t.start || t.due) <= end &&
          (t.due || t.start) >= start,
      )
      .map((t) => {
        const first = t.start || t.due,
          last = t.due || t.start;
        const col = Math.max(0, dayDiff(start, first)),
          lastCol = Math.min(6, dayDiff(start, last));
        return {
          task: t,
          col,
          span: lastCol - col + 1,
          before: first < start,
          after: last > end,
        };
      })
      .sort(
        (a, b) =>
          a.col - b.col ||
          b.span - a.span ||
          a.task.id.localeCompare(b.task.id),
      );
    const lanes = [];
    for (const s of segments) {
      let lane = lanes.findIndex((end) => end < s.col);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = s.col + s.span - 1;
      s.lane = lane;
    }
    return { days: dates, segments, laneCount: lanes.length };
  });
}
