import React, { useCallback, useState } from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { getApiErrorMessage } from "../../../utils/apiError";
import { sendReport } from "../api/report";
import { ReportSheet } from "../components/ReportSheet";
import { buildReportRequest, reportConfirmation, type ReportReason, type ReportTarget } from "../core/report";

/**
 * Reporting from any screen: `openReport(target)` shows the sheet, and
 * `reportSheet` is rendered once at the end of the screen.
 */
export const useReport = (): { openReport: (target: ReportTarget) => void; reportSheet: React.ReactNode } => {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<ReportTarget | null>(null);
  const [isSending, setSending] = useState(false);

  const submit = useCallback(
    async (reason: ReportReason, note: string, alsoBlock: boolean) => {
      if (!target) return;
      setSending(true);
      try {
        const response = await sendReport(buildReportRequest(target, reason, note, alsoBlock));
        setTarget(null);
        // A block hides the rider's posts, routes and rides everywhere.
        if (response.blocked) void queryClient.invalidateQueries();
        Alert.alert(
          "Report sent",
          reportConfirmation(response.already_reported, response.blocked, response.report?.reference),
        );
      } catch (error) {
        Alert.alert("Report not sent", getApiErrorMessage(error, "Check your connection and try again."));
      } finally {
        setSending(false);
      }
    },
    [queryClient, target],
  );

  return {
    openReport: setTarget,
    reportSheet: (
      <ReportSheet
        target={target}
        isSending={isSending}
        onSubmit={(reason, note, alsoBlock) => void submit(reason, note, alsoBlock)}
        onClose={() => setTarget(null)}
      />
    ),
  };
};
