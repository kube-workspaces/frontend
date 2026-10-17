import type { Metadata } from "next";
import { Inter, Michroma, Exo_2, Rajdhani } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const michroma = Michroma({
  variable: "--font-michroma",
  subsets: ["latin"],
  weight: ["400"],
});

const exo2 = Exo_2({
  variable: "--font-exo2",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Kube Workspaces",
  description: "Manage container-based workspaces in Kubernetes",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Kube Workspaces",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${michroma.variable} ${exo2.variable} ${rajdhani.variable} h-full`} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0d9488" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#14b8a6" media="(prefers-color-scheme: dark)" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var theme = localStorage.getItem('theme');
                var colorTheme = localStorage.getItem('color-theme') || 'teal';
                var root = document.documentElement;
                if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  root.classList.add('dark');
                } else {
                  root.classList.remove('dark');
                }
                root.classList.add('theme-' + colorTheme);
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--color-bg-page)] text-[var(--color-text)] font-sans">
        <ServiceWorkerRegistrar />
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
