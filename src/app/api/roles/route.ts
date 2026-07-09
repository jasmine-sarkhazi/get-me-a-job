import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function serialize(pref: { titles: string; locations: string; remoteOnly: boolean; autoApplyThreshold: number; autoApplyEnabled: boolean } | null) {
  return {
    titles: pref ? (JSON.parse(pref.titles) as string[]) : [],
    locations: pref ? (JSON.parse(pref.locations) as string[]) : [],
    remoteOnly: pref?.remoteOnly ?? false,
    autoApplyThreshold: pref?.autoApplyThreshold ?? 95,
    autoApplyEnabled: pref?.autoApplyEnabled ?? false,
  };
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const pref = await prisma.rolePreference.findUnique({ where: { userId } });
  return NextResponse.json(serialize(pref));
}

export async function PUT(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const titles = Array.isArray(body.titles) ? body.titles.map(String).filter(Boolean) : undefined;
  const locations = Array.isArray(body.locations) ? body.locations.map(String).filter(Boolean) : undefined;

  const pref = await prisma.rolePreference.upsert({
    where: { userId },
    create: {
      userId,
      titles: JSON.stringify(titles ?? []),
      locations: JSON.stringify(locations ?? []),
      remoteOnly: Boolean(body.remoteOnly ?? false),
      autoApplyThreshold: clampThreshold(body.autoApplyThreshold),
      autoApplyEnabled: Boolean(body.autoApplyEnabled ?? false),
    },
    update: {
      ...(titles !== undefined && { titles: JSON.stringify(titles) }),
      ...(locations !== undefined && { locations: JSON.stringify(locations) }),
      ...(body.remoteOnly !== undefined && { remoteOnly: Boolean(body.remoteOnly) }),
      ...(body.autoApplyThreshold !== undefined && { autoApplyThreshold: clampThreshold(body.autoApplyThreshold) }),
      ...(body.autoApplyEnabled !== undefined && { autoApplyEnabled: Boolean(body.autoApplyEnabled) }),
    },
  });
  return NextResponse.json(serialize(pref));
}

function clampThreshold(v: unknown): number {
  const n = Number(v);
  if (Number.isNaN(n)) return 95;
  return Math.min(100, Math.max(50, Math.round(n)));
}
