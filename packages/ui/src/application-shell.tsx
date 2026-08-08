import { ChevronDown, ChevronUp, Menu, PanelLeftClose, PanelLeftOpen, Terminal } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { cn } from "./cn.js";
import { ConsoleTabs, type ConsolePanel } from "./console-tabs.js";
import { FullScreenSheet } from "./full-screen-sheet.js";
import {
  CONSOLE_HEIGHT_STORAGE_KEY,
  DEFAULT_CONSOLE_HEIGHT,
  DEFAULT_SIDEBAR_WIDTH,
  DESKTOP_BREAKPOINT,
  MIN_CONSOLE_HEIGHT,
  MIN_SIDEBAR_WIDTH,
  SIDEBAR_OPEN_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
  clampConsoleHeight,
  clampSidebarWidth,
  getLayoutStorage,
  readStoredBoolean,
  readStoredNumber,
  writeStoredValue,
} from "./layout.js";
import { usePointerResize } from "./use-pointer-resize.js";

type CloseMobile = () => void;
type ShellSlot = ReactNode | ((closeMobile: CloseMobile) => ReactNode);

export interface ApplicationShellProps {
  children: ReactNode;
  consolePanels: readonly ConsolePanel[];
  consoleStatus?: ReactNode;
  mobileTitle?: string;
  sidebarActions: ReactNode;
  sidebarContent: ShellSlot;
  sidebarFooter: ShellSlot;
  sidebarHeader: ReactNode;
}

interface ShellStyle extends CSSProperties {
  "--shell-console-height": string;
  "--shell-sidebar-width": string;
}

function renderSlot(slot: ShellSlot, closeMobile: CloseMobile): ReactNode {
  return typeof slot === "function" ? slot(closeMobile) : slot;
}

function SidebarFrame({
  actions,
  content,
  footer,
  header,
}: {
  actions: ReactNode;
  content: ReactNode;
  footer: ReactNode;
  header: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="shrink-0">{header}</div>
      <div className="shrink-0 border-y border-sidebar-border">{actions}</div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{content}</div>
      <div className="shrink-0 border-t border-sidebar-border">{footer}</div>
    </div>
  );
}

export function ApplicationShell({
  children,
  consolePanels,
  consoleStatus = "Console ready",
  mobileTitle = "Blackglass navigation",
  sidebarActions,
  sidebarContent,
  sidebarFooter,
  sidebarHeader,
}: ApplicationShellProps) {
  const storage = getLayoutStorage(window);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(() =>
    readStoredBoolean(storage, SIDEBAR_OPEN_STORAGE_KEY, true),
  );
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    clampSidebarWidth(
      readStoredNumber(storage, SIDEBAR_WIDTH_STORAGE_KEY, DEFAULT_SIDEBAR_WIDTH),
      window.innerWidth,
    ),
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopConsoleCollapsed, setDesktopConsoleCollapsed] = useState(false);
  const [mobileConsoleOpen, setMobileConsoleOpen] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(() =>
    clampConsoleHeight(
      readStoredNumber(storage, CONSOLE_HEIGHT_STORAGE_KEY, DEFAULT_CONSOLE_HEIGHT),
      window.innerHeight,
    ),
  );
  const wasDesktop = useRef(window.innerWidth >= DESKTOP_BREAKPOINT);

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const renderedDesktopContent = useMemo(
    () => renderSlot(sidebarContent, closeMobileNav),
    [closeMobileNav, sidebarContent],
  );
  const renderedDesktopFooter = useMemo(
    () => renderSlot(sidebarFooter, closeMobileNav),
    [closeMobileNav, sidebarFooter],
  );

  useEffect(() => {
    writeStoredValue(storage, SIDEBAR_OPEN_STORAGE_KEY, desktopSidebarOpen);
    document.documentElement.dataset.sidebarOpen = String(desktopSidebarOpen);
  }, [desktopSidebarOpen, storage]);

  useEffect(() => {
    if (window.innerWidth < DESKTOP_BREAKPOINT) return;
    writeStoredValue(storage, SIDEBAR_WIDTH_STORAGE_KEY, sidebarWidth);
    document.documentElement.style.setProperty("--shell-sidebar-width", `${sidebarWidth}px`);
  }, [sidebarWidth, storage]);

  useEffect(() => {
    if (window.innerWidth < DESKTOP_BREAKPOINT) return;
    writeStoredValue(storage, CONSOLE_HEIGHT_STORAGE_KEY, consoleHeight);
    document.documentElement.style.setProperty("--shell-console-height", `${consoleHeight}px`);
  }, [consoleHeight, storage]);

  useEffect(() => {
    const onResize = () => {
      const isDesktop = window.innerWidth >= DESKTOP_BREAKPOINT;
      const wasDesktopViewport = wasDesktop.current;
      if (isDesktop) {
        setSidebarWidth((current) =>
          clampSidebarWidth(
            wasDesktopViewport
              ? current
              : readStoredNumber(storage, SIDEBAR_WIDTH_STORAGE_KEY, DEFAULT_SIDEBAR_WIDTH),
            window.innerWidth,
          ),
        );
        setConsoleHeight((current) =>
          clampConsoleHeight(
            wasDesktopViewport
              ? current
              : readStoredNumber(storage, CONSOLE_HEIGHT_STORAGE_KEY, DEFAULT_CONSOLE_HEIGHT),
            window.innerHeight,
          ),
        );
      } else {
        setSidebarWidth((current) => clampSidebarWidth(current, window.innerWidth));
        setConsoleHeight((current) => clampConsoleHeight(current, window.innerHeight));
      }
      wasDesktop.current = isDesktop;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [storage]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "b" ||
        (!event.metaKey && !event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        window.innerWidth < DESKTOP_BREAKPOINT
      ) {
        return;
      }
      const target = event.target;
      if (target instanceof Element && target.closest("[data-keybinding-capture]")) return;
      event.preventDefault();
      setDesktopSidebarOpen((current) => !current);
    };
    window.addEventListener("keydown", onShortcut, { capture: true });
    return () => window.removeEventListener("keydown", onShortcut, { capture: true });
  }, []);

  const sidebarResize = usePointerResize({
    axis: "x",
    clamp: useCallback((value: number) => clampSidebarWidth(value, window.innerWidth), []),
    cursor: "col-resize",
    onChange: setSidebarWidth,
    value: sidebarWidth,
  });
  const consoleResize = usePointerResize({
    axis: "y",
    clamp: useCallback((value: number) => clampConsoleHeight(value, window.innerHeight), []),
    cursor: "row-resize",
    direction: -1,
    onChange: setConsoleHeight,
    value: consoleHeight,
  });

  const style: ShellStyle = {
    "--shell-console-height": `${consoleHeight}px`,
    "--shell-sidebar-width": `${sidebarWidth}px`,
  };

  return (
    <div
      className="application-shell h-dvh min-h-0 overflow-hidden bg-background text-foreground"
      data-sidebar-open={desktopSidebarOpen}
      data-testid="application-shell"
      style={style}
    >
      <aside
        aria-hidden={!desktopSidebarOpen}
        aria-label="Primary"
        className="shell-sidebar fixed inset-y-0 z-30 hidden md:block"
        inert={!desktopSidebarOpen ? true : undefined}
      >
        <SidebarFrame
          header={sidebarHeader}
          actions={sidebarActions}
          content={renderedDesktopContent}
          footer={renderedDesktopFooter}
        />
        {desktopSidebarOpen && (
          <div
            aria-label="Resize sidebar"
            aria-orientation="vertical"
            aria-valuemax={Math.max(MIN_SIDEBAR_WIDTH, window.innerWidth - 640)}
            aria-valuemin={MIN_SIDEBAR_WIDTH}
            aria-valuenow={Math.round(sidebarWidth)}
            className="shell-sidebar-resize absolute inset-y-0 right-0 z-10 w-2 translate-x-1/2 cursor-col-resize touch-none"
            role="separator"
            {...sidebarResize}
          />
        )}
      </aside>

      <button
        type="button"
        aria-keyshortcuts="Control+B Meta+B"
        aria-label={desktopSidebarOpen ? "Hide sidebar" : "Show sidebar"}
        aria-pressed={desktopSidebarOpen}
        className="shell-sidebar-toggle fixed top-3 z-40 hidden size-11 items-center justify-center rounded-md border border-border bg-card text-foreground shadow-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
        onClick={() => setDesktopSidebarOpen((current) => !current)}
        title={`${desktopSidebarOpen ? "Hide" : "Show"} sidebar (Mod+B)`}
      >
        {desktopSidebarOpen ? (
          <PanelLeftClose className="size-5" aria-hidden="true" />
        ) : (
          <PanelLeftOpen className="size-5" aria-hidden="true" />
        )}
      </button>

      <div className="shell-workspace flex h-dvh min-w-0 flex-col">
        <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-3 pt-[env(safe-area-inset-top)] md:hidden">
          <FullScreenSheet
            description="Global navigation and Blackglass settings."
            onOpenChange={setMobileNavOpen}
            open={mobileNavOpen}
            title={mobileTitle}
            trigger={<Menu className="size-5" aria-hidden="true" />}
            triggerLabel="Open navigation"
          >
            <SidebarFrame
              header={sidebarHeader}
              actions={sidebarActions}
              content={renderSlot(sidebarContent, closeMobileNav)}
              footer={renderSlot(sidebarFooter, closeMobileNav)}
            />
          </FullScreenSheet>
          <span className="min-w-0 flex-1 truncate text-sm font-bold">Blackglass</span>
          <FullScreenSheet
            description="Advisor, activity, and raw output views."
            onOpenChange={setMobileConsoleOpen}
            open={mobileConsoleOpen}
            title="Console"
            trigger={<Terminal className="size-5" aria-hidden="true" />}
            triggerLabel="Open console"
          >
            <ConsoleTabs panels={consolePanels} />
          </FullScreenSheet>
        </header>

        <div className="min-h-0 flex-1 overflow-auto" data-testid="workspace-scroll-region">
          {children}
        </div>

        <section
          aria-label="Console"
          className={cn(
            "shell-console relative hidden shrink-0 border-t border-border bg-card md:block",
            desktopConsoleCollapsed && "shell-console-collapsed",
          )}
        >
          {!desktopConsoleCollapsed && (
            <div
              aria-label="Resize console"
              aria-orientation="horizontal"
              aria-valuemax={Math.max(MIN_CONSOLE_HEIGHT, window.innerHeight * 0.6)}
              aria-valuemin={MIN_CONSOLE_HEIGHT}
              aria-valuenow={Math.round(consoleHeight)}
              className="absolute inset-x-0 top-0 z-10 h-2 -translate-y-1/2 cursor-row-resize touch-none"
              role="separator"
              {...consoleResize}
            />
          )}
          {desktopConsoleCollapsed ? (
            <div className="flex h-11 items-center gap-3 px-4 text-sm text-muted-foreground">
              <Terminal className="size-4" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{consoleStatus}</span>
              <button
                type="button"
                aria-label="Expand console"
                className="inline-flex size-11 items-center justify-center rounded-md outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setDesktopConsoleCollapsed(false)}
              >
                <ChevronUp className="size-5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="relative h-full min-h-0">
              <button
                type="button"
                aria-label="Collapse console"
                className="absolute top-0 right-2 z-20 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setDesktopConsoleCollapsed(true)}
              >
                <ChevronDown className="size-5" aria-hidden="true" />
              </button>
              <ConsoleTabs panels={consolePanels} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
