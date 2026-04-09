"use client";

import { AdviceDocumentPlaceholderSection } from "./advice-document-placeholder-section";

type StatementOfAdviceSectionProps = {
  clientId: string;
};

export function StatementOfAdviceSection({ clientId }: StatementOfAdviceSectionProps) {
  return (
    <AdviceDocumentPlaceholderSection
      clientId={clientId}
      documentKey="statement-of-advice"
      title="Statement of Advice"
      stepTitle="Prepare Statement of Advice"
      sections={[
        "Client circumstances and objectives",
        "Strategy recommendations and product scope",
        "Research, risks, and disclosures",
        "Implementation, fees, and next steps",
      ]}
      outputText="Finley will be able to guide the adviser through a full Statement of Advice workflow, help draft narrative sections, and generate the final advice document."
    />
  );
}
