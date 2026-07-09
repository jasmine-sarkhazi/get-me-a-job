import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractResumeText, storeResumeFile } from "@/lib/resume";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const resume = await prisma.resume.findFirst({
    where: { userId, isActive: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, mimeType: true, createdAt: true, text: true },
  });
  return NextResponse.json({ resume });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    text = await extractResumeText(buffer, file.type, file.name);
  } catch {
    return NextResponse.json(
      { error: "Could not read that file. Upload a PDF, DOCX, or TXT resume." },
      { status: 422 }
    );
  }
  if (text.length < 100) {
    return NextResponse.json(
      { error: "Could not extract enough text from the resume. Try a text-based PDF or DOCX." },
      { status: 422 }
    );
  }

  const filePath = await storeResumeFile(buffer, userId, file.name);
  await prisma.resume.updateMany({ where: { userId }, data: { isActive: false } });
  const resume = await prisma.resume.create({
    data: { userId, fileName: file.name, mimeType: file.type, filePath, text },
    select: { id: true, fileName: true, createdAt: true },
  });

  return NextResponse.json({ resume, extractedChars: text.length });
}
