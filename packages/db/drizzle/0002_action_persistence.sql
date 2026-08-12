CREATE TABLE `actions` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_version` integer NOT NULL,
	`engagement_id` text NOT NULL,
	`revision` integer NOT NULL,
	`state` text NOT NULL,
	`queued_snapshot_version` integer,
	`warning_interactions` integer NOT NULL,
	`run_state` text,
	`resume_requested` integer NOT NULL,
	`cleanup_required` integer NOT NULL,
	`capability_error_code` text,
	`pending_warning_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "action_contract_version" CHECK("actions"."contract_version" = 1),
	CONSTRAINT "action_revision_positive" CHECK("actions"."revision" >= 1),
	CONSTRAINT "action_id_length" CHECK(length("actions"."id") between 1 and 255),
	CONSTRAINT "action_state" CHECK("actions"."state" in ('planning', 'paused_for_warning', 'queued', 'active', 'active_paused_for_warning', 'succeeded', 'failed', 'cancelled', 'capability_error')),
	CONSTRAINT "action_queued_snapshot_version" CHECK("actions"."queued_snapshot_version" is null or "actions"."queued_snapshot_version" >= 1),
	CONSTRAINT "action_warning_interactions" CHECK("actions"."warning_interactions" in (0, 1)),
	CONSTRAINT "action_run_state" CHECK("actions"."run_state" is null or "actions"."run_state" in ('running', 'cancel_requested')),
	CONSTRAINT "action_resume_boolean" CHECK("actions"."resume_requested" in (0, 1)),
	CONSTRAINT "action_cleanup_boolean" CHECK("actions"."cleanup_required" in (0, 1)),
	CONSTRAINT "action_capability_error" CHECK("actions"."capability_error_code" is null or "actions"."capability_error_code" in ('capability_error', 'required_resolution_unavailable', 'target_set_unrepresentable')),
	CONSTRAINT "action_pending_warning_json" CHECK("actions"."pending_warning_json" is null or (json_valid("actions"."pending_warning_json") and length(cast("actions"."pending_warning_json" as blob)) <= 1048576))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `action_engagement_id_unique` ON `actions` (`engagement_id`,`id`);--> statement-breakpoint
CREATE INDEX `action_engagement_created_idx` ON `actions` (`engagement_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `action_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_version` integer NOT NULL,
	`action_id` text NOT NULL,
	`engagement_id` text NOT NULL,
	`version` integer NOT NULL,
	`binding` text NOT NULL,
	`canonicalization_profile` text NOT NULL,
	`scope_revision_id` text,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`engagement_id`,`action_id`) REFERENCES `actions`(`engagement_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`engagement_id`,`scope_revision_id`) REFERENCES `scope_revisions`(`engagement_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "action_snapshot_contract_version" CHECK("action_snapshots"."contract_version" = 1),
	CONSTRAINT "action_snapshot_version_positive" CHECK("action_snapshots"."version" >= 1),
	CONSTRAINT "action_snapshot_id_length" CHECK(length("action_snapshots"."id") between 1 and 255),
	CONSTRAINT "action_snapshot_profile" CHECK("action_snapshots"."canonicalization_profile" = 'action-snapshot-json-v1'),
	CONSTRAINT "action_snapshot_binding" CHECK(length("action_snapshots"."binding") = 71 and "action_snapshots"."binding" glob 'sha256:[0-9a-f]*' and "action_snapshots"."binding" not glob 'sha256:*[^0-9a-f]*'),
	CONSTRAINT "action_snapshot_json" CHECK(json_valid("action_snapshots"."snapshot_json") and length(cast("action_snapshots"."snapshot_json" as blob)) <= 1048576)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `action_snapshot_action_version_unique` ON `action_snapshots` (`action_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `action_snapshot_action_id_unique` ON `action_snapshots` (`action_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `action_snapshot_engagement_id_unique` ON `action_snapshots` (`engagement_id`,`id`);--> statement-breakpoint
CREATE TRIGGER `action_snapshots_no_update`
BEFORE UPDATE ON `action_snapshots`
BEGIN
	SELECT RAISE(ABORT, 'action snapshots are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `action_snapshots_no_delete`
BEFORE DELETE ON `action_snapshots`
BEGIN
	SELECT RAISE(ABORT, 'action snapshots are immutable');
END;--> statement-breakpoint
CREATE TABLE `action_warning_acknowledgments` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_version` integer NOT NULL,
	`action_id` text NOT NULL,
	`engagement_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`snapshot_version` integer NOT NULL,
	`snapshot_binding` text NOT NULL,
	`scope_revision_id` text,
	`reason_codes_json` text NOT NULL,
	`known_additions_json` text NOT NULL,
	`source` text NOT NULL,
	`acknowledged_at` text NOT NULL,
	`pending_event_id` integer,
	FOREIGN KEY (`engagement_id`,`action_id`) REFERENCES `actions`(`engagement_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`action_id`,`snapshot_id`) REFERENCES `action_snapshots`(`action_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`engagement_id`,`scope_revision_id`) REFERENCES `scope_revisions`(`engagement_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "action_warning_acknowledgment_contract_version" CHECK("action_warning_acknowledgments"."contract_version" = 1),
	CONSTRAINT "action_warning_acknowledgment_id_length" CHECK(length("action_warning_acknowledgments"."id") between 1 and 255),
	CONSTRAINT "action_warning_acknowledgment_snapshot_version" CHECK("action_warning_acknowledgments"."snapshot_version" >= 1),
	CONSTRAINT "action_warning_acknowledgment_binding" CHECK(length("action_warning_acknowledgments"."snapshot_binding") = 71 and "action_warning_acknowledgments"."snapshot_binding" glob 'sha256:[0-9a-f]*' and "action_warning_acknowledgments"."snapshot_binding" not glob 'sha256:*[^0-9a-f]*'),
	CONSTRAINT "action_warning_acknowledgment_source" CHECK("action_warning_acknowledgments"."source" in ('operator_continue', 'add_scope_and_run', 'engagement_policy')),
	CONSTRAINT "action_warning_acknowledgment_pending_event" CHECK("action_warning_acknowledgments"."pending_event_id" is null or "action_warning_acknowledgments"."pending_event_id" >= 1),
	CONSTRAINT "action_warning_acknowledgment_reason_codes_json" CHECK(json_valid("action_warning_acknowledgments"."reason_codes_json") and length(cast("action_warning_acknowledgments"."reason_codes_json" as blob)) <= 1048576),
	CONSTRAINT "action_warning_acknowledgment_known_additions_json" CHECK(json_valid("action_warning_acknowledgments"."known_additions_json") and length(cast("action_warning_acknowledgments"."known_additions_json" as blob)) <= 1048576)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `action_warning_acknowledgment_action_unique` ON `action_warning_acknowledgments` (`action_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `action_warning_acknowledgment_engagement_id_unique` ON `action_warning_acknowledgments` (`engagement_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `action_warning_acknowledgment_action_id_unique` ON `action_warning_acknowledgments` (`action_id`,`id`);--> statement-breakpoint
CREATE TRIGGER `action_warning_acknowledgments_no_update`
BEFORE UPDATE ON `action_warning_acknowledgments`
BEGIN
	SELECT RAISE(ABORT, 'action warning acknowledgments are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `action_warning_acknowledgments_no_delete`
BEFORE DELETE ON `action_warning_acknowledgments`
BEGIN
	SELECT RAISE(ABORT, 'action warning acknowledgments are immutable');
END;--> statement-breakpoint
CREATE TABLE `action_covered_destinations` (
	`action_id` text NOT NULL,
	`engagement_id` text NOT NULL,
	`acknowledgment_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`destination_json` text NOT NULL,
	`reason_codes_json` text NOT NULL,
	`acknowledged_cover` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`action_id`, `sequence`),
	FOREIGN KEY (`engagement_id`,`action_id`) REFERENCES `actions`(`engagement_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`action_id`,`acknowledgment_id`) REFERENCES `action_warning_acknowledgments`(`action_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "action_covered_destination_sequence" CHECK("action_covered_destinations"."sequence" >= 1),
	CONSTRAINT "action_covered_destination_ack_cover" CHECK("action_covered_destinations"."acknowledged_cover" in (0, 1)),
	CONSTRAINT "action_covered_destination_json" CHECK(json_valid("action_covered_destinations"."destination_json") and length(cast("action_covered_destinations"."destination_json" as blob)) <= 1048576),
	CONSTRAINT "action_covered_destination_reason_codes_json" CHECK(json_valid("action_covered_destinations"."reason_codes_json") and length(cast("action_covered_destinations"."reason_codes_json" as blob)) <= 1048576)
);
--> statement-breakpoint
CREATE TRIGGER `action_covered_destinations_no_update`
BEFORE UPDATE ON `action_covered_destinations`
BEGIN
	SELECT RAISE(ABORT, 'action covered destinations are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `action_covered_destinations_no_delete`
BEFORE DELETE ON `action_covered_destinations`
BEGIN
	SELECT RAISE(ABORT, 'action covered destinations are immutable');
END;
