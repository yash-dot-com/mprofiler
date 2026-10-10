import { Suspense } from "react";
import ComparisonDashboard from "../ComparisonDashboard";

export default function ComparePage() {
  return (
    <Suspense>
      <ComparisonDashboard />
    </Suspense>
  );
}
