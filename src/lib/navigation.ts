import type { AppNavItem, ClientListItem, DashboardMetric, WorkQueueItem } from "./types";

export const appNavItems: AppNavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    description: "Recent work, activity, and shortcuts.",
  },
  {
    href: "/clients",
    label: "Clients",
    description: "Search, create, and manage client records.",
  },
  {
    href: "/letters",
    label: "Letters",
    description: "Generate client letters and advice outputs.",
  },
  {
    href: "/admin",
    label: "Admin",
    description: "Manage users, licensees, and practices.",
  },
  {
    href: "/profile",
    label: "My Profile",
    description: "Manage your account and personal settings.",
  },
];

export const dashboardMetrics: DashboardMetric[] = [
  {
    label: "Open Clients",
    value: "128",
    detail: "Clients with active servicing work this month",
  },
  {
    label: "Letters Pending",
    value: "14",
    detail: "Basic letter requests awaiting generation or review",
  },
  {
    label: "Recent File Notes",
    value: "37",
    detail: "File notes logged in the past seven days",
  },
];

export const workQueue: WorkQueueItem[] = [
  {
    title: "Review client onboarding pack",
    summary: "Finish profile details and create the initial welcome letter.",
    href: "/clients/new",
    status: "Ready",
  },
  {
    title: "Update existing client details",
    summary: "Open a client workspace and check profile completeness before the next review.",
    href: "/clients",
    status: "In progress",
  },
  {
    title: "Prepare adviser letter batch",
    summary: "Generate basic letters using the latest merged client data.",
    href: "/letters",
    status: "Needs review",
  },
];

export const sampleClients: ClientListItem[] = [
  {
    id: "cl-1001",
    name: "Anthony Lyon",
    adviser: "Olivia Porter",
    practice: "Harbour Advice Group",
    status: "Active",
    updatedAt: "Updated 2 hours ago",
  },
  {
    id: "cl-1002",
    name: "Naomi Evans",
    adviser: "Olivia Porter",
    practice: "Harbour Advice Group",
    status: "Pending review",
    updatedAt: "Updated yesterday",
  },
  {
    id: "cl-1003",
    name: "Luca Bennett",
    adviser: "Marcus Lee",
    practice: "Prosper Wealth",
    status: "Needs documents",
    updatedAt: "Updated 3 days ago",
  },
];
