"use client";

import { useMemo, useState } from "react";
import { updateAdminUser } from "@/lib/api/admin";
import type { AdminUserRecord, LicenseeSummary, PracticeSummary } from "@/lib/admin-data";
import styles from "@/app/admin/admin.module.css";

type UserDraft = {
  roleName: string;
  accessName: string;
  statusName: string;
  practiceId: string;
  licenseeId: string;
};

type AdminUsersManagerProps = {
  initialUsers: AdminUserRecord[];
  practices: PracticeSummary[];
  licensees: LicenseeSummary[];
};

const DEFAULT_ROLE_OPTIONS = ["Adviser", "Compliance Manager", "Paraplanner", "Support Staff"];
const DEFAULT_ACCESS_OPTIONS = ["Full Access", "Standard Access", "Read Only", "No Access"];
const DEFAULT_STATUS_OPTIONS = ["Active", "Invited", "Suspended", "Inactive"];

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

  const editingUser = users.find((user) => user.id && user.id === editingUserId) ?? null;

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
    });
  }

  function closeEditor() {
    setEditingUserId(null);
    setDraft(null);
    setIsSaving(false);
    setSaveError(null);
  }

  async function saveEditor() {
    if (!editingUserId || !draft || !editingUser) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      await updateAdminUser(editingUserId, {
        subscriptionId: editingUser.subscriptionTier?.id ?? null,
        practiceId: draft.practiceId || null,
        licenseeId: draft.licenseeId || null,
        complianceManagerId: editingUser.complianceManager?.id ?? null,
        appAccess: draft.accessName || null,
        userRole: draft.roleName || null,
        userStatus: draft.statusName || null,
      });

      const selectedPracticeRecord = practices.find((item) => item.id === draft.practiceId) ?? null;
      const selectedLicenseeRecord = licensees.find((item) => item.id === draft.licenseeId) ?? null;

      setUsers((current) =>
        current.map((user) =>
          user.id === editingUserId
            ? {
                ...user,
                roleName: draft.roleName,
                accessName: draft.accessName,
                statusName: draft.statusName,
                practiceName: selectedPracticeRecord?.name || "Unassigned practice",
                licenseeName: selectedLicenseeRecord?.name || "Unassigned licensee",
                practice: selectedPracticeRecord
                  ? { id: selectedPracticeRecord.id, name: selectedPracticeRecord.name }
                  : null,
                licensee: selectedLicenseeRecord
                  ? { id: selectedLicenseeRecord.id, name: selectedLicenseeRecord.name }
                  : null,
                userRole: draft.roleName,
                appAccess: draft.accessName,
                userStatus: draft.statusName,
              }
            : user,
        ),
      );

      setSaveSuccess("User saved.");
      closeEditor();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save user changes.");
      setIsSaving(false);
    }
  }

  return (
    <>
      <section className={styles.contentCard}>
        <div className={styles.contentCardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Users</h2>
            <p className={styles.cardText}>
              Live user records are shown below, and supported role, access, status, practice, and licensee changes
              now save back to the live API.
            </p>
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
              {filteredUsers.map((user) => (
                <tr key={user.id ?? `${user.email ?? "user"}-${user.name ?? "unknown"}`}>
                  <td>{user.name ?? "Unknown user"}</td>
                  <td>{user.email ?? "No email"}</td>
                  <td>{user.roleName}</td>
                  <td>{user.practiceName}</td>
                  <td>{user.licenseeName}</td>
                  <td>{user.accessName}</td>
                  <td>
                    <span className={`${styles.statusPill} ${user.adminEnabled ? styles.statusPillAdmin : ""}`.trim()}>
                      {user.adminEnabled ? "Enabled" : "No"}
                    </span>
                  </td>
                  <td>{user.statusName}</td>
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
                <input value={editingUser.appAdmin == null ? "Not configured" : String(editingUser.appAdmin)} readOnly />
              </label>
            </div>

            <p className={styles.helperText}>
              App admin stays read-only here until the backend exposes an admin-specific update field for it.
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
