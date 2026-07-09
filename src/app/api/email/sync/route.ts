import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { syncInbox } from "@/lib/gmail";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST /api/email/sync — scan Gmail for recruiter replies and update tracking. */
export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await syncInbox(userId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Inbox sync failed" },
      { status: 500 }
    );
  }
}
