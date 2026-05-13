"use client";

import { useEffect, useMemo, useState } from "react";
import { updateAdminUser } from "@/lib/api/admin";
import type { AdminUserRecord, LicenseeSummary, PracticeSummary } from "@/lib/admin-data";
import styles from "@/app/admin/admin.module.css";

type UserDraft = {
  roleName: string;
  accessName: string;
  statusName: string;
  practiceId: string;
  licenseeId: string;
  appAdmin: boolean;
};

type AdminUsersManagerProps = {
  initialUsers: AdminUserRecord[];
  practices: PracticeSummary[];
  licensees: LicenseeSummary[];
};

type UserAccessUpdate = Partial<UserDraft>;

const DEFAULT_ROLE_OPTIONS = ["Adviser", "Compliance Manager", "Paraplanner", "Support Staff"];
const DEFAULT_ACCESS_OPTIONS = ["Full Access"];
const DEFAULT_STATUS_OPTIONS = ["Active", "Archived"];
const PAGE_SIZE_OPTIONS = [10, 25, 50];

export function AdminUsersManager({ initialUsers, practices, licensees }: AdminUsersManagerProps) {
  const [users, setUsers] = useState(initialUsers);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [selectedLicensee, setSelectedLicensee] = useState("All licensees");
  const [selectedPractice, setSelectedPractice] = useState("All practices");
  const [selectedStatus, setSelectedStatus] = useState("All statuses");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const licenseeOptions = useMemo(() => {
    const values = Array.from(
      new Set(users.map((user) => user.licenseeName?.trim()).filter((value): value is string => Boolean(value))),
    ).sort((left, right) => left.localeCompare(right));

    return ["All licensees", ...values];
  }, [users]);

  const practiceOptions = useMemo(() => {
    const values = Array.from(
      new Set(users.map((user) => user.practiceName?.trim()).filter((value): value is string => Boolean(value))),
    ).sort((left, right) => left.localeCompare(right));

    return ["All practices", ...values];
  }, [users]);

  const statusOptions = useMemo(() => {
    const values = Array.from(
      new Set(users.map((user) => user.statusName?.trim()).filter((value): value is string => Boolean(value))),
    ).sort((left, right) => left.localeCompare(right));

    return ["All statuses", ...values];
  }, [users]);

  const roleOptions = useMemo(() => {
    const values = Array.from(
      new Set(users.map((user) => user.roleName?.trim()).filter((value): value is string => Boolean(value))),
    ).sort((left, right) => left.localeCompare(right));

    return Array.from(new Set([...DEFAULT_ROLE_OPTIONS, ...values]));
  }, [users]);

  const accessOptions = useMemo(() => {
    const values = Array.from(
      new Set(users.map((user) => user.accessName?.trim()).filter((value): value is string => Boolean(value))),
    ).sort((left, right) => left.localeCompare(right));

    return Array.from(new Set([...DEFAULT_ACCESS_OPTIONS, ...values]));
  }, [users]);

  const userStatusOptions = useMemo(() => {
    const values = Array.from(
      new Set(users.map((user) => user.statusName?.trim()).filter((value): value is string => Boolean(value))),
    ).sort((left, right) => left.localeCompare(right));

    return Array.from(new Set([...DEFAULT_STATUS_OPTIONS, ...values]));
  }, [users]);

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        const normalizedQuery = nameQuery.trim().toLowerCase();
        const matchesName = !normalizedQuery || (user.name ?? "").toLowerCase().includes(normalizedQuery);
        const matchesLicensee =
          selectedLicensee === "All licensees" || user.licenseeName?.trim() === selectedLicensee;
        const matchesPractice =
          selectedPractice === "All practices" || user.practiceName?.trim() === selectedPractice;
        const matchesStatus = selectedStatus === "All statuses" || user.statusName?.trim() === selectedStatus;

        return matchesName && matchesLicensee && matchesPractice && matchesStatus;
      }),
    [nameQuery, selectedLicensee, selectedPractice, selectedStatus, users],
  );

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const visiblePage = Math.min(currentPage, totalPages);
  const pageStartIndex = filteredUsers.length ? (visiblePage - 1) * pageSize : 0;
  const pageEndIndex = Math.min(pageStartIndex + pageSize, filteredUsers.length);
  const paginatedUsers = filteredUsers.slice(pageStartIndex, pageEndIndex);
  const filteredPracticeCount = new Set(
    filteredUsers.map((user) => user.practice?.id?.trim() || user.practiceName?.trim()).filter(Boolean),
  ).size;
  const filteredLicenseeCount = new Set(
    filteredUsers.map((user) => user.licensee?.id?.trim() || user.licenseeName?.trim()).filter(Boolean),
  ).size;
  const filteredAppAdminCount = filteredUsers.filter((user) => user.adminEnabled).length;

  const editingUser = users.find((user) => user.id && user.id === editingUserId) ?? null;

  useEffect(() => {
    setCurrentPage(1);
  }, [nameQuery, selectedLicensee, selectedPractice, selectedStatus, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  function openEditor(user: AdminUserRecord) {
    if (!user.id) {
      return;
    }

    setEditingUserId(user.id);
    setSaveError(null);
    setSaveSuccess(null);
    setDraft({
      roleName: user.roleName,
      accessName: user.accessName,
      statusName: user.statusName,
      practiceId: user.practice?.id?.trim() || "",
      licenseeId: user.licensee?.id?.trim() || "",
      appAdmin: user.adminEnabled,
    });
  }

  function closeEditor() {
    setEditingUserId(null);
    setDraft(null);
    setIsSaving(false);
    setSaveError(null);
  }

  async function saveUserAccess(user: AdminUserRecord, update: UserAccessUpdate) {
    if (!user.id) {
      return;
    }

    const nextPracticeId = update.practiceId ?? user.practice?.id?.trim() ?? "";
    const nextLicenseeId = update.licenseeId ?? user.licensee?.id?.trim() ?? "";
    const nextPracticeRecord = practices.find((item) => item.id === nextPracticeId) ?? null;
    const nextLicenseeRecord = licensees.find((item) => item.id === nextLicenseeId) ?? null;
    const nextRoleName = update.roleName ?? user.roleName;
    const nextAccessName = update.accessName ?? user.accessName;
    const nextStatusName = update.statusName ?? user.statusName;
    const nextAppAdmin = update.appAdmin ?? user.adminEnabled;

    await updateAdminUser(user.id, {
      subscriptionId: user.subscriptionId ?? user.subscriptionTier?.id ?? null,
      subscriptionTier: user.subscriptionTier ?? null,
      practice: nextPracticeRecord ? { id: nextPracticeRecord.id, name: nextPracticeRecord.name } : null,
      licensee: nextLicenseeRecord ? { id: nextLicenseeRecord.id, name: nextLicenseeRecord.name } : null,
      complianceManager: user.complianceManager ?? null,
      appAccess: nextAccessName || null,
      userRole: nextRoleName || null,
      userStatus: nextStatusName || null,
      appAdmin: nextAppAdmin,
    });

    setUsers((current) =>
      current.map((item) =>
        item.id === user.id
          ? {
              ...item,
              roleName: nextRoleName,
              accessName: nextAccessName,
              statusName: nextStatusName,
              practiceName: nextPracticeRecord?.name || "Unassigned practice",
              licenseeName: nextLicenseeRecord?.name || "Unassigned licensee",
              practice: nextPracticeRecord ? { id: nextPracticeRecord.id, name: nextPracticeRecord.name } : null,
              licensee: nextLicenseeRecord ? { id: nextLicenseeRecord.id, name: nextLicenseeRecord.name } : null,
              userRole: nextRoleName,
              appAccess: nextAccessName,
              userStatus: nextStatusName,
              appAdmin: nextAppAdmin,
              adminEnabled: nextAppAdmin,
            }
          : item,
      ),
    );

    if (editingUserId === user.id && draft) {
      setDraft({
        roleName: nextRoleName,
        accessName: nextAccessName,
        statusName: nextStatusName,
        practiceId: nextPracticeId,
        licenseeId: nextLicenseeId,
        appAdmin: nextAppAdmin,
      });
    }
  }

  async function saveInlineUserAccess(user: AdminUserRecord, update: UserAccessUpdate) {
    if (!user.id) {
      return;
    }

    setSavingUserId(user.id);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      await saveUserAccess(user, update);
      setSaveSuccess("User saved.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save user changes.");
    } finally {
      setSavingUserId(null);
    }
  }

  async function saveEditor() {
    if (!editingUserId || !draft || !editingUser) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      await saveUserAccess(editingUser, draft);
      setSaveSuccess("User saved.");
      closeEditor();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save user changes.");
      setIsSaving(false);
    }
  }

  return (
    <>
      <section className={styles.overviewGrid}>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>Users</span>
          <strong className={styles.metricValue}>{filteredUsers.length}</strong>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>Practices</span>
          <strong className={styles.metricValue}>{filteredPracticeCount}</strong>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>Licensees</span>
          <strong className={styles.metricValue}>{filteredLicenseeCount}</strong>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>App Admins</span>
          <strong className={styles.metricValue}>{filteredAppAdminCount}</strong>
        </article>
      </section>

      <section className={styles.contentCard}>
        <div className={styles.contentCardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Users</h2>
          </div>

          <span className={styles.badge}>
            {filteredUsers.length} {filteredUsers.length === 1 ? "user" : "users"}
          </span>
        </div>

        <div className={styles.filterRow}>
          <label className={styles.field}>
            <span>User name</span>
            <input
              value={nameQuery}
              onChange={(event) => setNameQuery(event.target.value)}
              placeholder="Search by user name"
            />
          </label>

          <label className={styles.field}>
            <span>Licensee</span>
            <select value={selectedLicensee} onChange={(event) => setSelectedLicensee(event.target.value)}>
              {licenseeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Practice</span>
            <select value={selectedPractice} onChange={(event) => setSelectedPractice(event.target.value)}>
              {practiceOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Status</span>
            <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        {saveSuccess ? <p className={styles.successText}>{saveSuccess}</p> : null}
        {saveError ? <p className={styles.errorText}>{saveError}</p> : null}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Practice</th>
                <th>Licensee</th>
                <th>App access</th>
                <th>App admin</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.map((user) => (
                <tr key={user.id ?? `${user.email ?? "user"}-${user.name ?? "unknown"}`}>
                  <td>{user.name ?? "Unknown user"}</td>
                  <td>{user.email ?? "No email"}</td>
                  <td>
                    <select
                      className={styles.tableSelect}
                      value={user.roleName}
                      onChange={(event) => void saveInlineUserAccess(user, { roleName: event.target.value })}
                      disabled={savingUserId === user.id}
                    >
                      {!roleOptions.includes(user.roleName) && user.roleName ? (
                        <option value={user.roleName}>{user.roleName}</option>
                      ) : null}
                      {roleOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className={styles.tableSelect}
                      value={user.practice?.id?.trim() || ""}
                      onChange={(event) => void saveInlineUserAccess(user, { practiceId: event.target.value })}
                      disabled={savingUserId === user.id}
                    >
                      <option value="">Unassigned practice</option>
                      {user.practice?.id && !practices.some((option) => option.id === user.practice?.id) ? (
                        <option value={user.practice.id}>{user.practiceName}</option>
                      ) : null}
                      {practices.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className={styles.tableSelect}
                      value={user.licensee?.id?.trim() || ""}
                      onChange={(event) => void saveInlineUserAccess(user, { licenseeId: event.target.value })}
                      disabled={savingUserId === user.id}
                    >
                      <option value="">Unassigned licensee</option>
                      {user.licensee?.id && !licensees.some((option) => option.id === user.licensee?.id) ? (
                        <option value={user.licensee.id}>{user.licenseeName}</option>
                      ) : null}
                      {licensees.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className={styles.tableSelect}
                      value={user.accessName}
                      onChange={(event) => void saveInlineUserAccess(user, { accessName: event.target.value })}
                      disabled={savingUserId === user.id}
                    >
                      {!accessOptions.includes(user.accessName) && user.accessName ? (
                        <option value={user.accessName}>{user.accessName}</option>
                      ) : null}
                      {accessOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className={`${styles.statusPill} ${user.adminEnabled ? styles.statusPillAdmin : ""}`.trim()}>
                      {user.adminEnabled ? "Enabled" : "No"}
                    </span>
                  </td>
                  <td>
                    <select
                      className={styles.tableSelect}
                      value={user.statusName}
                      onChange={(event) => void saveInlineUserAccess(user, { statusName: event.target.value })}
                      disabled={savingUserId === user.id}
                    >
                      {!userStatusOptions.includes(user.statusName) && user.statusName ? (
                        <option value={user.statusName}>{user.statusName}</option>
                      ) : null}
                      {userStatusOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button type="button" className={styles.secondaryButton} onClick={() => openEditor(user)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9}>No users match the selected filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className={styles.paginationBar}>
          <span className={styles.paginationSummary}>
            {filteredUsers.length
              ? `Showing ${pageStartIndex + 1}-${pageEndIndex} of ${filteredUsers.length} users`
              : "Showing 0 users"}
          </span>

          <label className={styles.paginationSize}>
            <span>Rows</span>
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.paginationActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={visiblePage <= 1}
            >
              Previous
            </button>
            <span className={styles.paginationPage}>
              Page {visiblePage} of {totalPages}
            </span>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={visiblePage >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {editingUser && draft ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.contentCardHeader}>
              <div>
                <h3 className={styles.cardTitle}>Edit user access</h3>
                <p className={styles.cardText}>{editingUser.name ?? editingUser.email ?? "User"}</p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Role</span>
                <select value={draft.roleName} onChange={(event) => setDraft({ ...draft, roleName: event.target.value })}>
                  {roleOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>App access</span>
                <select value={draft.accessName} onChange={(event) => setDraft({ ...draft, accessName: event.target.value })}>
                  {accessOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Status</span>
                <select value={draft.statusName} onChange={(event) => setDraft({ ...draft, statusName: event.target.value })}>
                  {userStatusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Licensee</span>
                <select value={draft.licenseeId} onChange={(event) => setDraft({ ...draft, licenseeId: event.target.value })}>
                  <option value="">Unassigned licensee</option>
                  {licensees.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Practice</span>
                <select value={draft.practiceId} onChange={(event) => setDraft({ ...draft, practiceId: event.target.value })}>
                  <option value="">Unassigned practice</option>
                  {practices.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>App admin</span>
                <input
                  type="checkbox"
                  checked={draft.appAdmin}
                  onChange={(event) => setDraft({ ...draft, appAdmin: event.target.checked })}
                />
              </label>
            </div>

            <p className={styles.helperText}>
              App admin, role, access, status, practice, and licensee changes save to the live user endpoint.
            </p>
            {saveError ? <p className={styles.errorText}>{saveError}</p> : null}

            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={closeEditor} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className={styles.primaryButton} onClick={saveEditor} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
