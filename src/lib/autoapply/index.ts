import { prisma } from "@/lib/prisma";
import { getGreenhouseJob } from "@/lib/ats/greenhouse";
import type { JobPosting } from "@/lib/ats/types";
import type { MatchResult } from "@/lib/matching";
import { AnswerMap, answerForLabel } from "./answers";
import { fillAndSubmit } from "./browser";

export interface ApplyOutcome {
  applicationId: string;
  status: "submitted" | "needs_review" | "failed";
  detail: string;
}

export function applyUrlFor(job: Pick<JobPosting, "source" | "url">): string {
  if (job.source === "lever") return `${job.url.replace(/\/$/, "")}/apply`;
  if (job.source === "ashby" && !job.url.includes("/application")) {
    return `${job.url.replace(/\/$/, "")}/application`;
  }
  return job.url; // greenhouse hosted pages include the form inline
}

/**
 * Auto-apply pipeline:
 *  1. Create the Application record (queued) so nothing is ever lost.
 *  2. Pre-check coverage: for Greenhouse we fetch the posting's real questions
 *     and verify the stored profile can answer the required ones.
 *  3. Fill the hosted form via headless browser and submit (when
 *     AUTO_APPLY_LIVE=true; otherwise records a dry run as needs_review).
 *  4. Record the outcome + answer snapshot for tracking.
 */
export async function autoApply(
  userId: string,
  job: JobPosting,
  match: MatchResult,
  answers: AnswerMap,
  resumePath: string | null
): Promise<ApplyOutcome> {
  const application = await prisma.application.create({
    data: {
      userId,
      source: job.source,
      externalId: job.externalId,
      jobTitle: job.title,
      company: job.company,
      jobUrl: job.url,
      location: job.location,
      matchScore: match.score,
      matchDetail: JSON.stringify(match),
      status: "queued",
      method: "auto",
      answersUsed: JSON.stringify(answers),
    },
  });

  // Coverage pre-check against the posting's real required questions (Greenhouse
  // exposes these via its public API).
  const missing: string[] = [];
  if (job.source === "greenhouse") {
    const [board, ghId] = job.externalId.split("/");
    const detail = await getGreenhouseJob(board, ghId);
    for (const q of detail?.questions ?? []) {
      const isFile = q.fields?.[0]?.type === "input_file";
      if (q.required && !isFile && !answerForLabel(q.label, answers)) {
        missing.push(q.label);
      }
    }
  }
  if (missing.length > 0) {
    return finish(application.id, "needs_review", `Missing required answers: ${missing.join("; ")}`);
  }

  const live = process.env.AUTO_APPLY_LIVE === "true";
  const result = await fillAndSubmit(applyUrlFor(job), answers, resumePath, live);

  if (result.error) {
    return finish(application.id, "failed", `Auto-fill error: ${result.error}`);
  }
  if (!live) {
    return finish(
      application.id,
      "needs_review",
      `Form fill verified (${result.filled.length} fields; auto-submit is off)` +
        (result.unanswered.length ? `; no stored answer for: ${result.unanswered.slice(0, 5).join("; ")}` : "") +
        ". Use Review & submit on the Applications page to finish in your browser."
    );
  }
  if (result.submitted) {
    return finish(application.id, "submitted", `Submitted; filled ${result.filled.length} fields`);
  }
  return finish(
    application.id,
    "needs_review",
    `Form filled (${result.filled.length} fields) but submission was not confirmed — review manually`
  );
}

async function finish(
  applicationId: string,
  status: ApplyOutcome["status"],
  detail: string
): Promise<ApplyOutcome> {
  await prisma.application.update({ where: { id: applicationId }, data: { status } });
  await prisma.applicationEvent.create({
    data: { applicationId, type: status === "failed" ? "error" : "applied", detail },
  });
  return { applicationId, status, detail };
}
