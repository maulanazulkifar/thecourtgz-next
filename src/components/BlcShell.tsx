import { Nav } from "@/components/Nav";
import { getSelectedServer, listServers } from "@/lib/servers";

export async function BlcShell({
  children,
  showNav = false,
  isStaff = false,
  canManageCatalog = false,
  wide = false,
  scroll = false,
}: {
  children: React.ReactNode;
  showNav?: boolean;
  isStaff?: boolean;
  canManageCatalog?: boolean;
  wide?: boolean;
  scroll?: boolean;
}) {
  const [selectedServer, servers] = showNav
    ? await Promise.all([getSelectedServer(), listServers()])
    : [null, [] as Awaited<ReturnType<typeof listServers>>];

  return (
    <>
      {showNav ? (
        <Nav
          isStaff={isStaff}
          canManageCatalog={canManageCatalog}
          selectedServer={selectedServer}
          servers={servers}
        />
      ) : null}
      <div className={`blc-shell ${showNav ? "has-nav" : ""} ${scroll ? "is-scroll" : ""}`}>
        <div className={`blc-frame ${wide ? "is-wide" : ""}`}>{children}</div>
      </div>
    </>
  );
}
