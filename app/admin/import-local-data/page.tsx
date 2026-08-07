import { Card } from "@/components/ui/Card";
import { LocalDemoImportTool } from "@/components/admin/LocalDemoImportTool";
import { requireAdmin } from "@/lib/admin/auth";

export default async function ImportLocalDataPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
      <Card>
        <LocalDemoImportTool />
      </Card>
    </div>
  );
}
