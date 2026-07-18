import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const roles = session?.user?.roles ?? [];
  const isLoggedIn = Boolean(session?.user);
  const staff = roles.includes("superadmin") || roles.includes("admin");

  if (pathname === "/") {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/home", req.url));
    }
    const url = new URL("/auth/discord", req.url);
    url.searchParams.set("callbackUrl", "/home");
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin/login")) {
    if (isLoggedIn && staff) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    if (isLoggedIn && !staff) {
      return NextResponse.redirect(new URL("/home", req.url));
    }
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/home") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/users")
  ) {
    if (!isLoggedIn) {
      if (pathname.startsWith("/dashboard") || pathname.startsWith("/users")) {
        return NextResponse.redirect(new URL("/admin/login", req.url));
      }
      const url = new URL("/auth/discord", req.url);
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/dashboard") && !staff) {
    return NextResponse.redirect(new URL("/home", req.url));
  }

  if (pathname.startsWith("/users") && !roles.includes("superadmin")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/", "/home/:path*", "/admin/login", "/dashboard", "/users/:path*"],
};
