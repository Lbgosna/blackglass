import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

import {
  formatRunnerAuthorization,
  type ActionSnapshot,
} from "@blackglass/contracts";
import {
  bindActionSnapshot,
  EngagementRepository,
  OperatorCommandRepository,
  openEngagementDatabase,
  RunRepository,
  RunnerRepository,
} from "@blackglass/db";
import { afterEach, describe, expect, it } from "vitest";

import fixtureData from "../../../docs/architecture/fixtures/d2/runner-identity.json" with {
  type: "json",
};
import { buildApp } from "./app.js";

const MUST_IMPLEMENT = [
  "d2.runner.route-separation",
  "d2.runner.protocol-handshake-accepted",
  "d2.runner.protocol-mismatch",
  "d2.runner.revocation-fences-work",
  "d2.runner.lost-credential-reenrollment",
] as const;

const DEFERRED: Record<string, string> = {
  "d2.runner.enrollment-owner-confirmation": "packages/db runner repository",
  "d2.runner.enrollment-expired": "packages/db runner repository",
  "d2.runner.credential-hashed-at-rest": "packages/db runner repository",
  "d2.runner.rotation-handover": "rotation handover / later owner",
  "d2.runner.required-capability-missing": "capability admission / later owner",
  "d2.runner.event-schema-unsupported": "event schema / later owner",
  "d2.runner.handshake-reports-abandoned-journals":
    "restart journals / later owner",
};

function requireFixture(id: string) {
  const value = fixtureData.cases.find((candidate) => candidate.id === id);
  if (value === undefined) throw new Error(`Missing D2 fixture ${id}`);
  return value;
}

const fixtureFingerprint =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const digestA = `sha256:${"a".repeat(64)}`;
const operatorHeaders = (key: string) => ({ "idempotency-key": key });
const operatorKey = (suffix: string) =>
  `fixture-idempotency-${suffix.padEnd(12, "0")}`;

const directories: string[] = [];
const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
  await Promise.all(
    directories.splice(0).map(async (directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

function boundSnapshot(actionId: string): ActionSnapshot {
  const snapshot: ActionSnapshot = {
    normalizationProfile: "d1-v1",
    orchestrationProfile: "d2-v1",
    snapshotId: `snapshot-${actionId}`,
    version: 1,
    binding: digestA,
    actionId,
    canonicalTargets: [
      {
        normalizationProfile: "d1-v1",
        kind: "hostname",
        hostname: "app.target.test",
      },
    ],
    concreteDestinations: [
      {
        normalizationProfile: "d1-v1",
        kind: "ip",
        family: 4,
        address: "192.0.2.40",
        zone: null,
      },
    ],
    typedOptions: { fixture: true },
    resolutionSnapshots: [
      {
        canonicalQueryName: "app.target.test",
        resolverMode: "system",
        cnameChain: [],
        answers: [{ address: "192.0.2.40", family: 4, ttlSeconds: 60 }],
        resolvedAt: "2026-08-09T11:59:00.000Z",
      },
    ],
    scopeRevisionId: null,
    warningState: {
      reasonCodes: [],
      knownAdditions: [],
      acknowledgment: null,
    },
  };
  const bound = bindActionSnapshot(snapshot);
  if (!bound.ok) throw new Error("fixture snapshot binding failed");
  return { ...snapshot, binding: bound.binding };
}

async function createHarness(options: { captureLogs?: boolean } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "blackglass-runner-api-"));
  directories.push(directory);
  await chmod(directory, 0o700);
  const database = openEngagementDatabase({ dataDirectory: directory });
  let engagementSeq = 0;
  let leaseSeq = 0;
  let runnerSeq = 0;
  let now = new Date("2026-08-09T12:00:00.000Z");
  const clock = () => new Date(now);
  const engagementRepository = new EngagementRepository(database.db, {
    createId: () =>
      `10000000-0000-4000-8000-${String(++engagementSeq).padStart(12, "0")}`,
    now: clock,
  });
  const runRepository = new RunRepository(database.db, {
    createId: () => `lease-fixture-${++leaseSeq}`,
    now: clock,
  });
  const runnerRepository = new RunnerRepository(database.db, {
    createId: () => {
      runnerSeq += 1;
      return runnerSeq === 2 ? "runner-fixture-1" : `runner-id-${runnerSeq}`;
    },
    now: clock,
  });
  const operatorCommandRepository = new OperatorCommandRepository(
    engagementRepository,
    { now: clock },
  );
  const logLines: string[] = [];
  const logger = options.captureLogs
    ? {
        level: "info" as const,
        stream: new Writable({
          write(chunk, _encoding, callback) {
            logLines.push(String(chunk));
            callback();
          },
        }),
      }
    : false;
  const app = buildApp({
    engagementRepository,
    operatorCommandRepository,
    runRepository,
    runnerRepository,
    getDevelopmentStorageReadiness: () => "ready",
    logger,
    now: clock,
  });
  app.addHook("onClose", async () => database.close());
  apps.push(app);
  return {
    app,
    database,
    engagementRepository,
    runRepository,
    runnerRepository,
    logLines,
    setNow(value: string) {
      now = new Date(value);
    },
  };
}

async function enroll(app: ReturnType<typeof buildApp>) {
  const challenge = await app.inject({
    method: "POST",
    url: "/api/v1/runners/enrollment-challenges",
    headers: operatorHeaders(operatorKey("enroll-start")),
    payload: {
      name: "fixture-runner",
      installationFingerprint: fixtureFingerprint,
    },
  });
  expect(challenge.statusCode).toBe(201);
  const confirmed = await app.inject({
    method: "POST",
    url: `/api/v1/runners/enrollment-challenges/${challenge.json().challengeId}/confirm`,
    headers: operatorHeaders(operatorKey("enroll-confirm")),
    payload: { ownerConfirmed: true },
  });
  expect(confirmed.statusCode).toBe(201);
  return confirmed.json() as {
    runner: { id: string; revision: number };
    secret: string;
  };
}

function runnerHeaders(runnerId: string, secret: string, key?: string) {
  return {
    authorization: formatRunnerAuthorization(runnerId, secret),
    ...(key === undefined ? {} : { "idempotency-key": key }),
  };
}

async function queueRun(
  harness: Awaited<ReturnType<typeof createHarness>>,
  actionId: string,
) {
  const engagement = harness.engagementRepository.createEngagement({
    name: "Runner fixture lab",
    kind: "lab",
    description: null,
    authorizationContext: "Synthetic fixture authorization context",
    autoContinueWarnings: false,
  });
  if (!engagement.ok) throw new Error(engagement.error.code);
  const planned = harness.engagementRepository.persistPlannedAction({
    engagementId: engagement.value.id,
    snapshot: boundSnapshot(actionId),
    representable: true,
    capabilityErrorCode: null,
    occurredAt: "2026-08-09T12:00:00.000Z",
  });
  if (!planned.ok) throw new Error(planned.error.code);
  const row = harness.database.sqlite
    .prepare("select id from runs where action_id = ?")
    .get(actionId) as { id: string } | undefined;
  if (row === undefined) throw new Error("queued run missing");
  return row.id;
}

async function handshake(
  app: ReturnType<typeof buildApp>,
  runnerId: string,
  secret: string,
  sessionId = "session-fixture-1",
) {
  return app.inject({
    method: "POST",
    url: "/api/v1/runner/handshake",
    headers: runnerHeaders(runnerId, secret),
    payload: {
      protocol: "runner-control-v1",
      sessionId,
      installationFingerprint: fixtureFingerprint,
      eventSchemas: ["runner-event-v1"],
      registryDigest: `sha256:${"b".repeat(64)}`,
    },
  });
}

function sqliteContainsSecret(
  database: Awaited<ReturnType<typeof createHarness>>["database"],
  secret: string,
): boolean {
  const tables = database.sqlite
    .prepare(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%'",
    )
    .pluck()
    .all() as string[];
  for (const table of tables) {
    const rows = database.sqlite.prepare(`select * from "${table}"`).all();
    if (JSON.stringify(rows).includes(secret)) return true;
  }
  return false;
}

describe("runner identity HTTP fixture ownership", () => {
  it("implements or explicitly defers every D2 runner-identity case", () => {
    const implemented = new Set<string>(MUST_IMPLEMENT);
    for (const entry of fixtureData.cases) {
      const deferredOwner = DEFERRED[entry.id];
      if (deferredOwner !== undefined) {
        expect(implemented.has(entry.id), `${entry.id} must not be fake-passed`).toBe(
          false,
        );
        expect(deferredOwner.length).toBeGreaterThan(0);
        continue;
      }
      expect(implemented.has(entry.id), `${entry.id} has no owner`).toBe(true);
    }
  });
});

describe("runner enrollment and lease routes", () => {
  it("d2.runner.route-separation: rejects cross-family credentials", async () => {
    const spec = requireFixture("d2.runner.route-separation");
    expect(spec.given.runnerRoute).toBe("/api/v1/runner/lease");
    expect(spec.expected?.runnerOnOperatorRoute).toBe("rejected");
    expect(spec.expected?.operatorOnRunnerRoute).toBe("rejected");
    const harness = await createHarness();
    const enrolled = await enroll(harness.app);
    const runnerOnActions = await harness.app.inject({
      method: "GET",
      url: "/api/v1/actions",
      headers: runnerHeaders(enrolled.runner.id, enrolled.secret),
    });
    const runnerOnEngagements = await harness.app.inject({
      method: "GET",
      url: "/api/v1/engagements",
      headers: runnerHeaders(enrolled.runner.id, enrolled.secret),
    });
    const operatorOnLease = await harness.app.inject({
      method: "POST",
      url: "/api/v1/runner/lease",
      headers: operatorHeaders(operatorKey("operator-lease")),
      payload: { sessionId: "session-fixture-1" },
    });
    expect(runnerOnActions.statusCode).toBe(403);
    expect(runnerOnActions.json()).toEqual({ code: "runner_route_forbidden" });
    expect(runnerOnEngagements.statusCode).toBe(403);
    expect(operatorOnLease.statusCode).toBe(401);
    expect(operatorOnLease.json()).toEqual({ code: "runner_unauthorized" });
    expect(spec.given.crossUseAttempts).toBe(2);
  });

  it("d2.runner.protocol-handshake-accepted: accepted session may lease", async () => {
    const spec = requireFixture("d2.runner.protocol-handshake-accepted");
    const harness = await createHarness();
    const enrolled = await enroll(harness.app);
    await queueRun(harness, "action-fixture-handshake");
    const accepted = await handshake(
      harness.app,
      enrolled.runner.id,
      enrolled.secret,
      String(spec.given.sessionId ?? "session-fixture-1"),
    );
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({
      acceptedProtocol: spec.expected?.acceptedProtocol,
      leaseAllowed: spec.expected?.leaseAllowed,
      sessionPinned: spec.expected?.sessionPinned,
      registryPinned: spec.expected?.registryPinned,
    });
    const leased = await harness.app.inject({
      method: "POST",
      url: "/api/v1/runner/lease",
      headers: runnerHeaders(enrolled.runner.id, enrolled.secret),
      payload: { sessionId: spec.given.sessionId ?? "session-fixture-1" },
    });
    expect(leased.statusCode).toBe(200);
    expect(leased.json().lease.sessionId).toBe(
      spec.given.sessionId ?? "session-fixture-1",
    );
  });

  it("d2.runner.protocol-mismatch: 426 does not create a lease", async () => {
    const spec = requireFixture("d2.runner.protocol-mismatch");
    const harness = await createHarness();
    const enrolled = await enroll(harness.app);
    const runId = await queueRun(harness, "action-fixture-mismatch");
    const mismatched = await harness.app.inject({
      method: "POST",
      url: "/api/v1/runner/handshake",
      headers: runnerHeaders(enrolled.runner.id, enrolled.secret),
      payload: {
        protocol: spec.given.protocol,
        sessionId: "session-fixture-mismatch",
        installationFingerprint: fixtureFingerprint,
        eventSchemas: spec.given.eventSchemas,
      },
    });
    expect(mismatched.statusCode).toBe(spec.error?.httpStatus);
    expect(mismatched.json()).toEqual({
      code: spec.error?.code,
      supported: spec.error?.supported,
    });
    const leased = await harness.app.inject({
      method: "POST",
      url: "/api/v1/runner/lease",
      headers: runnerHeaders(enrolled.runner.id, enrolled.secret),
      payload: { sessionId: "session-fixture-mismatch" },
    });
    expect(leased.statusCode).toBe(409);
    expect(leased.json()).toEqual({ code: "runner_handshake_required" });
    expect(harness.runRepository.getCurrentLease(runId)).toEqual({
      ok: false,
      error: { code: "run_not_found" },
    });
    expect(spec.error?.leaseAllowed).toBe(false);
  });

  it("heartbeats, appends started, and completes through RunRepository", async () => {
    const harness = await createHarness();
    const enrolled = await enroll(harness.app);
    await queueRun(harness, "action-fixture-complete");
    await handshake(harness.app, enrolled.runner.id, enrolled.secret);
    const leased = await harness.app.inject({
      method: "POST",
      url: "/api/v1/runner/lease",
      headers: runnerHeaders(enrolled.runner.id, enrolled.secret),
      payload: { sessionId: "session-fixture-1" },
    });
    expect(leased.statusCode).toBe(200);
    const lease = leased.json().lease;
    harness.setNow("2026-08-09T12:00:10.000Z");
    const heartbeat = await harness.app.inject({
      method: "POST",
      url: `/api/v1/runner/leases/${lease.leaseId}/heartbeat`,
      headers: runnerHeaders(enrolled.runner.id, enrolled.secret),
      payload: {
        runId: lease.runId,
        sessionId: lease.sessionId,
        fence: lease.fence,
        heartbeatSequence: 1,
      },
    });
    expect(heartbeat.statusCode).toBe(200);
    expect(heartbeat.json()).toEqual({
      heartbeatSequence: 1,
      leaseExpiresAt: "2026-08-09T12:00:40.000Z",
    });
    const started = await harness.app.inject({
      method: "POST",
      url: `/api/v1/runner/leases/${lease.leaseId}/events`,
      headers: runnerHeaders(
        enrolled.runner.id,
        enrolled.secret,
        operatorKey("started"),
      ),
      payload: {
        runId: lease.runId,
        sessionId: lease.sessionId,
        fence: lease.fence,
        sequence: 1,
        payload: { started: true },
      },
    });
    expect(started.statusCode).toBe(200);
    expect(started.json().event.type).toBe("started");
    const completed = await harness.app.inject({
      method: "POST",
      url: `/api/v1/runner/leases/${lease.leaseId}/complete`,
      headers: runnerHeaders(
        enrolled.runner.id,
        enrolled.secret,
        operatorKey("complete"),
      ),
      payload: {
        runId: lease.runId,
        sessionId: lease.sessionId,
        fence: lease.fence,
        sequence: 2,
        terminalKind: "succeeded",
        reason: null,
      },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({
      disposition: "accepted_completion",
      event: { type: "succeeded" },
    });
    expect(harness.runRepository.getRun(lease.runId)).toMatchObject({
      ok: true,
      value: { state: "succeeded" },
    });
  });

  it("keeps stale fence, expired lease, and owner mismatch failing through the run repository", async () => {
    const harness = await createHarness();
    const enrolled = await enroll(harness.app);
    await queueRun(harness, "action-fixture-authority");
    await handshake(harness.app, enrolled.runner.id, enrolled.secret);
    const leased = await harness.app.inject({
      method: "POST",
      url: "/api/v1/runner/lease",
      headers: runnerHeaders(enrolled.runner.id, enrolled.secret),
      payload: { sessionId: "session-fixture-1" },
    });
    const lease = leased.json().lease;
    const stale = await harness.app.inject({
      method: "POST",
      url: `/api/v1/runner/leases/${lease.leaseId}/events`,
      headers: runnerHeaders(
        enrolled.runner.id,
        enrolled.secret,
        operatorKey("stale"),
      ),
      payload: {
        runId: lease.runId,
        sessionId: lease.sessionId,
        fence: "99",
        sequence: 1,
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ code: "stale_fence" });
    const owner = await harness.app.inject({
      method: "POST",
      url: `/api/v1/runner/leases/${lease.leaseId}/heartbeat`,
      headers: runnerHeaders(enrolled.runner.id, enrolled.secret),
      payload: {
        runId: lease.runId,
        sessionId: "session-other",
        fence: lease.fence,
        heartbeatSequence: 1,
      },
    });
    expect(owner.statusCode).toBe(403);
    expect(owner.json()).toEqual({ code: "lease_owner_mismatch" });
    harness.setNow("2026-08-09T12:00:31.000Z");
    const expiredCurrent = await harness.app.inject({
      method: "POST",
      url: `/api/v1/runner/leases/${lease.leaseId}/heartbeat`,
      headers: runnerHeaders(enrolled.runner.id, enrolled.secret),
      payload: {
        runId: lease.runId,
        sessionId: lease.sessionId,
        fence: lease.fence,
        heartbeatSequence: 1,
      },
    });
    expect(expiredCurrent.statusCode).toBe(409);
    expect(expiredCurrent.json()).toEqual({ code: "lease_expired" });
    expect(
      harness.runRepository.expireLease({
        runId: lease.runId,
        serverNow: "2026-08-09T12:00:31.000Z",
      }).ok,
    ).toBe(true);
    const expired = await harness.app.inject({
      method: "POST",
      url: `/api/v1/runner/leases/${lease.leaseId}/events`,
      headers: runnerHeaders(
        enrolled.runner.id,
        enrolled.secret,
        operatorKey("expired"),
      ),
      payload: {
        runId: lease.runId,
        sessionId: lease.sessionId,
        fence: lease.fence,
        sequence: 1,
      },
    });
    expect(expired.statusCode).toBe(409);
    expect(expired.json()).toEqual({ code: "stale_fence" });
  });

  it("d2.runner.revocation-fences-work: revoke denies later runner calls", async () => {
    const spec = requireFixture("d2.runner.revocation-fences-work");
    const harness = await createHarness();
    const enrolled = await enroll(harness.app);
    await queueRun(harness, "action-fixture-revoke");
    await handshake(harness.app, enrolled.runner.id, enrolled.secret);
    const leased = await harness.app.inject({
      method: "POST",
      url: "/api/v1/runner/lease",
      headers: runnerHeaders(enrolled.runner.id, enrolled.secret),
      payload: { sessionId: "session-fixture-1" },
    });
    expect(leased.statusCode).toBe(200);
    const revoked = await harness.app.inject({
      method: "POST",
      url: `/api/v1/runners/${enrolled.runner.id}/revoke`,
      headers: operatorHeaders(operatorKey("revoke")),
      payload: { expectedRevision: enrolled.runner.revision },
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json()).toMatchObject({
      leasesFenced: spec.expected?.leasesFenced,
      cancellationRequested: spec.expected?.cancellationRequested,
      runner: { status: "revoked" },
    });
    const denied = await handshake(
      harness.app,
      enrolled.runner.id,
      enrolled.secret,
    );
    expect(denied.statusCode).toBe(401);
    expect(denied.json()).toEqual({ code: "runner_unauthorized" });
    expect(spec.expected?.authenticationAccepted).toBe(false);
    expect(spec.expected?.newLeaseAllowed).toBe(false);
    expect(spec.expected?.runnerCancelsOnAuthenticationRejection).toBe(true);
  });

  it("d2.runner.lost-credential-reenrollment: confirm replay does not redisplay the secret", async () => {
    const spec = requireFixture("d2.runner.lost-credential-reenrollment");
    const harness = await createHarness({ captureLogs: true });
    const challenge = await harness.app.inject({
      method: "POST",
      url: "/api/v1/runners/enrollment-challenges",
      headers: operatorHeaders(operatorKey("lost-start")),
      payload: {
        name: "fixture-runner",
        installationFingerprint: fixtureFingerprint,
      },
    });
    const confirmRequest = {
      method: "POST" as const,
      url: `/api/v1/runners/enrollment-challenges/${challenge.json().challengeId}/confirm`,
      headers: operatorHeaders(operatorKey("lost-confirm")),
      payload: { ownerConfirmed: true },
    };
    const first = await harness.app.inject(confirmRequest);
    expect(first.statusCode).toBe(201);
    const secret = first.json().secret as string;
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const replay = await harness.app.inject(confirmRequest);
    expect(replay.statusCode).toBe(201);
    expect(replay.json().secret).toBeUndefined();
    expect(sqliteContainsSecret(harness.database, secret)).toBe(false);
    expect(first.body).toContain(secret);
    expect(replay.body).not.toContain(secret);
    expect(harness.logLines.join("\n")).not.toContain(secret);
    expect(harness.logLines.join("\n")).not.toContain("Blackglass-Runner");
    const failed = await harness.app.inject({
      method: "POST",
      url: `/api/v1/runners/${first.json().runner.id}/revoke`,
      headers: operatorHeaders(operatorKey("lost-revoke")),
      payload: { expectedRevision: 99 },
    });
    expect(failed.body).not.toContain(secret);
    expect(spec.expected?.secretRecoverable).toBe(false);
    expect(spec.expected?.requiredSteps).toEqual([
      "revoke_identity",
      "remove_local_file",
      "enroll_again",
    ]);
  });

  it("does not treat storage_busy during authenticate as credential rejection", async () => {
    const harness = await createHarness();
    const enrolled = await enroll(harness.app);
    const original = harness.runnerRepository.authenticate.bind(
      harness.runnerRepository,
    );
    harness.runnerRepository.authenticate = () => ({
      ok: false as const,
      error: { code: "storage_busy" as const },
    });
    try {
      const busy = await harness.app.inject({
        method: "POST",
        url: "/api/v1/runner/handshake",
        headers: runnerHeaders(enrolled.runner.id, enrolled.secret),
        payload: {
          protocol: "runner-control-v1",
          sessionId: "session-fixture-busy",
          installationFingerprint: fixtureFingerprint,
          eventSchemas: ["runner-event-v1"],
        },
      });
      expect(busy.statusCode).toBe(503);
      expect(busy.json()).toEqual({ code: "storage_busy" });
    } finally {
      harness.runnerRepository.authenticate = original;
    }
  });

  it("fails closed on a second enabled enroll and an expired HTTP challenge", async () => {
    const harness = await createHarness();
    await enroll(harness.app);
    const second = await harness.app.inject({
      method: "POST",
      url: "/api/v1/runners/enrollment-challenges",
      headers: operatorHeaders(operatorKey("second")),
      payload: {
        name: "fixture-runner-2",
        installationFingerprint: `sha256:${"c".repeat(64)}`,
      },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ code: "runner_already_enabled" });

    const isolated = await createHarness();
    const challenge = await isolated.app.inject({
      method: "POST",
      url: "/api/v1/runners/enrollment-challenges",
      headers: operatorHeaders(operatorKey("exp-start")),
      payload: {
        name: "fixture-runner",
        installationFingerprint: fixtureFingerprint,
      },
    });
    isolated.setNow("2026-08-09T12:10:01.000Z");
    const expired = await isolated.app.inject({
      method: "POST",
      url: `/api/v1/runners/enrollment-challenges/${challenge.json().challengeId}/confirm`,
      headers: operatorHeaders(operatorKey("exp-confirm")),
      payload: { ownerConfirmed: true },
    });
    expect(expired.statusCode).toBe(409);
    expect(expired.json()).toEqual({ code: "enrollment_challenge_expired" });
    expect(
      isolated.database.sqlite
        .prepare("select count(*) as count from runner_identities")
        .get(),
    ).toEqual({ count: 0 });
  });
});
