import Link from "next/link";
import { KeyRound } from "lucide-react";
import { updateAdminPassword } from "@/app/admin/reset-password/actions";
import { Card } from "@/components/ui/Card";
import { getAdminSessionState } from "@/lib/admin/auth";

const errorMessages = {
  mismatch: "Passwords must match.",
  short: "Password must be at least 8 characters.",
  update: "Password could not be updated. Request a fresh reset link.",
  session: "Your password reset link is missing, expired, or already used."
} as const;

type ResetError = keyof typeof errorMessages;

function isResetError(value: string | undefined): value is ResetError {
  return Boolean(value && value in errorMessages);
}

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = isResetError(params?.error) ? params.error : undefined;
  const session = await getAdminSessionState();
  const sessionMissing = !session.isAdmin;

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
              SET NEW PASSWORD
            </h1>
          </div>
        </div>

        {sessionMissing ? (
          <div className="admin-reset-expired">
            <p>Your password reset link is missing, expired, or already used.</p>
            <Link href="/admin/forgot-password" className="neon-button admin-login-submit">
              Request New Reset Link
            </Link>
          </div>
        ) : (
          <form action={updateAdminPassword} className="admin-login-form">
            <label>
              <span>New Password</span>
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <label>
              <span>Confirm Password</span>
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            {error ? (
              <p className="admin-login-error" role="alert">
                {errorMessages[error]}
              </p>
            ) : null}
            <button type="submit" className="neon-button admin-login-submit">
              UPDATE PASSWORD
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
