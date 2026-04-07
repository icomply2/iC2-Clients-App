import { SectionPage } from "@/components/section-page";

export default function NewClientPage() {
  return (
    <SectionPage
      title="Create New Client"
      description="This is the v1 entry point for the most important workflow in the app: creating a client record quickly and safely before expanding into the full profile."
      items={[
        {
          title: "Step 1",
          text: "Capture the essential identifying details and hierarchy links such as licensee, practice, and adviser ownership.",
        },
        {
          title: "Step 2",
          text: "Create the initial client record through the existing API and route the user straight into the new client workspace.",
        },
        {
          title: "Step 3",
          text: "Use section prompts so support staff and paraplanners know which profile areas still need completion.",
        },
      ]}
    />
  );
}
