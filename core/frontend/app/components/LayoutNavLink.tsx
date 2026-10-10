import type React from "react";
import { Nav } from "react-bootstrap";
import { useLocation } from "react-router";

type MatchMode = "exact" | "prefix";

type LayoutNavLinkProps = Omit<
  React.ComponentProps<typeof Nav.Link>,
  "active" | "href"
> & {
  href: string;
  activePath?: string;
  match?: MatchMode;
};

export function LayoutNavLink({
  href,
  activePath,
  match = "exact",
  ...props
}: LayoutNavLinkProps) {
  const location = useLocation();
  const pathToMatch = activePath ?? href.split("?")[0];
  const isActive =
    match === "prefix"
      ? location.pathname === pathToMatch ||
        location.pathname.startsWith(`${pathToMatch}/`)
      : location.pathname === pathToMatch;

  return (
    <Nav.Link
      href={href}
      active={isActive}
      aria-current={isActive ? "page" : undefined}
      {...props}
    />
  );
}
