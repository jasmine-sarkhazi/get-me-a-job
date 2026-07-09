import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await prisma.profile.findUnique({ where: { userId } });
  return NextResponse.json({ answers: profile ? JSON.parse(profile.answers) : {} });
}

export async function PUT(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (typeof body?.answers !== "object" || body.answers === null) {
    return NextResponse.json({ error: "answers object required" }, { status: 400 });
  }
  // merge with existing answers so partial saves never wipe data
  const existing = await prisma.profile.findUnique({ where: { userId } });
  const merged = { ...(existing ? JSON.parse(existing.answers) : {}), ...body.answers };
  const profile = await prisma.profile.upsert({
    where: { userId },
    create: { userId, answers: JSON.stringify(merged) },
    update: { answers: JSON.stringify(merged) },
  });
  return NextResponse.json({ answers: JSON.parse(profile.answers) });
}
