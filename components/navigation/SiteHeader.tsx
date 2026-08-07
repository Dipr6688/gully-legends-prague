import { Crown, Menu, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { logoutAdmin } from "@/app/admin/actions";
import {
  DesktopNavigation,
  MobileNavigationPanel
} from "@/components/navigation/NavigationLinks";
import { isCurrentUserAdmin } from "@/lib/admin/auth";

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

function HeaderActions({ isAdmin }: { isAdmin: boolean }) {
  const adminHref = isAdmin ? "/admin" : "/admin/login";

  return (
    <div className="header-actions">
      <Link href={adminHref} className="header-admin-link">
        <Crown className="h-4 w-4 text-neon-yellow" aria-hidden="true" />
        Admin
      </Link>
      {isAdmin ? (
        <form action={logoutAdmin}>
          <button type="submit" className="header-logout-button">
            Log Out
          </button>
        </form>
      ) : (
        <Link href="/admin/login" className="header-security-link" aria-label="Login">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

function MobileMenu({ isAdmin }: { isAdmin: boolean }) {
  return (
    <details className="mobile-navigation">
      <summary className="mobile-navigation-trigger">
        <Menu className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">Open navigation</span>
      </summary>
      <MobileNavigationPanel
        adminHref={isAdmin ? "/admin" : "/admin/login"}
        isAdmin={isAdmin}
      />
    </details>
  );
}

export async function SiteHeader() {
  const isAdmin = await isCurrentUserAdmin();

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Brand />
        <DesktopNavigation />
        <HeaderActions isAdmin={isAdmin} />
        <MobileMenu isAdmin={isAdmin} />
      </div>
    </header>
  );
}
