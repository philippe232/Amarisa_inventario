import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppShell from "@/components/AppShell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Ported from reference/cereza/app/layout.tsx — the manifest +
// appleWebApp + icons combination is what makes "Agregar a inicio" on
// iOS actually launch standalone (no Safari URL bar/toolbar) instead of
// just bookmarking the page. Without these, "Add to Home Screen" still
// opens a normal Safari tab.
export const metadata: Metadata = {
  title: "Amarisa Inventarios",
  description: "Catálogo de artículos en venta",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Amarisa",
  },
  // Next 16's appleWebApp.capable only emits the modern, unprefixed
  // "mobile-web-app-capable" tag — iOS Safari has historically needed
  // the Apple-prefixed one specifically to launch standalone (no URL
  // bar/toolbar) from a home screen icon, so it's added explicitly
  // rather than relying on iOS having caught up to the standard tag.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  // iOS Safari's "Add to Home Screen" prefers this over the manifest's
  // icons array — without it, iOS falls back to a screenshot of the
  // page instead of an actual icon.
  icons: {
    icon: "/icon-512.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
