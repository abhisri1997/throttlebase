import type { Request, Response } from "express";
import {
  CreateSupportTicketSchema,
  ListSupportTicketsQuerySchema,
  UpdateTicketStatusSchema,
  AdminListTicketsQuerySchema,
} from "../schemas/support.schemas.js";
import * as SupportService from "../services/support.service.js";

interface RiderPayload {
  riderId: string;
  email: string;
}

const rid = (req: Request) => (req.rider as RiderPayload).riderId;

export const createSupportTicket = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = CreateSupportTicketSchema.parse(req.body);
    const ticket = await SupportService.createSupportTicket(rid(req), data);
    res.status(201).json(ticket);
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({ errors: error.issues });
      return;
    }

    console.error("Error creating support ticket:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const listSupportTickets = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const filters = ListSupportTicketsQuerySchema.parse(req.query);
    const tickets = await SupportService.listSupportTickets(rid(req), filters);
    res.json(tickets);
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({ errors: error.issues });
      return;
    }

    console.error("Error listing support tickets:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getSupportTicket = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const ticket = await SupportService.getSupportTicketById(
      rid(req),
      req.params.id as string,
    );

    if (!ticket) {
      res.status(404).json({ error: "Support ticket not found" });
      return;
    }

    res.json(ticket);
  } catch (error: any) {
    console.error("Error fetching support ticket:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── Admin handlers ────────────────────────────────────────────────────────────

export const adminListTickets = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const filters = AdminListTicketsQuerySchema.parse(req.query);
    const tickets = await SupportService.adminListTickets(filters);
    res.json(tickets);
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({ errors: error.issues });
      return;
    }
    console.error("Error listing admin support tickets:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const adminUpdateTicketStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = UpdateTicketStatusSchema.parse(req.body);
    const ticket = await SupportService.adminUpdateTicketStatus(
      req.params.id as string,
      data,
    );

    if (!ticket) {
      res.status(404).json({ error: "Support ticket not found" });
      return;
    }

    res.json(ticket);
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({ errors: error.issues });
      return;
    }
    console.error("Error updating support ticket status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
