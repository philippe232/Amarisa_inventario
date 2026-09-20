"use client";

import { useState } from "react";
import TopBar from "./TopBar";
import Drawer from "./Drawer";

// Mounted once in app/layout.tsx so the hamburger/drawer are present on
// every screen, same shape as reference/cereza/app/(shell)/shell.tsx
// (minus BottomNav/user-identity — this app has neither).
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar onMenuClick={() => setDrawerOpen(true)} />
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
