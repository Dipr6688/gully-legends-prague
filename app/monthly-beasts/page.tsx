import { Suspense } from "react";
import { MonthlyBeastsFeature } from "@/components/monthly-beasts/MonthlyBeastsFeature";

export default function MonthlyBeastsPage() {
  return (
    <div className="mx-auto max-w-[1480px] px-4 py-8 lg:px-6">
      <Suspense fallback={null}>
        <MonthlyBeastsFeature />
      </Suspense>
    </div>
  );
}
