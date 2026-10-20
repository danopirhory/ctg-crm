"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CheckSquare,
  ClipboardList,
  LayoutDashboard,
  Mail,
  Receipt,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Primary surfaces. Prospects feeds the Candidate Pipeline (and the
// Companies board) via "Move to Pipeline" actions on each prospect's
// detail page. Legacy list routes (/jobs, /placements) still exist by
// URL but are not in the nav.
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/prospects", label: "Leads", icon: UserPlus },
  { href: "/candidates", label: "Candidate Pipeline", icon: Users },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/invoicing", label: "Invoicing", icon: Receipt },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/campaigns", label: "Campaigns", icon: Mail },
  { href: "/reviews", label: "Review Snapshots", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-1 px-2 py-4 text-sm">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active &&
                "bg-sidebar-primary text-sidebar-primary-foreground font-medium hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
