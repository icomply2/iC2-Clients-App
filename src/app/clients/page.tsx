"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { AppTopbar } from "@/components/app-topbar";
import { CreateClientDialog, type CreatedClientResponse } from "@/components/create-client-dialog";
import type { AdviserSummary, ClientSummary } from "@/lib/api/types";
import styles from "./page.module.css";

type ClientRow = {
  id: string;
  name: string;
  adviser: string;
  category: string;
  practice: string;
  status: string;
  licensee: string;
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
    category: client.category ?? client.clientCategory ?? "",
    practice: client.clientAdviserPracticeName ?? "",
    status: client.clientStatus ?? client.status ?? "",
    licensee: client.clientAdviserLicenseeName ?? "",
  };
}

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function isComplianceManagerRole(userRole?: string | null) {
  return normalizeText(userRole) === "compliance manager";
}

function filterRowsByCurrentUserScope(rows: ClientRow[], currentUserScope?: CurrentUserScope | null) {
  const normalizedLicensee = normalizeText(currentUserScope?.licensee?.name);
  const normalizedPractice = normalizeText(currentUserScope?.practice?.name);
  const isComplianceManager = isComplianceManagerRole(currentUserScope?.userRole);

  if (!normalizedLicensee && (isComplianceManager || !normalizedPractice)) {
    return rows;
  }

  return rows.filter((row) => {
    const matchesLicensee = !normalizedLicensee || normalizeText(row.licensee) === normalizedLicensee;
    const matchesPractice = isComplianceManager || !normalizedPractice || normalizeText(row.practice) === normalizedPractice;

    return matchesLicensee && matchesPractice;
  });
}

function getClientHref(clientId: string) {
  return `/clients/${clientId}`;
}

function ClientsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [adviser, setAdviser] = useState("All advisers");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [adviserOptions, setAdviserOptions] = useState<string[]>(["All advisers"]);
  const [statusOptions, setStatusOptions] = useState<string[]>(["All statuses"]);
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageDataSource, setPageDataSource] = useState<"mock" | "live">("live");
  const [fallbackSource, setFallbackSource] = useState("none");
  const [clientListRefreshKey, setClientListRefreshKey] = useState(0);
  const locallyCreatedClientIdsRef = useRef<Set<string>>(new Set());
  const pendingCreatedClientNavigationRef = useRef<string | null>(null);
  const isComplianceManager = isComplianceManagerRole(currentUserScope?.userRole);

  useEffect(() => {
    let isMounted = true;

    async function loadClients() {
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
                  client?: { name?: string | null; clientStatus?: string | null; status?: string | null } | null;
                  partner?: { name?: string | null } | null;
                  adviser?: { name?: string | null } | null;
                  practice?: string | null;
                  licensee?: string | null;
                  clientAdviserName?: string | null;
                  clientAdviserPracticeName?: string | null;
                  status?: string | null;
                  clientStatus?: string | null;
                  clientAdviserLicenseeName?: string | null;
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
              status: item.status,
              clientStatus: item.client?.clientStatus ?? item.clientStatus ?? item.client?.status,
              category: item.category ?? item.clientCategory,
              clientCategory: item.clientCategory,
              clientAdviserLicenseeName: item.clientAdviserLicenseeName ?? item.licensee
            }),
          )
          .filter((client) => client.id);

        if (nextClients.length > 0) {
          const scopedClients = filterRowsByPractice(nextClients, currentUserScope?.practice?.name);
          setStatusOptions([
            "All statuses",
            ...Array.from(new Set(scopedClients.map((client) => client.status.trim()).filter(Boolean))).sort((left, right) =>
              left.localeCompare(right),
            ),
          ]);
          setClients(
            statusFilter === "All statuses"
              ? scopedClients
              : scopedClients.filter((client) => client.status.trim() === statusFilter),
          );
        } else {
          setClients([]);
        }

        setNextContinuationToken(body?.data?.continuationToken ?? null);
        setTotalPages(Math.max(body?.data?.totalPageCount ?? 1, 1));
        setLoadError(null);
        setPageDataSource("live");
        setFallbackSource("none");
      } catch (error) {
        if (isMounted) {
          setClients((currentClients) =>
            currentClients.filter((client) => locallyCreatedClientIdsRef.current.has(client.id)),
          );
          setNextContinuationToken(null);
          setTotalPages(1);
          setLoadError(error instanceof Error ? error.message : "Unable to load clients from the live API.");
          setPageDataSource("live");
          setFallbackSource("clients-page:live-error");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);

          const pendingCreatedClientId = pendingCreatedClientNavigationRef.current;
          if (pendingCreatedClientId) {
            pendingCreatedClientNavigationRef.current = null;
            router.push(getClientHref(pendingCreatedClientId));
            router.refresh();
          }
        }
      }
    }

    void loadClients();

    return () => {
      isMounted = false;
    };
  }, [adviser, continuationTokens, currentPage, currentUserScope?.practice?.name, pageSize, search, statusFilter]);

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentUserScope() {
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

    setIsCreateClientOpen(true);
  }, [searchParams]);

  useEffect(() => {
    let isMounted = true;

    async function loadAdvisers() {
      try {
        const params = new URLSearchParams();
        const practiceName = currentUserScope?.practice?.name?.trim();
        const licenseeName = currentUserScope?.licensee?.name?.trim();

        if (licenseeName) {
          params.set("licenseeName", licenseeName);
        }

        if (!isComplianceManager && practiceName) {
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
          const normalizedLicenseeName = currentUserScope?.licensee?.name?.trim().toLowerCase();
          const itemPractice = item.practiceName?.trim().toLowerCase();
          const itemLicensee = item.licenseeName?.trim().toLowerCase();
          const matchesLicensee = !normalizedLicenseeName || !itemLicensee || itemLicensee === normalizedLicenseeName;
          const matchesPractice = isComplianceManager || !normalizedPracticeName || itemPractice === normalizedPracticeName;

          return matchesLicensee && matchesPractice;
        });

        const names = scopedAdvisers
          .map((item) => item.name?.trim() ?? "")
          .filter(Boolean);

        if (names.length > 0) {
          setAdviserOptions(["All advisers", ...Array.from(new Set(names)).sort((left, right) => left.localeCompare(right))]);
        } else {
          setAdviserOptions(["All advisers"]);
        }
      } catch {
        if (!isMounted) {
          return;
        }

        setAdviserOptions(
          clients.length > 0
            ? ["All advisers", ...Array.from(new Set(clients.map((client) => client.adviser.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right))]
            : ["All advisers"],
        );
      }
    }

    void loadAdvisers();

    return () => {
      isMounted = false;
    };
  }, [clients, currentUserScope, isComplianceManager]);

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
  }

  function handleClientCreated(createdClient: CreatedClientResponse) {
    const createdProfileId = createdClient.id?.trim() || "";

    if (!createdProfileId) {
      return;
    }

    const primaryName = createdClient.client?.name?.trim() ?? "";
    const partnerName = createdClient.partner?.name?.trim() ?? "";
    const createdRow: ClientRow = {
      id: createdProfileId,
      name: createdClient.name?.trim() || [primaryName, partnerName].filter(Boolean).join(" & ") || "Unnamed Client",
      adviser: createdClient.clientAdviserName ?? createdClient.adviser?.name ?? currentUserScope?.name ?? "",
      category: "",
      practice:
        createdClient.clientAdviserPracticeName ??
        createdClient.practice ??
        currentUserScope?.practice?.name ??
        "",
      licensee:
        createdClient.clientAdviserLicenseeName ??
        createdClient.licensee ??
        currentUserScope?.licensee?.name ??
        "",
    };

    locallyCreatedClientIdsRef.current.add(createdProfileId);
    setClients((currentClients) => [
      createdRow,
      ...currentClients.filter((client) => client.id !== createdProfileId),
    ]);
    pendingCreatedClientNavigationRef.current = createdProfileId;
    setClientListRefreshKey((key) => key + 1);
  }

  return (
    <div
      className={styles.page}
      data-ic2-data-source={pageDataSource}
      data-ic2-fallback-source={fallbackSource}
    >
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
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                resetPagination();
              }}
            >
              {statusOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
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
          {loadError ? <p className={styles.dataNotice}>{loadError}</p> : null}
          <div className={styles.tableHeader}>
            <div>Client Name</div>
            <div>Adviser Name</div>
            <div>Category</div>
            <div>Practice Name</div>
            <div>Status</div>
            <div />
          </div>

          <div>
            {clients.map((client) => (
              <div key={client.id} className={styles.tableRow}>
                <Link href={getClientHref(client.id)} className={styles.clientLink}>
                  {client.name}
                </Link>
                <div>{client.adviser}</div>
                <div>{client.category}</div>
                <div>{client.practice}</div>
                <div>{client.status || "No status"}</div>
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
            {!clients.length && !isLoading && !loadError ? <p className={styles.dataNotice}>No clients found.</p> : null}
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

      <CreateClientDialog
        isOpen={isCreateClientOpen}
        currentUserScope={currentUserScope}
        onClose={closeCreateClientModal}
        onCreated={handleClientCreated}
      />
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
