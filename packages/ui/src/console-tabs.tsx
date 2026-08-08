import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";

export interface ConsolePanel {
  content: ReactNode;
  label: string;
  value: string;
}

export function ConsoleTabs({ panels }: { panels: readonly ConsolePanel[] }) {
  const firstPanel = panels[0];
  if (!firstPanel) return null;

  return (
    <Tabs.Root className="flex h-full min-h-0 flex-col" defaultValue={firstPanel.value}>
      <Tabs.List
        activateOnFocus
        aria-label="Console views"
        className="flex min-h-11 shrink-0 items-end gap-1 border-b border-border px-3"
      >
        {panels.map((panel) => (
          <Tabs.Tab
            key={panel.value}
            value={panel.value}
            className="relative inline-flex min-h-11 items-center px-3 text-sm font-bold text-muted-foreground outline-none after:absolute after:right-2 after:bottom-0 after:left-2 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[active]:text-foreground data-[active]:after:opacity-100"
          >
            {panel.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {panels.map((panel) => (
        <Tabs.Panel
          key={panel.value}
          value={panel.value}
          className="min-h-0 flex-1 overflow-auto p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {panel.content}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
