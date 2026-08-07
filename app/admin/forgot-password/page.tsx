import Link from "next/link";
import { KeyRound } from "lucide-react";
import { sendAdminPasswordReset } from "@/app/admin/forgot-password/actions";
import { Card } from "@/components/ui/Card";

export default async function ForgotPasswordPage({
  searchParams
}: {
  searchParams?: Promise<{ sent?: string }>;
}) {
  const params = await searchParams;
  const wasSent = params?.sent === "1";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-6">
      <Card className="admin-login-card">
        <div className="flex items-center gap-3">
          <KeyRound className="h-8 w-8 text-neon-yellow" aria-hidden="true" />
          <div>
            <p className="text-xs font-black uppercase text-neon-cyan">
              CONTROL ROOM
            </p>
            <h1 className="font-display text-5xl uppercase comic-title">
              RESET ADMIN PASSWORD
            </h1>
          </div>
        </div>

        <form action={sendAdminPasswordReset} className="admin-login-form">
          <label>
            <span>Admin ID</span>
            <input
              name="adminId"
              type="text"
              autoComplete="username"
              required
            />
          </label>
          {wasSent ? (
            <p className="admin-login-success" role="status">
              IF THE ADMIN ACCOUNT IS VALID, A RESET LINK HAS BEEN SENT.
            </p>
          ) : null}
          <button type="submit" className="neon-button admin-login-submit">
            SEND RESET LINK
          </button>
        </form>

        <Link href="/admin/login" className="admin-forgot-link">
          Back to Admin Login
        </Link>
      </Card>
    </div>
  );
}
