import { mkdir, writeFile } from "fs/promises";
import path from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";

/** Extract plain text from an uploaded resume (PDF, DOCX, or plain text). */
export async function extractResumeText(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const ext = path.extname(fileName).toLowerCase();
  if (mimeType === "application/pdf" || ext === ".pdf") {
    // deep import avoids pdf-parse's debug harness running on module load
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (b: Buffer) => Promise<{ text: string }>;
    const parsed = await pdfParse(buffer);
    return parsed.text.trim();
  }
  if (
    ext === ".docx" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }
  return buffer.toString("utf-8").trim();
}

/** Persist the raw resume file to disk; returns the stored path. */
export async function storeResumeFile(buffer: Buffer, userId: string, fileName: string): Promise<string> {
  const dir = path.join(UPLOAD_DIR, userId);
  await mkdir(dir, { recursive: true });
  const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const filePath = path.join(dir, safeName);
  await writeFile(filePath, buffer);
  return filePath;
}
