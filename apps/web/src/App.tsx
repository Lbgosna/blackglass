import { HealthResponseSchema } from "@blackglass/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

type ApiState = "checking" | "connected" | "unavailable";

export function App() {
  const [apiState, setApiState] = useState<ApiState>("checking");
  const [requestNumber, setRequestNumber] = useState(0);
  const latestRequest = useRef(0);

  const retry = useCallback(() => {
    setApiState("checking");
    setRequestNumber((current) => current + 1);
  }, []);

  useEffect(() => {
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;
    let mounted = true;

    async function checkHealth() {
      try {
        const response = await fetch("/health");
        if (!response.ok) throw new Error(`Health returned HTTP ${response.status}.`);
        const payload: unknown = await response.json();
        const result = HealthResponseSchema.safeParse(payload);
        if (!result.success) throw new Error("Health response did not match its contract.");
        if (mounted && latestRequest.current === requestId) setApiState("connected");
      } catch {
        if (mounted && latestRequest.current === requestId) setApiState("unavailable");
      }
    }

    void checkHealth();
    return () => {
      mounted = false;
    };
  }, [requestNumber]);

  return (
    <main className="app">
      <section className="status-card" aria-live="polite">
        <p className="eyebrow">Blackglass</p>
        <h1>Local security workbench</h1>
        {apiState === "checking" && <p>Checking API</p>}
        {apiState === "connected" && <p>API connected</p>}
        {apiState === "unavailable" && (
          <div>
            <p>API unavailable</p>
            <button type="button" onClick={retry}>
              Retry
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
