import { z } from "zod/v4";

export const SupportTicketCategorySchema = z.enum([
  "bug",
  "dispute",
  "account",
  "general",
]);

export const SupportTicketStatusSchema = z.enum([
  "open",
  "in_progress",
  "awaiting_rider",
  "resolved",
  "closed",
]);

export const CreateSupportTicketSchema = z.object({
  category: SupportTicketCategorySchema,
  subject: z.string().trim().min(3).max(255),
  description: z.string().trim().min(10).max(5000),
  attachment_urls: z.array(z.string().url()).max(5).optional(),
});

export const ListSupportTicketsQuerySchema = z.object({
  status: SupportTicketStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const UpdateTicketStatusSchema = z.object({
  status: SupportTicketStatusSchema,
  agent_reply: z.string().trim().max(5000).optional(),
});

export const RiderUpdateTicketSchema = z
  .object({
    rider_reply: z.string().trim().min(1).max(5000).optional(),
    close_ticket: z.boolean().optional(),
  })
  .refine((value) => value.rider_reply !== undefined || value.close_ticket === true, {
    message: "Provide rider_reply or set close_ticket=true",
    path: ["rider_reply"],
  });

export const AdminListTicketsQuerySchema = z.object({
  status: SupportTicketStatusSchema.optional(),
  rider_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateSupportTicketInput = z.infer<
  typeof CreateSupportTicketSchema
>;
export type ListSupportTicketsQuery = z.infer<
  typeof ListSupportTicketsQuerySchema
>;
export type UpdateTicketStatusInput = z.infer<typeof UpdateTicketStatusSchema>;
export type RiderUpdateTicketInput = z.infer<typeof RiderUpdateTicketSchema>;
export type AdminListTicketsQuery = z.infer<typeof AdminListTicketsQuerySchema>;
export type SupportTicketCategory = z.infer<typeof SupportTicketCategorySchema>;
export type SupportTicketStatus = z.infer<typeof SupportTicketStatusSchema>;
