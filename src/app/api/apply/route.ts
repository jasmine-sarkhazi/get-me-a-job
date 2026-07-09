import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeMatch } from "@/lib/matching";
import { autoApply } from "@/lib/autoapply";
import type { JobPosting, JobSource } from "@/lib/ats/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ApplyRequestJob {
  id: string;
  source: JobSource;
  externalId: string;
  title: string;
  company: string;
  location?: string;
  url: string;
  description: string;
}

/**
 * POST /api/apply  { jobs: ApplyRequestJob[], force?: boolean }
 *
 * Auto-applies to each job that scores at or above the user's threshold
 * (default 95%). Match scores are recomputed server-side — the client cannot
 * forge a score. `force: true` (one-click apply on a specific job) skips the
 * threshold gate — the user explicitly chose that job — but still records the
 * real computed score in the tracker.
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [resume, profile, pref] = await Promise.all([
    prisma.resume.findFirst({ where: { userId, isActive: true }, orderBy: { createdAt: "desc" } }),
    prisma.profile.findUnique({ where: { userId } }),
    prisma.rolePreference.findUnique({ where: { userId } }),
  ]);
  if (!resume) return NextResponse.json({ error: "Upload a resume first" }, { status: 400 });
  if (!profile) {
    return NextResponse.json({ error: "Complete the application questions first" }, { status: 400 });
  }
  const answers = JSON.parse(profile.answers) as Record<string, string>;
  const threshold = pref?.autoApplyThreshold ?? 95;

  const body = await req.json();
  const jobs: ApplyRequestJob[] = Array.isArray(body?.jobs) ? body.jobs.slice(0, 20) : [];
  const force = body?.force === true;
  if (jobs.length === 0) return NextResponse.json({ error: "No jobs provided" }, { status: 400 });

  const results = [];
  for (const job of jobs) {
    const match = computeMatch(resume.text, job.title, job.description ?? "");
    if (!force && match.score < threshold) {
      results.push({
        id: job.id,
        skipped: true,
        reason: `Match ${match.score}% is below your ${threshold}% auto-apply threshold`,
        score: match.score,
      });
      continue;
    }

    const already = await prisma.application.findFirst({
      where: { userId, source: job.source, externalId: job.externalId },
    });
    if (already) {
      results.push({ id: job.id, skipped: true, reason: "Already applied", score: match.score });
      continue;
    }

    const posting: JobPosting = {
      id: job.id,
      source: job.source,
      externalId: job.externalId,
      title: job.title,
      company: job.company,
      location: job.location ?? "",
      url: job.url,
      description: job.description ?? "",
    };
    const outcome = await autoApply(userId, posting, match, answers, resume.filePath);
    results.push({ id: job.id, skipped: false, score: match.score, ...outcome });
  }

  return NextResponse.json({ threshold, results });
}
