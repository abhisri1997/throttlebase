import { query } from "../config/db.js";
import type {
  CreateSupportTicketInput,
  ListSupportTicketsQuery,
  UpdateTicketStatusInput,
  AdminListTicketsQuery,
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

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const adminListTickets = async (filters: AdminListTicketsQuery) => {
  const values: Array<string | number> = [];
  const conditions: string[] = [];

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`st.status = $${values.length}`);
  }

  if (filters.rider_id) {
    values.push(filters.rider_id);
    conditions.push(`st.rider_id = $${values.length}`);
  }

  values.push(filters.limit);

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await query(
    `SELECT st.*,
            r.display_name AS rider_display_name,
            r.email AS rider_email
     FROM support_tickets st
     JOIN riders r ON st.rider_id = r.id
     ${where}
     ORDER BY st.updated_at DESC, st.created_at DESC
     LIMIT $${values.length}`,
    values,
  );

  return result.rows;
};

export const adminUpdateTicketStatus = async (
  ticketId: string,
  data: UpdateTicketStatusInput,
) => {
  const updates: string[] = ["status = $2"];
  const values: Array<string> = [ticketId, data.status];

  if (data.agent_reply !== undefined) {
    values.push(data.agent_reply);
    updates.push(`agent_reply = $${values.length}`);
  }

  const result = await query(
    `UPDATE support_tickets
     SET ${updates.join(", ")}
     WHERE id = $1
     RETURNING *`,
    values,
  );

  return result.rows[0] ?? null;
};
