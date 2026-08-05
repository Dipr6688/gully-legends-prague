import { Crown, Menu, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { mainNavigation } from "@/lib/data/navigation";

function Brand() {
  return (
    <Link href="/" className="header-brand" aria-label="Gully Legends Prague home">
      <Image
        src="/branding/gully-legends-emblem-tight.png"
        alt="Gully Legends - No Rules, Only Fun"
        width={1318}
        height={467}
        priority
        className="header-brand-logo"
      />
    </Link>
  );
}

function DesktopNavigation() {
  return (
    <nav className="desktop-navigation" aria-label="Main navigation">
      {mainNavigation.map((item, index) => (
        <Link
          key={item.href}
          className={index === 0 ? "desktop-navigation-link is-active" : "desktop-navigation-link"}
          href={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function HeaderActions() {
  return (
    <div className="header-actions">
      <Link href="/admin" className="header-admin-link">
        <Crown className="h-4 w-4 text-neon-yellow" aria-hidden="true" />
        Admin
      </Link>
      <Link href="/login" className="header-security-link" aria-label="Login">
        <ShieldCheck className="h-5 w-5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function MobileMenu() {
  return (
    <details className="mobile-navigation">
      <summary className="mobile-navigation-trigger">
        <Menu className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">Open navigation</span>
      </summary>
      <nav className="mobile-navigation-panel" aria-label="Mobile navigation">
        {mainNavigation.map((item) => (
          <Link key={item.href} className="mobile-navigation-link" href={item.href}>
            {item.label}
          </Link>
        ))}
        <Link className="mobile-navigation-link" href="/admin">
          Admin
        </Link>
        <Link className="mobile-navigation-link" href="/login">
          Login
        </Link>
      </nav>
    </details>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Brand />
        <DesktopNavigation />
        <HeaderActions />
        <MobileMenu />
      </div>
    </header>
  );
}
