import { MockMatchEntryForm } from "@/components/matches/MockMatchEntryForm";

export const metadata = {
  title: "Create Match | Gully Legends Prague"
};

export default function NewMatchPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
      <MockMatchEntryForm />
    </div>
  );
}
