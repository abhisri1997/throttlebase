import { query } from "../config/db.js";
import type {
  CreateSupportTicketInput,
  ListSupportTicketsQuery,
  UpdateTicketStatusInput,
  AdminListTicketsQuery,
  RiderUpdateTicketInput,
} from "../schemas/support.schemas.js";

type SupportTicketMessage = {
  id: string;
  sender_role: "rider" | "support";
  message: string;
  created_at: string;
};

const getTicketMessages = async (
  ticketId: string,
): Promise<SupportTicketMessage[]> => {
  const result = await query(
    `SELECT id, sender_role, message, created_at
     FROM support_ticket_messages
     WHERE ticket_id = $1
     ORDER BY created_at ASC, id ASC`,
    [ticketId],
  );

  return result.rows;
};

const getLegacyTicketMessages = (ticket: any): SupportTicketMessage[] => {
  const fallbackTime =
    ticket.updated_at ?? ticket.created_at ?? new Date().toISOString();
  const legacy: SupportTicketMessage[] = [];

  if (ticket.description) {
    legacy.push({
      id: `${ticket.id}-legacy-description`,
      sender_role: "rider",
      message: String(ticket.description),
      created_at: ticket.created_at ?? fallbackTime,
    });
  }

  if (ticket.agent_reply) {
    legacy.push({
      id: `${ticket.id}-legacy-agent`,
      sender_role: "support",
      message: String(ticket.agent_reply),
      created_at: fallbackTime,
    });
  }

  if (ticket.rider_reply) {
    legacy.push({
      id: `${ticket.id}-legacy-rider`,
      sender_role: "rider",
      message: String(ticket.rider_reply),
      created_at: fallbackTime,
    });
  }

  return legacy;
};

const addTicketMessage = async (
  ticketId: string,
  senderRole: "rider" | "support",
  message: string,
) => {
  await query(
    `INSERT INTO support_ticket_messages (ticket_id, sender_role, message)
     VALUES ($1, $2, $3)`,
    [ticketId, senderRole, message],
  );
};

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

  const created = result.rows[0];
  await addTicketMessage(created.id, "rider", created.description);

  return {
    ...created,
    messages: await getTicketMessages(created.id),
  };
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

  const ticket = result.rows[0] ?? null;
  if (!ticket) {
    return null;
  }

  const messages = await getTicketMessages(ticket.id);

  return {
    ...ticket,
    messages: messages.length > 0 ? messages : getLegacyTicketMessages(ticket),
  };
};

export const updateOwnSupportTicket = async (
  riderId: string,
  ticketId: string,
  data: RiderUpdateTicketInput,
) => {
  const updates: string[] = [];
  const values: Array<string> = [ticketId, riderId];

  if (data.rider_reply !== undefined) {
    values.push(data.rider_reply);
    updates.push(`rider_reply = $${values.length}`);
  }

  if (data.close_ticket === true) {
    updates.push(`status = 'closed'`);
  }

  if (updates.length === 0) {
    return getSupportTicketById(riderId, ticketId);
  }

  const result = await query(
    `UPDATE support_tickets
     SET ${updates.join(", ")}
     WHERE id = $1 AND rider_id = $2
     RETURNING *`,
    values,
  );

  const updated = result.rows[0] ?? null;
  if (!updated) {
    return null;
  }

  if (data.rider_reply !== undefined) {
    await addTicketMessage(updated.id, "rider", data.rider_reply);
  }

  return getSupportTicketById(riderId, updated.id);
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

  const updated = result.rows[0] ?? null;
  if (!updated) {
    return null;
  }

  if (data.agent_reply !== undefined) {
    await addTicketMessage(updated.id, "support", data.agent_reply);
  }

  return {
    ...updated,
    messages: await getTicketMessages(updated.id),
  };
};
