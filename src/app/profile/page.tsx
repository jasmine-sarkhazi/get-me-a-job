"use client";

import { ResumeUpload } from "@/components/ResumeUpload";
import { QuestionForm } from "@/components/QuestionForm";
import { RolePicker } from "@/components/RolePicker";

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-white">My data</h1>
      <div className="card">
        <h2 className="mb-3 text-lg font-semibold text-white">Resume</h2>
        <ResumeUpload />
      </div>
      <div className="card">
        <h2 className="mb-3 text-lg font-semibold text-white">Stored application answers</h2>
        <QuestionForm />
      </div>
      <div className="card">
        <h2 className="mb-3 text-lg font-semibold text-white">Roles & auto-apply</h2>
        <RolePicker />
      </div>
    </div>
  );
}
