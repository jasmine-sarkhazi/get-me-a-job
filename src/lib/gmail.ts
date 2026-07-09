import { prisma } from "@/lib/prisma";

/**
 * Gmail inbox sync: reads the user's inbox (gmail.readonly scope granted at
 * Google sign-in) for replies about tracked applications and updates status.
 */

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

/** Get a valid Gmail access token for the user, refreshing if expired. */
export async function getGmailAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account?.access_token) return null;

  const expired = (account.expires_at ?? 0) * 1000 < Date.now() + 60_000;
  if (!expired) return account.access_token;
  if (!account.refresh_token) return account.access_token;

  const refreshed = await refreshAccessToken(account.refresh_token);
  if (!refreshed) return null;
  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: refreshed.access_token,
      expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in,
    },
  });
  return refreshed.access_token;
}

interface GmailMessageMeta {
  id: string;
  snippet?: string;
  payload?: { headers?: { name: string; value: string }[] };
  internalDate?: string;
}

async function gmailSearch(token: string, query: string): Promise<string[]> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { messages?: { id: string }[] };
  return (data.messages ?? []).map((m) => m.id);
}

async function gmailGetMessage(token: string, id: string): Promise<GmailMessageMeta | null> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  return res.json();
}

/** Classify a recruiting email into an application status by its content. */
export function classifyEmail(subject: string, snippet: string): string | null {
  const text = `${subject} ${snippet}`.toLowerCase();
  if (/(offer letter|pleased to offer|extend an offer)/.test(text)) return "offer";
  if (/(unfortunately|not (be )?moving forward|other candidates|decided to pursue|not selected|position has been filled)/.test(text)) return "rejected";
  if (/(interview|schedule a (call|chat|conversation)|speak with you|meet (with )?the team|phone screen|availability)/.test(text)) return "interview";
  if (/(assessment|coding challenge|take-home|hackerrank|codesignal|exercise)/.test(text)) return "assessment";
  if (/(received your application|thank you for applying|application (was |has been )?received|confirm your application)/.test(text)) return "submitted";
  return null;
}

const STATUS_RANK: Record<string, number> = {
  queued: 0, needs_review: 0, failed: 0,
  submitted: 1, assessment: 2, interview: 3, offer: 5, rejected: 4,
};

/**
 * For each active application, search the inbox for recruiter replies since
 * the applied date and update tracking. Returns count of updates made.
 */
export async function syncInbox(userId: string): Promise<{ scanned: number; updates: number }> {
  const token = await getGmailAccessToken(userId);
  if (!token) throw new Error("No Google account connected or Gmail permission missing");

  const applications = await prisma.application.findMany({
    where: { userId, status: { notIn: ["rejected", "offer", "archived"] } },
    orderBy: { appliedAt: "desc" },
    take: 50,
  });

  let scanned = 0;
  let updates = 0;
  for (const app of applications) {
    const daysAgo = Math.max(1, Math.ceil((Date.now() - app.appliedAt.getTime()) / 86_400_000) + 1);
    const company = app.company.replace(/["()]/g, "");
    const query = `("${company}") (application OR interview OR position OR "${app.jobTitle.split(",")[0]}") newer_than:${Math.min(daysAgo, 180)}d -category:promotions`;

    const ids = await gmailSearch(token, query);
    for (const id of ids) {
      scanned += 1;
      const msg = await gmailGetMessage(token, id);
      if (!msg) continue;
      const subject = msg.payload?.headers?.find((h) => h.name === "Subject")?.value ?? "";
      const from = msg.payload?.headers?.find((h) => h.name === "From")?.value ?? "";
      const status = classifyEmail(subject, msg.snippet ?? "");
      if (!status) continue;

      // record the email once per application
      const existing = await prisma.applicationEvent.findUnique({
        where: { applicationId_emailId: { applicationId: app.id, emailId: id } },
      });
      if (existing) continue;

      await prisma.applicationEvent.create({
        data: {
          applicationId: app.id,
          type: "email_received",
          detail: JSON.stringify({ subject, from, snippet: msg.snippet, classified: status }),
          emailId: id,
          occurredAt: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(),
        },
      });

      // only move status forward (don't let a late confirmation email downgrade "interview")
      if ((STATUS_RANK[status] ?? 0) > (STATUS_RANK[app.status] ?? 0)) {
        await prisma.application.update({ where: { id: app.id }, data: { status } });
        await prisma.applicationEvent.create({
          data: {
            applicationId: app.id,
            type: "status_change",
            detail: `Status updated to "${status}" from inbox: ${subject}`,
          },
        });
        app.status = status;
      }
      updates += 1;
    }
  }
  return { scanned, updates };
}
