CREATE TABLE `operator_command_idempotency` (
	`actor_id` text NOT NULL,
	`route` text NOT NULL,
	`operation` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`canonicalization_profile` text NOT NULL,
	`request_digest` text NOT NULL,
	`response_status` integer NOT NULL,
	`response_body_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`actor_id`, `route`, `operation`, `idempotency_key`),
	CONSTRAINT "operator_command_actor" CHECK(length("operator_command_idempotency"."actor_id") between 1 and 128 and "operator_command_idempotency"."actor_id" not glob '*[^ -~]*'),
	CONSTRAINT "operator_command_route" CHECK(length("operator_command_idempotency"."route") between 1 and 2048 and "operator_command_idempotency"."route" glob '/api/v1/*' and "operator_command_idempotency"."route" not glob '*[^!-~]*' and "operator_command_idempotency"."route" not glob '*[?#]*'),
	CONSTRAINT "operator_command_operation" CHECK(length("operator_command_idempotency"."operation") between 1 and 64 and substr("operator_command_idempotency"."operation", 1, 1) glob '[a-z]' and "operator_command_idempotency"."operation" not glob '*[^a-z0-9_]*'),
	CONSTRAINT "operator_command_key" CHECK(length("operator_command_idempotency"."idempotency_key") between 22 and 128 and "operator_command_idempotency"."idempotency_key" not glob '*[^ -~]*'),
	CONSTRAINT "operator_command_profile" CHECK("operator_command_idempotency"."canonicalization_profile" = 'command-json-v1'),
	CONSTRAINT "operator_command_digest" CHECK(length("operator_command_idempotency"."request_digest") = 71 and "operator_command_idempotency"."request_digest" glob 'sha256:[0-9a-f]*' and "operator_command_idempotency"."request_digest" not glob 'sha256:*[^0-9a-f]*'),
	CONSTRAINT "operator_command_response_status" CHECK("operator_command_idempotency"."response_status" between 200 and 599),
	CONSTRAINT "operator_command_response_json" CHECK(json_valid("operator_command_idempotency"."response_body_json") and length(cast("operator_command_idempotency"."response_body_json" as blob)) <= 1048576)
);
--> statement-breakpoint
CREATE INDEX `operator_command_created_at_idx` ON `operator_command_idempotency` (`created_at`);
