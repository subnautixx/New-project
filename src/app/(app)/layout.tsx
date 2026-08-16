import { AppSidebar } from "@/components/layout/app-sidebar";
import { RouteTransition } from "@/components/layout/route-transition";
import { ToastProvider } from "@/components/ui/toast";
import { requireProfile } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <ToastProvider>
      <div className="flex h-dvh overflow-hidden">
        <AppSidebar profile={profile} />
        <RouteTransition>{children}</RouteTransition>
      </div>
    </ToastProvider>
  );
}
