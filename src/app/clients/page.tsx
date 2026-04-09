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

function mapClientSummaryToRow(client: ClientSummary): ClientRow {
  return {
    id: client.id ?? "",
    name: client.name ?? "Unnamed Client",
    adviser: client.clientAdviserName ?? "",
    category: "",
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

function ClientsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [adviser, setAdviser] = useState("All advisers");
  const [adviserOptions, setAdviserOptions] = useState<string[]>(["All advisers"]);
  const [currentUserScope, setCurrentUserScope] = useState<CurrentUserScope | null>(null);
  const [clients, setClients] = useState<ClientRow[]>(() => mockClientSummaries.map(mapClientSummaryToRow));
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [continuationTokens, setContinuationTokens] = useState<(string | null)[]>([null]);
  const [nextContinuationToken, setNextContinuationToken] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [loadMessage, setLoadMessage] = useState<string | null>("Showing sample client data.");
  const [deleteCandidate, setDeleteCandidate] = useState<ClientRow | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [isCreateClientOpen, setIsCreateClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newPartnerName, setNewPartnerName] = useState("");
  const [newClientAdviserName, setNewClientAdviserName] = useState("");
  const [newClientPracticeName, setNewClientPracticeName] = useState("");
  const [newClientError, setNewClientError] = useState<string | null>(null);

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
              clientAdviserName: item.adviser?.name,
              clientAdviserPracticeName: item.practice,
            }),
          )
          .filter((client) => client.id);

        if (nextClients.length > 0) {
          setClients(filterRowsByPractice(nextClients, currentUserScope?.practice?.name));
          setLoadMessage("Loaded live client data from the API via the local app server.");
        } else {
          setClients([]);
          setLoadMessage("API connected, but no client rows were returned.");
        }

        setNextContinuationToken(body?.data?.continuationToken ?? null);
        setTotalPages(Math.max(body?.data?.totalPageCount ?? 1, 1));
      } catch (error) {
        if (isMounted) {
          const message =
            error instanceof Error
              ? `Live API failed: ${error.message}. Showing sample records.`
              : "Unable to load live client data yet. Showing sample records.";

          const fallbackRows = filterRowsByPractice(
            mockClientSummaries.map(mapClientSummaryToRow),
            currentUserScope?.practice?.name,
          );

          setClients(fallbackRows.slice(0, pageSize));
          setCurrentPage(1);
          setContinuationTokens([null]);
          setNextContinuationToken(null);
          setTotalPages(Math.max(Math.ceil(fallbackRows.length / pageSize), 1));
          setLoadMessage(message);
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
    setNewClientAdviserName(currentUserScope?.name ?? "");
    setNewClientPracticeName(currentUserScope?.practice?.name ?? "");
    setNewClientError(null);
    setIsCreateClientOpen(true);
  }, [currentUserScope?.name, currentUserScope?.practice?.name, searchParams]);

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

  function resetPagination() {
    setCurrentPage(1);
    setContinuationTokens([null]);
    setNextContinuationToken(null);
  }

  function openDeleteConfirmation(client: ClientRow) {
    setDeleteMessage(null);
    setDeleteCandidate(client);
  }

  function closeDeleteConfirmation() {
    setDeleteCandidate(null);
  }

  function confirmDelete() {
    setDeleteMessage("Client deletion will be connected once the API endpoint is ready.");
    setDeleteCandidate(null);
  }

  function closeCreateClientModal() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("createClient");
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
    setIsCreateClientOpen(false);
    setNewClientError(null);
  }

  function handleCreateClient() {
    const primaryName = newClientName.trim();
    const partnerName = newPartnerName.trim();

    if (!primaryName) {
      setNewClientError("Enter the primary client name to start a new client record.");
      return;
    }

    const draftClient: ClientRow = {
      id: `draft-${crypto.randomUUID()}`,
      name: partnerName ? `${primaryName} & ${partnerName}` : primaryName,
      adviser: newClientAdviserName.trim() || currentUserScope?.name || "Unassigned Adviser",
      category: "Draft",
      practice: newClientPracticeName.trim() || currentUserScope?.practice?.name || "New client intake",
    };

    setClients((current) => [draftClient, ...current]);
    setLoadMessage("Draft client added locally from the Add New flow.");
    closeCreateClientModal();
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
          {loadMessage ? <p className={styles.dataNotice}>{isLoading ? "Loading..." : loadMessage}</p> : null}
          {deleteMessage ? <p className={styles.dataNotice}>{deleteMessage}</p> : null}
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
            <p className={styles.confirmSubtext}>This action will be enabled once the client delete API endpoint is ready.</p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.confirmCancelButton} onClick={closeDeleteConfirmation}>
                Cancel
              </button>
              <button type="button" className={styles.confirmDeleteButton} onClick={confirmDelete}>
                Confirm delete
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
              <input
                className={styles.createClientInput}
                value={newClientAdviserName}
                onChange={(event) => setNewClientAdviserName(event.target.value)}
              />
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
              <button type="button" className={styles.createClientApproveButton} onClick={handleCreateClient}>
                Create and select
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
