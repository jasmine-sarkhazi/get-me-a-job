import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aggregateJobs } from "@/lib/ats/aggregate";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/jobs/search?titles=Product%20Manager,Growth%20PM
 * Titles default to the user's saved role preferences.
 */
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const param = req.nextUrl.searchParams.get("titles");
  let titles = param ? param.split(",").map((t) => t.trim()).filter(Boolean) : [];
  if (titles.length === 0) {
    const pref = await prisma.rolePreference.findUnique({ where: { userId } });
    titles = pref ? (JSON.parse(pref.titles) as string[]) : [];
  }
  if (titles.length === 0) {
    return NextResponse.json(
      { error: "No target roles set. Add the titles you're looking for first.", jobs: [] },
      { status: 400 }
    );
  }

  const jobs = await aggregateJobs(titles);

  // annotate jobs the user already applied to
  const applied = await prisma.application.findMany({
    where: { userId },
    select: { source: true, externalId: true },
  });
  const appliedSet = new Set(applied.map((a) => `${a.source}:${a.externalId}`));

  return NextResponse.json({
    titles,
    count: jobs.length,
    jobs: jobs.slice(0, 200).map((j) => ({
      ...j,
      description: j.description.slice(0, 12_000),
      alreadyApplied: appliedSet.has(j.id),
    })),
  });
}
