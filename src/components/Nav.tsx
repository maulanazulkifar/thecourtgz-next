"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { signOut } from "next-auth/react";

const links = [
  { href: "/home", label: "Transaksi", match: (p: string) => p === "/home" },
  {
    href: "/home/rekap?tab=stok",
    label: "Cek Stok",
    match: (p: string) =>
      p.startsWith("/home/rekap") || p.startsWith("/home/audit-stok"),
  },
  {
    href: "/home/monitoring",
    label: "Monitoring",
    match: (p: string) => p.startsWith("/home/monitoring"),
  },
  {
    href: "/home/kategori",
    label: "+ Kategori",
    managerOnly: true,
    match: (p: string) => p.startsWith("/home/kategori"),
  },
  {
    href: "/home/item",
    label: "+ Item",
    managerOnly: true,
    match: (p: string) => p.startsWith("/home/item"),
  },
];

function NavInner({
  isStaff = false,
  canManageCatalog = false,
}: {
  isStaff?: boolean;
  canManageCatalog?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "stok";
  const [open, setOpen] = useState(false);

  const visibleLinks = links.filter(
    (link) => !link.managerOnly || canManageCatalog,
  );

  return (
    <nav className={`blc-nav ${open ? "is-open" : ""}`} aria-label="Menu utama">
      <div className="blc-nav-inner">
        <Link href="/home" className="blc-nav-brand">
          <img src="/image/blc.png" alt="" />
          <span>BLC</span>
        </Link>

        <button
          type="button"
          className="blc-nav-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          Menu
        </button>

        <div className="blc-nav-menu">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`blc-nav-link ${
                link.match(pathname, tab) ? "is-active" : ""
              }`}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {isStaff && (
            <Link
              href="/dashboard"
              className={`blc-nav-link ${pathname.startsWith("/dashboard") || pathname.startsWith("/users") ? "is-active" : ""}`}
              onClick={() => setOpen(false)}
            >
              Admin
            </Link>
          )}
          <button
            type="button"
            className="blc-nav-link"
            onClick={() =>
              signOut({ callbackUrl: isStaff ? "/admin/login" : "/" })
            }
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}

export function Nav({
  isStaff = false,
  canManageCatalog = false,
}: {
  isStaff?: boolean;
  canManageCatalog?: boolean;
}) {
  return (
    <Suspense fallback={<nav className="blc-nav" />}>
      <NavInner isStaff={isStaff} canManageCatalog={canManageCatalog} />
    </Suspense>
  );
}
