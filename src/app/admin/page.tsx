import { SectionPage } from "@/components/section-page";

export default function AdminPage() {
  return (
    <SectionPage
      title="Administration"
      description="This area will support the operational hierarchy behind the app: users, licensees, practices, and access management."
      items={[
        {
          title: "Users and roles",
          text: "Administration staff need a safe place to manage users, assign roles, and update access without touching production data directly.",
        },
        {
          title: "Hierarchy management",
          text: "Licensees and practices already exist in the API, so the admin area can map directly to those entities while still feeling cleaner than a raw CRUD screen.",
        },
        {
          title: "Operational settings",
          text: "This is also the natural place for profile-level settings, prompts, document templates, and future system configuration.",
        },
      ]}
    />
  );
}
