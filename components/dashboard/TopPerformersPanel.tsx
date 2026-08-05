import Image from "next/image";
import { Card } from "@/components/ui/Card";

const performers = [
  {
    label: "Most Runs",
    value: "0 runs",
    imageSrc: "/ui/most-runs-bat.png",
    imageAlt: "Cricket bat"
  },
  {
    label: "Most Wickets",
    value: "0 wickets",
    imageSrc: "/ui/most-wickets-wicket-smash.png",
    imageAlt: "Wicket smash"
  },
  {
    label: "Most Catches",
    value: "0 catches",
    imageSrc: "/ui/most-catches-gloves-ball.png",
    imageAlt: "Catching gloves and cricket ball"
  }
];

export function TopPerformersPanel() {
  return (
    <Card className="h-full min-h-52 p-4">
      <h2 className="arcade-heading text-xl uppercase">
        Top Performers (All Time)
      </h2>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
        {performers.map(({ label, value, imageSrc, imageAlt }) => (
          <div
            key={label}
            className="min-w-0 rounded-lg border border-white/10 bg-black/28 p-3"
          >
            <Image
              src={imageSrc}
              alt={imageAlt}
              width={1536}
              height={1024}
              className="mx-auto h-16 w-full max-w-24 object-contain"
            />
            <div className="mt-2 min-w-0 text-center">
              <p className="stat-label text-xs font-black uppercase leading-4 text-neon-cyan">
                {label}
              </p>
              <p className="mt-1 font-ui text-base font-black uppercase leading-4 text-stone-100">
                {value.split(" ")[0]}
                <span className="block text-xs font-semibold text-stone-400">
                  {value.split(" ").slice(1).join(" ")}
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
