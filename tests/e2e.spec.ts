import { expect, test, type Page } from "@playwright/test";

test.use({ actionTimeout: 10_000 });

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5174";
const databasePort = process.env.LEGACYDIFF_DB_PORT ?? "3000";
const workerPort = process.env.LEGACYDIFF_WORKER_PORT ?? "3001";

async function ready(page: Page) {
  await expect(
    page.getByText("Spacetime connected", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
}

async function publish(
  page: Page,
  rationale: string,
  choice: "include" | "exclude" = "include",
) {
  const editor = page.locator(".proposal-editor");
  if ((await editor.getAttribute("open")) === null)
    await editor.locator("summary").click();
  await editor
    .getByRole("radio", {
      name: choice === "include" ? "Include day 30" : "Exclude day 30",
      exact: false,
    })
    .check();
  await editor.getByLabel("Rationale", { exact: true }).fill(rationale);
  for (const checkbox of await editor.getByRole("checkbox").all())
    await checkbox.check();
  await editor
    .getByRole("button", { name: "Preview proposal", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Preview proposal",
    exact: true,
  });
  await expect(dialog.locator("tbody tr")).toHaveCount(5);
  await dialog
    .getByRole("button", { name: "Publish proposal", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
}

test("two independent identities review a measured mismatch, reject a stale preview, validate and export", async ({
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const ownerContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const reviewerContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const outsiderContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const reviewer = await reviewerContext.newPage();
  const outsider = await outsiderContext.newPage();
  const errors: string[] = [];
  owner.on("pageerror", (error) => errors.push(error.message));
  reviewer.on("pageerror", (error) => errors.push(error.message));

  try {
    await owner.goto(baseUrl);
    await ready(owner);
    await owner
      .getByRole("button", { name: "New comparison", exact: false })
      .click();
    const setup = owner.getByRole("dialog", { name: "What are we comparing?" });
    await setup
      .getByLabel("Comparison name", { exact: true })
      .fill(`Browser proof ${Date.now()}`);
    await setup
      .getByLabel("Your display name", { exact: false })
      .fill("Engineer A");
    await expect(
      setup.getByRole("button", { name: "Analyze comparison", exact: true }),
    ).toBeDisabled();
    await expect(setup.locator(".model-option")).toHaveCount(3);
    await setup
      .getByRole("button", { name: "Run comparison without AI", exact: true })
      .click();
    await expect(
      owner.getByRole("heading", {
        name: "One day. A different promise.",
        exact: true,
      }),
    ).toBeVisible({ timeout: 40_000 });
    await expect(
      owner.locator(".result-panel--baseline").first(),
    ).toContainText("$100.00");
    await expect(
      owner.locator(".result-panel--candidate").first(),
    ).toContainText("$0.00");
    const roomUrl = owner.url();
    const roomId = new URL(roomUrl).searchParams.get("room");
    expect(roomId).toBeTruthy();

    await outsider.goto(roomUrl);
    await ready(outsider);
    await expect(
      outsider.getByRole("heading", { name: "Request room access" }),
    ).toBeVisible();
    await expect(
      outsider.getByText("One day. A different promise."),
    ).toHaveCount(0);
    await expect(outsider.locator(".evidence-card")).toHaveCount(0);

    await reviewer.goto(roomUrl);
    await ready(reviewer);
    await reviewer
      .getByLabel("Your display name", { exact: true })
      .fill("Reviewer B");
    await reviewer
      .getByRole("button", { name: "Request entry", exact: true })
      .click();
    await expect(
      reviewer.getByRole("heading", { name: "Access pending" }),
    ).toBeVisible();
    await expect(owner.locator(".admission")).toContainText("Reviewer B");
    await owner
      .getByRole("button", { name: "Admit as reviewer", exact: true })
      .click();
    await expect(
      reviewer.getByRole("heading", {
        name: "One day. A different promise.",
        exact: true,
      }),
    ).toBeVisible();
    const ownerIdentity = await owner
      .locator(".rail-footer small")
      .getAttribute("title");
    const reviewerIdentity = await reviewer
      .locator(".rail-footer small")
      .getAttribute("title");
    expect(ownerIdentity).not.toBe(reviewerIdentity);

    await publish(
      owner,
      "Honor the operations handbook customer promise through day 30.",
    );
    await expect(reviewer.locator(".published-proposal")).toContainText(
      "Honor the operations handbook",
    );
    await reviewer
      .getByRole("button", { name: "Pin evidence", exact: true })
      .first()
      .click();
    await reviewer
      .getByLabel("Add a comment", { exact: true })
      .fill(
        "The migration ticket conflicts. I am checking the boundary wording.",
      );
    await reviewer
      .getByRole("button", { name: "Add comment", exact: true })
      .click();
    await expect(owner.locator(".comment")).toContainText(
      "The migration ticket conflicts.",
    );
    await owner.locator(".evidence-card").first().locator("summary").click();
    await expect(owner.locator(".evidence-card").first()).toContainText(
      "Reviewer B",
    );

    if (
      (await reviewer.locator(".proposal-editor").getAttribute("open")) === null
    ) {
      await reviewer.locator(".proposal-editor").locator("summary").click();
    }
    await reviewer
      .getByLabel("Rationale", { exact: true })
      .fill("My private rationale must survive a stale approval.");
    await reviewer
      .getByRole("button", { name: "Review proposal", exact: true })
      .click();
    await expect(reviewer.getByRole("dialog")).toContainText(
      "Exact revision 1",
    );
    await publish(
      owner,
      "Honor the handbook through day 30; preserve receipt and final-sale controls.",
    );
    await expect(reviewer.getByRole("dialog")).toContainText(
      "This proposal changed. Review the latest revision.",
    );
    await expect(
      reviewer.getByRole("button", {
        name: "Approve this revision and run tests",
        exact: true,
      }),
    ).toBeDisabled();
    await reviewer
      .getByRole("dialog")
      .getByRole("button", { name: "Back", exact: true })
      .click();
    await expect(reviewer.getByLabel("Rationale", { exact: true })).toHaveValue(
      "My private rationale must survive a stale approval.",
    );

    await reviewer
      .getByRole("button", { name: "Review proposal", exact: true })
      .click();
    await expect(reviewer.getByRole("dialog")).toContainText(
      "Exact revision 2",
    );
    await reviewer
      .getByRole("button", {
        name: "Approve this revision and run tests",
        exact: true,
      })
      .click();
    await expect(reviewer.getByRole("dialog")).not.toBeVisible();
    await expect(owner.locator(".validation-section")).toHaveCount(1);
    await expect(reviewer.locator(".validation-section")).toHaveCount(1);
    await expect(
      reviewer.locator(".validation-section .section-heading"),
    ).toContainText("fail", { timeout: 40_000 });
    await expect(
      owner.locator(".validation-section .section-heading"),
    ).toContainText("fail");
    await expect(owner.locator(".validation-section")).toContainText(
      "Revision 2 approved by Reviewer B",
    );
    await expect(
      owner
        .locator(".activity-event")
        .filter({ hasText: "Acceptance validation finished" }),
    ).toHaveCount(1);

    const downloadPromise = reviewer.waitForEvent("download");
    await reviewer
      .getByRole("button", { name: "Download review bundle", exact: true })
      .click();
    const download = await downloadPromise;
    await download.saveAs(testInfo.outputPath("review-bundle.zip"));
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toContain("decision-1.zip");
    // A direct export request must enforce membership even without browser CORS.
    const outsiderToken = await outsider.evaluate(
      (key) => localStorage.getItem(key),
      `legacydiff.identity.v1:ws://127.0.0.1:${databasePort}:legacydiff-local-v2`,
    );
    expect(outsiderToken).toBeTruthy();
    const address = new URL(roomUrl);
    const deniedHeaders: Record<string, string>[] = [
      {},
      { Authorization: `Bearer ${outsiderToken}` },
    ];
    for (const headers of deniedHeaders) {
      const denied = await outsider.request.post(
        `http://127.0.0.1:${workerPort}/export`,
        {
          headers,
          data: {
            roomId: address.searchParams.get("room"),
            runId: address.searchParams.get("run"),
            decisionVersion: 1,
          },
        },
      );
      expect(denied.status()).toBe(403);
      expect(await denied.text()).toBe(
        "Export unavailable. Check access and the approved validation.",
      );
    }
    await owner.evaluate(() => window.scrollTo(0, 0));
    await owner.screenshot({
      path: testInfo.outputPath("shared-review-desktop.png"),
      fullPage: true,
    });

    await owner.getByRole("tab", { name: "Cases", exact: false }).click();
    await expect(
      owner.getByRole("heading", { name: "Measured cases", exact: true }),
    ).toBeVisible();
    await expect(
      reviewer.getByRole("heading", {
        name: "One day. A different promise.",
        exact: true,
      }),
    ).toBeVisible();
    await reviewerContext.setOffline(true);
    await expect(
      reviewer.getByText("Connecting / stale", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      reviewer.getByRole("button", { name: "Review proposal", exact: true }),
    ).toBeDisabled();
    await reviewerContext.setOffline(false);
    await ready(reviewer);
    await expect(reviewer.locator(".validation-section")).toHaveCount(1);
    await expect(reviewer.getByLabel("Rationale", { exact: true })).toHaveValue(
      "My private rationale must survive a stale approval.",
    );
    await expect(
      owner.getByRole("heading", { name: "Measured cases", exact: true }),
    ).toBeVisible();
    await reviewer.reload();
    await ready(reviewer);
    await expect(reviewer.locator(".validation-section")).toHaveCount(1);
    await expect(reviewer.getByLabel("Rationale", { exact: true })).toHaveValue(
      "My private rationale must survive a stale approval.",
    );

    await reviewer
      .getByRole("button", { name: "History", exact: false })
      .click();
    await expect(
      reviewer.getByRole("heading", { name: "History", exact: true }),
    ).toBeVisible();
    await reviewer.goBack();
    await expect(
      reviewer.getByRole("heading", {
        name: "One day. A different promise.",
        exact: true,
      }),
    ).toBeVisible();
    await reviewer.goForward();
    await expect(
      reviewer.getByRole("heading", { name: "History", exact: true }),
    ).toBeVisible();

    await reviewer.setViewportSize({ width: 390, height: 844 });
    await reviewer.goto(roomUrl);
    await ready(reviewer);
    await reviewer
      .getByRole("button", { name: "Day 30 return eligibility", exact: false })
      .click();
    await expect(
      reviewer.getByRole("heading", {
        name: "One day. A different promise.",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await reviewer.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await reviewer.evaluate(() => window.scrollTo(0, 0));
    await reviewer.screenshot({
      path: testInfo.outputPath("shared-review-mobile.png"),
      fullPage: true,
    });
    await reviewer
      .getByRole("button", { name: "Back to findings", exact: false })
      .focus();
    await reviewer.keyboard.press("Enter");
    await expect(
      reviewer.getByRole("button", {
        name: "Day 30 return eligibility",
        exact: false,
      }),
    ).toBeVisible();
    await reviewer.setViewportSize({ width: 1440, height: 1000 });
    await Promise.all([
      owner.getByRole("button", { name: "New run", exact: true }).click(),
      reviewer.getByRole("button", { name: "New run", exact: true }).click(),
    ]);
    await Promise.all([
      owner
        .getByRole("button", { name: "Run comparison without AI", exact: true })
        .click(),
      reviewer
        .getByRole("button", { name: "Run comparison without AI", exact: true })
        .click(),
    ]);
    await expect
      .poll(
        async () =>
          (await owner.getByRole("dialog").count()) +
          (await reviewer.getByRole("dialog").count()),
      )
      .toBeLessThan(2);
    const waiting = (await owner.getByRole("dialog").count())
      ? owner
      : (await reviewer.getByRole("dialog").count())
        ? reviewer
        : null;
    if (waiting) {
      const started = waiting === owner ? reviewer : owner;
      await expect(waiting.getByRole("alert")).toContainText(
        "Wait for the active comparison",
      );
      expect(waiting.url()).toBe(roomUrl);
      await expect(
        started.getByRole("heading", {
          name: "One day. A different promise.",
          exact: true,
        }),
      ).toBeVisible({ timeout: 30_000 });
      const startedUrl = started.url();
      await waiting
        .getByRole("button", { name: "Run comparison without AI", exact: true })
        .click();
      await expect(waiting.getByRole("dialog")).not.toBeVisible();
      expect(started.url()).toBe(startedUrl);
    }
    await expect(
      owner.getByRole("heading", {
        name: "One day. A different promise.",
        exact: true,
      }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      reviewer.getByRole("heading", {
        name: "One day. A different promise.",
        exact: true,
      }),
    ).toBeVisible({ timeout: 30_000 });
    expect(new URL(owner.url()).searchParams.get("room")).toBe(roomId);
    expect(new URL(reviewer.url()).searchParams.get("room")).toBe(roomId);
    expect(new URL(owner.url()).searchParams.get("run")).not.toBe(
      new URL(reviewer.url()).searchParams.get("run"),
    );
    expect(errors).toEqual([]);
  } finally {
    await ownerContext.close();
    await reviewerContext.close();
    await outsiderContext.close();
  }
});

test("narrow keyboard flow can defer, approve exclusion, and start a supplied corrected run", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl);
  await ready(page);
  const createButton = page.getByRole("button", {
    name: "New comparison",
    exact: false,
  });
  await createButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(createButton).toBeFocused();
  await page.keyboard.press("Enter");
  const setup = page.getByRole("dialog");
  await setup
    .getByLabel("Comparison name", { exact: true })
    .fill(`Exclusion proof ${Date.now()}`);
  await setup
    .getByLabel("Your display name", { exact: false })
    .fill("Policy reviewer");
  await setup
    .getByRole("button", { name: "Run comparison without AI", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Day 30 return eligibility", exact: false })
    .click({ timeout: 30_000 });
  await expect(
    page.getByRole("radio", { name: "Include day 30", exact: false }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Exclude day 30", exact: false }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Defer decision", exact: true })
    .click();
  await expect(page.locator(".finding-card")).toContainText("deferred");
  await expect(page.locator(".validation-section")).toHaveCount(0);
  await publish(
    page,
    "The migration ticket defines a strict before-day-30 policy.",
    "exclude",
  );
  await page
    .getByRole("button", { name: "Review proposal", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Exclude day 30");
  await page
    .getByRole("button", {
      name: "Approve this revision and run tests",
      exact: true,
    })
    .click();
  await expect(
    page.locator(".validation-section .section-heading"),
  ).toContainText("pass", { timeout: 30_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("exclusion-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page
    .getByRole("button", {
      name: "Compare supplied corrected version",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("Candidate", { exact: true }),
  ).toHaveValue("corrected-v2");
  await page
    .getByRole("button", { name: "Run comparison without AI", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No mismatch to review", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page
      .getByText("No differences found in the tested cases.", { exact: false })
      .last(),
  ).toBeVisible();
  await expect(page.locator(".validation-section")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review queue", exact: false })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "No unresolved comparisons",
      exact: true,
    }),
  ).toBeVisible();
});
