"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import crypto from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/db/queries";
import type { EmployeeRole } from "@/lib/db/types";

type InviteResult =
  | { ok: true; id: string; tempPassword: string }
  | { ok: false; error: string };

type ActionResult = { ok: true } | { ok: false; error: string };

const ROLES = ["Admin", "Recruiter", "Viewer"] as const;

const inviteSchema = z.object({
  email: z.string().trim().email("Invalid email").max(200),
  first_name: z.string().trim().min(1, "Required").max(120),
  last_name: z.string().trim().min(1, "Required").max(120),
  role: z.enum(ROLES),
});

export type InviteEmployeeInput = z.infer<typeof inviteSchema>;

function generateTempPassword(): string {
  // 20 chars from a friendly alphabet (no look-alikes). High entropy, easy
  // to paste into a chat without confusion between O/0 or l/I.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(20);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

async function ensureAdmin(): Promise<
  { ok: true; me: { id: string } } | { ok: false; error: string }
> {
  const me = await getCurrentEmployee();
  if ("error" in me) return { ok: false, error: me.error };
  if (me.role !== "Admin")
    return { ok: false, error: "Only an Admin can manage employees." };
  return { ok: true, me: { id: me.id } };
}

export async function inviteEmployee(
  input: InviteEmployeeInput,
): Promise<InviteResult> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const tempPassword = generateTempPassword();

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Admin client not available.",
    };
  }

  // 1) Create the auth user with email already confirmed (no email round trip).
  const { data: created, error: createErr } = await admin.auth.admin.createUser(
    {
      email: parsed.data.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
      },
    },
  );
  if (createErr) {
    if (/already.*registered|exists|duplicate/i.test(createErr.message)) {
      return {
        ok: false,
        error: "An account with this email already exists.",
      };
    }
    return { ok: false, error: createErr.message };
  }
  const authUser = created.user;
  if (!authUser) return { ok: false, error: "Failed to create auth user." };

  // 2) Insert the matching employees row.
  const { data: employee, error: empErr } = await admin
    .from("employees")
    .insert({
      auth_user_id: authUser.id,
      email: parsed.data.email,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      role: parsed.data.role,
      active: true,
    })
    .select("id")
    .single();

  if (empErr) {
    // Roll back the auth user so we don't leave an orphan account.
    await admin.auth.admin.deleteUser(authUser.id).catch(() => {});
    if (/duplicate key|unique/i.test(empErr.message)) {
      return {
        ok: false,
        error: "An employee with this email already exists.",
      };
    }
    return { ok: false, error: empErr.message };
  }

  revalidatePath("/settings/employees");
  return { ok: true, id: employee.id, tempPassword };
}

const updateSchema = z.object({
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
});

export async function updateEmployee(
  employeeId: string,
  updates: { role?: EmployeeRole; active?: boolean },
): Promise<ActionResult> {
  if (!employeeId) return { ok: false, error: "Missing employee id." };

  const gate = await ensureAdmin();
  if (!gate.ok) return gate;

  const parsed = updateSchema.safeParse(updates);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid update.",
    };
  }

  // Self-lockout guards: an Admin can't deactivate themselves or downgrade
  // their own role, which would otherwise immediately revoke their access.
  if (employeeId === gate.me.id) {
    if (parsed.data.active === false) {
      return { ok: false, error: "You can't deactivate yourself." };
    }
    if (parsed.data.role && parsed.data.role !== "Admin") {
      return { ok: false, error: "You can't change your own role." };
    }
  }

  if (
    parsed.data.role === undefined &&
    parsed.data.active === undefined
  ) {
    return { ok: false, error: "Nothing to update." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("employees")
    .update(parsed.data)
    .eq("id", employeeId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/employees");
  return { ok: true };
}
