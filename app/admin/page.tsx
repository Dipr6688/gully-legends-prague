import { Camera, Crown, DownloadCloud, LogOut, Swords, Trophy, Users } from "lucide-react";
import { logoutAdmin } from "@/app/admin/actions";
import { DemoDataResetControl } from "@/components/admin/DemoDataResetControl";
import { MatchStoryBackfillControl } from "@/components/admin/MatchStoryBackfillControl";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const controlSections = [
  {
    title: "MATCH OPERATIONS",
    icon: Swords,
    links: [
      { label: "Create Match", href: "/matches/new" },
      { label: "Manage Fixtures", href: "/matches" },
      { label: "APK Pending Review", href: "/admin/apk-imports" }
    ]
  },
  {
    title: "APK SYNC",
    icon: DownloadCloud,
    links: [
      { label: "APK Matches", href: "/admin/apk-imports" }
    ]
  },
  {
    title: "MONTHLY BEASTS",
    icon: Trophy,
    links: [
      { label: "Crown Monthly Beasts", href: "/monthly-beasts" },
      { label: "Crown History", href: "/monthly-beasts" }
    ]
  },
  {
    title: "GALLERY",
    icon: Camera,
    links: [
      { label: "Add Photos", href: "/gallery" },
      { label: "Manage Photos", href: "/gallery" }
    ]
  },
  {
    title: "PLAYERS",
    icon: Users,
    links: [{ label: "Manage Players", href: "/players" }]
  }
] as const;

export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("is_demo", true);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
      <Card>
        <div className="flex items-center gap-3">
          <Crown className="h-8 w-8 text-neon-yellow" aria-hidden="true" />
          <div>
            <p className="text-xs font-black uppercase text-neon-cyan">Control room</p>
            <h1 className="font-display text-5xl uppercase comic-title">
              Admin
            </h1>
          </div>
        </div>

        <div className="admin-control-grid">
          {controlSections.map((section) => {
            const Icon = section.icon;

            return (
              <section key={section.title} className="admin-control-card">
                <div>
                  <Icon aria-hidden="true" />
                  <h2>{section.title}</h2>
                </div>
                <div className="admin-control-links">
                  {section.links.map((link) => (
                    <LinkButton key={link.label} href={link.href} variant="secondary">
                      {link.label}
                    </LinkButton>
                  ))}
                </div>
              </section>
            );
          })}
          <MatchStoryBackfillControl />
          <DemoDataResetControl demoMatchCount={count ?? 0} />
        </div>

        <form action={logoutAdmin} className="mt-6">
          <button type="submit" className="neon-button admin-logout-action">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            LOG OUT
          </button>
        </form>
      </Card>
    </div>
  );
}
