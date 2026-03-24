import { z } from "zod";

export const SessionStatusSchema = z.enum([
  "starting",
  "active",
  "paused",
  "ended",
]);

export const IncidentSeveritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export const IncidentKindSchema = z.enum([
  "sos",
  "crash",
  "medical",
  "mechanical",
  "other",
]);

export const LiveLocationUpdateSchema = z.object({
  lon: z.number().gte(-180).lte(180),
  lat: z.number().gte(-90).lte(90),
  speed_kmh: z.number().nonnegative().optional(),
  heading_deg: z.number().gte(0).lt(360).optional(),
  accuracy_m: z.number().nonnegative().optional(),
  captured_at: z.string().datetime().optional(),
});

export const StartLiveSessionSchema = z.object({}).optional();

export const EndLiveSessionSchema = z.object({
  reason: z.string().max(255).optional(),
  mark_ride_completed: z.boolean().default(false),
});

export const CreateIncidentSchema = z
  .object({
    severity: IncidentSeveritySchema,
    kind: IncidentKindSchema,
    lon: z.number().gte(-180).lte(180).optional(),
    lat: z.number().gte(-90).lte(90).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (value) =>
      (value.lon === undefined && value.lat === undefined) ||
      (value.lon !== undefined && value.lat !== undefined),
    {
      message: "lon and lat must be provided together",
      path: ["lon"],
    },
  );

export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type IncidentSeverity = z.infer<typeof IncidentSeveritySchema>;
export type IncidentKind = z.infer<typeof IncidentKindSchema>;
export type LiveLocationUpdateInput = z.infer<typeof LiveLocationUpdateSchema>;
export type StartLiveSessionInput = z.infer<typeof StartLiveSessionSchema>;
export type EndLiveSessionInput = z.infer<typeof EndLiveSessionSchema>;
export type CreateIncidentInput = z.infer<typeof CreateIncidentSchema>;
