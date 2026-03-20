CREATE TABLE `course_group_qrcodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`level` int NOT NULL,
	`levelName` varchar(64) NOT NULL,
	`qrcodeUrl` text NOT NULL,
	`groupName` varchar(128),
	`enabled` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `course_group_qrcodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `course_group_qrcodes_level_unique` UNIQUE(`level`)
);
