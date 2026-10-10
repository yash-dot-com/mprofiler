import { Suspense } from "react";
import InsightsDashboard from "../InsightsDashboard";

export default function InsightsPage() {
  return (
    <Suspense>
      <InsightsDashboard />
    </Suspense>
  );
}
