import type { Browser, Page } from "playwright-core";
import { AnswerMap, answerForLabel, bestOption } from "./answers";

export interface FillResult {
  filled: string[];
  unanswered: string[];
  submitted: boolean;
  error?: string;
}

/**
 * Generic hosted-form auto-filler for Greenhouse / Lever / Ashby application
 * pages. Fills every visible labeled field from the user's stored answers,
 * attaches the resume, and — only when AUTO_APPLY_LIVE=true — clicks submit.
 *
 * Requires a Chromium binary (PLAYWRIGHT_EXECUTABLE_PATH or a playwright
 * install). Without one, callers fall back to needs_review.
 */
export async function fillAndSubmit(
  applyUrl: string,
  answers: AnswerMap,
  resumePath: string | null,
  live: boolean
): Promise<FillResult> {
  let browser: Browser | null = null;
  try {
    const { chromium } = await import("playwright-core");
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
      headless: true,
    });
    const page = await browser.newPage();
    await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1500);

    const filled: string[] = [];
    const unanswered: string[] = [];

    // Attach resume to any file input
    if (resumePath) {
      const fileInputs = page.locator('input[type="file"]');
      const count = await fileInputs.count();
      if (count > 0) {
        await fileInputs.first().setInputFiles(resumePath).catch(() => {});
        filled.push("resume");
      }
    }

    await fillLabeledFields(page, answers, filled, unanswered);

    let submitted = false;
    if (live) {
      const submit = page
        .locator(
          'button[type="submit"], input[type="submit"], button:has-text("Submit application"), button:has-text("Submit Application"), button:has-text("Apply")'
        )
        .first();
      if ((await submit.count()) > 0) {
        await submit.click({ timeout: 10_000 });
        // wait for confirmation signals
        await page
          .waitForSelector(
            'text=/thank you|application (was |has been )?submitted|received your application/i',
            { timeout: 15_000 }
          )
          .then(() => {
            submitted = true;
          })
          .catch(() => {});
      }
    }

    return { filled, unanswered, submitted };
  } catch (err) {
    return {
      filled: [],
      unanswered: [],
      submitted: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await browser?.close().catch(() => {});
  }
}

async function fillLabeledFields(
  page: Page,
  answers: AnswerMap,
  filled: string[],
  unanswered: string[]
): Promise<void> {
  // Text inputs & textareas resolved by their accessible label
  const fields = page.locator("input[type='text'], input[type='email'], input[type='tel'], input:not([type]), textarea");
  const n = await fields.count();
  for (let i = 0; i < Math.min(n, 60); i++) {
    const field = fields.nth(i);
    try {
      if (!(await field.isVisible())) continue;
      const label = await labelFor(page, field);
      if (!label) continue;
      const answer = answerForLabel(label, answers);
      if (answer) {
        await field.fill(answer, { timeout: 3_000 });
        filled.push(label);
      } else {
        unanswered.push(label);
      }
    } catch {
      /* keep going per-field */
    }
  }

  // Native selects
  const selects = page.locator("select");
  const sn = await selects.count();
  for (let i = 0; i < Math.min(sn, 30); i++) {
    const sel = selects.nth(i);
    try {
      if (!(await sel.isVisible())) continue;
      const label = await labelFor(page, sel);
      if (!label) continue;
      const answer = answerForLabel(label, answers);
      if (!answer) {
        unanswered.push(label);
        continue;
      }
      const options = await sel.locator("option").allTextContents();
      const pick = bestOption(answer, options);
      if (pick) {
        await sel.selectOption({ label: pick }, { timeout: 3_000 });
        filled.push(label);
      } else {
        unanswered.push(label);
      }
    } catch {
      /* keep going */
    }
  }
}

async function labelFor(page: Page, field: ReturnType<Page["locator"]>): Promise<string | null> {
  try {
    const aria = await field.getAttribute("aria-label");
    if (aria) return aria;
    const id = await field.getAttribute("id");
    if (id) {
      const label = page.locator(`label[for="${id}"]`).first();
      if ((await label.count()) > 0) return (await label.textContent())?.trim() ?? null;
    }
    const placeholder = await field.getAttribute("placeholder");
    if (placeholder) return placeholder;
    const name = await field.getAttribute("name");
    return name;
  } catch {
    return null;
  }
}
