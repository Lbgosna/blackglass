CREATE TABLE `runner_enrollment_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_version` integer NOT NULL,
	`name` text NOT NULL,
	`installation_fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	CONSTRAINT "runner_enrollment_challenge_contract_version" CHECK("runner_enrollment_challenges"."contract_version" = 1),
	CONSTRAINT "runner_enrollment_challenge_id_length" CHECK(length("runner_enrollment_challenges"."id") between 1 and 255),
	CONSTRAINT "runner_enrollment_challenge_name_length" CHECK(length("runner_enrollment_challenges"."name") between 1 and 120 and "runner_enrollment_challenges"."name" = trim("runner_enrollment_challenges"."name")),
	CONSTRAINT "runner_enrollment_challenge_fingerprint" CHECK(length("runner_enrollment_challenges"."installation_fingerprint") = 71 and "runner_enrollment_challenges"."installation_fingerprint" glob 'sha256:[0-9a-f]*' and "runner_enrollment_challenges"."installation_fingerprint" not glob 'sha256:*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE INDEX `runner_enrollment_challenge_expires_idx` ON `runner_enrollment_challenges` (`expires_at`);--> statement-breakpoint
CREATE TABLE `runner_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_version` integer NOT NULL,
	`revision` integer NOT NULL,
	`name` text NOT NULL,
	`installation_fingerprint` text NOT NULL,
	`status` text NOT NULL,
	`salt_hex` text NOT NULL,
	`verifier_hex` text NOT NULL,
	`kdf` text NOT NULL,
	`cost_n` integer NOT NULL,
	`block_size_r` integer NOT NULL,
	`parallelization_p` integer NOT NULL,
	`verifier_bytes` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revoked_at` text,
	CONSTRAINT "runner_identity_contract_version" CHECK("runner_identities"."contract_version" = 1),
	CONSTRAINT "runner_identity_revision_positive" CHECK("runner_identities"."revision" >= 1),
	CONSTRAINT "runner_identity_id_length" CHECK(length("runner_identities"."id") between 1 and 255),
	CONSTRAINT "runner_identity_name_length" CHECK(length("runner_identities"."name") between 1 and 120 and "runner_identities"."name" = trim("runner_identities"."name")),
	CONSTRAINT "runner_identity_fingerprint" CHECK(length("runner_identities"."installation_fingerprint") = 71 and "runner_identities"."installation_fingerprint" glob 'sha256:[0-9a-f]*' and "runner_identities"."installation_fingerprint" not glob 'sha256:*[^0-9a-f]*'),
	CONSTRAINT "runner_identity_status" CHECK("runner_identities"."status" in ('enabled', 'revoked')),
	CONSTRAINT "runner_identity_salt_hex" CHECK(length("runner_identities"."salt_hex") = 64 and "runner_identities"."salt_hex" not glob '*[^0-9a-f]*'),
	CONSTRAINT "runner_identity_verifier_hex" CHECK(length("runner_identities"."verifier_hex") = 64 and "runner_identities"."verifier_hex" not glob '*[^0-9a-f]*'),
	CONSTRAINT "runner_identity_kdf" CHECK("runner_identities"."kdf" = 'scrypt'),
	CONSTRAINT "runner_identity_cost_n" CHECK("runner_identities"."cost_n" = 16384),
	CONSTRAINT "runner_identity_block_size_r" CHECK("runner_identities"."block_size_r" = 8),
	CONSTRAINT "runner_identity_parallelization_p" CHECK("runner_identities"."parallelization_p" = 1),
	CONSTRAINT "runner_identity_verifier_bytes" CHECK("runner_identities"."verifier_bytes" = 32),
	CONSTRAINT "runner_identity_revoked_at" CHECK(("runner_identities"."status" = 'enabled' and "runner_identities"."revoked_at" is null) or ("runner_identities"."status" = 'revoked' and "runner_identities"."revoked_at" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runner_identity_one_enabled` ON `runner_identities` (`status`) WHERE "runner_identities"."status" = 'enabled';--> statement-breakpoint
CREATE INDEX `runner_identity_status_created_idx` ON `runner_identities` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `runner_sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`contract_version` integer NOT NULL,
	`runner_id` text NOT NULL,
	`protocol` text NOT NULL,
	`installation_fingerprint` text NOT NULL,
	`registry_digest` text,
	`event_schemas_json` text NOT NULL,
	`current` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`runner_id`) REFERENCES `runner_identities`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "runner_session_contract_version" CHECK("runner_sessions"."contract_version" = 1),
	CONSTRAINT "runner_session_id_length" CHECK(length("runner_sessions"."session_id") between 1 and 255),
	CONSTRAINT "runner_session_runner_id_length" CHECK(length("runner_sessions"."runner_id") between 1 and 255),
	CONSTRAINT "runner_session_protocol" CHECK("runner_sessions"."protocol" = 'runner-control-v1'),
	CONSTRAINT "runner_session_fingerprint" CHECK(length("runner_sessions"."installation_fingerprint") = 71 and "runner_sessions"."installation_fingerprint" glob 'sha256:[0-9a-f]*' and "runner_sessions"."installation_fingerprint" not glob 'sha256:*[^0-9a-f]*'),
	CONSTRAINT "runner_session_registry_digest" CHECK("runner_sessions"."registry_digest" is null or (length("runner_sessions"."registry_digest") = 71 and "runner_sessions"."registry_digest" glob 'sha256:[0-9a-f]*' and "runner_sessions"."registry_digest" not glob 'sha256:*[^0-9a-f]*')),
	CONSTRAINT "runner_session_event_schemas_json" CHECK(json_valid("runner_sessions"."event_schemas_json") and length(cast("runner_sessions"."event_schemas_json" as blob)) <= 1048576),
	CONSTRAINT "runner_session_current_boolean" CHECK("runner_sessions"."current" in (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runner_session_current_runner_unique` ON `runner_sessions` (`runner_id`) WHERE "runner_sessions"."current" = 1;--> statement-breakpoint
CREATE INDEX `runner_session_runner_created_idx` ON `runner_sessions` (`runner_id`,`created_at`);