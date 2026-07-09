"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";

const links = [
  { href: "/search", label: "Job Search" },
  { href: "/applications", label: "Applications" },
  { href: "/profile", label: "My Data" },
];

export function Nav() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  return (
    <header className="border-b border-ink-700 bg-ink-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-lg font-bold text-white">
            get<span className="text-accent-400">me</span>ajob
          </Link>
          {session && (
            <nav className="flex gap-1">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    pathname.startsWith(l.href)
                      ? "bg-ink-700 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3">
          {status === "loading" ? null : session ? (
            <>
              <span className="hidden text-sm text-slate-400 sm:block">
                {session.user?.email}
              </span>
              <button onClick={() => signOut({ callbackUrl: "/" })} className="btn-secondary">
                Sign out
              </button>
            </>
          ) : (
            <button onClick={() => signIn("google", { callbackUrl: "/onboarding" })} className="btn-primary">
              Sign in with Google
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
