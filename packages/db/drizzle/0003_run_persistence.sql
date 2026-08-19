CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_version` integer NOT NULL,
	`action_id` text NOT NULL,
	`engagement_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`state` text NOT NULL,
	`current_lease_id` text,
	`current_fence` text NOT NULL,
	`terminal_kind` text,
	`terminal_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`engagement_id`,`action_id`) REFERENCES `actions`(`engagement_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "run_contract_version" CHECK("runs"."contract_version" = 1),
	CONSTRAINT "run_id_length" CHECK(length("runs"."id") between 1 and 255),
	CONSTRAINT "run_attempt_safe_positive" CHECK("runs"."attempt" between 1 and 9007199254740991),
	CONSTRAINT "run_state" CHECK("runs"."state" in ('queued', 'leased', 'running', 'cancel_requested', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "run_current_fence_canonical_int64" CHECK(length("runs"."current_fence") between 1 and 19 and "runs"."current_fence" not glob '*[^0-9]*' and ("runs"."current_fence" = '0' or substr("runs"."current_fence", 1, 1) between '1' and '9') and (length("runs"."current_fence") < 19 or "runs"."current_fence" <= '9223372036854775807')),
	CONSTRAINT "run_positive_fence_after_queue" CHECK("runs"."current_fence" <> '0' or "runs"."state" in ('queued', 'cancelled')),
	CONSTRAINT "run_terminal_fields" CHECK((
        "runs"."state" = 'succeeded' and "runs"."terminal_kind" = 'succeeded' and "runs"."terminal_reason" is null
      ) or (
        "runs"."state" in ('failed', 'cancelled') and "runs"."terminal_kind" = "runs"."state" and "runs"."terminal_reason" is not null
      ) or (
        "runs"."state" not in ('succeeded', 'failed', 'cancelled') and "runs"."terminal_kind" is null and "runs"."terminal_reason" is null
      )),
	CONSTRAINT "run_terminal_reason" CHECK("runs"."terminal_reason" is null or (length("runs"."terminal_reason") between 1 and 64 and substr("runs"."terminal_reason", 1, 1) glob '[a-z]' and "runs"."terminal_reason" not glob '*[^a-z0-9_]*'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `run_action_attempt_unique` ON `runs` (`action_id`,`attempt`);--> statement-breakpoint
CREATE UNIQUE INDEX `run_engagement_id_unique` ON `runs` (`engagement_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `run_action_nonterminal_unique` ON `runs` (`action_id`) WHERE "runs"."state" not in ('succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE INDEX `run_queue_order_idx` ON `runs` (`state`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `run_leases` (
	`lease_id` text PRIMARY KEY NOT NULL,
	`contract_version` integer NOT NULL,
	`run_id` text NOT NULL,
	`runner_id` text NOT NULL,
	`session_id` text NOT NULL,
	`fence` text NOT NULL,
	`expires_at` text NOT NULL,
	`latest_heartbeat_sequence` integer NOT NULL,
	`latest_event_sequence` integer NOT NULL,
	`latest_heartbeat_digest` text,
	`current` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "run_lease_contract_version" CHECK("run_leases"."contract_version" = 1),
	CONSTRAINT "run_lease_id_length" CHECK(length("run_leases"."lease_id") between 1 and 255),
	CONSTRAINT "run_lease_runner_id_length" CHECK(length("run_leases"."runner_id") between 1 and 255),
	CONSTRAINT "run_lease_session_id_length" CHECK(length("run_leases"."session_id") between 1 and 255),
	CONSTRAINT "run_lease_fence_canonical_int64" CHECK(length("run_leases"."fence") between 1 and 19 and "run_leases"."fence" not glob '*[^0-9]*' and substr("run_leases"."fence", 1, 1) between '1' and '9' and (length("run_leases"."fence") < 19 or "run_leases"."fence" <= '9223372036854775807')),
	CONSTRAINT "run_lease_heartbeat_sequence" CHECK("run_leases"."latest_heartbeat_sequence" between 0 and 9007199254740991),
	CONSTRAINT "run_lease_event_sequence" CHECK("run_leases"."latest_event_sequence" between 0 and 9007199254740991),
	CONSTRAINT "run_lease_heartbeat_digest" CHECK("run_leases"."latest_heartbeat_digest" is null or (length("run_leases"."latest_heartbeat_digest") = 71 and "run_leases"."latest_heartbeat_digest" glob 'sha256:[0-9a-f]*' and "run_leases"."latest_heartbeat_digest" not glob 'sha256:*[^0-9a-f]*')),
	CONSTRAINT "run_lease_current_boolean" CHECK("run_leases"."current" in (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `run_lease_run_fence_unique` ON `run_leases` (`run_id`,`fence`);--> statement-breakpoint
CREATE UNIQUE INDEX `run_lease_identity_unique` ON `run_leases` (`lease_id`,`run_id`,`fence`);--> statement-breakpoint
CREATE UNIQUE INDEX `run_lease_current_run_unique` ON `run_leases` (`run_id`) WHERE "run_leases"."current" = 1;--> statement-breakpoint
CREATE INDEX `run_lease_runner_current_idx` ON `run_leases` (`runner_id`,`session_id`,`current`,`expires_at`);--> statement-breakpoint
CREATE TABLE `run_events` (
	`event_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contract_version` integer NOT NULL,
	`run_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`fence` text NOT NULL,
	`payload_json` text NOT NULL,
	`digest` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "run_event_contract_version" CHECK("run_events"."contract_version" = 1),
	CONSTRAINT "run_event_id_safe_positive" CHECK("run_events"."event_id" between 1 and 9007199254740991),
	CONSTRAINT "run_event_sequence_safe_positive" CHECK("run_events"."sequence" between 1 and 9007199254740991),
	CONSTRAINT "run_event_type" CHECK("run_events"."type" in ('lease_acquired', 'heartbeat', 'started', 'lease_expired', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "run_event_fence_canonical_int64" CHECK(length("run_events"."fence") between 1 and 19 and "run_events"."fence" not glob '*[^0-9]*' and substr("run_events"."fence", 1, 1) between '1' and '9' and (length("run_events"."fence") < 19 or "run_events"."fence" <= '9223372036854775807')),
	CONSTRAINT "run_event_payload_json" CHECK(json_valid("run_events"."payload_json") and length(cast("run_events"."payload_json" as blob)) <= 1048576),
	CONSTRAINT "run_event_digest" CHECK(length("run_events"."digest") = 71 and "run_events"."digest" glob 'sha256:[0-9a-f]*' and "run_events"."digest" not glob 'sha256:*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `run_event_run_type_sequence_unique` ON `run_events` (`run_id`,`fence`,`type`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `run_event_runner_sequence_unique` ON `run_events` (`run_id`,`fence`,`sequence`) WHERE "run_events"."type" in ('started', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE INDEX `run_event_run_created_idx` ON `run_events` (`run_id`,`event_id`);--> statement-breakpoint
CREATE TRIGGER `run_events_no_update`
BEFORE UPDATE ON `run_events`
BEGIN
	SELECT RAISE(ABORT, 'run events are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `run_events_no_delete`
BEFORE DELETE ON `run_events`
BEGIN
	SELECT RAISE(ABORT, 'run events are immutable');
END;