CREATE TABLE `chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`stage_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`messages` text,
	`config` text,
	`tool_calls` text,
	`scene_id` text,
	`last_action_index` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_sessions_stage_id_idx` ON `chat_sessions` (`stage_id`);--> statement-breakpoint
CREATE TABLE `generated_agents` (
	`id` text PRIMARY KEY NOT NULL,
	`stage_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`persona` text DEFAULT '' NOT NULL,
	`avatar` text DEFAULT '/avatars/teacher.png' NOT NULL,
	`color` text DEFAULT '#3b82f6' NOT NULL,
	`priority` integer DEFAULT 5 NOT NULL,
	`voice_config` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `generated_agents_stage_id_idx` ON `generated_agents` (`stage_id`);--> statement-breakpoint
CREATE TABLE `media_files` (
	`id` text PRIMARY KEY NOT NULL,
	`stage_id` text NOT NULL,
	`element_id` text NOT NULL,
	`type` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`storage_key` text,
	`poster_storage_key` text,
	`prompt` text DEFAULT '' NOT NULL,
	`params` text,
	`error` text,
	`error_code` text,
	`oss_key` text,
	`poster_oss_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_files_stage_id_idx` ON `media_files` (`stage_id`);--> statement-breakpoint
CREATE INDEX `media_files_stage_element_idx` ON `media_files` (`stage_id`,`element_id`);--> statement-breakpoint
CREATE TABLE `playback_state` (
	`stage_id` text PRIMARY KEY NOT NULL,
	`scene_index` integer DEFAULT 0 NOT NULL,
	`action_index` integer DEFAULT 0 NOT NULL,
	`consumed_discussions` text,
	`scene_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `stage_outlines` (
	`stage_id` text PRIMARY KEY NOT NULL,
	`outlines` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE cascade
);
