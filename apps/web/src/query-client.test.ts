import { describe, expect, it } from "vitest";

import {
  createAppQueryClient,
  QUERY_GC_TIME_MS,
  QUERY_STALE_TIME_MS,
} from "./query-client.js";

describe("createAppQueryClient", () => {
  it("uses deliberate non-automatic query and mutation defaults", () => {
    const client = createAppQueryClient();
    const defaults = client.getDefaultOptions();

    expect(defaults.queries).toMatchObject({
      gcTime: QUERY_GC_TIME_MS,
      refetchInterval: false,
      refetchIntervalInBackground: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: QUERY_STALE_TIME_MS,
    });
    expect(defaults.mutations).toMatchObject({ retry: false });
    client.clear();
  });
});
