// Explicit operator action: sends one invitation to the Box 004 administrator.
// Run with node --env-file=.env.local scripts/invite-admin.mjs https://YOUR-DOMAIN
import { createClient } from "@supabase/supabase-js";
const origin = process.argv[2];
if (!origin || !/^https:\/\/[^/]+$/.test(origin))
  throw new Error("Pass the HTTPS origin without a trailing slash.");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key)
  throw new Error("Missing Supabase server environment variables.");
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const email = "santiago@box004.com";
const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
  redirectTo: `${origin}/admin?setPassword=1`,
});
if (error)
  throw new Error(
    `Invitation failed: ${error.code || "unknown"}. No administrator membership was added.`,
  );
const { error: membershipError } = await db
  .from("admin_users")
  .insert({ user_id: data.user.id });
if (membershipError)
  throw new Error(
    "Invitation sent but membership failed. Add this verified user in admin_users via the dashboard.",
  );
console.log(
  "Invitation sent; administrator membership created for santiago@box004.com.",
);
