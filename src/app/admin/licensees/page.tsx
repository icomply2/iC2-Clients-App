import { AdminStructuresManager } from "@/components/admin-structures-manager";
import {
  getAdminContext,
  loadAdminLicensees,
  loadAdminPractices,
  loadAdminUsers,
  summarizeLicensees,
  summarizePractices,
} from "@/lib/admin-data";

export default async function AdminLicenseesPage() {
  const { token } = await getAdminContext();
  const users = await loadAdminUsers(token);
  const [licenseeRecords, practiceRecords] = await Promise.all([
    loadAdminLicensees(token),
    loadAdminPractices(token),
  ]);
  const practices = summarizePractices(practiceRecords, users);
  const licensees = summarizeLicensees(licenseeRecords, practices, users);

  return <AdminStructuresManager kind="licensees" initialItems={licensees} />;
}
