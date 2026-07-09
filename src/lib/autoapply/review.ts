import { prisma } from "@/lib/prisma";
import { AnswerMap } from "./answers";
import { CONFIRMATION_TEXT, fillFormFields, launchBrowser } from "./browser";

export interface ReviewSessionResult {
  filled: string[];
  unanswered: string[];
}

/**
 * Human-in-the-loop apply: open a VISIBLE browser window on the application
 * form, pre-fill it from the user's stored answers, attach the resume — then
 * leave the window open for the user to review and click submit themselves.
 *
 * A background watcher keeps observing the tab: when the ATS confirmation
 * page appears, the application flips to `submitted` in the tracker; if the
 * window is closed without a confirmation, that's recorded too and the
 * status stays `needs_review`.
 */
export async function openReviewSession(
  applicationId: string,
  applyUrl: string,
  answers: AnswerMap,
  resumePath: string | null
): Promise<ReviewSessionResult> {
  // Headless override for automated tests / display-less environments.
  const headless = process.env.REVIEW_BROWSER_HEADLESS === "true";
  const browser = await launchBrowser(headless);

  try {
    const page = await browser.newPage();
    await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1500);
    const { filled, unanswered } = await fillFormFields(page, answers, resumePath);

    await prisma.applicationEvent.create({
      data: {
        applicationId,
        type: "note",
        detail:
          `Review session opened: form pre-filled (${filled.length} fields)` +
          (unanswered.length ? `; no stored answer for: ${unanswered.slice(0, 6).join("; ")}` : "") +
          ". Waiting for you to review and hit submit in the browser window.",
      },
    });

    // Fire-and-forget watcher: the HTTP response returns immediately while
    // the browser stays open under the dev server process.
    void watchForSubmission(applicationId, browser, page);

    return { filled, unanswered };
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
}

async function watchForSubmission(
  applicationId: string,
  browser: Awaited<ReturnType<typeof launchBrowser>>,
  page: Awaited<ReturnType<Awaited<ReturnType<typeof launchBrowser>>["newPage"]>>
): Promise<void> {
  const THIRTY_MINUTES = 30 * 60_000;
  try {
    await page.waitForSelector(`text=${CONFIRMATION_TEXT}`, { timeout: THIRTY_MINUTES });
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: "submitted", method: "reviewed" },
    });
    await prisma.applicationEvent.create({
      data: {
        applicationId,
        type: "applied",
        detail: "Submitted — you reviewed the pre-filled form and the ATS confirmed the application.",
      },
    });
    // Give the user a moment to see the confirmation, then tidy up.
    await page.waitForTimeout(5_000).catch(() => {});
    await browser.close().catch(() => {});
  } catch {
    // Window closed or 30 minutes passed without a confirmation page.
    await prisma.applicationEvent
      .create({
        data: {
          applicationId,
          type: "note",
          detail:
            "Review session ended without a detected confirmation. If you did submit, the ATS may use a custom confirmation page — update the status manually if needed.",
        },
      })
      .catch(() => {});
    await browser.close().catch(() => {});
  }
}
