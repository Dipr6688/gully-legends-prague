"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isNavigationItemActive,
  mainNavigation
} from "@/lib/data/navigation";

export function DesktopNavigation() {
  const pathname = usePathname();

  return (
    <nav className="desktop-navigation" aria-label="Main navigation">
      {mainNavigation.map((item) => {
        const isActive = isNavigationItemActive(pathname, item);

        return (
          <Link
            key={item.href}
            className={
              isActive
                ? "desktop-navigation-link is-active"
                : "desktop-navigation-link"
            }
            href={item.href}
            aria-current={isActive ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNavigationPanel({
  adminHref,
  isAdmin
}: {
  adminHref: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className="mobile-navigation-panel" aria-label="Mobile navigation">
      {mainNavigation.map((item) => {
        const isActive = isNavigationItemActive(pathname, item);

        return (
          <Link
            key={item.href}
            className={
              isActive
                ? "mobile-navigation-link is-active"
                : "mobile-navigation-link"
            }
            href={item.href}
            aria-current={isActive ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
      <Link className="mobile-navigation-link" href={adminHref}>
        Admin
      </Link>
      {!isAdmin ? (
      <Link className="mobile-navigation-link" href="/admin/login">
        Login
      </Link>
      ) : null}
    </nav>
  );
}
