"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppTopbar } from "@/components/app-topbar";
import type { AdviserSummary, ClientSummary } from "@/lib/api/types";
import { mockClientSummaries } from "@/lib/client-mocks";
import styles from "./page.module.css";

type ClientRow = {
  id: string;
  name: string;
  adviser: string;
  category: string;
  practice: string;
};

type CurrentUserScope = {
  name?: string | null;
  userRole?: string | null;
  practice?: { id?: string | null; name?: string | null } | null;
  licensee?: { id?: string | null; name?: string | null } | null;
};

type CreateClientAdviserOption = {
  id: string;
  entityId: string;
  name: string;
  email: string;
};

type CreatedClientResponse = {
  id?: string | null;
  client?: { id?: string | null; name?: string | null } | null;
  partner?: { id?: string | null; name?: string | null } | null;
  adviser?: {
    id?: string | null;
    entity?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  name?: string | null;
  clientAdviserName?: string | null;
  clientAdviserPracticeName?: string | null;
  clientAdviserLicenseeName?: string | null;
};

type CreateClientResult = {
  status?: boolean | null;
  message?: string | null;
  modelErrors?: { propertyName?: string | null; errorMessage?: string | null }[] | null;
  data?: CreatedClientResponse | null;
};

function mapClientSummaryToRow(client: ClientSummary): ClientRow {
  return {
    id: client.id ?? "",
    name: client.name ?? "Unnamed Client",
    adviser: client.clientAdviserName ?? "",
    category: client.category ?? client.clientCategory ?? "",
    practice: client.clientAdviserPracticeName ?? "",
  };
}

function filterRowsByPractice(rows: ClientRow[], practiceName?: string | null) {
  const normalizedPractice = practiceName?.trim().toLowerCase();

  if (!normalizedPractice) {
    return rows;
  }

  return rows.filter((row) => row.practice.trim().toLowerCase() === normalizedPractice);
}

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function getCreateClientAdviserOptionValue(option: CreateClientAdviserOption) {
  return option.entityId || option.id || option.email || option.name;
}

function ClientsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [adviser, setAdviser] = useState("All advisers");
  const [adviserOptions, setAdviserOptions] = useState<string[]>(["All advisers"]);
  const [currentUserScope, setCurrentUserScope] = useState<CurrentUserScope | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [continuationTokens, setContinuationTokens] = useState<(string | null)[]>([null]);
  const [nextContinuationToken, setNextContinuationToken] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<ClientRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingClient, setIsDeletingClient] = useState(false);
  const [isCreateClientOpen, setIsCreateClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newPartnerName, setNewPartnerName] = useState("");
  const [newClientAdviserValue, setNewClientAdviserValue] = useState("");
  const [createClientAdviserOptions, setCreateClientAdviserOptions] = useState<CreateClientAdviserOption[]>([]);
  const [newClientPracticeName, setNewClientPracticeName] = useState("");
  const [newClientError, setNewClientError] = useState<string | null>(null);
  const [creatingClient, setCreatingClient] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadClients() {
      if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
        return;
      }

      setIsLoading(true);

      try {
        const query = new URLSearchParams();
        if (search.trim()) {
          query.set("search", search.trim());
        }
        if (adviser && adviser !== "All advisers") {
          query.set("adviser", adviser);
        }
        query.set("pageSize", String(pageSize));

        const currentToken = continuationTokens[currentPage - 1];
        if (currentToken) {
          query.set("continuationToken", currentToken);
        }

        const response = await fetch(`/api/clients?${query.toString()}`, {
          method: "GET",
          cache: "no-store",
        });

        const body = (await response.json().catch(() => null)) as
          | {
              data?: {
                continuationToken?: string | null;
                totalPageCount?: number | null;
                items?: Array<{
                  id?: string | null;
                  client?: { name?: string | null } | null;
                  partner?: { name?: string | null } | null;
                  adviser?: { name?: string | null } | null;
                  practice?: string | null;
                  clientAdviserName?: string | null;
                  clientAdviserPracticeName?: string | null;
                  category?: string | null;
                  clientCategory?: string | null;
                }>;
              };
              message?: string;
            }
          | null;

        if (!response.ok) {
          throw new Error(
            response.status && body?.message
              ? `(${response.status}) ${body.message}`
              : body?.message ?? `Request failed with status ${response.status}.`,
          );
        }

        if (!isMounted) {
          return;
        }

        const nextClients = (body?.data?.items ?? [])
          .map((item) =>
            mapClientSummaryToRow({
              id: item.id,
              name: [item.client?.name, item.partner?.name].filter(Boolean).join(" & "),
              clientAdviserName: item.clientAdviserName ?? item.adviser?.name,
              clientAdviserPracticeName: item.clientAdviserPracticeName ?? item.practice,
              category: item.category ?? item.clientCategory,
              clientCategory: item.clientCategory,
            }),
          )
          .filter((client) => client.id);

        if (nextClients.length > 0) {
          setClients(filterRowsByPractice(nextClients, currentUserScope?.practice?.name));
        } else {
          setClients([]);
        }

        setNextContinuationToken(body?.data?.continuationToken ?? null);
        setTotalPages(Math.max(body?.data?.totalPageCount ?? 1, 1));
      } catch {
        if (isMounted) {
          const fallbackRows = filterRowsByPractice(
            mockClientSummaries.map(mapClientSummaryToRow),
            currentUserScope?.practice?.name,
          );

          setClients(fallbackRows.slice(0, pageSize));
          setCurrentPage(1);
          setContinuationTokens([null]);
          setNextContinuationToken(null);
          setTotalPages(Math.max(Math.ceil(fallbackRows.length / pageSize), 1));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadClients();

    return () => {
      isMounted = false;
    };
  }, [adviser, continuationTokens, currentPage, currentUserScope?.practice?.name, pageSize, search]);

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentUserScope() {
      if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
        return;
      }

      try {
        const response = await fetch("/api/users/me", {
          method: "GET",
          cache: "no-store",
        });

        const body = (await response.json().catch(() => null)) as
          | {
              data?: CurrentUserScope | null;
            }
          | null;

        if (!response.ok || !body?.data) {
          return;
        }

        if (isMounted) {
          setCurrentUserScope(body.data);
        }
      } catch {
        // Keep the dropdown unfiltered if the user scope cannot be resolved yet.
      }
    }

    void loadCurrentUserScope();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (searchParams.get("createClient") !== "1") {
      return;
    }

    setNewClientName("");
    setNewPartnerName("");
    setNewClientAdviserValue("");
    setNewClientPracticeName(currentUserScope?.practice?.name ?? "");
    setNewClientError(null);
    setIsCreateClientOpen(true);
  }, [currentUserScope?.practice?.name, searchParams]);

  useEffect(() => {
    let isMounted = true;

    async function loadAdvisers() {
      if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
        return;
      }

      try {
        const params = new URLSearchParams();
        const practiceName = currentUserScope?.practice?.name?.trim();

        if (practiceName) {
          params.set("practiceName", practiceName);
        }

        const response = await fetch(`/api/advisers${params.size ? `?${params.toString()}` : ""}`, {
          method: "GET",
          cache: "no-store",
        });

        const body = (await response.json().catch(() => null)) as
          | {
              data?: AdviserSummary[] | null;
              message?: string;
            }
          | null;

        if (!response.ok) {
          throw new Error(body?.message ?? `Request failed with status ${response.status}.`);
        }

        if (!isMounted) {
          return;
        }

        const scopedAdvisers = (body?.data ?? []).filter((item) => {
          const normalizedPracticeName = currentUserScope?.practice?.name?.trim().toLowerCase();
          const itemPractice = item.practiceName?.trim().toLowerCase();

          return !normalizedPracticeName || itemPractice === normalizedPracticeName;
        });

        const names = scopedAdvisers
          .map((item) => item.name?.trim() ?? "")
          .filter(Boolean);

        if (names.length > 0) {
          setAdviserOptions(["All advisers", ...Array.from(new Set(names)).sort((left, right) => left.localeCompare(right))]);
        }
      } catch {
        if (!isMounted) {
          return;
        }

        const names = clients
          .map((client) => client.adviser.trim())
          .filter(Boolean);

        setAdviserOptions(["All advisers", ...Array.from(new Set(names)).sort((left, right) => left.localeCompare(right))]);
      }
    }

    void loadAdvisers();

    return () => {
      isMounted = false;
    };
  }, [clients, currentUserScope]);

  useEffect(() => {
    let isMounted = true;

    async function loadCreateClientAdvisers() {
      const practiceName = currentUserScope?.practice?.name?.trim();
      const normalizedPracticeName = practiceName?.toLowerCase();
      const licenseeName = currentUserScope?.licensee?.name?.trim();

      if (!normalizedPracticeName) {
        if (isMounted) {
          setCreateClientAdviserOptions([]);
        }
        return;
      }

      try {
        const usersResponse = await fetch("/api/users", {
          method: "GET",
          cache: "no-store",
        });

        const usersBody = (await usersResponse.json().catch(() => null)) as
          | {
              data?:
                | Array<{
                    id?: string | null;
                    name?: string | null;
                    email?: string | null;
                    userRole?: string | null;
                    practice?: { name?: string | null } | null;
                  }>
                | null;
              message?: string;
            }
          | null;

        if (!usersResponse.ok) {
          throw new Error(usersBody?.message ?? `Request failed with status ${usersResponse.status}.`);
        }

        const scopedUserAdvisers = (usersBody?.data ?? [])
          .filter((user) => user.name)
          .filter((user) => normalizeText(user.userRole) === "adviser")
          .filter((user) => normalizeText(user.practice?.name) === normalizedPracticeName)
          .map((user) => ({
            id: "",
            entityId: user.entityId?.trim() ?? "",
            name: user.name?.trim() ?? "",
            email: user.email?.trim() ?? "",
          }))
          .filter((user) => user.name);

        const adviserParams = new URLSearchParams();

        if (licenseeName) {
          adviserParams.set("licenseeName", licenseeName);
        } else {
          adviserParams.set("practiceName", practiceName);
        }

        const advisersResponse = await fetch(`/api/advisers?${adviserParams.toString()}`, {
          method: "GET",
          cache: "no-store",
        });

        const advisersBody = (await advisersResponse.json().catch(() => null)) as
          | {
              data?: AdviserSummary[] | null;
              message?: string;
            }
          | null;

        if (!advisersResponse.ok) {
          throw new Error(advisersBody?.message ?? `Request failed with status ${advisersResponse.status}.`);
        }

        if (!isMounted) {
          return;
        }

        const adviserRecords = (advisersBody?.data ?? [])
          .filter((user) => user.id && user.name)
          .map((user) => ({
            id: user.id ?? "",
            name: user.name?.trim() ?? "",
            email: user.email?.trim() ?? "",
            practiceName: user.practiceName?.trim() ?? "",
          }))
          .filter((user) => user.id && user.name);

        const matchedAdvisers =
          scopedUserAdvisers
            .map((userAdviser) => {
              const matchedRecord =
                adviserRecords.find(
                  (adviserRecord) =>
                    userAdviser.email &&
                    normalizeText(adviserRecord.email) === normalizeText(userAdviser.email),
                ) ??
                adviserRecords.find((adviserRecord) => normalizeText(adviserRecord.name) === normalizeText(userAdviser.name)) ??
                null;

              return matchedRecord
                ? {
                    id: matchedRecord.id,
                    entityId: userAdviser.entityId,
                    name: matchedRecord.name,
                    email: matchedRecord.email,
                  }
                : userAdviser;
            })
            .filter((user) => user.name) ?? [];

        const practiceScopedAdvisers = adviserRecords
          .filter((user) => !user.practiceName || normalizeText(user.practiceName) === normalizedPracticeName)
          .map((user) => ({
            id: user.id,
            entityId: "",
            name: user.name,
            email: user.email,
          }));

        const sourceOptions =
          matchedAdvisers.length > 0
            ? matchedAdvisers
            : practiceScopedAdvisers.length > 0
              ? practiceScopedAdvisers
              : scopedUserAdvisers;

        const deduped = Array.from(
          new Map(
            sourceOptions.map((user) => [`${normalizeText(user.name)}|${normalizeText(user.email)}`, user]),
          ).values(),
        ).sort((left, right) => left.name.localeCompare(right.name));

        setCreateClientAdviserOptions(deduped);

        setNewClientAdviserValue((current) => {
          if (current && deduped.some((user) => getCreateClientAdviserOptionValue(user) === current)) {
            return current;
          }

          const currentUserOption = deduped.find((user) => user.name === currentUserScope?.name);
          return currentUserOption ? getCreateClientAdviserOptionValue(currentUserOption) : deduped[0] ? getCreateClientAdviserOptionValue(deduped[0]) : "";
        });
      } catch {
        if (!isMounted) {
          return;
        }

        setCreateClientAdviserOptions([]);
      }
    }

    void loadCreateClientAdvisers();

    return () => {
      isMounted = false;
    };
  }, [currentUserScope?.name, currentUserScope?.practice?.name]);

  function resetPagination() {
    setCurrentPage(1);
    setContinuationTokens([null]);
    setNextContinuationToken(null);
  }

  function openDeleteConfirmation(client: ClientRow) {
    setDeleteError(null);
    setDeleteCandidate(client);
  }

  function closeDeleteConfirmation() {
    if (isDeletingClient) {
      return;
    }

    setDeleteError(null);
    setDeleteCandidate(null);
  }

  async function confirmDelete() {
    if (!deleteCandidate || isDeletingClient) {
      return;
    }

    setIsDeletingClient(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/client-profiles/${encodeURIComponent(deleteCandidate.id)}`, {
        method: "DELETE",
      });

      const text = await response.text();
      const body = text
        ? (() => {
            try {
              return JSON.parse(text);
            } catch {
              return null;
            }
          })()
        : null;

      if (!response.ok) {
        const message =
          body?.message ||
          body?.title ||
          (body?.errors ? Object.values(body.errors).flat().join(" ") : null) ||
          text ||
          `Delete client failed (${response.status}).`;

        setDeleteError(message);
        return;
      }

      setClients((currentClients) => currentClients.filter((client) => client.id !== deleteCandidate.id));
      setDeleteCandidate(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Delete client failed.");
    } finally {
      setIsDeletingClient(false);
    }
  }

  function closeCreateClientModal() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("createClient");
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
    setIsCreateClientOpen(false);
    setNewClientError(null);
  }

  async function handleCreateClient() {
    const primaryName = newClientName.trim();

    if (!primaryName) {
      setNewClientError("Enter the primary client name to start a new client record.");
      return;
    }

    setCreatingClient(true);
    setNewClientError(null);

    try {
      const selectedAdviserOption =
        createClientAdviserOptions.find((option) => getCreateClientAdviserOptionValue(option) === newClientAdviserValue) ??
        createClientAdviserOptions[0] ??
        null;

      const response = await fetch("/api/client-profiles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          practice: newClientPracticeName.trim() || currentUserScope?.practice?.name || "",
          licensee: currentUserScope?.licensee?.name || "",
          adviser: selectedAdviserOption
            ? {
                id: selectedAdviserOption.id || null,
                entity: selectedAdviserOption.entityId || null,
                name: selectedAdviserOption.name || null,
                email: selectedAdviserOption.email || null,
              }
            : {},
          client: {
            name: primaryName,
            status: "Client",
            clientCategory: "Draft",
          },
          partner: newPartnerName.trim()
            ? {
                name: newPartnerName.trim(),
                status: "Client",
                clientCategory: "Draft",
              }
            : {},
        }),
        cache: "no-store",
      });

      const body = (await response.json().catch(() => null)) as CreateClientResult | null;

      const createdProfileId = body?.data?.id?.trim() || "";
      const modelErrorMessage = body?.modelErrors?.map((entry) => entry.errorMessage).filter(Boolean).join(", ");

      if (!response.ok || body?.status === false || !createdProfileId) {
        const fallbackMessage = body
          ? `Create client failed (${response.status}): ${JSON.stringify(body)}`
          : `Create client failed (${response.status}).`;

        throw new Error(modelErrorMessage || body?.message || fallbackMessage);
      }

      closeCreateClientModal();
      router.push(`/clients/${createdProfileId}`);
      router.refresh();
    } catch (error) {
      setNewClientError(error instanceof Error ? error.message : "Unable to create the client profile.");
    } finally {
      setCreatingClient(false);
    }
  }

  return (
    <div className={styles.page}>
      <AppTopbar finleyHref="/finley" />

      <main className={styles.content}>
        <section className={styles.searchCard}>
          <div className={styles.searchHeader}>
            <h2 className={styles.searchTitle}>Search Client</h2>
            <input
              className={styles.searchInput}
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPagination();
              }}
              placeholder="Search by Client"
            />
            <select
              className={styles.filterSelect}
              value={adviser}
              onChange={(event) => {
                setAdviser(event.target.value);
                resetPagination();
              }}
            >
              {adviserOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div>Client Name</div>
            <div>Adviser Name</div>
            <div>Category</div>
            <div>Practice Name</div>
            <div />
          </div>

          <div>
            {clients.map((client) => (
              <div key={client.id} className={styles.tableRow}>
                <Link href={`/clients/${client.id}`} className={styles.clientLink}>
                  {client.name}
                </Link>
                <div>{client.adviser}</div>
                <div className={styles.muted}>{client.category}</div>
                <div>{client.practice}</div>
                <button
                  type="button"
                  className={styles.deleteButton}
                  aria-label={`Delete ${client.name}`}
                  onClick={() => openDeleteConfirmation(client)}
                >
                  <span aria-hidden="true" className={styles.deleteIcon}>
                    🗑
                  </span>
                </button>
              </div>
            ))}
          </div>

          <div className={styles.footer}>
            <div className={styles.pager}>
              <button
                type="button"
                className={styles.pagerButton}
                onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                disabled={currentPage <= 1 || isLoading}
              >
                Previous
              </button>
              <span className={styles.pagerText}>
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className={styles.pagerButton}
                onClick={() => {
                  if (!nextContinuationToken || currentPage >= totalPages) {
                    return;
                  }

                  setContinuationTokens((current) => {
                    const next = [...current];
                    next[currentPage] = nextContinuationToken;
                    return next;
                  });
                  setCurrentPage((page) => page + 1);
                }}
                disabled={!nextContinuationToken || currentPage >= totalPages || isLoading}
              >
                Next
              </button>
            </div>

            <div className={styles.pageSize}>
              <span>Page size</span>
              <select
                className={styles.pageSizeSelect}
                value={String(pageSize)}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setDeleteMessage(null);
                  resetPagination();
                }}
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </div>
          </div>
        </section>
      </main>

      {deleteCandidate ? (
        <div className={styles.modalOverlay} role="presentation">
          <div className={styles.confirmModal} role="dialog" aria-modal="true" aria-labelledby="delete-client-title">
            <h2 id="delete-client-title" className={styles.confirmTitle}>
              Delete client
            </h2>
            <p className={styles.confirmText}>
              Are you sure you want to delete <strong>{deleteCandidate.name}</strong>?
            </p>
            <p className={styles.confirmSubtext}>This will remove the client profile from Finley.</p>
            {deleteError ? <p className={styles.confirmError}>{deleteError}</p> : null}
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmCancelButton}
                onClick={closeDeleteConfirmation}
                disabled={isDeletingClient}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmDeleteButton}
                onClick={confirmDelete}
                disabled={isDeletingClient}
              >
                {isDeletingClient ? "Deleting..." : "Confirm delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateClientOpen ? (
        <div className={styles.modalOverlay} role="presentation" onClick={closeCreateClientModal}>
          <div
            className={styles.createClientModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-client-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="create-client-title" className={styles.createClientTitle}>
              Create a new client or household in Finley
            </h2>

            <div className={styles.createClientGrid}>
              <label className={styles.createClientField}>
                <span className={styles.createClientLabel}>Primary client name</span>
                <input
                  className={styles.createClientInput}
                  value={newClientName}
                  onChange={(event) => setNewClientName(event.target.value)}
                />
              </label>
              <label className={styles.createClientField}>
                <span className={styles.createClientLabel}>Partner name</span>
                <input
                  className={styles.createClientInput}
                  value={newPartnerName}
                  onChange={(event) => setNewPartnerName(event.target.value)}
                />
              </label>
            </div>

            <label className={styles.createClientField}>
              <span className={styles.createClientLabel}>Adviser</span>
              <select
                className={styles.createClientInput}
                value={newClientAdviserValue}
                onChange={(event) => setNewClientAdviserValue(event.target.value)}
              >
                {createClientAdviserOptions.length ? (
                  createClientAdviserOptions.map((adviserOption) => (
                    <option
                      key={`${adviserOption.id}-${adviserOption.entityId}-${adviserOption.email}-${adviserOption.name}`}
                      value={getCreateClientAdviserOptionValue(adviserOption)}
                    >
                      {adviserOption.name}
                    </option>
                  ))
                ) : (
                  <option value="">{currentUserScope?.practice?.name ? "No advisers available in this practice" : "No practice selected"}</option>
                )}
              </select>
            </label>

            <label className={styles.createClientField}>
              <span className={styles.createClientLabel}>Practice</span>
              <input
                className={styles.createClientInput}
                value={newClientPracticeName}
                onChange={(event) => setNewClientPracticeName(event.target.value)}
              />
            </label>

            {newClientError ? <div className={styles.createClientError}>{newClientError}</div> : null}

            <div className={styles.createClientActions}>
              <button type="button" className={styles.createClientCancelButton} onClick={closeCreateClientModal}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.createClientApproveButton}
                onClick={() => void handleCreateClient()}
                disabled={creatingClient}
              >
                {creatingClient ? "Creating..." : "Create and select"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ClientsPage() {
  return (
    <Suspense fallback={null}>
      <ClientsPageContent />
    </Suspense>
  );
}
