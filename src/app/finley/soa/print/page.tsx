import { Suspense } from "react";
import { SoaPrintPreview } from "./soa-print-preview";

export default function FinleySoaPrintPage() {
  return (
    <Suspense fallback={null}>
      <SoaPrintPreview />
    </Suspense>
  );
}
