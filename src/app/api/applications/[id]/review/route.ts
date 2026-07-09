import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyUrlFor } from "@/lib/autoapply";
import { openReviewSession } from "@/lib/autoapply/review";
import type { JobSource } from "@/lib/ats/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/applications/:id/review
 *
 * Opens a visible browser window with the job's application form pre-filled
 * from the user's stored answers (resume attached) so they can review and hit
 * submit themselves. A watcher updates the tracker when the ATS confirms.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const application = await prisma.application.findFirst({ where: { id, userId } });
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (application.status === "submitted") {
    return NextResponse.json({ error: "This application was already submitted" }, { status: 400 });
  }

  const [profile, resume] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.resume.findFirst({ where: { userId, isActive: true }, orderBy: { createdAt: "desc" } }),
  ]);
  // Prefer current profile answers; fall back to the snapshot taken at apply time.
  const snapshot = JSON.parse(application.answersUsed || "{}") as Record<string, string>;
  const current = profile ? (JSON.parse(profile.answers) as Record<string, string>) : {};
  const answers = { ...snapshot, ...current };

  const applyUrl = applyUrlFor({
    source: application.source as JobSource,
    url: application.jobUrl,
  });

  try {
    const result = await openReviewSession(application.id, applyUrl, answers, resume?.filePath ?? null);
    return NextResponse.json({
      opened: true,
      filled: result.filled.length,
      unanswered: result.unanswered,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not open the review browser" },
      { status: 500 }
    );
  }
}
