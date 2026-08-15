import { createContext, useContext, type ReactNode } from "react";

interface EngagementWorkspaceContextValue {
  openCreate: () => void;
}

const EngagementWorkspaceContext = createContext<EngagementWorkspaceContextValue | null>(null);

export function EngagementWorkspaceProvider({
  children,
  openCreate,
}: {
  children: ReactNode;
  openCreate: () => void;
}) {
  return (
    <EngagementWorkspaceContext.Provider value={{ openCreate }}>
      {children}
    </EngagementWorkspaceContext.Provider>
  );
}

export function useEngagementWorkspace() {
  const value = useContext(EngagementWorkspaceContext);
  if (value === null) {
    throw new Error("Engagement workspace context is unavailable.");
  }
  return value;
}
