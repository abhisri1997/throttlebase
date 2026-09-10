import type { Request, Response } from "express";
import { StopSuggestionQuerySchema } from "../schemas/placeSuggestion.schemas.js";
import { getStopSuggestions } from "../services/placeSuggestion.service.js";

/**
 * Returns places along a route for a stop category.
 *
 * Degradation is reported in the body rather than as an error status: the
 * client's fallback is to offer manual search, which is a normal outcome, not
 * a failure the user should see as one.
 */
export const getSuggestions = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const validated = StopSuggestionQuerySchema.parse(req.body);

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error(
        "Stop suggestions unavailable: GOOGLE_MAPS_API_KEY is not configured.",
      );
      res.status(200).json({ suggestions: [], cached: false, degraded: true });
      return;
    }

    const result = await getStopSuggestions(validated, { apiKey });
    res.status(200).json(result);
  } catch (error: any) {
    if (error.name === "ZodError") {
      res
        .status(400)
        .json({ error: "Validation failed", details: error.errors });
    } else {
      console.error("Error fetching stop suggestions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};
