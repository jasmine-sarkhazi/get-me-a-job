import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getQuestionSet, harvestAndStoreQuestions } from "@/lib/ats/questions";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const questions = await getQuestionSet();
  return NextResponse.json({ questions });
}

/** Re-harvest questions from live Greenhouse/Ashby boards. */
export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const count = await harvestAndStoreQuestions();
  const questions = await getQuestionSet();
  return NextResponse.json({ harvested: count, questions });
}
