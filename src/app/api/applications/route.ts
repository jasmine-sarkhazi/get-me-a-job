import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const applications = await prisma.application.findMany({
    where: { userId },
    orderBy: { appliedAt: "desc" },
    include: { events: { orderBy: { occurredAt: "desc" }, take: 5 } },
  });

  return NextResponse.json({
    applications: applications.map((a) => ({
      id: a.id,
      jobTitle: a.jobTitle,
      company: a.company,
      jobUrl: a.jobUrl,
      location: a.location,
      source: a.source,
      matchScore: a.matchScore,
      matchDetail: safeParse(a.matchDetail),
      answersUsed: safeParse(a.answersUsed),
      status: a.status,
      method: a.method,
      appliedAt: a.appliedAt,
      events: a.events.map((e) => ({
        type: e.type,
        detail: safeParse(e.detail),
        occurredAt: e.occurredAt,
      })),
    })),
  });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
