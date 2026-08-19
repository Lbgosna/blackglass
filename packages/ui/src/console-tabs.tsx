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
        className="flex min-h-11 shrink-0 items-end gap-0.5 px-2 md:min-h-8"
      >
        {panels.map((panel) => (
          <Tabs.Tab
            key={panel.value}
            value={panel.value}
            className="relative inline-flex min-h-11 items-center px-3 text-[13px] font-semibold text-muted-foreground outline-none after:absolute after:right-2 after:bottom-0 after:left-2 after:h-px after:bg-primary after:opacity-0 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[active]:text-foreground data-[active]:after:opacity-100 md:min-h-8"
          >
            {panel.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {panels.map((panel) => (
        <Tabs.Panel
          key={panel.value}
          value={panel.value}
          className="min-h-0 flex-1 overflow-auto px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {panel.content}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
