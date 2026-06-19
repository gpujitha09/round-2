import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const feedbackTable = pgTable("feedback", {
  id: serial("id").primaryKey(),
  predicted_score: numeric("predicted_score", { precision: 5, scale: 2 }).notNull(),
  predicted_band: text("predicted_band").notNull(),
  actual_severity: text("actual_severity").notNull(),
  actual_police_deployed: integer("actual_police_deployed").notNull(),
  diversion_used: text("diversion_used").notNull(),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertFeedbackSchema = createInsertSchema(feedbackTable).omit({ id: true, created_at: true });
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type FeedbackRow = typeof feedbackTable.$inferSelect;
