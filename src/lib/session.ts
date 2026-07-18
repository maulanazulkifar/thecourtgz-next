import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }
  return session;
}

export async function requireStaff() {
  const session = await requireSession();
  const roles = session.user.roles ?? [];
  if (!roles.includes("superadmin") && !roles.includes("admin")) {
    redirect("/home");
  }
  return session;
}

export async function requireSuperadmin() {
  const session = await requireSession();
  if (!session.user.roles?.includes("superadmin")) {
    redirect("/dashboard");
  }
  return session;
}
