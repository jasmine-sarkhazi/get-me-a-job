"use client";

import { useEffect, useState } from "react";

interface ResumeInfo {
  id: string;
  fileName: string;
  createdAt: string;
}

export function ResumeUpload({ onUploaded }: { onUploaded?: () => void }) {
  const [resume, setResume] = useState<ResumeInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/resume")
      .then((r) => r.json())
      .then((d) => setResume(d.resume ?? null));
  }, []);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/resume", { method: "POST", body: form });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) {
      setError(data.error ?? "Upload failed");
      return;
    }
    setResume(data.resume);
    onUploaded?.();
  }

  return (
    <div>
      {resume ? (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-green-800 bg-green-950/40 px-4 py-3">
          <span className="text-green-400">✓</span>
          <div>
            <p className="text-sm font-medium text-white">{resume.fileName}</p>
            <p className="text-xs text-slate-400">
              Uploaded {new Date(resume.createdAt).toLocaleDateString()} — used for matching and
              every application
            </p>
          </div>
        </div>
      ) : (
        <p className="mb-4 text-sm text-slate-400">
          Upload once. We extract the text for ATS-style matching and attach the file to every
          auto-application.
        </p>
      )}
      <label className="btn-secondary cursor-pointer">
        {uploading ? "Parsing…" : resume ? "Replace resume" : "Upload resume (PDF or DOCX)"}
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
      </label>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
