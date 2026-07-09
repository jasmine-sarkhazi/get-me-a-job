"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ResumeUpload } from "@/components/ResumeUpload";
import { QuestionForm } from "@/components/QuestionForm";
import { RolePicker } from "@/components/RolePicker";

const STEPS = ["Resume", "Application answers", "Target roles"] as const;

export default function Onboarding() {
  const { status } = useSession();
  const [step, setStep] = useState(0);

  if (status === "unauthenticated") {
    return (
      <div className="card mx-auto max-w-lg text-center">
        <p>Sign in with Google to set up your profile.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-white">Set up your profile</h1>
      <p className="mt-1 text-sm text-slate-400">
        Three steps, once. After this, the agent handles the paperwork.
      </p>

      <div className="mt-6 flex gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => setStep(i)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
              i === step
                ? "border-accent-500 bg-ink-800 text-white"
                : "border-ink-700 text-slate-400 hover:text-white"
            }`}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      <div className="card mt-6">
        {step === 0 && (
          <>
            <h2 className="mb-3 text-lg font-semibold text-white">Upload your resume</h2>
            <ResumeUpload onUploaded={() => setStep(1)} />
          </>
        )}
        {step === 1 && (
          <>
            <h2 className="mb-3 text-lg font-semibold text-white">
              The questions every application asks
            </h2>
            <QuestionForm onSaved={() => setStep(2)} submitLabel="Save & continue" />
          </>
        )}
        {step === 2 && (
          <>
            <h2 className="mb-3 text-lg font-semibold text-white">What are you looking for?</h2>
            <RolePicker />
            <div className="mt-6 border-t border-ink-700 pt-4">
              <Link href="/search" className="btn-primary">
                Done — take me to the jobs →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
