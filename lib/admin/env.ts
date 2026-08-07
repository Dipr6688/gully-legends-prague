import "server-only";

export function getAdminLoginConfig() {
  const adminId = process.env.ADMIN_LOGIN_ID;
  const adminEmail = process.env.ADMIN_LOGIN_EMAIL;

  if (!adminId || !adminEmail) return null;

  return { adminId, adminEmail };
}

export function getConfiguredSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl);

    return url.origin;
  } catch {
    return null;
  }
}

export function getAdminPasswordResetRedirectUrl() {
  const siteUrl = getConfiguredSiteUrl();

  if (!siteUrl) return null;

  const callbackUrl = new URL("/auth/callback", siteUrl);

  callbackUrl.searchParams.set("next", "/admin/reset-password");

  return callbackUrl.toString();
}
