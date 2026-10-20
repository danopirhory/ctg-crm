import "server-only";

import { createClient } from "@/lib/supabase/server";

import { fail, type Result } from "./shared";

// =====================================================================
// Active employees (for the "assigned to" picker)
// =====================================================================
export type ActiveEmployee = {
  id: string;
  first_name: string;
  last_name: string;
};

export async function listActiveEmployees(): Promise<Result<ActiveEmployee[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("active", true)
    .order("last_name", { ascending: true });
  if (error) return fail([], error.message);
  return { data: data ?? [], error: null };
}

// =====================================================================
// Current employee lookup (for stamping employee_id on inserts)
// =====================================================================
export async function getCurrentEmployeeId(): Promise<
  { id: string } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data, error } = await supabase
    .from("employees")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "No employee profile found for this user." };
  return { id: data.id };
}

export type CurrentEmployee = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "Admin" | "Recruiter" | "Viewer";
  active: boolean;
};

// Returns the full employees row for the signed-in user (or an error).
// Used by the (app) layout to gate the entire authenticated shell.
export async function getCurrentEmployee(): Promise<
  CurrentEmployee | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data, error } = await supabase
    .from("employees")
    .select("id, email, first_name, last_name, role, active")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "No employee profile found for this user." };
  if (!data.active) return { error: "Your employee account is inactive." };
  return data;
}

export async function listEmployees(): Promise<
  Result<
    Array<{
      id: string;
      auth_user_id: string;
      email: string;
      first_name: string;
      last_name: string;
      role: "Admin" | "Recruiter" | "Viewer";
      active: boolean;
      created_at: string;
    }>
  >
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select(
      "id, auth_user_id, email, first_name, last_name, role, active, created_at",
    )
    .order("last_name", { ascending: true });
  if (error) return fail([], error.message);
  return { data: data ?? [], error: null };
}

