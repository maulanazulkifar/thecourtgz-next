import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { assignRole, getUserPermissions, getUserRoles, isStaff } from "@/lib/roles";
import { sanitizeName } from "@/lib/sanitize";
import { rateLimit } from "@/lib/rate-limit";
import { authConfig } from "@/lib/auth.config";

async function verifyRecaptcha(token: string, ip?: string | null): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (ip) body.set("remoteip", ip);

  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as { success?: boolean; score?: number };
  const min = Number(process.env.RECAPTCHA_MIN_SCORE ?? 0.5);
  return Boolean(data.success) && (data.score ?? 0) >= min;
}

function randomPassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Discord({
      clientId: process.env.AUTH_DISCORD_ID ?? process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET ?? process.env.DISCORD_CLIENT_SECRET,
      authorization: { params: { scope: "identify" } },
      profile(profile) {
        return {
          id: profile.id,
          name: profile.global_name ?? profile.username,
          email: `${profile.id}@discord.local`,
          image: profile.avatar
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
            : null,
          discordId: profile.id,
          discordUsername: profile.username,
          discordAvatar: profile.avatar,
        };
      },
    }),
    Credentials({
      id: "admin",
      name: "Admin",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
        token: { label: "reCAPTCHA", type: "text" },
      },
      async authorize(credentials, request) {
        const username = String(credentials?.username ?? "").trim();
        const password = String(credentials?.password ?? "");
        const token = String(credentials?.token ?? "");

        if (!username || !password) {
          throw new Error("Kredensial tidak valid.");
        }

        const ip =
          request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        const key = `admin-login:${username.toLowerCase()}|${ip}`;
        const limited = rateLimit(key, 5, 5 * 60 * 1000);
        if (!limited.ok) {
          throw new Error("Terlalu banyak percobaan login. Coba lagi dalam beberapa menit.");
        }

        if (!(await verifyRecaptcha(token, ip))) {
          throw new Error("Verifikasi keamanan gagal. Coba lagi.");
        }

        const user = await prisma.user.findUnique({ where: { email: username } });
        if (!user?.password) {
          throw new Error("Kredensial tidak valid.");
        }

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
          throw new Error("Kredensial tidak valid.");
        }

        const roles = await getUserRoles(user.id);
        if (!isStaff(roles)) {
          throw new Error("Akses admin tidak diizinkan untuk akun ini.");
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date(), lastLoginIp: ip },
        });

        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          image: null,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider === "discord") {
        const discordId = String(
          (user as { discordId?: string }).discordId ??
            (profile as { id?: string })?.id ??
            "",
        );
        if (!discordId) return false;

        const username = sanitizeName(
          String(
            (user as { discordUsername?: string }).discordUsername ??
              (profile as { username?: string })?.username ??
              user.name ??
              "Discord User",
          ),
        );
        const displayName = sanitizeName(String(user.name ?? username));
        const avatar =
          ((user as { discordAvatar?: string | null }).discordAvatar ??
            (profile as { avatar?: string | null })?.avatar ??
            null)?.toString() ?? null;

        let dbUser = await prisma.user.findUnique({ where: { discordId } });

        if (!dbUser) {
          dbUser = await prisma.user.create({
            data: {
              discordId,
              name: displayName,
              discordUsername: username,
              discordAvatar: avatar ? avatar.slice(0, 128) : null,
              email: `${discordId}@discord.local`,
              password: await bcrypt.hash(randomPassword(), 12),
              emailVerifiedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
          await assignRole(dbUser.id, "member");
        } else {
          dbUser = await prisma.user.update({
            where: { id: dbUser.id },
            data: {
              name: displayName,
              discordUsername: username,
              discordAvatar: avatar ? avatar.slice(0, 128) : null,
              updatedAt: new Date(),
            },
          });
        }

        await prisma.user.update({
          where: { id: dbUser.id },
          data: { lastLoginAt: new Date() },
        });

        user.id = String(dbUser.id);
        user.name = dbUser.name;
        user.email = dbUser.email;
        (user as { discordId?: string }).discordId = dbUser.discordId ?? discordId;
        (user as { discordAvatar?: string | null }).discordAvatar = dbUser.discordAvatar;
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
        token.discordId =
          (user as { discordId?: string | null }).discordId ?? token.discordId ?? null;
        token.discordAvatar =
          (user as { discordAvatar?: string | null }).discordAvatar ??
          token.discordAvatar ??
          null;

        const roles = await getUserRoles(String(token.uid));
        const permissions = await getUserPermissions(String(token.uid));
        token.roles = roles;
        token.permissions = permissions;

        const dbUser = await prisma.user.findUnique({
          where: { id: BigInt(String(token.uid)) },
          select: {
            name: true,
            email: true,
            discordId: true,
            discordAvatar: true,
          },
        });
        if (dbUser) {
          token.name = dbUser.name;
          token.email = dbUser.email;
          token.discordId = dbUser.discordId;
          token.discordAvatar = dbUser.discordAvatar;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.uid ?? "");
        session.user.roles = (token.roles as string[]) ?? [];
        session.user.permissions = (token.permissions as string[]) ?? [];
        session.user.discordId = (token.discordId as string | null | undefined) ?? undefined;
        session.user.discordAvatar =
          (token.discordAvatar as string | null | undefined) ?? undefined;
      }
      return session;
    },
  },
});
