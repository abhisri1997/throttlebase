import { apiClient } from "../../../api/client";
import type { ReportRequest } from "../core/report";

export interface ReportResponse {
  report: { id: string; reference: string };
  already_reported: boolean;
  blocked: boolean;
}

export const sendReport = async (request: ReportRequest): Promise<ReportResponse> => {
  const { data } = await apiClient.post("/api/reports", request);
  return data as ReportResponse;
};
