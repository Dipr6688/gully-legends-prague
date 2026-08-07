import { Suspense } from "react";
import { MonthlyBeastsFeature } from "@/components/monthly-beasts/MonthlyBeastsFeature";
import { isCurrentUserAdmin } from "@/lib/admin/auth";

export default async function MonthlyBeastsPage() {
  const isAdmin = await isCurrentUserAdmin();

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-8 lg:px-6">
      <Suspense fallback={null}>
        <MonthlyBeastsFeature isAdmin={isAdmin} />
      </Suspense>
    </div>
  );
}
