"use client";

import { createContext, useContext, useEffect, useState } from "react";

// What a page can ask the top bar to show instead of the plain
// "Amarisa" brand: a title (+ optional small subtitle) and a back button.
export type TopBarConfig = { title: string; subtitle?: string | null; back?: boolean };

const ConfigContext = createContext<TopBarConfig | null>(null);
const SetConfigContext = createContext<(config: TopBarConfig | null) => void>(() => {});

export function TopBarProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<TopBarConfig | null>(null);
  return (
    <SetConfigContext.Provider value={setConfig}>
      <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>
    </SetConfigContext.Provider>
  );
}

export function useTopBarConfig(): TopBarConfig | null {
  return useContext(ConfigContext);
}

// Call from a page: the top bar shows this while the page is mounted and
// goes back to "Amarisa" when it unmounts.
export function useTopBar({ title, subtitle = null, back = false }: TopBarConfig) {
  const setConfig = useContext(SetConfigContext);
  useEffect(() => {
    setConfig({ title, subtitle, back });
  }, [setConfig, title, subtitle, back]);
  useEffect(() => () => setConfig(null), [setConfig]);
}
