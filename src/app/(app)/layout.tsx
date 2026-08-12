import { AppSidebar } from "@/components/layout/app-sidebar";
import { requireProfile } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar profile={profile} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
