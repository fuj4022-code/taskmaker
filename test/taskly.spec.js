import { test, expect } from "@playwright/test";
import { initialState, normalize, addDays, dateKey } from "../src/model.js";
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
  await page.getByRole("tab", { name: "ガントチャート" }).click();
  const bar = page.locator(".gantt-bar").filter({ hasText: "ガントの予定" });
  await expect(bar).toBeVisible();
  await bar.click();
  await page.locator('[data-status="done"]').click();
  await page.getByRole("button", { name: "変更を保存" }).click();
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
test("project creation and tag filtering", async ({ page }, info) => {
  await start(page);
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "メニュー", exact: true }).click();
  await page
    .getByRole("button", { name: "新しいプロジェクト", exact: true })
    .click();
  await page.getByLabel("プロジェクト名", { exact: true }).fill("旅行の計画");
  await page.getByRole("button", { name: "作成する", exact: true }).click();
  await create(page, "宿泊を予約");
  await page.getByPlaceholder("タグを入力して Enter").fill("旅行");
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await expect(page.locator(".task-card")).toHaveCount(1);
  await page.getByRole("button", { name: "旅行", exact: true }).click();
  await expect(page.locator(".task-card")).toHaveCount(1);
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
  await page.getByRole("tab", { name: "ガントチャート" }).click();
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
    await expect(second.locator('[data-column="done"]')).toContainText(
      "端末をまたぐタスク",
    );
    await settings(second);
    await second
      .getByRole("button", { name: "今すぐ同期", exact: true })
      .click();
    await expect(second.locator("#toast")).toContainText("同期しました");
    await page.getByRole("button", { name: "今すぐ同期", exact: true }).click();
    await expect
      .poll(
        () =>
          doc.payload.tasks.find((t) => t.title === "端末をまたぐタスク")
            .status,
      )
      .toBe("done");
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(page.locator('[data-column="done"]')).toContainText(
      "端末をまたぐタスク",
    );
    expect(doc.payload.tasks.length).toBe(8);
    await open(page, "端末をまたぐタスク");
    await expect(page.locator("#task-progress")).toHaveValue("ahead");
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
    await second.getByRole("button", { name: "閉じる", exact: true }).click();
    await second
      .getByRole("button", {
        name: "端末をまたぐタスクをアーカイブ",
        exact: true,
      })
      .click();
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
    await settings(page);
    await page.getByRole("button", { name: "今すぐ同期", exact: true }).click();
    await expect(page.locator("[data-connection]").first()).not.toContainText(
      "同期中",
    );
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
    if (test.info().project.name === "mobile") await menu(page);
    await page.getByRole("button", { name: /^アーカイブ \d/ }).click();
    await expect(
      page.locator(".archive-row").filter({ hasText: "端末をまたぐタスク" }),
    ).toBeVisible();
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
  await page.getByRole("tab", { name: "ガントチャート" }).click();
  await expect(
    page.locator(".gantt-bar").filter({ hasText: "資料づくり" }),
  ).toBeVisible();
});

test("rename column titles and project title without changing status semantics", async ({
  page,
}, info) => {
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
  if (info.project.name === "mobile") await menu(page);
  await page.getByRole("button", { name: /^Webサイトリニューアル / }).click();
  await page.getByRole("button", { name: "プロジェクト名を変更" }).click();
  await page.getByLabel("プロジェクト名", { exact: true }).fill("新しい計画");
  await page.getByRole("button", { name: "名前を保存" }).click();
  await expect(
    page.getByRole("heading", { name: "新しい計画", exact: true }),
  ).toBeVisible();
});

test("Gantt edges resize with mouse or touch and persist both dates", async ({
  page,
  context,
}, info) => {
  await start(page);
  const title = "帯を動かす",
    id = await datedTask(page, title);
  await page.getByRole("tab", { name: "ガントチャート" }).click();
  await page.locator(".gantt-scroll").evaluate((el) => (el.scrollLeft = 150));
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
  await page.getByRole("tab", { name: "ガントチャート" }).click();
  await page.getByLabel("ガントの1日の幅", { exact: true }).focus();
  await page.getByLabel("ガントの1日の幅", { exact: true }).press("End");
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
  await page.getByRole("tab", { name: "ガントチャート" }).click();
  await expect(page.locator("#day-width-value")).toHaveText("80px");
});

test("month calendar shows multi-day tasks and creates tasks on a selected date", async ({
  page,
}) => {
  await start(page);
  await datedTask(page, "カレンダーの予定");
  await page.getByRole("tab", { name: "カレンダー", exact: true }).click();
  await expect(
    page
      .locator(`[data-day="${dateKey()}"] .calendar-event`)
      .filter({ hasText: "カレンダーの予定" }),
  ).toBeVisible();
  await expect(
    page
      .locator(`[data-day="${addDays(dateKey(), 1)}"] .calendar-event`)
      .filter({ hasText: "カレンダーの予定" }),
  ).toBeVisible();
  await page
    .locator(`[data-day="${dateKey()}"] .calendar-event`)
    .filter({ hasText: "カレンダーの予定" })
    .click();
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
    page
      .locator(`[data-day="${date}"] .calendar-event`)
      .filter({ hasText: "この日の予定" }),
  ).toBeVisible();
  await page.screenshot({
    path: `/tmp/taskly-calendar-${test.info().project.name}.png`,
    fullPage: true,
  });
  const heading = await page.locator(".calendar-toolbar h2").textContent();
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

test("completed tasks archive and restore with dates preserved", async ({
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
  await page
    .getByRole("button", { name: "保管するタスクをアーカイブ", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "保管するタスク", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await showArchive(page, info);
  await expect(
    page.locator(".archive-row").filter({ hasText: "保管するタスク" }),
  ).toBeVisible();
  await page
    .locator(".archive-row")
    .filter({ hasText: "保管するタスク" })
    .getByRole("button", { name: "元に戻す" })
    .click();
  await expect(
    page.locator(".archive-row").filter({ hasText: "保管するタスク" }),
  ).toHaveCount(0);
  if (info.project.name === "mobile") await menu(page);
  await page.getByRole("button", { name: /^すべてのタスク \d/ }).click();
  await open(page, "保管するタスク");
  await expect(page.locator("#task-start")).toHaveValue(dateKey());
  await expect(page.locator('[data-status="done"]')).toHaveClass(/selected/);
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
  await page.getByRole("tab", { name: "ガントチャート" }).click();
  await page.locator(".gantt-scroll").evaluate((el) => (el.scrollLeft = 150));
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
