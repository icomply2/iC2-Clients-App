"use client";

import { AdviceDocumentPlaceholderSection } from "./advice-document-placeholder-section";

type RecordOfAdviceSectionProps = {
  clientId: string;
};

export function RecordOfAdviceSection({ clientId }: RecordOfAdviceSectionProps) {
  return (
    <AdviceDocumentPlaceholderSection
      clientId={clientId}
      documentKey="record-of-advice"
      title="Record of Advice"
      stepTitle="Prepare Record of Advice"
      sections={[
        "Client and review context",
        "Relevant changes since the previous advice",
        "Recommended updates and rationale",
        "Implementation notes and disclosures",
      ]}
      outputText="Finley will be able to help the adviser capture changed circumstances, draft the recommendation summary, and generate the Record of Advice once the workflow is connected."
    />
  );
}
