import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("Supabase SSR packages and clients are configured", () => {
  const packageJson = source("package.json");
  const browserClient = source("lib/supabase/client.ts");
  const serverClient = source("lib/supabase/server.ts");
  const proxyClient = source("lib/supabase/proxy.ts");
  const rootProxy = source("proxy.ts");

  assert.match(packageJson, /@supabase\/supabase-js/);
  assert.match(packageJson, /@supabase\/ssr/);
  assert.match(browserClient, /createBrowserClient/);
  assert.match(serverClient, /createServerClient/);
  assert.match(serverClient, /cookies/);
  assert.match(proxyClient, /getClaims/);
  assert.match(rootProxy, /export async function proxy/);
  assert.match(rootProxy, /updateSession/);
});

test("admin role migration creates admin_users and is_admin without hardcoded UID", () => {
  const migration = source("supabase/migrations/20260807090000_admin_users.sql");

  assert.match(migration, /create table if not exists public\.admin_users/);
  assert.match(migration, /user_id uuid primary key references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /create or replace function public\.is_admin\(\)/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /where user_id = auth\.uid\(\)/);
  assert.doesNotMatch(
    migration,
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
});

test("admin login uses Admin ID mapping and generic errors", () => {
  const action = source("app/admin/login/actions.ts");
  const page = source("app/admin/login/page.tsx");

  assert.match(page, /CONTROL ROOM/);
  assert.match(page, /ADMIN ACCESS/);
  assert.match(page, /Admin ID/);
  assert.match(page, /Password/);
  assert.match(page, /ENTER CONTROL ROOM/);
  assert.match(page, /INVALID ADMIN ID OR PASSWORD/);
  assert.doesNotMatch(page, /ADMIN_LOGIN_EMAIL|email/i);
  assert.match(action, /getAdminLoginConfig/);
  assert.match(action, /adminId !== config\.adminId/);
  assert.match(action, /email: config\.adminEmail/);
  assert.match(action, /signInWithPassword/);
  assert.match(action, /isAdminWithClient/);
  assert.match(action, /invalidLoginRedirect/);
});

test("admin route is protected and non-admin sessions are signed out", () => {
  const adminPage = source("app/admin/page.tsx");
  const auth = source("lib/admin/auth.ts");
  const proxy = source("lib/supabase/proxy.ts");

  assert.match(adminPage, /await requireAdmin\(\)/);
  assert.match(auth, /export async function requireAdmin/);
  assert.match(auth, /supabase\.auth\.signOut\(\)/);
  assert.match(proxy, /isAdminPath/);
  assert.match(proxy, /isAdminAuthUtilityPath/);
  assert.match(proxy, /supabase\.rpc\("is_admin"\)/);
  assert.match(proxy, /supabase\.auth\.signOut\(\)/);
  assert.match(proxy, /NextResponse\.redirect\(new URL\("\/admin\/login"/);
});

test("admin login links to password recovery without offering signup", () => {
  const page = source("app/admin/login/page.tsx");

  assert.match(page, /FORGOT PASSWORD\?/);
  assert.match(page, /href="\/admin\/forgot-password"/);
  assert.match(page, /PASSWORD UPDATED SUCCESSFULLY/);
  assert.doesNotMatch(page, /sign\s*up|signup|create account/i);
});

test("forgot password sends generic reset response using hidden server email", () => {
  const page = source("app/admin/forgot-password/page.tsx");
  const action = source("app/admin/forgot-password/actions.ts");
  const env = source("lib/admin/env.ts");

  assert.match(page, /RESET ADMIN PASSWORD/);
  assert.match(page, /Admin ID/);
  assert.match(page, /SEND RESET LINK/);
  assert.match(
    page,
    /IF THE ADMIN ACCOUNT IS VALID, A RESET LINK HAS BEEN SENT\./
  );
  assert.doesNotMatch(page, /ADMIN_LOGIN_EMAIL|email/i);
  assert.match(action, /adminId !== config\.adminId/);
  assert.match(action, /resetPasswordForEmail\(config\.adminEmail/);
  assert.match(action, /redirectTo/);
  assert.match(action, /genericSentRedirect/);
  assert.match(env, /getAdminPasswordResetRedirectUrl/);
  assert.match(env, /NEXT_PUBLIC_SITE_URL/);
  assert.match(env, /callbackUrl\.searchParams\.set\("next", "\/admin\/reset-password"\)/);
});

test("PKCE recovery callback exchanges code and redirects to reset password", () => {
  const callback = source("app/auth/callback/route.ts");

  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /getSafeNextPath/);
  assert.match(callback, /"\/admin\/reset-password\?error=session"/);
  assert.match(callback, /NextResponse\.redirect\(new URL\(next/);
});

test("reset password requires admin session validates password and updates Supabase user", () => {
  const page = source("app/admin/reset-password/page.tsx");
  const action = source("app/admin/reset-password/actions.ts");

  assert.match(page, /SET NEW PASSWORD/);
  assert.match(page, /New Password/);
  assert.match(page, /Confirm Password/);
  assert.match(page, /UPDATE PASSWORD/);
  assert.match(page, /getAdminSessionState/);
  assert.match(page, /Request New Reset Link/);
  assert.match(action, /minimumPasswordLength = 8/);
  assert.match(action, /newPassword !== confirmPassword/);
  assert.match(action, /getUser\(\)/);
  assert.match(action, /isAdminWithClient/);
  assert.match(action, /updateUser\(\{[\s\S]*password: newPassword/);
  assert.match(action, /signOut\(\)/);
  assert.match(action, /redirect\("\/admin\/login\?reset=success"\)/);
});

test("password recovery does not create users or modify admin role records", () => {
  const recoverySources = [
    source("app/admin/forgot-password/actions.ts"),
    source("app/admin/reset-password/actions.ts"),
    source("app/auth/callback/route.ts")
  ].join("\n");

  assert.doesNotMatch(recoverySources, /signUp/);
  assert.doesNotMatch(recoverySources, /insert\s+into\s+public\.admin_users/i);
  assert.doesNotMatch(recoverySources, /admin_users\.insert|from\("admin_users"\)\.insert/);
});

test("password recovery never logs or persists plaintext passwords", () => {
  const recoverySources = [
    source("app/admin/forgot-password/actions.ts"),
    source("app/admin/reset-password/actions.ts"),
    source("app/admin/reset-password/page.tsx"),
    source("app/admin/forgot-password/page.tsx")
  ].join("\n");

  assert.doesNotMatch(recoverySources, /console\.(log|error|warn|info)/);
  assert.doesNotMatch(recoverySources, /localStorage|sessionStorage/);
  assert.doesNotMatch(recoverySources, /ADMIN_PASSWORD/);
});

test("navbar routes Admin by verified state and exposes logout", () => {
  const header = source("components/navigation/SiteHeader.tsx");
  const links = source("components/navigation/NavigationLinks.tsx");

  assert.match(header, /isCurrentUserAdmin/);
  assert.match(header, /isAdmin \? "\/admin" : "\/admin\/login"/);
  assert.match(header, /logoutAdmin/);
  assert.match(header, /Log Out/);
  assert.match(links, /adminHref/);
  assert.match(links, /href=\{adminHref\}/);
});

test("?admin=1 and localStorage grant no administrator authority", () => {
  const monthly = source("components/monthly-beasts/MonthlyBeastsFeature.tsx");
  const gallery = source("components/gallery/GalleryFeature.tsx");
  const monthlyPage = source("app/monthly-beasts/page.tsx");
  const galleryPage = source("app/gallery/page.tsx");

  for (const file of [monthly, gallery, monthlyPage, galleryPage]) {
    assert.doesNotMatch(file, /gully-legends-admin-mode/);
    assert.doesNotMatch(file, /requestedAdminMode/);
    assert.doesNotMatch(file, /searchParams\.get\("admin"\)/);
  }

  assert.match(monthlyPage, /isCurrentUserAdmin/);
  assert.match(galleryPage, /isCurrentUserAdmin/);
});

test("public pages do not require login", () => {
  const publicPages = [
    "app/page.tsx",
    "app/players/page.tsx",
    "app/players/[playerId]/page.tsx",
    "app/matches/page.tsx",
    "app/leaderboard/page.tsx",
    "app/monthly-beasts/page.tsx",
    "app/stats/page.tsx",
    "app/gallery/page.tsx"
  ];

  for (const path of publicPages) {
    assert.doesNotMatch(source(path), /requireAdmin/);
  }
});

test("private admin email and passwords are not rendered to browser-facing UI", () => {
  const browserFacingFiles = [
    "components/navigation/SiteHeader.tsx",
    "components/navigation/NavigationLinks.tsx",
    "components/gallery/GalleryFeature.tsx",
    "components/monthly-beasts/MonthlyBeastsFeature.tsx",
    "app/admin/login/page.tsx",
    "app/admin/forgot-password/page.tsx",
    "app/admin/reset-password/page.tsx",
    "app/admin/page.tsx"
  ];

  for (const path of browserFacingFiles) {
    const text = source(path);
    assert.doesNotMatch(text, /ADMIN_LOGIN_EMAIL/);
    assert.doesNotMatch(text, /ADMIN_PASSWORD/);
    assert.doesNotMatch(text, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);
  }
});
