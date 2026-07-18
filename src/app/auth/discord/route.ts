import { signIn } from "@/lib/auth";
import { NextRequest } from "next/server";

// Auto-redirect ke OAuth Discord (parity dengan Laravel /auth/discord).
export async function GET(req: NextRequest) {
  const callbackUrl = req.nextUrl.searchParams.get("callbackUrl") ?? "/home";
  await signIn("discord", { redirectTo: callbackUrl });
}
