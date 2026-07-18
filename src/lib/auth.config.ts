import type { NextAuthConfig } from "next-auth";
import Discord from "next-auth/providers/discord";
import Credentials from "next-auth/providers/credentials";

/**
 * Edge-safe Auth.js config (no Prisma / Node-only modules).
 * Middleware uses this; full auth.ts adds DB callbacks.
 */
export const authConfig = {
  providers: [
    Discord({
      clientId: process.env.AUTH_DISCORD_ID ?? process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET ?? process.env.DISCORD_CLIENT_SECRET,
      authorization: { params: { scope: "identify" } },
    }),
    Credentials({
      id: "admin",
      name: "Admin",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
        token: { label: "reCAPTCHA", type: "text" },
      },
      // Real authorize lives in auth.ts (Node runtime)
      authorize: () => null,
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },
  callbacks: {
    jwt({ token }) {
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.uid ?? token.sub ?? "");
        session.user.roles = (token.roles as string[]) ?? [];
        session.user.permissions = (token.permissions as string[]) ?? [];
        session.user.discordId = (token.discordId as string | undefined) ?? undefined;
        session.user.discordAvatar =
          (token.discordAvatar as string | undefined) ?? undefined;
      }
      return session;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
