"use client";

import { useEffect, useState } from "react";
import type { AdviserSummary } from "@/lib/api/types";
import styles from "./create-client-dialog.module.css";

export type CreateClientUserScope = {
  name?: string | null;
  userRole?: string | null;
  practice?: { id?: string | null; name?: string | null } | null;
  licensee?: { id?: string | null; name?: string | null } | null;
};

export type CreateClientAdviserOption = {
  id: string;
  entityId: string;
  name: string;
  email: string;
};

export type CreatedClientResponse = {
  id?: string | null;
  client?: { id?: string | null; name?: string | null } | null;
  partner?: { id?: string | null; name?: string | null } | null;
  adviser?: {
    id?: string | null;
    entity?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  practice?: string | null;
  licensee?: string | null;
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

type CreateClientDialogProps = {
  isOpen: boolean;
  currentUserScope?: CreateClientUserScope | null;
  defaultAdviserName?: string | null;
  defaultPracticeName?: string | null;
  defaultLicenseeName?: string | null;
  onClose: () => void;
  onCreated: (createdClient: CreatedClientResponse) => void;
};

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

export function getCreateClientAdviserOptionValue(option: CreateClientAdviserOption) {
  return option.entityId || option.id || option.email || option.name;
}

export function CreateClientDialog({
  isOpen,
  currentUserScope,
  defaultAdviserName,
  defaultPracticeName,
  defaultLicenseeName,
  onClose,
  onCreated,
}: CreateClientDialogProps) {
  const [clientName, setClientName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [adviserValue, setAdviserValue] = useState("");
  const [adviserOptions, setAdviserOptions] = useState<CreateClientAdviserOption[]>([]);
  const [practiceName, setPracticeName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setClientName("");
    setPartnerName("");
    setAdviserValue("");
    setPracticeName(currentUserScope?.practice?.name ?? defaultPracticeName ?? "");
    setError(null);
  }, [currentUserScope?.practice?.name, defaultPracticeName, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isMounted = true;

    async function loadAdviserOptions() {
      const scopedPracticeName = currentUserScope?.practice?.name?.trim() || defaultPracticeName?.trim();
      const normalizedPracticeName = scopedPracticeName?.toLowerCase();
      const licenseeName = currentUserScope?.licensee?.name?.trim() || defaultLicenseeName?.trim();

      if (!normalizedPracticeName) {
        if (isMounted) {
          setAdviserOptions([]);
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
                    entityId?: string | null;
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
          adviserParams.set("practiceName", scopedPracticeName ?? "");
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

        const nextOptions = Array.from(
          new Map(
            sourceOptions.map((user) => [`${normalizeText(user.name)}|${normalizeText(user.email)}`, user]),
          ).values(),
        ).sort((left, right) => left.name.localeCompare(right.name));

        setAdviserOptions(nextOptions);

        const preferredAdviserName = currentUserScope?.name ?? defaultAdviserName ?? "";
        const preferredOption =
          nextOptions.find((user) => user.name === preferredAdviserName) ??
          nextOptions.find((user) => normalizeText(user.name) === normalizeText(preferredAdviserName)) ??
          nextOptions[0] ??
          null;

        setAdviserValue(preferredOption ? getCreateClientAdviserOptionValue(preferredOption) : "");
      } catch {
        if (isMounted) {
          setAdviserOptions([]);
        }
      }
    }

    void loadAdviserOptions();

    return () => {
      isMounted = false;
    };
  }, [
    currentUserScope?.licensee?.name,
    currentUserScope?.name,
    currentUserScope?.practice?.name,
    defaultAdviserName,
    defaultLicenseeName,
    defaultPracticeName,
    isOpen,
  ]);

  async function handleCreate() {
    const primaryName = clientName.trim();

    if (!primaryName) {
      setError("Enter the primary client name to start a new client record.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const selectedAdviser =
        adviserOptions.find((option) => getCreateClientAdviserOptionValue(option) === adviserValue) ??
        adviserOptions[0] ??
        null;

      const response = await fetch("/api/client-profiles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          practice: practiceName.trim() || currentUserScope?.practice?.name || defaultPracticeName || "",
          licensee: currentUserScope?.licensee?.name || defaultLicenseeName || "",
          adviser: selectedAdviser
            ? {
                id: selectedAdviser.id || null,
                entity: selectedAdviser.entityId || null,
                name: selectedAdviser.name || null,
                email: selectedAdviser.email || null,
              }
            : {},
          client: {
            name: primaryName,
            status: "Client",
            clientCategory: "Draft",
          },
          partner: partnerName.trim()
            ? {
                name: partnerName.trim(),
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

      onClose();
      onCreated(body?.data ?? { id: createdProfileId });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create the client profile.");
    } finally {
      setIsCreating(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-client-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="create-client-title" className={styles.title}>
          Create a new client or household in Finley
        </h2>

        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.label}>Primary client name</span>
            <input
              className={styles.input}
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Partner name</span>
            <input
              className={styles.input}
              value={partnerName}
              onChange={(event) => setPartnerName(event.target.value)}
            />
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Adviser</span>
          <select
            className={styles.input}
            value={adviserValue}
            onChange={(event) => setAdviserValue(event.target.value)}
          >
            {adviserOptions.length ? (
              adviserOptions.map((adviserOption) => (
                <option
                  key={`${adviserOption.id}-${adviserOption.entityId}-${adviserOption.email}-${adviserOption.name}`}
                  value={getCreateClientAdviserOptionValue(adviserOption)}
                >
                  {adviserOption.name}
                </option>
              ))
            ) : (
              <option value="">
                {currentUserScope?.practice?.name || defaultPracticeName
                  ? "No advisers available in this practice"
                  : "No practice selected"}
              </option>
            )}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Practice</span>
          <input
            className={styles.input}
            value={practiceName}
            onChange={(event) => setPracticeName(event.target.value)}
          />
        </label>

        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onClose} disabled={isCreating}>
            Cancel
          </button>
          <button type="button" className={styles.createButton} onClick={() => void handleCreate()} disabled={isCreating}>
            {isCreating ? "Creating..." : "Create and select"}
          </button>
        </div>
      </div>
    </div>
  );
}
