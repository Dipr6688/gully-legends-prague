import Image from "next/image";
import { gullyRules } from "@/lib/data/rules";
import { Card } from "@/components/ui/Card";

const ruleImages = [
  { src: "/ui/gully-rules/rule-no-ball-we-dont-care-trimmed.png", scale: 1.02 },
  { src: "/ui/gully-rules/rule-out-or-not-out-umpires-mood-trimmed.png", scale: 1.02 },
  { src: "/ui/gully-rules/rule-over-when-light-gone-trimmed.png", scale: 1.03 },
  { src: "/ui/gully-rules/rule-fight-next-ball-best-friends-trimmed.png", scale: 1.03 }
];

export function GullyRulesCard() {
  return (
    <Card className="border-neon-orange/35 p-4">
      <h2 className="arcade-heading text-[1.75rem] uppercase">Gully Rules</h2>
      <div className="mt-4 divide-y divide-white/10">
        {gullyRules.map((rule, index) => (
          <div key={rule.title} className="flex items-center gap-4 py-3">
            <div className="rule-icon-circle border border-neon-orange/25 bg-black/45">
              <Image
                src={ruleImages[index].src}
                alt=""
                width={88}
                height={88}
                className="rule-icon-image"
                style={{ transform: `scale(${ruleImages[index].scale})` }}
                aria-hidden="true"
              />
            </div>
            <div>
              <p className="stat-label text-base font-black text-stone-50">{rule.title}</p>
              <p className="text-sm font-medium text-stone-300">{rule.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="handwritten-accent mt-4 text-center text-2xl uppercase text-yellow-100">
        It&apos;s all about fun!
      </p>
    </Card>
  );
}
