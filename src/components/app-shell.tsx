"use client";

import { usePathname } from "next/navigation";
import { AuthGate } from "@/components/auth/auth-gate";
import { NavBar } from "@/components/nav-bar";
import { MaintenanceBanner } from "@/components/maintenance-banner";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (/^\/workspaces\/[^/]+\/popout\/?$/.test(pathname)) {
    return (
      <main className="h-dvh w-full overflow-hidden bg-[#1a1b26]">
        <AuthGate>{children}</AuthGate>
      </main>
    );
  }

  return (
    <>
      <NavBar />
      <main className="flex-1">
        <div className="max-w-screen-xl mx-auto py-5 px-4 sm:px-6 lg:px-8">
          <AuthGate>
            <MaintenanceBanner />
            {children}
          </AuthGate>
        </div>
      </main>
    </>
  );
}
