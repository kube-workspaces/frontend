"use client";

import { ThemeProvider } from "@/lib/theme";
import { NamespaceProvider } from "@/lib/namespace";
import { AuthProvider } from "@/lib/auth";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NamespaceProvider>
          {children}
        </NamespaceProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
