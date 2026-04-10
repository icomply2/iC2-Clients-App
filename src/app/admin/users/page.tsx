import { AdminUsersManager } from "@/components/admin-users-manager";
import {
  getAdminContext,
  loadAdminLicensees,
  loadAdminPractices,
  loadAdminUsers,
  summarizeLicensees,
  summarizePractices,
} from "@/lib/admin-data";

export default async function AdminUsersPage() {
  const { token } = await getAdminContext();
  const users = await loadAdminUsers(token);
  const [licenseeRecords, practiceRecords] = await Promise.all([
    loadAdminLicensees(token),
    loadAdminPractices(token),
  ]);
  const practices = summarizePractices(practiceRecords, users);
  const licensees = summarizeLicensees(licenseeRecords, practices, users);

  return <AdminUsersManager initialUsers={users} practices={practices} licensees={licensees} />;
}
