import { test, expect } from "@playwright/test";
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
  await page.getByRole("button", { name: "タスクを作成", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "端末をまたぐタスク" }),
  ).toBeVisible();
  await connect(page);
  const ctx = await browser.newContext({
    baseURL: "http://127.0.0.1:5173",
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
