"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
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
  isAdmin,
  id,
  onNavigate
}: {
  adminHref: string;
  isAdmin: boolean;
  id?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav id={id} className="mobile-navigation-panel" aria-label="Mobile navigation">
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
            onClick={onNavigate}
          >
            {item.label}
          </Link>
        );
      })}
      <Link className="mobile-navigation-link" href={adminHref} onClick={onNavigate}>
        Admin
      </Link>
      {!isAdmin ? (
        <Link className="mobile-navigation-link" href="/admin/login" onClick={onNavigate}>
          Login
        </Link>
      ) : null}
    </nav>
  );
}

export function MobileNavigationMenu({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const menuId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const previousPathnameRef = useRef(pathname);

  const closeMenu = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return;

    previousPathnameRef.current = pathname;
    const closeTimer = window.setTimeout(closeMenu, 0);

    return () => window.clearTimeout(closeTimer);
  }, [closeMenu, pathname]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) return;
      if (containerRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;

      closeMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, isOpen]);

  return (
    <div
      ref={containerRef}
      className={isOpen ? "mobile-navigation is-open" : "mobile-navigation"}
      data-open={isOpen ? "true" : "false"}
    >
      <button
        ref={triggerRef}
        type="button"
        className="mobile-navigation-trigger"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={isOpen ? "Close navigation" : "Open navigation"}
        onClick={() => setIsOpen((current) => !current)}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">{isOpen ? "Close navigation" : "Open navigation"}</span>
      </button>
      {isOpen ? (
        <MobileNavigationPanel
          id={menuId}
          adminHref={isAdmin ? "/admin" : "/admin/login"}
          isAdmin={isAdmin}
          onNavigate={closeMenu}
        />
      ) : null}
    </div>
  );
}
