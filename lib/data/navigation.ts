export type NavigationItem = {
  label: string;
  href: string;
  activePrefixes: string[];
  exact?: boolean;
};

export const mainNavigation = [
  { label: "Dashboard", href: "/", activePrefixes: ["/"], exact: true },
  { label: "Players", href: "/players", activePrefixes: ["/players"] },
  { label: "FACE-OFF", href: "/face-off", activePrefixes: ["/face-off"] },
  { label: "Matches", href: "/matches", activePrefixes: ["/matches"] },
  {
    label: "HALL OF LEGENDS",
    href: "/leaderboard",
    activePrefixes: ["/leaderboard"]
  },
  {
    label: "Monthly Beasts",
    href: "/monthly-beasts",
    activePrefixes: ["/monthly-beasts"]
  },
  { label: "FORMULA ROOM", href: "/stats", activePrefixes: ["/stats"] },
  { label: "Gallery", href: "/gallery", activePrefixes: ["/gallery"] }
] as const satisfies readonly NavigationItem[];

export function isNavigationItemActive(
  pathname: string,
  item: NavigationItem
): boolean {
  if (item.exact) {
    return pathname === item.href;
  }

  return item.activePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
