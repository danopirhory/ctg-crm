"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { GlobalSearch } from "./global-search";
import { SidebarNav } from "./sidebar-nav";
import { logout } from "../actions";

// The logo artwork is black-on-transparent, so it always needs a white
// surface behind it - the sidebar header renders as a white band.
function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center">
      <Image
        src="/Photos/logo-mark.png"
        alt="Command Talent Group"
        width={1168}
        height={574}
        priority
        className="h-10 w-auto"
      />
    </Link>
  );
}

export function AppShell({
  user,
  children,
}: {
  user: { email: string };
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-svh md:grid md:grid-cols-[240px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:block">
        <div className="flex h-14 items-center border-b border-sidebar-border bg-white px-4">
          <Brand />
        </div>
        <SidebarNav />
      </aside>

      <div className="flex min-h-svh flex-col">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b px-4 md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-64 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
              >
                <SheetHeader className="h-14 justify-center border-b border-sidebar-border bg-white px-4">
                  <SheetTitle className="text-left">
                    <Brand />
                  </SheetTitle>
                </SheetHeader>
                <SidebarNav onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <Link href="/dashboard">
              <Image
                src="/Photos/logo-mark.png"
                alt="Command Talent Group"
                width={1168}
                height={574}
                className="h-7 w-auto"
              />
            </Link>
          </div>

          <div className="hidden md:block" />

          <div className="flex items-center gap-3">
            <GlobalSearch />
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.email}
            </span>
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
