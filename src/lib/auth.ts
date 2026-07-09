import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { AuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // Google is the only provider and verifies email ownership, so linking
      // by email is safe. Also recovers users whose first sign-in failed
      // mid-callback, leaving a User row with no Account
      // (error=OAuthAccountNotLinked).
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          // gmail.readonly lets the tracker watch the inbox for recruiter replies
          scope:
            "openid email profile https://www.googleapis.com/auth/gmail.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      if (session.user) (session.user as { id?: string }).id = user.id;
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
};

/** Returns the authenticated user's id, or null. */
export async function getSessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}
