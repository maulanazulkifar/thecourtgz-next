import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      roles: string[];
      permissions: string[];
      discordId?: string | null | undefined;
      discordAvatar?: string | null | undefined;
    };
  }

  interface User {
    discordId?: string;
    discordUsername?: string;
    discordAvatar?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    roles?: string[];
    permissions?: string[];
    discordId?: string | null;
    discordAvatar?: string | null;
  }
}

declare module "next-auth/providers/discord" {
  interface DiscordProfile {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
  }
}
