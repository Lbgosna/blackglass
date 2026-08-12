CREATE TABLE `engagement_active_scopes` (
	`engagement_id` text PRIMARY KEY NOT NULL,
	`scope_revision_id` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`engagement_id`,`scope_revision_id`) REFERENCES `scope_revisions`(`engagement_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `engagements` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_version` integer NOT NULL,
	`revision` integer NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`description` text,
	`authorization_context` text,
	`auto_continue_warnings` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "engagement_contract_version" CHECK("engagements"."contract_version" = 1),
	CONSTRAINT "engagement_revision_positive" CHECK("engagements"."revision" >= 1),
	CONSTRAINT "engagement_name_length" CHECK(length("engagements"."name") between 1 and 120 and "engagements"."name" = trim("engagements"."name")),
	CONSTRAINT "engagement_kind" CHECK("engagements"."kind" in ('ctf', 'lab', 'assessment')),
	CONSTRAINT "engagement_status" CHECK("engagements"."status" in ('active', 'archived')),
	CONSTRAINT "engagement_description_length" CHECK("engagements"."description" is null or length("engagements"."description") <= 4096),
	CONSTRAINT "engagement_authorization_context_length" CHECK("engagements"."authorization_context" is null or length("engagements"."authorization_context") <= 4096),
	CONSTRAINT "engagement_auto_continue_boolean" CHECK("engagements"."auto_continue_warnings" in (0, 1))
);
--> statement-breakpoint
CREATE INDEX `engagement_status_created_idx` ON `engagements` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `scope_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_version` integer NOT NULL,
	`engagement_id` text NOT NULL,
	`version` integer NOT NULL,
	`rules_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "scope_revision_contract_version" CHECK("scope_revisions"."contract_version" = 1),
	CONSTRAINT "scope_revision_version_positive" CHECK("scope_revisions"."version" >= 1),
	CONSTRAINT "scope_revision_rules_json" CHECK(json_valid("scope_revisions"."rules_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scope_revision_engagement_version_unique` ON `scope_revisions` (`engagement_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `scope_revision_engagement_id_unique` ON `scope_revisions` (`engagement_id`,`id`);--> statement-breakpoint
CREATE TRIGGER `scope_revisions_no_update`
BEFORE UPDATE ON `scope_revisions`
BEGIN
	SELECT RAISE(ABORT, 'scope revisions are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `scope_revisions_no_delete`
BEFORE DELETE ON `scope_revisions`
BEGIN
	SELECT RAISE(ABORT, 'scope revisions are immutable');
END;
