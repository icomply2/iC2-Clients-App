import { SectionPage } from "@/components/section-page";

export default function LettersPage() {
  return (
    <SectionPage
      title="Letters"
      description="Letter generation is a core v1 workflow, so this area is reserved for template selection, merge previews, generation status, and download history."
      items={[
        {
          title: "Template-driven output",
          text: "We can start with basic client letters first, using the existing API and document merge process before we expand toward more advanced advice documents.",
        },
        {
          title: "Client context",
          text: "Users should be able to start from a client and arrive here with the record preselected so letter creation stays efficient.",
        },
        {
          title: "Operational visibility",
          text: "Generated outputs, failures, and retry options should be visible so staff do not lose track of document work.",
        },
      ]}
    />
  );
}
