"use client";

import Link from "next/link";
import { signIn, useSession } from "next-auth/react";

const steps = [
  {
    title: "Upload your resume once",
    body: "We parse it, store it, and never ask you to retype your work history again.",
  },
  {
    title: "Answer the ATS questions once",
    body: "We harvest the real questions Greenhouse, Ashby, Lever and Jobvite forms ask, and you answer them a single time.",
  },
  {
    title: "Tell us your target roles",
    body: "The agent sweeps live job boards across the web for postings matching your titles.",
  },
  {
    title: "Match, auto-apply, track",
    body: "ATS-style scoring rates every job against your resume. Anything above your threshold can be auto-applied, and your Gmail is watched for replies.",
  },
];

export default function Home() {
  const { data: session } = useSession();

  return (
    <div className="py-8">
      <section className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold text-white sm:text-5xl">
          Job searching is a full-time job.
          <br />
          <span className="text-accent-400">Give it to an agent.</span>
        </h1>
        <p className="mt-5 text-lg text-slate-400">
          Stop copy-pasting the same answers into the same forms. GetMeAJob searches, matches,
          applies, and tracks — you just interview.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          {session ? (
            <>
              <Link href="/onboarding" className="btn-primary text-base">
                Set up my profile
              </Link>
              <Link href="/search" className="btn-secondary text-base">
                Search jobs
              </Link>
            </>
          ) : (
            <button
              onClick={() => signIn("google", { callbackUrl: "/onboarding" })}
              className="btn-primary text-base"
            >
              Get started with Google
            </button>
          )}
        </div>
      </section>

      <section className="mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-2">
        {steps.map((s, i) => (
          <div key={s.title} className="card">
            <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent-500 text-sm font-bold text-white">
              {i + 1}
            </div>
            <h3 className="font-semibold text-white">{s.title}</h3>
            <p className="mt-1 text-sm text-slate-400">{s.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
