import { existsSync } from "fs";
import type { Browser, Page } from "playwright-core";
import { AnswerMap, answerForLabel, bestOption } from "./answers";

export interface FillResult {
  filled: string[];
  unanswered: string[];
  submitted: boolean;
  error?: string;
}

export const CONFIRMATION_TEXT =
  /thank you|application (was |has been )?submitted|received your application|application received|we('|’)ve received/i;

/**
 * Locate a Chromium-based browser binary. PLAYWRIGHT_EXECUTABLE_PATH wins;
 * otherwise probe the usual install locations per platform.
 */
export function findChromiumExecutable(): string | null {
  const fromEnv = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const candidates = [
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    // Linux
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/opt/pw-browsers/chromium",
    // Windows
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

export async function launchBrowser(headless: boolean): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const executablePath = findChromiumExecutable();
  if (!executablePath) {
    throw new Error(
      "No Chrome/Chromium found. Set PLAYWRIGHT_EXECUTABLE_PATH in .env to your browser binary."
    );
  }
  return chromium.launch({ executablePath, headless });
}

/**
 * Fill every visible labeled field on an application form from the user's
 * stored answers, and attach the resume to any file input.
 */
export async function fillFormFields(
  page: Page,
  answers: AnswerMap,
  resumePath: string | null
): Promise<{ filled: string[]; unanswered: string[] }> {
  const filled: string[] = [];
  const unanswered: string[] = [];

  if (resumePath) {
    const fileInputs = page.locator('input[type="file"]');
    if ((await fileInputs.count()) > 0) {
      await fileInputs.first().setInputFiles(resumePath).catch(() => {});
      filled.push("resume");
    }
  }

  // Text inputs & textareas resolved by their accessible label
  const fields = page.locator(
    "input[type='text'], input[type='email'], input[type='tel'], input:not([type]), textarea"
  );
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

  return { filled, unanswered };
}

/**
 * Fully automatic path: fill the hosted form and — only when `live` — click
 * submit and wait for a confirmation signal.
 */
export async function fillAndSubmit(
  applyUrl: string,
  answers: AnswerMap,
  resumePath: string | null,
  live: boolean
): Promise<FillResult> {
  let browser: Browser | null = null;
  try {
    browser = await launchBrowser(true);
    const page = await browser.newPage();
    await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1500);

    const { filled, unanswered } = await fillFormFields(page, answers, resumePath);

    let submitted = false;
    if (live) {
      const submit = page
        .locator(
          'button[type="submit"], input[type="submit"], button:has-text("Submit application"), button:has-text("Submit Application"), button:has-text("Apply")'
        )
        .first();
      if ((await submit.count()) > 0) {
        await submit.click({ timeout: 10_000 });
        await page
          .waitForSelector(`text=${CONFIRMATION_TEXT}`, { timeout: 15_000 })
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

export async function labelFor(page: Page, field: ReturnType<Page["locator"]>): Promise<string | null> {
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
