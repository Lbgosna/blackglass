import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface EngagementWorkspaceContextValue {
  announce: (message: string) => void;
  clearNotice: () => void;
  engagementFilter: string;
  focusRunsToken: number;
  notice: string | null;
  openCreate: () => void;
  requestFocusRuns: () => void;
  setEngagementFilter: (value: string) => void;
}

const EngagementWorkspaceContext = createContext<EngagementWorkspaceContextValue | null>(null);

export function EngagementWorkspaceProvider({
  children,
  openCreate,
}: {
  children: ReactNode;
  openCreate: () => void;
}) {
  const [engagementFilter, setEngagementFilter] = useState("");
  const [focusRunsToken, setFocusRunsToken] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const announce = useCallback((message: string) => {
    setNotice(message);
  }, []);
  const clearNotice = useCallback(() => {
    setNotice(null);
  }, []);
  const requestFocusRuns = useCallback(() => {
    setFocusRunsToken((current) => current + 1);
  }, []);
  const value = useMemo(
    () => ({
      announce,
      clearNotice,
      engagementFilter,
      focusRunsToken,
      notice,
      openCreate,
      requestFocusRuns,
      setEngagementFilter,
    }),
    [
      announce,
      clearNotice,
      engagementFilter,
      focusRunsToken,
      notice,
      openCreate,
      requestFocusRuns,
    ],
  );

  return (
    <EngagementWorkspaceContext.Provider value={value}>
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

export function engagementMatchesFilter(name: string, kindLabel: string, filter: string): boolean {
  const query = filter.trim().toLowerCase();
  if (query.length === 0) return true;
  return name.toLowerCase().includes(query) || kindLabel.toLowerCase().includes(query);
}
