export type AppNavItem = {
  href: string;
  label: string;
  description: string;
};

export type DashboardMetric = {
  label: string;
  value: string;
  detail: string;
};

export type WorkQueueItem = {
  title: string;
  summary: string;
  href: string;
  status: "Ready" | "In progress" | "Needs review";
};

export type ClientListItem = {
  id: string;
  name: string;
  adviser: string;
  practice: string;
  status: string;
  updatedAt: string;
};
