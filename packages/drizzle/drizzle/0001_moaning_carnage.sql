CREATE INDEX "coach_assignment_coach_idx" ON "coach_assignment" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "coach_assignment_leerling_idx" ON "coach_assignment" USING btree ("leerling_id");--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "form_submission_leerling_idx" ON "form_submission" USING btree ("leerling_id");--> statement-breakpoint
CREATE INDEX "content_block_section_idx" ON "content_block" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "content_progress_leerling_block_idx" ON "content_progress" USING btree ("leerling_id","content_block_id");--> statement-breakpoint
CREATE INDEX "course_section_course_idx" ON "course_section" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "task_leerling_idx" ON "task" USING btree ("leerling_id");--> statement-breakpoint
CREATE INDEX "conversation_member_user_idx" ON "conversation_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversation_member_conversation_idx" ON "conversation_member" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "message_conversation_created_idx" ON "message" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_user_read_idx" ON "notification" USING btree ("user_id","read");