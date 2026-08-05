import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";

export function RecentMatchesPanel() {
  return (
    <Card className="relative h-full min-h-52 p-4">
      <Image
        src="/ui/recent-matches-wicket-ball.png"
        alt=""
        width={1536}
        height={1024}
        className="pointer-events-none absolute bottom-2 right-2 z-0 h-[78%] w-[45%] object-contain object-center opacity-42"
        aria-hidden="true"
      />
      <div className="relative z-10 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black uppercase">Recent Matches</h2>
        </div>
        <LinkButton href="/matches" variant="ghost" className="min-h-9 px-3 text-xs">
          Archive
        </LinkButton>
      </div>
      <div className="relative z-10 mt-4 max-w-[60%] rounded-lg border border-neon-cyan/18 bg-black/50 p-3 text-sm text-stone-300 shadow-inner">
        <p className="arcade-heading text-lg font-black uppercase text-stone-100">
          No matches yet
        </p>
        <p className="mt-2 max-w-52 leading-5">
          Create your first match and let the gully chaos begin!
        </p>
      </div>
    </Card>
  );
}
