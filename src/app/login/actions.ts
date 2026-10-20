"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard");

  if (!email || !password) {
    redirect(`/login?error=${encodeURIComponent("Email and password are required.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  // Use a generic message so attackers can't enumerate emails from the
  // "wrong password" vs "no such user" vs "exists in auth.users but not
  // employees" branches. Server logs still capture the real cause.
  if (error) {
    console.warn("[login] signInWithPassword failed:", error.message);
    redirect(
      `/login?error=${encodeURIComponent("Invalid email or password.")}`,
    );
  }

  // Block sign-in if the auth user isn't an active employee.
  // is_active_employee() is a security-definer RPC, so it works regardless
  // of RLS on the employees table.
  const { data: isActive } = await supabase.rpc("is_active_employee");
  if (!isActive) {
    await supabase.auth.signOut();
    redirect(
      `/login?error=${encodeURIComponent(
        "Sign-in failed. If you should have access, contact your admin.",
      )}`,
    );
  }

  revalidatePath("/", "layout");
  redirect(redirectTo.startsWith("/") ? redirectTo : "/dashboard");
}
