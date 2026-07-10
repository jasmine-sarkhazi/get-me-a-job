import { existsSync } from "fs";
import type { Browser, Frame, Locator, Page } from "playwright-core";
import { AnswerMap, answerForLabel, bestOption } from "./answers";

export interface FillResult {
  filled: string[];
  unanswered: string[];
  submitted: boolean;
  error?: string;
}

export const CONFIRMATION_TEXT =
  /thank you|application (was |has been )?submitted|received your application|application received|we('|’)ve received/i;

/** A Page or an embedded Frame — both expose the same locator API we need. */
type FormScope = Page | Frame;

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

const FIELD_SELECTOR =
  "input[type='text'], input[type='email'], input[type='tel'], input:not([type]), textarea, select, input[type='radio'], [role='combobox']";

/**
 * Application forms are frequently embedded in an iframe (e.g. Greenhouse
 * boards on a company's own careers page). Pick the frame that actually
 * contains the form: prefer known-ATS frame URLs, otherwise whichever frame
 * has the most form fields.
 */
async function pickFormScope(page: Page): Promise<FormScope> {
  const frames = page.frames().filter((f) => f !== page.mainFrame());
  const atsFrame = frames.find((f) => /greenhouse\.io|lever\.co|ashbyhq\.com|jobvite\.com/i.test(f.url()));
  const candidates: FormScope[] = atsFrame ? [atsFrame, page, ...frames] : [page, ...frames];

  let best: FormScope = page;
  let bestCount = -1;
  for (const scope of candidates) {
    const count = await scope
      .locator(FIELD_SELECTOR)
      .count()
      .catch(() => 0);
    if (count > bestCount) {
      best = scope;
      bestCount = count;
    }
    // an ATS frame with real fields wins immediately
    if (scope === atsFrame && count > 3) return scope;
  }
  return best;
}

/**
 * Some hosted boards (Greenhouse job-boards UI, Ashby) hide the form behind
 * an "Apply" button/tab. If no fillable field is visible yet, click it.
 */
async function revealForm(scope: FormScope): Promise<void> {
  const visibleField = scope.locator("input[type='text']:visible, textarea:visible").first();
  if ((await visibleField.count()) > 0 && (await visibleField.isVisible().catch(() => false))) return;

  const reveal = scope
    .locator(
      'button[aria-label="Apply"], button:has-text("Apply for this job"), a:has-text("Apply for this job"), button:has-text("Apply now"), a:has-text("Apply now"), button:has-text("Apply")'
    )
    .first();
  if ((await reveal.count()) > 0) {
    await reveal.click({ timeout: 5_000 }).catch(() => {});
    await scope.waitForTimeout?.(1_500).catch(() => {});
  }
}

async function resolveLabel(scope: FormScope, field: Locator): Promise<string | null> {
  try {
    const aria = await field.getAttribute("aria-label");
    if (aria?.trim()) return aria.trim();

    // aria-labelledby → concatenate referenced elements' text (Greenhouse
    // react-select comboboxes use id="...-label" references)
    const labelledBy = await field.getAttribute("aria-labelledby");
    if (labelledBy) {
      const parts: string[] = [];
      for (const id of labelledBy.split(/\s+/).filter(Boolean).slice(0, 3)) {
        const el = scope.locator(`[id="${id}"]`).first();
        if ((await el.count()) > 0) {
          const text = (await el.textContent().catch(() => null))?.trim();
          if (text) parts.push(text);
        }
      }
      if (parts.length) return parts.join(" ");
    }

    const id = await field.getAttribute("id");
    if (id) {
      const label = scope.locator(`label[for="${id}"]`).first();
      if ((await label.count()) > 0) {
        const text = (await label.textContent().catch(() => null))?.trim();
        if (text) return text;
      }
    }

    // input wrapped inside its <label>
    const wrapping = field.locator("xpath=ancestor::label[1]");
    if ((await wrapping.count()) > 0) {
      const text = (await wrapping.textContent().catch(() => null))?.trim();
      if (text) return text;
    }

    // autocomplete attribute names the canonical field
    const autocomplete = await field.getAttribute("autocomplete");
    const AUTOCOMPLETE_MAP: Record<string, string> = {
      "given-name": "First Name",
      "family-name": "Last Name",
      name: "Full Name",
      email: "Email",
      tel: "Phone",
      "address-level2": "City",
      country: "Country",
      "country-name": "Country",
      organization: "Company",
    };
    if (autocomplete && AUTOCOMPLETE_MAP[autocomplete]) return AUTOCOMPLETE_MAP[autocomplete];

    const placeholder = await field.getAttribute("placeholder");
    if (placeholder?.trim()) return placeholder.trim();
    return await field.getAttribute("name");
  } catch {
    return null;
  }
}

/**
 * Fill every labeled field on an application form from the user's stored
 * answers: text inputs, textareas, native selects, react-select style
 * comboboxes, radio groups — and attach the resume to file inputs.
 * Handles forms living inside iframes.
 */
export async function fillFormFields(
  page: Page,
  answers: AnswerMap,
  resumePath: string | null
): Promise<{ filled: string[]; unanswered: string[] }> {
  const filled: string[] = [];
  const unanswered: string[] = [];
  const scope = await pickFormScope(page);
  await revealForm(scope);

  // --- Resume upload (file inputs are often visually hidden — that's fine) ---
  if (resumePath) {
    const fileInputs = scope.locator('input[type="file"]');
    const count = await fileInputs.count();
    for (let i = 0; i < Math.min(count, 2); i++) {
      const input = fileInputs.nth(i);
      const id = (await input.getAttribute("id").catch(() => "")) ?? "";
      // attach to the resume input; skip a separate cover-letter upload
      if (i === 0 || /resume|cv/i.test(id)) {
        const ok = await input
          .setInputFiles(resumePath, { timeout: 5_000 })
          .then(() => true)
          .catch(() => false);
        if (ok) {
          filled.push("resume");
          break;
        }
      }
    }
  }

  // --- Text inputs & textareas (comboboxes handled separately) ---
  const fields = scope.locator(
    "input[type='text']:not([role='combobox']), input[type='email'], input[type='tel'], input:not([type]):not([role='combobox']), textarea"
  );
  const n = await fields.count();
  for (let i = 0; i < Math.min(n, 60); i++) {
    const field = fields.nth(i);
    try {
      if (!(await field.isVisible())) continue;
      const label = await resolveLabel(scope, field);
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

  // --- Native selects ---
  const selects = scope.locator("select");
  const sn = await selects.count();
  for (let i = 0; i < Math.min(sn, 30); i++) {
    const sel = selects.nth(i);
    try {
      if (!(await sel.isVisible())) continue;
      const label = await resolveLabel(scope, sel);
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

  // --- react-select style comboboxes (Greenhouse's new UI, Ashby) ---
  const combos = scope.locator("[role='combobox']");
  const cn = await combos.count();
  for (let i = 0; i < Math.min(cn, 30); i++) {
    const combo = combos.nth(i);
    try {
      if (!(await combo.isVisible())) continue;
      const label = await resolveLabel(scope, combo);
      if (!label) continue;
      const answer = answerForLabel(label, answers);
      if (!answer) {
        unanswered.push(label);
        continue;
      }
      await combo.click({ timeout: 3_000 });
      await combo.pressSequentially(answer.slice(0, 40), { timeout: 5_000, delay: 15 });
      await page.waitForTimeout(600);
      const options = scope.locator("[role='option']");
      const texts = await options.allTextContents();
      const pick = bestOption(answer, texts);
      const idx = pick ? texts.indexOf(pick) : texts.length === 1 ? 0 : -1;
      if (idx >= 0) {
        await options.nth(idx).click({ timeout: 3_000 });
        filled.push(label);
      } else if (texts.length > 0) {
        // no clean match — take the top suggestion for typed text
        await options.first().click({ timeout: 3_000 });
        filled.push(`${label} (best guess)`);
      } else {
        await combo.press("Escape").catch(() => {});
        unanswered.push(label);
      }
    } catch {
      /* keep going */
    }
  }

  // --- Radio groups (Yes/No questions) ---
  const radios = scope.locator("input[type='radio']");
  const rn = await radios.count();
  const seenGroups = new Set<string>();
  for (let i = 0; i < Math.min(rn, 40); i++) {
    const radio = radios.nth(i);
    try {
      const name = (await radio.getAttribute("name")) ?? `radio-${i}`;
      if (seenGroups.has(name)) continue;
      seenGroups.add(name);
      const group = scope.locator(`input[type='radio'][name="${name}"]`);
      const gn = await group.count();

      // group label: the enclosing fieldset's legend, else nearest heading
      const legend = radio.locator("xpath=ancestor::fieldset[1]/legend");
      const label =
        (await legend.count()) > 0
          ? (await legend.textContent().catch(() => null))?.trim() ?? null
          : await resolveLabel(scope, radio);
      if (!label) continue;
      const answer = answerForLabel(label, answers);
      if (!answer) {
        unanswered.push(label);
        continue;
      }

      const optionLabels: string[] = [];
      for (let j = 0; j < gn; j++) {
        optionLabels.push((await resolveLabel(scope, group.nth(j))) ?? "");
      }
      const pick = bestOption(answer, optionLabels);
      const idx = pick ? optionLabels.indexOf(pick) : -1;
      if (idx >= 0) {
        await group.nth(idx).check({ timeout: 3_000 }).catch(async () => {
          await group.nth(idx).click({ timeout: 3_000, force: true });
        });
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
    await page.waitForTimeout(2_500);

    const { filled, unanswered } = await fillFormFields(page, answers, resumePath);

    let submitted = false;
    if (live) {
      const scope = await pickFormScope(page);
      const submit = scope
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
