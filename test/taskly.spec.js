import { test, expect } from "@playwright/test";
import { initialState, normalize, addDays, dateKey } from "../src/model.js";
import {
  timelineFrom,
  dateAtOffset,
  TIMELINE_COLUMNS,
} from "../src/schedule.js";
async function start(page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "すべてのタスク", exact: true }),
  ).toBeVisible();
}
async function create(page, title = "テストタスク") {
  await page
    .getByRole("button", { name: "タスクを追加", exact: true })
    .first()
    .click();
  await page.getByLabel("タスク名", { exact: true }).fill(title);
}
async function settings(page) {
  await page.getByRole("button", { name: "同期と設定", exact: true }).click();
}
async function open(page, title) {
  await page
    .locator(".task-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .click();
}
test("create, edit, checklist, multiple tags and persistence", async ({
  page,
}) => {
  await start(page);
  await create(page);
  await page.getByPlaceholder("タグを入力して Enter").fill("仕事");
  await page.getByPlaceholder("タグを入力して Enter").press("Enter");
  await page.getByPlaceholder("タグを入力して Enter").fill("重要");
  await page.getByPlaceholder("タグを入力して Enter").press("Enter");
  await page.getByPlaceholder("チェック項目を追加…").fill("資料を準備");
  await page.getByPlaceholder("チェック項目を追加…").press("Enter");
  await page.getByLabel("資料を準備を完了").check();
  await page.getByLabel("開始日", { exact: true }).fill("2026-11-01");
  await page.getByLabel("期限日", { exact: true }).fill("2026-11-15");
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  const card = page.locator(".task-card").filter({ hasText: "テストタスク" });
  await expect(card).toContainText("仕事");
  await expect(card).toContainText("重要");
  await expect(card).toContainText("1/1");
  await page.reload();
  await open(page, "テストタスク");
  await expect(page.getByLabel("資料を準備を完了")).toBeChecked();
  await page.getByLabel("タスク名", { exact: true }).fill("更新したタスク");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(
    page.getByRole("heading", { name: "更新したタスク" }),
  ).toBeVisible();
});
test("one tap cycles status and board drop changes status", async ({
  page,
}, info) => {
  await start(page);
  await create(page, "状態を変える");
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await page
    .getByRole("button", { name: "状態を変える：未着手。次の状態へ変更" })
    .click();
  await expect(page.locator('[data-column="doing"]')).toContainText(
    "状態を変える",
  );
  await page
    .getByRole("button", { name: "状態を変える：進行中。次の状態へ変更" })
    .click();
  await showRetained(page);
  await expect(page.locator('[data-column="done"]')).toContainText(
    "状態を変える",
  );
  await page
    .getByRole("button", { name: "状態を変える：完了。次の状態へ変更" })
    .click();
  await expect(page.locator('[data-column="todo"]')).toContainText(
    "状態を変える",
  );
  if (info.project.name === "desktop") {
    const transfer = await page.evaluateHandle(() => new DataTransfer());
    await page
      .locator(".task-card")
      .filter({ hasText: "状態を変える" })
      .dispatchEvent("dragstart", { dataTransfer: transfer });
    await page
      .locator('[data-column="doing"]')
      .dispatchEvent("drop", { dataTransfer: transfer });
    await expect(page.locator('[data-column="doing"]')).toContainText(
      "状態を変える",
    );
  }
});
test("gantt shares dates and task edits with kanban, filters and navigates", async ({
  page,
}) => {
  await start(page);
  await create(page, "ガントの予定");
  const today = new Date().toLocaleDateString("sv-SE");
  await page.getByLabel("開始日", { exact: true }).fill(today);
  await page.getByLabel("期限日", { exact: true }).fill(today);
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await openGantt(page);
  const bar = page.locator(".gantt-bar").filter({ hasText: "ガントの予定" });
  await expect(bar).toBeVisible();
  await bar.click();
  await page.locator('[data-status="done"]').click();
  await page.getByRole("button", { name: "変更を保存" }).click();
  await showRetained(page);
  await expect(
    page.locator(".gantt-bar.done").filter({ hasText: "ガントの予定" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "次の期間" }).click();
  await expect(
    page.locator(".gantt-task").filter({ hasText: "ガントの予定" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await page.getByRole("tab", { name: "かんばん" }).click();
  await expect(page.locator('[data-column="done"]')).toContainText(
    "ガントの予定",
  );
  await page
    .getByRole("textbox", { name: "タスクを検索" })
    .fill("ガントの予定");
  await expect(page.locator(".task-card")).toHaveCount(1);
});
test("date validation keeps draft and does not partially save", async ({
  page,
}) => {
  await start(page);
  await create(page, "日付の検証");
  await page.getByLabel("開始日", { exact: true }).fill("2026-11-20");
  await page.getByLabel("期限日", { exact: true }).fill("2026-11-01");
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("期限日は開始日以降");
  await expect(page.locator("#modal")).toBeVisible();
  await page.getByLabel("期限日", { exact: true }).fill("2026-11-21");
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await expect(page.getByRole("heading", { name: "日付の検証" })).toBeVisible();
});
test("tasks from every former project remain visible and tags filter the unified list", async ({
  page,
}) => {
  const legacy = initialState();
  legacy.tasks = legacy.tasks.slice(0, 2);
  legacy.tasks[0].title = "以前の分類A";
  legacy.tasks[1].title = "以前の分類B";
  legacy.tasks[1].projectId = legacy.projects[1].id;
  await seedState(page, legacy);
  await start(page);
  await expect(
    page.getByRole("heading", { name: "以前の分類A", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "以前の分類B", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新しいプロジェクト", exact: true }),
  ).toHaveCount(0);
  await create(page, "宿泊を予約");
  await expect(page.locator("#task-project")).toHaveCount(0);
  await page.getByPlaceholder("タグを入力して Enter").fill("旅行");
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await expect(page.locator(".task-card")).toHaveCount(3);
  await page.getByRole("button", { name: "旅行", exact: true }).click();
  await expect(page.locator(".task-card")).toHaveCount(1);
  await page.getByRole("button", { name: "すべて", exact: true }).click();
  await expect(page.locator(".task-card")).toHaveCount(3);
  await page.reload();
  await expect(page.locator(".task-card")).toHaveCount(3);
});
test("image attachment persists offline and app reopens from cache", async ({
  page,
  context,
}) => {
  await start(page);
  await create(page, "画像のタスク");
  await page.locator("#image-input").setInputFiles({
    name: "picture.png",
    mimeType: "image/png",
    buffer: await page.screenshot({
      clip: { x: 0, y: 0, width: 120, height: 120 },
    }),
  });
  await expect(page.locator(".image-preview img")).toBeVisible();
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "画像のタスク" }),
  ).toBeVisible();
  await open(page, "画像のタスク");
  await expect(page.locator(".image-preview img")).toBeVisible();
  await page.getByLabel("タスク名", { exact: true }).fill("オフラインで編集");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(
    page.getByRole("heading", { name: "オフラインで編集" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "オフラインで編集" }),
  ).toBeVisible();
  await context.setOffline(false);
});
test("backup export/import and invalid backup rejection", async ({ page }) => {
  await start(page);
  await settings(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "書き出す", exact: true }).click();
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/^taskly-backup/);
  const path = await d.path();
  await page.locator("#import-file").setInputFiles(path);
  await expect(page.locator("#toast")).toContainText("統合しました");
  await page.locator("#import-file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schema":1}'),
  });
  await expect(page.locator("#settings-error")).toContainText("データ形式");
});
test("deletion survives reload", async ({ page }) => {
  await start(page);
  await create(page, "削除するタスク");
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await open(page, "削除するタスク");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "タスクを削除" }).click();
  await expect(
    page.getByRole("heading", { name: "削除するタスク" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "削除するタスク" }),
  ).toHaveCount(0);
});
test("viewport has no horizontal overflow, board and gantt scroll internally", async ({
  page,
}) => {
  await start(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `/tmp/taskly-${test.info().project.name}.png`,
    fullPage: true,
  });
  await openGantt(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("sync merges cloud changes and retries version conflict without losing local tasks", async ({
  page,
}) => {
  let patches = 0;
  let payload;
  await page.route("https://taskly-test.supabase.co/**", async (route) => {
    const req = route.request(),
      url = req.url();
    if (url.includes("/auth/"))
      return route.fulfill({
        json: {
          access_token: "test-access",
          refresh_token: "refresh",
          expires_in: 3600,
          user: { id: "test-user", email: "test@example.com" },
        },
      });
    if (req.method() === "GET") {
      if (!payload) {
        payload = await page.evaluate(async () => {
          const db = await new Promise((r) => {
            const q = indexedDB.open("taskly-data", 1);
            q.onsuccess = () => r(q.result);
          });
          return await new Promise((r) => {
            const q = db
              .transaction("documents")
              .objectStore("documents")
              .get("workspace");
            q.onsuccess = () => r(q.result);
          });
        });
        const cloudTask = payload.tasks.find((t) => t.id === "task-demo-0");
        cloudTask.title = "クラウドからの更新";
        cloudTask.updatedAt = Date.now() + 100;
      }
      return route.fulfill({ json: [{ payload, version: patches + 1 }] });
    }
    if (req.method() === "PATCH") {
      patches++;
      if (patches === 1) return route.fulfill({ json: [] });
      payload = req.postDataJSON().payload;
      return route.fulfill({ json: [{ payload, version: patches + 1 }] });
    }
    return route.fulfill({ json: [] });
  });
  await start(page);
  await create(page, "端末で作ったタスク");
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await settings(page);
  await page
    .getByLabel("Project URL", { exact: true })
    .fill("https://taskly-test.supabase.co");
  await page
    .getByLabel("Publishable key / anon key", { exact: true })
    .fill("public-test-key");
  await page.getByRole("button", { name: "接続設定を保存" }).click();
  await page
    .getByLabel("メールアドレス", { exact: true })
    .fill("test@example.com");
  await page.getByLabel("パスワード", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("同期しました");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "クラウドからの更新" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "端末で作ったタスク" }),
  ).toBeVisible();
  expect(patches).toBeGreaterThanOrEqual(2);
});

test("two independent devices share tasks and status through the sync API", async ({
  page,
  browser,
}) => {
  let doc = null;
  async function api(route) {
    const r = route.request(),
      url = new URL(r.url());
    if (url.pathname.startsWith("/auth/"))
      return route.fulfill({
        json: {
          access_token: "test",
          refresh_token: "refresh",
          expires_in: 3600,
          user: { id: "same-user", email: "owner@example.com" },
        },
      });
    if (r.method() === "GET") return route.fulfill({ json: doc ? [doc] : [] });
    const body = r.postDataJSON();
    if (r.method() === "POST") {
      if (doc) return route.fulfill({ json: [] });
      doc = { payload: body.payload, version: 1 };
      return route.fulfill({ json: [doc] });
    }
    if (r.method() === "PATCH") {
      if (url.searchParams.get("version") !== `eq.${doc.version}`)
        return route.fulfill({ json: [] });
      doc = { payload: body.payload, version: body.version };
      return route.fulfill({ json: [doc] });
    }
    return route.fulfill({ json: [] });
  }
  async function connect(p) {
    await settings(p);
    await p
      .getByLabel("Project URL", { exact: true })
      .fill("https://taskly-test.supabase.co");
    await p
      .getByLabel("Publishable key / anon key", { exact: true })
      .fill("public-key");
    await p.getByRole("button", { name: "接続設定を保存" }).click();
    await p
      .getByLabel("メールアドレス", { exact: true })
      .fill("owner@example.com");
    await p.getByLabel("パスワード", { exact: true }).fill("password123");
    await p.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(p.locator("#toast")).toContainText("同期しました");
  }
  await page.route("https://taskly-test.supabase.co/**", api);
  await start(page);
  await create(page, "端末をまたぐタスク");
  await page.getByPlaceholder("チェック項目を追加…").fill("同期する小項目");
  await page.getByPlaceholder("チェック項目を追加…").press("Enter");
  await page
    .getByLabel("同期する小項目の開始日", { exact: true })
    .fill(dateKey());
  await page
    .getByLabel("同期する小項目の期限日", { exact: true })
    .fill(addDays(dateKey(), 2));
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "端末をまたぐタスク" }),
  ).toBeVisible();
  await connect(page);
  const ctx = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    viewport: { width: 768, height: 1024 },
    hasTouch: true,
  });
  try {
    await ctx.route("https://taskly-test.supabase.co/**", api);
    const second = await ctx.newPage();
    await start(second);
    await connect(second);
    await second.getByRole("button", { name: "閉じる", exact: true }).click();
    await open(second, "端末をまたぐタスク");
    await expect(
      second.getByLabel("同期する小項目の期限日", { exact: true }),
    ).toHaveValue(addDays(dateKey(), 2));
    await second.locator("#task-progress").selectOption("ahead");
    await second.locator('[data-status="done"]').click();
    await second.getByRole("button", { name: "変更を保存" }).click();
    await expect(
      second.getByRole("heading", { name: "端末をまたぐタスク", exact: true }),
    ).toHaveCount(0);
    await settings(second);
    await second
      .getByRole("button", { name: "今すぐ同期", exact: true })
      .click();
    await expect
      .poll(
        () =>
          doc.payload.tasks.find((t) => t.title === "端末をまたぐタスク")
            .archived,
      )
      .toBe(true);
    await page.getByRole("button", { name: "今すぐ同期", exact: true }).click();
    await expect(page.locator("[data-connection]").first()).not.toContainText(
      "同期中",
    );
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "端末をまたぐタスク", exact: true }),
    ).toHaveCount(0);
    await showRetained(page);
    const card = page
      .locator(".task-card")
      .filter({ hasText: "端末をまたぐタスク" });
    await expect(card).toHaveAttribute("data-archived", "true");
    await expect(card).toContainText("アーカイブ済み");
    expect(doc.payload.tasks.length).toBe(8);
    await open(page, "端末をまたぐタスク");
    await expect(page.locator("#task-progress")).toHaveValue("ahead");
    await expect(
      page.getByLabel("同期する小項目の期限日", { exact: true }),
    ).toHaveValue(addDays(dateKey(), 2));
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
    await hideRetained(page);
    await expect(card).toHaveCount(0);
    expect(
      (await workspace(page)).tasks.find(
        (t) => t.title === "端末をまたぐタスク",
      ).archived,
    ).toBe(true);
    await showArchive(page, test.info());
    await expect(
      page.locator(".archive-row").filter({ hasText: "端末をまたぐタスク" }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "アーカイブしたまま一覧に表示",
        exact: true,
      })
      .click();
    await expect(card).toHaveAttribute("data-archived", "true");
  } finally {
    await ctx.close();
  }
});

test("storage failure preserves draft and does not show an unsaved card", async ({
  page,
}) => {
  await start(page);
  await create(page, "保存失敗のタスク");
  await page.evaluate(() => {
    window.originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await expect(page.locator("#form-error")).toContainText("Quota");
  await expect(page.locator("#modal")).toBeVisible();
  await expect(page.getByLabel("タスク名", { exact: true })).toHaveValue(
    "保存失敗のタスク",
  );
  await page.evaluate(
    () => (IDBObjectStore.prototype.put = window.originalPut),
  );
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "保存失敗のタスク" }),
  ).toBeVisible();
});

async function menu(page) {
  await page.getByRole("button", { name: "メニュー", exact: true }).click();
}
async function showArchive(page, info) {
  if (info.project.name === "mobile") await menu(page);
  await page.getByRole("button", { name: /^アーカイブ \d/ }).click();
}
async function datedTask(page, title) {
  await create(page, title);
  const today = dateKey();
  await page.locator("#task-start").fill(today);
  await page.locator("#task-due").fill(addDays(today, 1));
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  return await page
    .locator(".task-card")
    .filter({ hasText: title })
    .getAttribute("data-task");
}

test("checklist dates validate, persist and appear in the Gantt with progress", async ({
  page,
}) => {
  await start(page);
  await create(page, "小さな予定");
  await page.locator("#task-progress").selectOption("behind");
  await page.getByPlaceholder("チェック項目を追加…").fill("資料づくり");
  await page.getByPlaceholder("チェック項目を追加…").press("Enter");
  await page.getByLabel("資料づくりの開始日", { exact: true }).fill(dateKey());
  await page
    .getByLabel("資料づくりの期限日", { exact: true })
    .fill(addDays(dateKey(), -1));
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await expect(page.locator("#form-error")).toContainText("チェック項目");
  await page
    .getByLabel("資料づくりの期限日", { exact: true })
    .fill(addDays(dateKey(), 2));
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await expect(
    page.locator(".task-card").filter({ hasText: "小さな予定" }),
  ).toContainText("遅れ気味");
  await page.reload();
  await open(page, "小さな予定");
  await expect(
    page.getByLabel("資料づくりの開始日", { exact: true }),
  ).toHaveValue(dateKey());
  await expect(page.locator("#task-progress")).toHaveValue("behind");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await openGantt(page);
  await expect(
    page.locator(".gantt-bar").filter({ hasText: "資料づくり" }),
  ).toBeVisible();
});

test("column renaming persists without changing status semantics", async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole("button", { name: "未着手の列名を変更", exact: true })
    .click();
  await page.getByLabel("未着手の列名", { exact: true }).fill("これから");
  await page.getByLabel("進行中の列名", { exact: true }).fill("作業中");
  await page.getByRole("button", { name: "列名を保存" }).click();
  await expect(
    page.getByRole("heading", { name: "これから", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "これから", exact: true }),
  ).toBeVisible();
  await create(page, "名前を変えても状態は共通");
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await page
    .getByRole("button", {
      name: "名前を変えても状態は共通：これから。次の状態へ変更",
    })
    .click();
  await expect(page.locator('[data-column="doing"]')).toContainText(
    "名前を変えても状態は共通",
  );
});
test("Gantt edges resize with mouse or touch and persist both dates", async ({
  page,
  context,
}, info) => {
  await start(page);
  const title = "帯を動かす",
    id = await datedTask(page, title);
  await openGantt(page);
  await panToTask(page, id);
  async function drag(edge, delta) {
    const handle = page.locator(
      `[data-resize-task="${id}"][data-resize="${edge}"]`,
    );
    const box = await handle.boundingBox();
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    if (info.project.name === "mobile") {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 1 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + delta, y, id: 1 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await cdp.detach();
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + delta, y, { steps: 4 });
      await page.mouse.up();
    }
    await expect(page.locator(`[data-bar-task="${id}"]`)).not.toHaveClass(
      /resizing/,
    );
  }
  await drag("due", 40);
  await expect(page.locator(`[data-bar-task="${id}"]`)).toHaveAttribute(
    "data-end",
    addDays(dateKey(), 2),
  );
  await drag("start", -40);
  await expect(page.locator(`[data-bar-task="${id}"]`)).toHaveAttribute(
    "data-start",
    addDays(dateKey(), -1),
  );
  await page.reload();
  await open(page, title);
  await expect(page.locator("#task-start")).toHaveValue(addDays(dateKey(), -1));
  await expect(page.locator("#task-due")).toHaveValue(addDays(dateKey(), 2));
});

test("Gantt day width persists and checklist handles support keyboard clamping", async ({
  page,
}) => {
  await start(page);
  await create(page, "チェックの帯");
  await page.getByPlaceholder("チェック項目を追加…").fill("小項目");
  await page.getByPlaceholder("チェック項目を追加…").press("Enter");
  await page.getByLabel("小項目の開始日", { exact: true }).fill(dateKey());
  await page.getByLabel("小項目の期限日", { exact: true }).fill(dateKey());
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "チェックの帯" }),
  ).toBeVisible();
  await openGantt(page);
  await page.getByLabel("ガントの列幅", { exact: true }).focus();
  await page.getByLabel("ガントの列幅", { exact: true }).press("End");
  await expect(page.locator("#day-width-value")).toHaveText("80px");
  expect(
    await page
      .locator(".gantt-day")
      .first()
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBe(80);
  await page.screenshot({
    path: `/tmp/taskly-gantt-${test.info().project.name}.png`,
    fullPage: true,
  });
  const handle = page.getByRole("button", {
    name: "小項目の期限日を調整",
    exact: true,
  });
  await handle.focus();
  await handle.press("ArrowLeft");
  await expect(
    page.locator(".gantt-bar").filter({ hasText: "小項目" }),
  ).toHaveAttribute("data-end", dateKey());
  await expect(
    page.getByRole("button", { name: "小項目の期限日を調整", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.locator(".gantt-bar").filter({ hasText: "小項目" }),
  ).toHaveAttribute("data-end", addDays(dateKey(), 1));
  await page.reload();
  await openGantt(page);
  await expect(page.locator("#day-width-value")).toHaveText("80px");
});

test("month calendar uses one bar per weekly range and creates tasks on a selected date", async ({
  page,
}) => {
  await start(page);
  const id = await datedTask(page, "カレンダーの予定");
  await page.getByRole("tab", { name: "カレンダー", exact: true }).click();
  const events = page.locator(`[data-calendar-task="${id}"]`);
  const sunday = new Date(dateKey() + "T12:00:00").getDay() === 0;
  await expect(events).toHaveCount(sunday ? 2 : 1);
  if (!sunday)
    expect(
      await events.first().evaluate((el) => el.style.gridColumn),
    ).toContain("span 2");
  await events.first().click();
  await expect(page.locator("#task-title")).toHaveValue("カレンダーの予定");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  const date = addDays(dateKey(), 3);
  await page
    .getByRole("button", { name: `${date}にタスクを追加`, exact: true })
    .click();
  await expect(page.locator("#task-start")).toHaveValue(date);
  await expect(page.locator("#task-due")).toHaveValue(date);
  await page.locator("#task-title").fill("この日の予定");
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await expect(
    page.locator(".calendar-event").filter({ hasText: "この日の予定" }),
  ).toBeVisible();
  const heading = await page.locator(".calendar-toolbar h2").textContent();
  await page.screenshot({
    path: `/tmp/taskly-smart-calendar-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "次の月", exact: true }).click();
  await expect(page.locator(".calendar-toolbar h2")).not.toHaveText(heading);
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await expect(page.locator(".calendar-toolbar h2")).toHaveText(heading);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("completed tasks archive automatically, reveal without unarchiving, and explicitly resume with dates preserved", async ({
  page,
}, info) => {
  await start(page);
  await datedTask(page, "保管するタスク");
  await page
    .getByRole("button", { name: "保管するタスク：未着手。次の状態へ変更" })
    .click();
  await page
    .getByRole("button", { name: "保管するタスク：進行中。次の状態へ変更" })
    .click();
  await expect(
    page.getByRole("heading", { name: "保管するタスク", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "保管するタスク", exact: true }),
  ).toHaveCount(0);
  expect(
    (await workspace(page)).tasks.find((t) => t.title === "保管するタスク")
      .archived,
  ).toBe(true);
  await showRetained(page);
  const card = page.locator(".task-card").filter({ hasText: "保管するタスク" });
  await expect(card).toHaveAttribute("data-archived", "true");
  await expect(card).toContainText("アーカイブ済み");
  await openGantt(page);
  await expect(
    page.getByLabel("保管するタスクのステータス", { exact: true }),
  ).toHaveValue("done");
  await page.getByRole("tab", { name: "カレンダー", exact: true }).click();
  await expect(
    page
      .locator(".calendar-event")
      .filter({ hasText: "保管するタスク" })
      .first(),
  ).toHaveAttribute("data-archived", "true");
  await hideRetained(page);
  await expect(
    page.locator(".calendar-event").filter({ hasText: "保管するタスク" }),
  ).toHaveCount(0);
  expect(
    (await workspace(page)).tasks.find((t) => t.title === "保管するタスク")
      .archived,
  ).toBe(true);
  await showArchive(page, info);
  const row = page
    .locator(".archive-row")
    .filter({ hasText: "保管するタスク" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "再開する", exact: true }).click();
  await expect(row).toHaveCount(0);
  if (info.project.name === "mobile") await menu(page);
  await page.getByRole("button", { name: /^すべてのタスク \d/ }).click();
  await page.getByRole("tab", { name: "かんばん", exact: true }).click();
  await open(page, "保管するタスク");
  await expect(page.locator("#task-start")).toHaveValue(dateKey());
  await expect(page.locator('[data-status="todo"]')).toHaveClass(/selected/);
  expect(
    (await workspace(page)).tasks.find((t) => t.title === "保管するタスク")
      .archived,
  ).toBe(false);
});
test("sidebar toggles on desktop and mobile and keeps desktop preference", async ({
  page,
}, info) => {
  await start(page);
  const aside = page.locator("aside");
  if (info.project.name === "desktop") {
    await expect(aside).not.toHaveAttribute("inert");
    await menu(page);
    await expect(aside).toHaveAttribute("inert");
    await page.reload();
    await expect(page.locator("aside")).toHaveAttribute("inert");
    await menu(page);
    await expect(page.locator("aside")).not.toHaveAttribute("inert");
  } else {
    await expect(aside).toHaveAttribute("inert");
    await menu(page);
    await expect(page.locator("aside")).not.toHaveAttribute("inert");
    await page
      .getByRole("button", { name: "サイドバーを閉じる", exact: true })
      .click();
    await expect(page.locator("aside")).toHaveAttribute("inert");
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("existing database upgrades safely and sharing guide is linked", async ({
  page,
}) => {
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
  old.tasks[0].title = "以前のデータ";
  await page.addInitScript(async (data) => {
    if (localStorage.getItem("migration-seeded")) return;
    await new Promise((resolve, reject) => {
      const q = indexedDB.open("taskly-data", 1);
      q.onupgradeneeded = () => q.result.createObjectStore("documents");
      q.onsuccess = () => {
        const tx = q.result.transaction("documents", "readwrite");
        tx.objectStore("documents").put(data, "workspace");
        tx.oncomplete = () => {
          localStorage.setItem("migration-seeded", "1");
          q.result.close();
          resolve();
        };
      };
      q.onerror = () => reject(q.error);
    });
  }, old);
  await start(page);
  await open(page, "以前のデータ");
  await expect(page.locator("#task-progress")).toHaveValue("ontrack");
  await expect(page.locator("[data-check-start]").first()).toHaveValue("");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await settings(page);
  await expect(
    page.getByRole("link", { name: /初心者向け・端末間共有ガイド/ }),
  ).toHaveAttribute(
    "href",
    "https://github.com/fuj4022-code/taskmaker/blob/main/docs/SHARING.md",
  );
});

test("canceling a Gantt drag leaves stored dates unchanged", async ({
  page,
}) => {
  await start(page);
  const id = await datedTask(page, "キャンセルする帯");
  await openGantt(page);
  await panToTask(page, id);
  const h = page.locator(`[data-resize-task="${id}"][data-resize="due"]`),
    b = await h.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2);
  await h.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await expect(page.locator(`[data-bar-task="${id}"]`)).toHaveAttribute(
    "data-end",
    addDays(dateKey(), 1),
  );
  await page.reload();
  await open(page, "キャンセルする帯");
  await expect(page.locator("#task-due")).toHaveValue(addDays(dateKey(), 1));
});

async function openGantt(page) {
  await page.getByRole("tab", { name: "ガントチャート", exact: true }).click();
  await page
    .getByLabel("ガントの表示単位", { exact: true })
    .selectOption("day");
}
async function panToTask(page, id) {
  await page.locator(".gantt-scroll").evaluate((el, id) => {
    const bar = el.querySelector(`[data-bar-task="${id}"]`);
    el.scrollLeft = Math.max(0, bar.offsetLeft - 20);
  }, id);
}
async function seedState(page, data) {
  await page.addInitScript(async (data) => {
    if (localStorage.getItem("fixture-seeded")) return;
    await new Promise((resolve, reject) => {
      const q = indexedDB.open("taskly-data", 1);
      q.onupgradeneeded = () => q.result.createObjectStore("documents");
      q.onsuccess = () => {
        const tx = q.result.transaction("documents", "readwrite");
        tx.objectStore("documents").put(data, "workspace");
        tx.oncomplete = () => {
          localStorage.setItem("fixture-seeded", "1");
          q.result.close();
          resolve();
        };
      };
      q.onerror = () => reject(q.error);
    });
  }, data);
}

test("Gantt scrolls continuously in either direction without a period selector", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("tab", { name: "ガントチャート", exact: true }).click();
  await expect(page.locator("#gantt-months")).toHaveCount(0);
  await expect(
    page.getByLabel("ガントの表示単位", { exact: true }),
  ).toHaveValue("week");
  await expect(page.locator(".gantt-day")).toHaveCount(TIMELINE_COLUMNS);
  for (const direction of ["right", "right", "left", "left"]) {
    const before = await page
      .locator(".gantt-scroll")
      .evaluate((el, direction) => {
        const start =
            document.querySelector(".gantt-section").dataset.rangeStart,
          width = document
            .querySelector(".gantt-day")
            .getBoundingClientRect().width;
        el.scrollLeft =
          direction === "right" ? el.scrollWidth - el.clientWidth - 10 : 0;
        return { start, width, left: el.scrollLeft };
      }, direction);
    const visible = dateAtOffset(
      timelineFrom(before.start, "week"),
      before.left,
      before.width,
    );
    await expect
      .poll(() =>
        page.locator(".gantt-section").getAttribute("data-range-start"),
      )
      .not.toBe(before.start);
    const after = await page.locator(".gantt-scroll").evaluate((el) => ({
      start: document.querySelector(".gantt-section").dataset.rangeStart,
      left: el.scrollLeft,
    }));
    expect(
      dateAtOffset(timelineFrom(after.start, "week"), after.left, before.width),
    ).toBe(visible);
    await expect(page.locator(".gantt-day")).toHaveCount(TIMELINE_COLUMNS);
  }
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await page
    .getByLabel("ガントの表示単位", { exact: true })
    .selectOption("day");
  await expect(page.locator(".gantt-day")).toHaveCount(TIMELINE_COLUMNS);
  expect(
    await page
      .locator(".gantt-row")
      .first()
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(32);
  await page.reload();
  await page.getByRole("tab", { name: "ガントチャート", exact: true }).click();
  await expect(
    page.getByLabel("ガントの表示単位", { exact: true }),
  ).toHaveValue("day");
  await page.screenshot({
    path: `/tmp/taskly-restored-gantt-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("weekly timeline dragging changes dates at the same scale as its headers", async ({
  page,
}) => {
  await start(page);
  const id = await datedTask(page, "週の帯");
  await page.getByRole("tab", { name: "ガントチャート", exact: true }).click();
  await panToTask(page, id);
  const handle = page.locator(`[data-resize-task="${id}"][data-resize="due"]`);
  const b = await handle.boundingBox(),
    width = await page
      .locator(".gantt-day")
      .first()
      .evaluate((el) => el.getBoundingClientRect().width);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + width, b.y + b.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.locator(`[data-bar-task="${id}"]`)).toHaveAttribute(
    "data-end",
    addDays(dateKey(), 8),
  );
});

test("deadline colors appear in board, Gantt and calendar and clear on completion", async ({
  page,
}) => {
  await start(page);
  await create(page, "期限が近いタスク");
  await page.locator("#task-start").fill(dateKey());
  await page.locator("#task-due").fill(addDays(dateKey(), 3));
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  const card = page
    .locator(".task-card")
    .filter({ hasText: "期限が近いタスク" });
  await expect(card).toHaveClass(/deadline-soon/);
  await expect(card).toContainText("期限まで3日");
  const id = await card.getAttribute("data-task");
  await page.getByRole("tab", { name: "ガントチャート", exact: true }).click();
  await expect(page.locator(`[data-bar-task="${id}"]`)).toHaveClass(
    /deadline-soon/,
  );
  await page.getByRole("tab", { name: "カレンダー", exact: true }).click();
  await expect(
    page.locator(`[data-calendar-task="${id}"]`).first(),
  ).toHaveClass(/deadline-soon/);
  await page.getByRole("tab", { name: "かんばん", exact: true }).click();
  await open(page, "期限が近いタスク");
  await page.locator("#task-start").fill(addDays(dateKey(), -3));
  await page.locator("#task-due").fill(addDays(dateKey(), -1));
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(card).toHaveClass(/deadline-overdue/);
  await page
    .getByRole("button", { name: "期限が近いタスク：未着手。次の状態へ変更" })
    .click();
  await page
    .getByRole("button", { name: "期限が近いタスク：進行中。次の状態へ変更" })
    .click();
  await showRetained(page);
  await expect(card).not.toHaveClass(/deadline-(soon|overdue)/);
});

test("calendar shows overlapping ranges in lanes and continues a long task across week boundaries", async ({
  page,
}) => {
  const state = initialState(),
    month = dateKey().slice(0, 7) + "-01",
    startDay = addDays(month, (8 - new Date(month + "T12:00:00").getDay()) % 7);
  state.tasks = state.tasks.slice(0, 2);
  state.tasks[0].title = "長い予定";
  state.tasks[0].start = startDay;
  state.tasks[0].due = addDays(startDay, 12);
  state.tasks[1].title = "重なる予定";
  state.tasks[1].start = addDays(startDay, 1);
  state.tasks[1].due = addDays(startDay, 3);
  await seedState(page, state);
  await start(page);
  await page.getByRole("tab", { name: "カレンダー", exact: true }).click();
  const bars = page.locator(`[data-calendar-task="${state.tasks[0].id}"]`);
  expect(await bars.count()).toBeGreaterThanOrEqual(2);
  await expect(bars.first()).toHaveClass(/continues-after/);
  await expect(bars.last()).toHaveClass(/continues-before/);
  const row = bars.first().locator("..");
  const second = row.locator(`[data-calendar-task="${state.tasks[1].id}"]`);
  expect(await bars.first().evaluate((el) => el.style.gridRow)).not.toBe(
    await second.evaluate((el) => el.style.gridRow),
  );
  await bars.first().click();
  await expect(page.locator("#task-title")).toHaveValue("長い予定");
});

test("new task drawer bounds scrolling without a blank area and adapts to a smaller viewport", async ({
  page,
  context,
}, info) => {
  await start(page);
  await create(page, "スクロールの確認");
  for (let i = 0; i < 8; i++) {
    await page.getByPlaceholder("チェック項目を追加…").fill("項目" + i);
    await page.getByPlaceholder("チェック項目を追加…").press("Enter");
  }
  const body = page.locator(".drawer-body");
  await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
  const positions = await page.evaluate(() => {
    const b = document.querySelector(".drawer-body").getBoundingClientRect(),
      a = document.querySelector(".upload-area").getBoundingClientRect(),
      f = document.querySelector(".drawer-footer").getBoundingClientRect();
    return {
      blank: b.bottom - a.bottom,
      footer: f.bottom,
      viewport: innerHeight,
      outerScroll: document.scrollingElement.scrollHeight,
    };
  });
  expect(positions.blank).toBeLessThan(60);
  expect(positions.footer).toBeLessThanOrEqual(positions.viewport + 1);
  expect(positions.outerScroll).toBeLessThanOrEqual(positions.viewport + 1);
  if (info.project.name === "mobile") {
    const cdp = await context.newCDPSession(page),
      b = await body.boundingBox(),
      x = b.x + b.width / 2,
      y = b.y + b.height - 40;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y - 160, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }
  const original = page.viewportSize();
  await page.setViewportSize({ width: original.width, height: 480 });
  await expect(page.locator(".drawer-footer")).toBeInViewport();
  expect(
    await page
      .locator("#modal")
      .evaluate((el) => el.getBoundingClientRect().bottom),
  ).toBeLessThanOrEqual(481);
  await page.setViewportSize(original);
  await page.screenshot({
    path: `/tmp/taskly-smart-drawer-${test.info().project.name}.png`,
  });
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "スクロールの確認", exact: true }),
  ).toBeVisible();
});

test("deadline colors refresh after the date changes while the app stays open", async ({
  page,
}) => {
  await page.clock.install({ time: new Date(2026, 10, 5, 23, 59, 30) });
  await start(page);
  await create(page, "日付が変わるタスク");
  await page.locator("#task-start").fill("2026-11-05");
  await page.locator("#task-due").fill("2026-11-09");
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  const card = page
    .locator(".task-card")
    .filter({ hasText: "日付が変わるタスク" });
  await expect(card).not.toHaveClass(/deadline-soon/);
  await page.clock.fastForward(60000);
  await expect(card).toHaveClass(/deadline-soon/);
  await expect(card).toContainText("期限まで3日");
});

test("Gantt shows checklist periods independently and can jump to a distant checklist schedule", async ({
  page,
}) => {
  await start(page);
  await create(page, "親に日程がないタスク");
  await page.locator("#task-start").fill("");
  await page.locator("#task-due").fill("");
  await page.getByPlaceholder("チェック項目を追加…").fill("遠い予定の小項目");
  await page.getByPlaceholder("チェック項目を追加…").press("Enter");
  await page
    .getByLabel("遠い予定の小項目の開始日", { exact: true })
    .fill("2090-01-10");
  await page
    .getByLabel("遠い予定の小項目の期限日", { exact: true })
    .fill("2090-01-15");
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await openGantt(page);
  const row = page
    .locator(".gantt-subtask")
    .filter({ hasText: "遠い予定の小項目" });
  await expect(row).toContainText("1/10");
  await expect(row).toContainText("1/15");
  await page
    .getByRole("button", { name: /1\/10〜1\/15 · この期間へ移動/ })
    .click();
  const bar = page
    .locator(".gantt-bar")
    .filter({ hasText: "遠い予定の小項目" });
  await expect(bar).toHaveAttribute("data-start", "2090-01-10");
  await expect(bar).toHaveAttribute("data-end", "2090-01-15");
  await expect(bar).toBeInViewport();
  await page
    .getByRole("checkbox", { name: "遠い予定の小項目を完了", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "遠い予定の小項目を完了", exact: true }),
  ).toHaveCount(0);
  await expect(bar).toHaveCount(0);
  await page.reload();
  await open(page, "親に日程がないタスク");
  await expect(
    page.getByLabel("遠い予定の小項目を完了", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("遠い予定の小項目の期限日", { exact: true }),
  ).toHaveValue("2090-01-15");
});

test("Gantt changes task status directly and preserves it across reload and board views", async ({
  page,
}) => {
  await start(page);
  await datedTask(page, "ガントで状態を変更");
  await openGantt(page);
  const select = page.getByLabel("ガントで状態を変更のステータス", {
    exact: true,
  });
  await select.selectOption("doing");
  await expect(select).toHaveValue("doing");
  await expect(page.locator("#modal")).not.toBeVisible();
  await select.selectOption("done");
  await expect(select).toHaveCount(0);
  await showRetained(page);
  await expect(select).toHaveValue("done");
  await page.reload();
  await expect(page.locator('[data-column="done"]')).toContainText(
    "ガントで状態を変更",
  );
  await openGantt(page);
  await expect(select).toHaveValue("done");
  await select.selectOption("todo");
  await expect(select).toHaveValue("todo");
  await page.getByRole("tab", { name: "かんばん", exact: true }).click();
  await expect(page.locator('[data-column="todo"]')).toContainText(
    "ガントで状態を変更",
  );
});

test("restored theme keeps kanban cards compact and task details accessible", async ({
  page,
}) => {
  await start(page);
  await expect(page.locator(".brand-mark")).toBeVisible();
  await expect(page.locator(".stats")).toBeVisible();
  const card = page.locator(".task-card").filter({
    has: page.getByRole("heading", {
      name: "リサーチをまとめる",
      exact: true,
    }),
  });
  expect(
    await card.evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(180);
  await card.click();
  await expect(page.locator("#task-description")).toContainText("まずは目的");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.screenshot({
    path: `/tmp/taskly-restored-board-${test.info().project.name}.png`,
    fullPage: true,
  });
});

async function showRetained(page) {
  const button = page.getByRole("button", {
    name: "完了・アーカイブを表示",
    exact: true,
  });
  if (await button.count()) await button.click();
}
async function hideRetained(page) {
  const button = page.getByRole("button", {
    name: "完了・アーカイブを非表示",
    exact: true,
  });
  if (await button.count()) await button.click();
}
async function workspace(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const q = indexedDB.open("taskly-data", 1);
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const q = db
          .transaction("documents")
          .objectStore("documents")
          .get("workspace");
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => reject(q.error);
      });
    } finally {
      db.close();
    }
  });
}

test("Gantt ribbons and bulk buttons control both dated and undated pending checklist entries", async ({
  page,
}) => {
  const s = initialState();
  s.tasks = s.tasks.slice(0, 3);
  for (const [i, t] of s.tasks.entries()) {
    t.title = "開閉タスク" + i;
    t.status = "todo";
    t.archived = false;
    t.start = dateKey();
    t.due = addDays(dateKey(), 2);
  }
  s.tasks[0].checklist = [
    {
      id: "dated-a",
      text: "日程ありA",
      done: false,
      start: dateKey(),
      due: addDays(dateKey(), 1),
    },
    { id: "undated-a", text: "日程なしA", done: false, start: "", due: "" },
    {
      id: "done-dated",
      text: "完了した予定",
      done: true,
      start: dateKey(),
      due: dateKey(),
    },
    {
      id: "done-undated",
      text: "完了した未設定",
      done: true,
      start: "",
      due: "",
    },
  ];
  s.tasks[1].checklist = [
    {
      id: "dated-b",
      text: "日程ありB",
      done: false,
      start: dateKey(),
      due: dateKey(),
    },
  ];
  s.tasks[2].start = "";
  s.tasks[2].due = "";
  s.tasks[2].checklist = [
    { id: "undated-c", text: "日程なしC", done: false, start: "", due: "" },
  ];
  await seedState(page, s);
  await start(page);
  await openGantt(page);
  await expect(page.locator('[data-row-check="dated-a"]')).toBeVisible();
  await expect(
    page.locator('.gantt-grid [data-row-check="undated-a"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-unscheduled-check="undated-a"]'),
  ).toBeVisible();
  await expect(
    page.locator(`[data-unscheduled-task="${s.tasks[2].id}"]`),
  ).toBeVisible();
  await expect(
    page.locator(".gantt-grid").getByText("期間未設定", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(
      '[data-row-check="done-dated"],[data-unscheduled-check="done-undated"]',
    ),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "開閉タスク0のチェックリストを非表示",
      exact: true,
    })
    .click();
  await expect(page.locator('[data-row-check="dated-a"]')).toHaveCount(0);
  await expect(
    page.locator('[data-unscheduled-check="undated-a"]'),
  ).toHaveCount(0);
  await expect(page.locator('[data-row-check="dated-b"]')).toBeVisible();
  await page
    .getByRole("button", { name: "すべてのチェックリストを表示", exact: true })
    .click();
  await expect(page.locator('[data-row-check="dated-a"]')).toBeVisible();
  await expect(
    page.locator('[data-unscheduled-check="undated-c"]'),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "すべてのチェックリストを非表示",
      exact: true,
    })
    .click();
  await expect(
    page.locator("[data-row-check],[data-unscheduled-check]"),
  ).toHaveCount(0);
  await page.reload();
  await openGantt(page);
  await expect(
    page.locator("[data-row-check],[data-unscheduled-check]"),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "すべてのチェックリストを表示", exact: true })
    .click();
  await expect(page.locator('[data-row-check="dated-a"]')).toBeVisible();
  await expect(
    page.locator('[data-unscheduled-check="undated-a"]'),
  ).toBeVisible();
  await page.screenshot({
    path: `/tmp/taskly-folded-planning-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("completed checklist entries disappear in Gantt and can be restored from task details", async ({
  page,
}) => {
  await start(page);
  await create(page, "チェック完了のテスト");
  await page.getByPlaceholder("チェック項目を追加…").fill("下の未設定を完了");
  await page.getByPlaceholder("チェック項目を追加…").press("Enter");
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "チェック完了のテスト", exact: true }),
  ).toBeVisible();
  await openGantt(page);
  await page
    .getByRole("checkbox", { name: "下の未設定を完了を完了", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "下の未設定を完了を完了", exact: true }),
  ).toHaveCount(0);
  const t = (await workspace(page)).tasks.find(
    (t) => t.title === "チェック完了のテスト",
  );
  expect(t.checklist[0].done).toBe(true);
  expect(t.archived).toBe(false);
  await page.reload();
  await open(page, "チェック完了のテスト");
  await expect(
    page.getByLabel("下の未設定を完了を完了", { exact: true }),
  ).toBeChecked();
  await page.getByLabel("下の未設定を完了を完了", { exact: true }).uncheck();
  await page.getByRole("button", { name: "変更を保存", exact: true }).click();
  await openGantt(page);
  await expect(
    page.getByRole("checkbox", { name: "下の未設定を完了を完了", exact: true }),
  ).toBeVisible();
});

test("legacy and newly created completed tasks auto-archive while reveal remains a view-only preference", async ({
  page,
}) => {
  const s = initialState();
  s.tasks = s.tasks.slice(0, 1);
  s.tasks[0].title = "以前に完了したタスク";
  s.tasks[0].status = "done";
  s.tasks[0].archived = false;
  const ts = s.tasks[0].updatedAt;
  await seedState(page, s);
  await start(page);
  await expect(
    page.getByRole("heading", { name: "以前に完了したタスク", exact: true }),
  ).toHaveCount(0);
  let saved = await workspace(page);
  expect(saved.tasks[0].archived).toBe(true);
  expect(saved.tasks[0].updatedAt).toBe(ts);
  await showRetained(page);
  await expect(
    page.locator(".task-card").filter({ hasText: "以前に完了したタスク" }),
  ).toHaveAttribute("data-archived", "true");
  await hideRetained(page);
  await create(page, "最初から完了");
  await page.getByPlaceholder("チェック項目を追加…").fill("データは残る");
  await page.getByPlaceholder("チェック項目を追加…").press("Enter");
  await page.locator('[data-status="done"]').click();
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await expect(page.locator("#modal")).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "最初から完了", exact: true }),
  ).toHaveCount(0);
  const before = (await workspace(page)).tasks.find(
    (t) => t.title === "最初から完了",
  );
  expect(before.archived).toBe(true);
  await showRetained(page);
  await expect(
    page.locator(".task-card").filter({ hasText: "最初から完了" }),
  ).toHaveAttribute("data-archived", "true");
  await hideRetained(page);
  await showRetained(page);
  await page.reload();
  await expect(
    page.locator(".task-card").filter({ hasText: "最初から完了" }),
  ).toHaveAttribute("data-archived", "true");
  const after = (await workspace(page)).tasks.find(
    (t) => t.title === "最初から完了",
  );
  expect(after).toEqual(before);
});

test("kanban retains the selected column through background sync and avoids no-op redraws", async ({
  page,
}) => {
  let payload = initialState(),
    reads = 0,
    release;
  const gate = new Promise((resolve) => (release = resolve));
  payload.tasks[0].description = "同期後のメモ";
  payload.tasks[0].updatedAt = Date.now() + 100;
  await page.addInitScript(() => {
    localStorage.setItem(
      "taskly-cloud-config",
      JSON.stringify({
        url: "https://taskly-test.supabase.co",
        key: "public-key",
      }),
    );
    localStorage.setItem(
      "taskly-cloud-auth",
      JSON.stringify({
        access_token: "test",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        user: { id: "same-user", email: "test@example.com" },
      }),
    );
    localStorage.setItem("taskly-include-archived", "true");
  });
  await page.route("https://taskly-test.supabase.co/**", async (route) => {
    if (route.request().method() === "GET") {
      reads++;
      await gate;
      return route.fulfill({ json: [{ payload, version: 1 }] });
    }
    if (route.request().method() === "PATCH") {
      payload = route.request().postDataJSON().payload;
      return route.fulfill({ json: [{ payload, version: 2 }] });
    }
    return route.fulfill({ json: [] });
  });
  await start(page);
  await expect.poll(() => reads).toBe(1);
  await page
    .locator(".board")
    .evaluate((el) => (el.scrollLeft = el.scrollWidth - el.clientWidth));
  const left = await page.locator(".board").evaluate((el) => el.scrollLeft);
  release();
  await expect(
    page.locator(".task-card").filter({ hasText: "リサーチをまとめる" }),
  ).toContainText("同期後のメモ");
  expect(
    Math.abs(
      (await page.locator(".board").evaluate((el) => el.scrollLeft)) - left,
    ),
  ).toBeLessThan(3);
  await page.evaluate(
    () => (window.boardBeforeSync = document.querySelector(".board")),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => reads).toBe(2);
  await expect(page.locator("[data-connection]").first()).not.toContainText(
    "同期中",
  );
  expect(
    await page.evaluate(
      () => window.boardBeforeSync === document.querySelector(".board"),
    ),
  ).toBe(true);
});

test("kanban preserves touch swipe and momentum through a visibility refresh", async ({
  page,
  context,
}, info) => {
  test.skip(
    info.project.name !== "mobile",
    "Touch swipe regression uses the mobile layout.",
  );
  await start(page);
  const board = page.locator(".board");
  await board.scrollIntoViewIfNeeded();
  const box = await board.boundingBox(),
    x = box.x + Math.min(310, box.width - 20),
    y = Math.max(80, Math.min(720, box.y + 80));
  const cdp = await context.newCDPSession(page);
  await page.evaluate(
    () => (window.boardDuringSwipe = document.querySelector(".board")),
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 1 }],
  });
  for (let i = 1; i <= 6; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x - i * 40, y, id: 1 }],
    });
  await page.waitForTimeout(250);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  expect(
    await page.evaluate(
      () => window.boardDuringSwipe === document.querySelector(".board"),
    ),
  ).toBe(true);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
  await expect
    .poll(() => page.locator(".board").evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(200);
  await page.waitForTimeout(450);
  const left = await board.evaluate((el) => el.scrollLeft);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await page.waitForTimeout(450);
  expect(
    Math.abs((await board.evaluate((el) => el.scrollLeft)) - left),
  ).toBeLessThan(3);
});

test("application version is shown in the footer and sync settings", async ({
  page,
}) => {
  await start(page);
  await expect(page.locator(".page-footer [data-app-version]")).toHaveText(
    "Taskly v1.0.1",
  );
  await expect(page.locator(".page-footer [data-app-version]")).toBeVisible();
  await settings(page);
  await expect(page.locator("#modal [data-app-version]")).toHaveText(
    "Taskly v1.0.1",
  );
});
