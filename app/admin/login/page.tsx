import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAdmin } from "@/app/admin/login/actions";
import { Card } from "@/components/ui/Card";
import { isCurrentUserAdmin } from "@/lib/admin/auth";

export default async function AdminLoginPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const hasError = params?.error === "invalid";
  const wasReset = params?.reset === "success";
  const isAdmin = await isCurrentUserAdmin();

  if (isAdmin) {
    redirect("/admin");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-6">
      <Card className="admin-login-card">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-neon-yellow" aria-hidden="true" />
          <div>
            <p className="text-xs font-black uppercase text-neon-cyan">
              CONTROL ROOM
            </p>
            <h1 className="font-display text-5xl uppercase comic-title">
              ADMIN ACCESS
            </h1>
          </div>
        </div>

        <form action={loginAdmin} className="admin-login-form">
          <label>
            <span>Admin ID</span>
            <input
              name="adminId"
              type="text"
              autoComplete="username"
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {hasError ? (
            <p className="admin-login-error" role="alert">
              INVALID ADMIN ID OR PASSWORD
            </p>
          ) : null}
          {wasReset ? (
            <p className="admin-login-success" role="status">
              PASSWORD UPDATED SUCCESSFULLY
            </p>
          ) : null}
          <button type="submit" className="neon-button admin-login-submit">
            ENTER CONTROL ROOM
          </button>
        </form>

        <Link href="/admin/forgot-password" className="admin-forgot-link">
          FORGOT PASSWORD?
        </Link>
      </Card>
    </div>
  );
}
