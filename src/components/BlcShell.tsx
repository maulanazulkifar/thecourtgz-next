import { Nav } from "@/components/Nav";

export function BlcShell({
  children,
  showNav = false,
  isStaff = false,
  wide = false,
  scroll = false,
}: {
  children: React.ReactNode;
  showNav?: boolean;
  isStaff?: boolean;
  wide?: boolean;
  scroll?: boolean;
}) {
  return (
    <>
      {showNav ? <Nav isStaff={isStaff} /> : null}
      <div className={`blc-shell ${showNav ? "has-nav" : ""} ${scroll ? "is-scroll" : ""}`}>
        <div className={`blc-frame ${wide ? "is-wide" : ""}`}>{children}</div>
      </div>
    </>
  );
}
