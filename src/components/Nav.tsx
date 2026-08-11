"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import {
  clearServerAction,
  selectServerAction,
} from "@/app/actions/servers";
import type { AppServer } from "@/lib/servers";

const links: {
  href: string;
  label: string;
  managerOnly?: boolean;
  match: (p: string, tab?: string) => boolean;
}[] = [
  { href: "/home", label: "Transaksi", match: (p) => p === "/home" },
  {
    href: "/home/rekap?tab=stok",
    label: "Cek Stok",
    match: (p) =>
      p.startsWith("/home/rekap") || p.startsWith("/home/audit-stok"),
  },
  {
    href: "/home/monitoring",
    label: "Monitoring",
    match: (p) => p.startsWith("/home/monitoring"),
  },
  {
    href: "/home/kategori",
    label: "+ Kategori",
    managerOnly: true,
    match: (p) => p.startsWith("/home/kategori"),
  },
  {
    href: "/home/item",
    label: "+ Item",
    managerOnly: true,
    match: (p) => p.startsWith("/home/item"),
  },
  {
    href: "/home/manager",
    label: "Manager",
    managerOnly: true,
    match: (p) => p.startsWith("/home/manager"),
  },
];

function NavInner({
  isStaff = false,
  canManageCatalog = false,
  selectedServer = null,
  servers = [],
}: {
  isStaff?: boolean;
  canManageCatalog?: boolean;
  selectedServer?: AppServer | null;
  servers?: AppServer[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "stok";
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

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

        {selectedServer ? (
          <div className="blc-nav-server">
            <label className="blc-nav-server-label" htmlFor="nav-server">
              Server
            </label>
            <select
              id="nav-server"
              className="blc-nav-server-select"
              value={selectedServer.id}
              disabled={pending}
              onChange={(e) => {
                const id = e.target.value;
                const fd = new FormData();
                fd.set("server_id", id);
                startTransition(() => {
                  void selectServerAction(fd);
                });
              }}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="blc-nav-server-clear"
              disabled={pending}
              onClick={() => startTransition(() => void clearServerAction())}
              title="Pilih ulang server"
            >
              Ganti
            </button>
          </div>
        ) : null}

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
  selectedServer = null,
  servers = [],
}: {
  isStaff?: boolean;
  canManageCatalog?: boolean;
  selectedServer?: AppServer | null;
  servers?: AppServer[];
}) {
  return (
    <Suspense fallback={<nav className="blc-nav" />}>
      <NavInner
        isStaff={isStaff}
        canManageCatalog={canManageCatalog}
        selectedServer={selectedServer}
        servers={servers}
      />
    </Suspense>
  );
}
