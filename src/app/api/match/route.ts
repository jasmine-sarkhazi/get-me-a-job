import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeMatch } from "@/lib/matching";

export const runtime = "nodejs";

/**
 * POST /api/match  { jobs: [{ id, title, description }] }
 * Scores each selected job against the user's active resume.
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resume = await prisma.resume.findFirst({
    where: { userId, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (!resume) {
    return NextResponse.json({ error: "Upload a resume first" }, { status: 400 });
  }

  const body = await req.json();
  const jobs: { id: string; title: string; description: string }[] = Array.isArray(body?.jobs)
    ? body.jobs
    : [];
  if (jobs.length === 0 || jobs.length > 50) {
    return NextResponse.json({ error: "Provide 1-50 jobs to match" }, { status: 400 });
  }

  const results = jobs.map((job) => ({
    id: job.id,
    match: computeMatch(resume.text, job.title ?? "", job.description ?? ""),
  }));

  return NextResponse.json({ results });
}
