"use client";

import {
  BarChart3,
  LogOut,
  MessageSquare,
  Phone,
  ScrollText,
  Users,
  UserSquare2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { SessionProfile } from "@/lib/auth/session";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn, initials } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/clientes", label: "Clientes", icon: UserSquare2 },
  { href: "/desempenho", label: "Desempenho", icon: BarChart3 },
  { href: "/equipe", label: "Equipe", icon: Users, adminOnly: true },
  { href: "/whatsapps", label: "WhatsApps", icon: Phone, adminOnly: true },
  { href: "/auditoria", label: "Auditoria", icon: ScrollText, adminOnly: true },
];

export function AppSidebar({ profile }: { profile: SessionProfile }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = profile.role === "admin";

  const items = NAV.filter((item) => !item.adminOnly || isAdmin);

  async function handleSignOut() {
    await createSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    // Rail de ícones no celular, coluna completa a partir de lg.
    <aside className="flex w-14 shrink-0 flex-col border-r border-border bg-surface lg:w-52">
      <div className="flex h-14 items-center justify-center border-b border-border px-3 lg:justify-start">
        <span className="lg:hidden">
          <Logo compact />
        </span>
        <span className="hidden lg:inline">
          <Logo />
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors",
                "justify-center lg:justify-start",
                active
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-2">
        <div className="flex items-center gap-2 rounded-md px-1 py-1.5">
          <Avatar className="h-7 w-7">
            <AvatarFallback>{initials(profile.full_name)}</AvatarFallback>
          </Avatar>
          <div className="hidden min-w-0 flex-1 lg:block">
            <p className="truncate text-xs font-medium">{profile.full_name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {isAdmin ? "Administrador" : "Consignador"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleSignOut}
            title="Sair"
            className="hidden lg:inline-flex"
          >
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Sair</span>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleSignOut}
          title="Sair"
          className="mt-1 w-full lg:hidden"
        >
          <LogOut className="h-4 w-4" />
          <span className="sr-only">Sair</span>
        </Button>
      </div>
    </aside>
  );
}
