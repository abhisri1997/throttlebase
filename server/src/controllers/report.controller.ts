import type { Request, Response } from "express";
import { CreateReportSchema } from "../schemas/report.schemas.js";
import { createReport, listMyReports, ReportError } from "../services/report.service.js";
const rid = (req: Request): string => req.rider!.riderId;

export const create = async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateReportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }

  try {
    const outcome = await createReport(rid(req), parsed.data);
    res.status(outcome.alreadyReported ? 200 : 201).json({
      report: outcome.report,
      already_reported: outcome.alreadyReported,
      blocked: outcome.blocked,
    });
  } catch (error) {
    if (error instanceof ReportError) {
      res.status(error.kind === "not_found" ? 404 : 400).json({ error: error.message, code: error.kind });
      return;
    }
    console.error("Error creating report:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const mine = async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ reports: await listMyReports(rid(req)) });
  } catch (error) {
    console.error("Error listing a rider's reports:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
