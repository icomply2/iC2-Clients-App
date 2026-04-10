import { AdminStructuresManager } from "@/components/admin-structures-manager";
import {
  getAdminContext,
  loadAdminLicensees,
  loadAdminPractices,
  loadAdminUsers,
  summarizeLicensees,
  summarizePractices,
} from "@/lib/admin-data";

export default async function AdminPracticesPage() {
  const { token } = await getAdminContext();
  const users = await loadAdminUsers(token);
  const [practiceRecords, licenseeRecords] = await Promise.all([
    loadAdminPractices(token),
    loadAdminLicensees(token),
  ]);
  const practices = summarizePractices(practiceRecords, users);
  const licensees = summarizeLicensees(licenseeRecords, practices, users);

  return <AdminStructuresManager kind="practices" initialItems={practices} licensees={licensees} />;
}
