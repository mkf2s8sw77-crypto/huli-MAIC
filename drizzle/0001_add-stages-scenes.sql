CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`stage_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`content` text,
	`actions` text,
	`whiteboards` text,
	`multi_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scenes_stage_id_idx` ON `scenes` (`stage_id`);--> statement-breakpoint
CREATE INDEX `scenes_stage_order_idx` ON `scenes` (`stage_id`,`order`);--> statement-breakpoint
CREATE TABLE `stages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '',
	`language` text DEFAULT 'zh-CN',
	`style` text DEFAULT 'professional',
	`viewport_preset` text,
	`viewport_size` integer,
	`viewport_ratio` real,
	`current_scene_id` text,
	`agent_ids` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stages_user_id_idx` ON `stages` (`user_id`);--> statement-breakpoint
CREATE INDEX `stages_updated_at_idx` ON `stages` (`updated_at`);