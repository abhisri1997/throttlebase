import { query } from "../config/db.js";
import type {
  CreateSupportTicketInput,
  ListSupportTicketsQuery,
} from "../schemas/support.schemas.js";

export const createSupportTicket = async (
  riderId: string,
  data: CreateSupportTicketInput,
) => {
  const result = await query(
    `INSERT INTO support_tickets (rider_id, category, subject, description, attachment_urls)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      riderId,
      data.category,
      data.subject,
      data.description,
      data.attachment_urls ?? null,
    ],
  );

  return result.rows[0];
};

export const listSupportTickets = async (
  riderId: string,
  filters: ListSupportTicketsQuery,
) => {
  const values: Array<string | number> = [riderId];
  const conditions = ["rider_id = $1"];

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }

  values.push(filters.limit);

  const result = await query(
    `SELECT *
     FROM support_tickets
     WHERE ${conditions.join(" AND ")}
     ORDER BY updated_at DESC, created_at DESC
     LIMIT $${values.length}`,
    values,
  );

  return result.rows;
};

export const getSupportTicketById = async (
  riderId: string,
  ticketId: string,
) => {
  const result = await query(
    `SELECT *
     FROM support_tickets
     WHERE id = $1 AND rider_id = $2`,
    [ticketId, riderId],
  );

  return result.rows[0] ?? null;
};
