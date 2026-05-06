"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ClientPortfolioAccountRecord,
  ClientPortfolioRecord,
  ClientProfile,
  ExternalPlatformMapping,
  ExternalPlatformMappingStatus,
  ExternalPlatformProvider,
  ExternalPlatformSyncMode,
  PortfolioSyncRun,
} from "@/lib/api/types";
import styles from "./page.module.css";

type PortfolioSectionProps = {
  clientId: string;
  profile: ClientProfile;
  useMockFallback?: boolean;
};

type PortfolioDraftHolding = {
  id: string;
  positionExchange: string;
  positionDescription: string;
  inceptionDate: string;
  positionCode: string;
  units: string;
  holdingPrice: string;
  holdingValue: string;
  nativeMarketprice: string;
  nativeValue: string;
  nativeCurrency: string;
};

type PortfolioAccountBundle = {
  account: ClientPortfolioAccountRecord;
  holdings: ClientPortfolioRecord[];
};

type HoldingEditState = {
  account: ClientPortfolioAccountRecord;
  holding: ClientPortfolioRecord;
};

type HoldingAddState = {
  account: ClientPortfolioAccountRecord;
};

type DesktopBrokerHoldingBalance = {
  SecurityCode?: string | null;
  SecurityName?: string | null;
  HoldingQuantity?: number | null;
  AvailableQuantity?: number | null;
  AverageCostBase?: number | null;
  EntryPrice?: number | null;
  SecurityExchange?: string | null;
  HoldingValue?: number | null;
};

type DesktopBrokerHoldingsPayload = {
  ClientID?: number | null;
  HoldingBalances?: DesktopBrokerHoldingBalance[] | null;
};

type PlatformMappingFormState = {
  provider: ExternalPlatformProvider;
  ownerId: string;
  externalClientId: string;
  externalAccountId: string;
  externalAccountName: string;
  accountDescription: string;
  status: ExternalPlatformMappingStatus;
  syncMode: ExternalPlatformSyncMode;
};

const portfolioStepLabels = ["Portfolio", "Account Details", "Underlying Holdings"];
const exchangeOptions = ["ASX Listed", "International", "Managed Fund", "Cash", "Private Asset"];
const providerOptions: { value: ExternalPlatformProvider; label: string }[] = [
  { value: "desktop-broker", label: "Desktop Broker" },
  { value: "hub24", label: "HUB24" },
  { value: "netwealth", label: "Netwealth" },
];
const syncModeOptions: { value: ExternalPlatformSyncMode; label: string }[] = [
  { value: "daily-feed", label: "Daily Feed" },
  { value: "manual-import", label: "Manual Import" },
];
const mappingStatusOptions: { value: ExternalPlatformMappingStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];
const JOINT_OWNER_ID = "__joint__";

function getJointOwnerLabel(profile: ClientProfile) {
  const names = [profile.client?.name?.trim(), profile.partner?.name?.trim()].filter(
    (name): name is string => Boolean(name),
  );

  return names.length ? names.join(" and ") : "Joint";
}

function parseApiResult<T>(payload: unknown): { data: T | null; message: string | null } {
  if (!payload || typeof payload !== "object") {
    return { data: null, message: null };
  }

  const candidate = payload as {
    data?: T | null;
    message?: string | null;
    title?: string | null;
    errors?: Record<string, string[]>;
  };

  const errorMessage =
    candidate.message ??
    candidate.title ??
    (candidate.errors ? Object.values(candidate.errors).flat().join(" ") : null) ??
    null;

  return {
    data: candidate.data ?? null,
    message: errorMessage,
  };
}

function normalizeNumberInput(value: string) {
  const sanitized = value.replace(/[^\d.]/g, "");
  const decimalIndex = sanitized.indexOf(".");

  if (decimalIndex === -1) {
    return sanitized;
  }

  return `${sanitized.slice(0, decimalIndex + 1)}${sanitized.slice(decimalIndex + 1).replace(/\./g, "")}`;
}

function formatGroupedNumberInput(value: string) {
  const normalized = normalizeNumberInput(value);

  if (!normalized) {
    return "";
  }

  const [integerPartRaw = "0", decimalPart] = normalized.split(".");
  const groupedInteger = Number(integerPartRaw || "0").toLocaleString("en-AU");

  if (normalized.endsWith(".")) {
    return `${groupedInteger}.`;
  }

  return decimalPart != null ? `${groupedInteger}.${decimalPart}` : groupedInteger;
}

function normalizeCurrencyInput(value: string) {
  const normalized = normalizeNumberInput(value);

  if (!normalized) {
    return "";
  }

  const [integerPart = "", decimalPart = ""] = normalized.split(".");

  if (normalized.endsWith(".")) {
    return `${integerPart}.`;
  }

  return decimalPart ? `${integerPart}.${decimalPart.slice(0, 2)}` : integerPart;
}

function formatCurrencyInput(value: string) {
  const normalized = normalizeCurrencyInput(value);

  if (!normalized) {
    return "";
  }

  const [integerPartRaw = "0", decimalPart] = normalized.split(".");
  const groupedInteger = Number(integerPartRaw || "0").toLocaleString("en-AU");

  if (normalized.endsWith(".")) {
    return `$${groupedInteger}.`;
  }

  if (decimalPart != null) {
    return `$${groupedInteger}.${decimalPart}`;
  }

  return `$${groupedInteger}`;
}

function formatFixedCurrencyInput(value: string) {
  const normalized = normalizeCurrencyInput(value);

  if (!normalized) {
    return "";
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return "";
  }

  return parsed.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeMappingStatus(status?: string | null): ExternalPlatformMappingStatus {
  return status?.trim().toLowerCase() === "inactive" ? "inactive" : "active";
}

function parseNumber(value: string) {
  const normalized = normalizeNumberInput(value);
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumber(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatMoney(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }

  return value.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatHoldingNumber(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }

  return value.toLocaleString("en-AU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Never";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getProviderLabel(provider?: string | null) {
  return providerOptions.find((option) => option.value === provider)?.label ?? "Manual";
}

function getSyncModeLabel(syncMode?: string | null) {
  return syncModeOptions.find((option) => option.value === syncMode)?.label ?? "Synced";
}

function getMappingStatusLabel(status?: string | null) {
  return mappingStatusOptions.find((option) => option.value === normalizeMappingStatus(status))?.label ?? "Inactive";
}

function resolveMappingReference(mapping: ExternalPlatformMapping) {
  const parts = [
    mapping.externalClientId ? `Client ${mapping.externalClientId}` : null,
    mapping.externalAccountName?.trim() || null,
    mapping.accountDescription?.trim() || mapping.externalRef?.trim() || null,
  ].filter((part): part is string => Boolean(part));

  return parts.length ? parts.join(" · ") : "Not linked yet";
}

function resolveAccountSyncDetails(account: ClientPortfolioAccountRecord) {
  const provider = account.syncMeta?.provider?.trim() || null;
  const lastSyncedAt = account.syncMeta?.lastSyncedAt || account.syncMeta?.importedAt || null;
  const syncMode = account.syncMeta?.syncMode || null;

  return {
    providerLabel: provider ? getProviderLabel(provider) : null,
    ownershipLabel: provider ? "Synced" : "Manual",
    lastSyncedAt,
    syncModeLabel: provider ? getSyncModeLabel(syncMode) : null,
  };
}

function resolveHoldingSyncDetails(holding: ClientPortfolioRecord) {
  const provider = holding.syncMeta?.provider?.trim() || null;
  const syncStatus = holding.syncMeta?.syncStatus || null;

  return {
    providerLabel: provider ? getProviderLabel(provider) : null,
    syncStatusLabel:
      syncStatus === "missing-upstream"
        ? "Missing Upstream"
        : syncStatus === "inactive"
          ? "Inactive"
          : syncStatus === "active"
            ? "Active"
            : null,
  };
}

function createEmptyMappingFormState(): PlatformMappingFormState {
  return {
    provider: "desktop-broker",
    ownerId: "",
    externalClientId: "",
    externalAccountId: "",
    externalAccountName: "",
    accountDescription: "",
    status: "active",
    syncMode: "daily-feed",
  };
}

function resolvePlatformIntegrationOwnerId(
  ownerId: string,
  profile: ClientProfile,
  ownerOptions: Array<{ id: string; name: string }>,
) {
  if (ownerId === JOINT_OWNER_ID) {
    return profile.client?.id ?? "";
  }

  if (ownerId && ownerOptions.some((option) => option.id === ownerId)) {
    return ownerId;
  }

  return profile.client?.id ?? profile.partner?.id ?? "";
}

function resolveMarketValue(holding: ClientPortfolioRecord) {
  if (holding.nativeMarketprice != null && !Number.isNaN(holding.nativeMarketprice)) {
    return holding.nativeMarketprice;
  }

  const units = holding.units ?? 0;
  const holdingValue = holding.holdingValue ?? 0;

  return units * holdingValue;
}

function resolveCostBase(holding: ClientPortfolioRecord) {
  const units = holding.units ?? 0;
  const costPrice = holding.holdingPrice ?? 0;

  return units * costPrice;
}

function resolveGainLoss(holding: ClientPortfolioRecord) {
  return resolveMarketValue(holding) - resolveCostBase(holding);
}

function mapDesktopBrokerExchange(exchange?: string | null) {
  if (!exchange?.trim()) {
    return exchangeOptions[0];
  }

  const normalized = exchange.trim().toUpperCase();

  if (normalized === "ASX") {
    return "ASX Listed";
  }

  return exchange.trim();
}

function  mapDesktopBrokerHoldingToDraft(holding: DesktopBrokerHoldingBalance): PortfolioDraftHolding | null {
  const availableQuantity = toNumber(holding.AvailableQuantity);
  const totalQuantity = toNumber(holding.HoldingQuantity);
  const resolvedUnits = availableQuantity > 0 ? availableQuantity : totalQuantity;
  const marketValueTotal = toNumber(holding.HoldingValue);

  if (resolvedUnits <= 0 || marketValueTotal <= 0) {
    return null;
  }

  const unitCost = toNumber(holding.AverageCostBase);
  const fallbackUnitValue = toNumber(holding.EntryPrice);
  const unitMarketValue = marketValueTotal > 0 ? marketValueTotal / resolvedUnits : fallbackUnitValue;

  return {
    id: `db-${holding.SecurityCode ?? "holding"}-${resolvedUnits}-${marketValueTotal}`,
    positionExchange: mapDesktopBrokerExchange(holding.SecurityExchange),
    positionDescription: holding.SecurityName?.trim() || holding.SecurityCode?.trim() || "Imported holding",
    inceptionDate: "",
    positionCode: holding.SecurityCode?.trim() || "",
    units: String(resolvedUnits),
    holdingPrice: unitCost > 0 ? unitCost.toFixed(4) : "",
    holdingValue: unitMarketValue > 0 ? unitMarketValue.toFixed(4) : "",
    nativeMarketprice: marketValueTotal.toFixed(2),
    nativeValue: marketValueTotal.toFixed(2),
    nativeCurrency: "AUD",
  };
}

export function PortfolioSection({ clientId, profile, useMockFallback = false }: PortfolioSectionProps) {
  const [accounts, setAccounts] = useState<PortfolioAccountBundle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountDescription, setAccountDescription] = useState("");
  const [positionExchange, setPositionExchange] = useState(exchangeOptions[0]);
  const [positionDescription, setPositionDescription] = useState("");
  const [inceptionDate, setInceptionDate] = useState("");
  const [positionCode, setPositionCode] = useState("");
  const [units, setUnits] = useState("");
  const [holdingPrice, setHoldingPrice] = useState("");
  const [holdingValue, setHoldingValue] = useState("");
  const [nativeCurrency, setNativeCurrency] = useState("AUD");
  const [draftHoldings, setDraftHoldings] = useState<PortfolioDraftHolding[]>([]);
  const [editingHolding, setEditingHolding] = useState<HoldingEditState | null>(null);
  const [addingHolding, setAddingHolding] = useState<HoldingAddState | null>(null);
  const [addPositionExchange, setAddPositionExchange] = useState(exchangeOptions[0]);
  const [addPositionDescription, setAddPositionDescription] = useState("");
  const [addInceptionDate, setAddInceptionDate] = useState("");
  const [addPositionCode, setAddPositionCode] = useState("");
  const [addUnits, setAddUnits] = useState("");
  const [addHoldingPrice, setAddHoldingPrice] = useState("");
  const [addHoldingValue, setAddHoldingValue] = useState("");
  const [addNativeCurrency, setAddNativeCurrency] = useState("AUD");
  const [addError, setAddError] = useState<string | null>(null);
  const [isSavingAdd, setIsSavingAdd] = useState(false);
  const [editPositionExchange, setEditPositionExchange] = useState(exchangeOptions[0]);
  const [editPositionDescription, setEditPositionDescription] = useState("");
  const [editInceptionDate, setEditInceptionDate] = useState("");
  const [editPositionCode, setEditPositionCode] = useState("");
  const [editUnits, setEditUnits] = useState("");
  const [editHoldingPrice, setEditHoldingPrice] = useState("");
  const [editHoldingValue, setEditHoldingValue] = useState("");
  const [editNativeCurrency, setEditNativeCurrency] = useState("AUD");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deleteHoldingTarget, setDeleteHoldingTarget] = useState<HoldingEditState | null>(null);
  const [deleteHoldingError, setDeleteHoldingError] = useState<string | null>(null);
  const [isDeletingHolding, setIsDeletingHolding] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [desktopBrokerClientId, setDesktopBrokerClientId] = useState("");
  const [desktopBrokerOwnerId, setDesktopBrokerOwnerId] = useState("");
  const [desktopBrokerAccountName, setDesktopBrokerAccountName] = useState("");
  const [desktopBrokerAccountDescription, setDesktopBrokerAccountDescription] = useState("");
  const [desktopBrokerPreview, setDesktopBrokerPreview] = useState<PortfolioDraftHolding[]>([]);
  const [desktopBrokerImportError, setDesktopBrokerImportError] = useState<string | null>(null);
  const [isLoadingDesktopBrokerPreview, setIsLoadingDesktopBrokerPreview] = useState(false);
  const [isImportingDesktopBroker, setIsImportingDesktopBroker] = useState(false);
  const [platformMappings, setPlatformMappings] = useState<ExternalPlatformMapping[]>([]);
  const [isLoadingPlatformMappings, setIsLoadingPlatformMappings] = useState(false);
  const [platformMappingsError, setPlatformMappingsError] = useState<string | null>(null);
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<ExternalPlatformMapping | null>(null);
  const [mappingForm, setMappingForm] = useState<PlatformMappingFormState>(createEmptyMappingFormState);
  const [mappingFormError, setMappingFormError] = useState<string | null>(null);
  const [isSavingMapping, setIsSavingMapping] = useState(false);
  const [syncingMappingId, setSyncingMappingId] = useState<string | null>(null);
  const [historyMapping, setHistoryMapping] = useState<ExternalPlatformMapping | null>(null);
  const [syncHistory, setSyncHistory] = useState<PortfolioSyncRun[]>([]);
  const [syncHistoryError, setSyncHistoryError] = useState<string | null>(null);
  const [isLoadingSyncHistory, setIsLoadingSyncHistory] = useState(false);

  const ownerOptions = useMemo(
    () => {
      const hasClientAndPartner = Boolean(profile.client?.id && profile.client?.name && profile.partner?.id && profile.partner?.name);
      const peopleOwners = [profile.client, profile.partner]
        .filter((person): person is NonNullable<typeof person> => Boolean(person?.id && person?.name))
        .map((person) => ({
          id: person.id ?? "",
          name: person.name ?? "",
        }));

      const entityOwners = (profile.entities ?? [])
        .filter((entity) => (entity.id || entity.entitiesId) && entity.name)
        .map((entity) => ({
          id: entity.id?.trim() || entity.entitiesId?.trim() || "",
          name: entity.type?.trim()
            ? `${entity.name?.trim() ?? ""} (${entity.type.trim()})`
            : entity.name?.trim() ?? "",
        }))
        .filter((entity) => entity.id && entity.name);

      return [
        ...peopleOwners,
        ...(hasClientAndPartner
          ? [
              {
                id: JOINT_OWNER_ID,
                name: "Joint",
              },
            ]
          : []),
        ...entityOwners,
      ];
    },
    [profile.client, profile.entities, profile.partner],
  );
  const calculatedMarketValue = useMemo(() => {
    const unitsValue = parseNumber(units);
    const holdingUnitValue = parseNumber(holdingValue);
    const computedValue = unitsValue * holdingUnitValue;

    return computedValue > 0 ? computedValue.toFixed(2) : "";
  }, [holdingValue, units]);

  const calculatedNativeValue = useMemo(() => calculatedMarketValue, [calculatedMarketValue]);
  const draftMarketValueTotal = useMemo(
    () =>
      draftHoldings.reduce((total, holding) => total + parseNumber(holding.nativeMarketprice), 0),
    [draftHoldings],
  );
  const editCalculatedMarketValue = useMemo(() => {
    const unitsValue = parseNumber(editUnits);
    const holdingUnitValue = parseNumber(editHoldingValue);
    const computedValue = unitsValue * holdingUnitValue;

    return computedValue > 0 ? computedValue.toFixed(2) : "";
  }, [editHoldingValue, editUnits]);
  const editCalculatedNativeValue = useMemo(() => editCalculatedMarketValue, [editCalculatedMarketValue]);
  const addCalculatedMarketValue = useMemo(() => {
    const unitsValue = parseNumber(addUnits);
    const holdingUnitValue = parseNumber(addHoldingValue);
    const computedValue = unitsValue * holdingUnitValue;

    return computedValue > 0 ? computedValue.toFixed(2) : "";
  }, [addHoldingValue, addUnits]);
  const addCalculatedNativeValue = useMemo(() => addCalculatedMarketValue, [addCalculatedMarketValue]);
  const groupedAccounts = useMemo(() => {
    const groups = new Map<
      string,
      {
        ownerLabel: string;
        bundles: PortfolioAccountBundle[];
      }
    >();

    for (const bundle of accounts) {
      const ownerLabel = bundle.account.jointAccount
        ? getJointOwnerLabel(profile)
        : bundle.account.owner?.name || "No owner selected";
      const existing = groups.get(ownerLabel);

      if (existing) {
        existing.bundles.push(bundle);
        continue;
      }

      groups.set(ownerLabel, {
        ownerLabel,
        bundles: [bundle],
      });
    }

    return Array.from(groups.values());
  }, [accounts, profile]);
  const ownerFilterOptions = useMemo(
    () => [
      { value: "all", label: "All owners" },
      ...groupedAccounts.map((group) => ({
        value: group.ownerLabel,
        label: group.ownerLabel,
      })),
    ],
    [groupedAccounts],
  );
  const filteredGroupedAccounts = useMemo(
    () =>
      ownerFilter === "all"
        ? groupedAccounts
        : groupedAccounts.filter((group) => group.ownerLabel === ownerFilter),
    [groupedAccounts, ownerFilter],
  );
  const consolidatedTotals = useMemo(
    () =>
      filteredGroupedAccounts.reduce(
        (totals, group) => {
          group.bundles.forEach(({ holdings }) => {
            holdings.forEach((holding) => {
              totals.marketValue += resolveMarketValue(holding);
              totals.costBase += resolveCostBase(holding);
              totals.gainLoss += resolveGainLoss(holding);
            });
          });

          return totals;
        },
        { marketValue: 0, costBase: 0, gainLoss: 0 },
      ),
    [filteredGroupedAccounts],
  );
  const desktopBrokerPreviewTotal = useMemo(
    () => desktopBrokerPreview.reduce((total, holding) => total + parseNumber(holding.nativeMarketprice), 0),
    [desktopBrokerPreview],
  );

  useEffect(() => {
    if (!selectedOwnerId && ownerOptions.length) {
      const defaultOwner = ownerOptions.find((option) => option.id !== JOINT_OWNER_ID) ?? ownerOptions[0];
      setSelectedOwnerId(defaultOwner.id);
    }
  }, [ownerOptions, selectedOwnerId]);

  useEffect(() => {
    if (!desktopBrokerOwnerId && ownerOptions.length) {
      const defaultOwner = ownerOptions.find((option) => option.id !== JOINT_OWNER_ID) ?? ownerOptions[0];
      setDesktopBrokerOwnerId(defaultOwner.id);
    }
  }, [desktopBrokerOwnerId, ownerOptions]);

  useEffect(() => {
    if (!isMappingModalOpen) {
      return;
    }

    if (!mappingForm.ownerId && ownerOptions.length) {
      const defaultOwner = ownerOptions.find((option) => option.id !== JOINT_OWNER_ID) ?? ownerOptions[0];
      setMappingForm((current) => ({
        ...current,
        ownerId: defaultOwner.id,
      }));
    }
  }, [isMappingModalOpen, mappingForm.ownerId, ownerOptions]);

  async function loadPortfolioData() {
    if (useMockFallback || !profile.id) {
      setAccounts([]);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const accountResponse = await fetch(`/api/client-profiles/${encodeURIComponent(profile.id)}/account`, {
        cache: "no-store",
      });

      const accountPayload = accountResponse.ok ? await accountResponse.json().catch(() => null) : await accountResponse.json().catch(() => null);
      const accountResult = parseApiResult<ClientPortfolioAccountRecord[]>(accountPayload);

      if (!accountResponse.ok) {
        throw new Error(accountResult.message || `Unable to load portfolio accounts (${accountResponse.status}).`);
      }

      const accountRecords = accountResult.data ?? [];
      const bundles = await Promise.all(
        accountRecords.map(async (account) => {
          if (!account.id) {
            return { account, holdings: [] };
          }

          const holdingsResponse = await fetch(
            `/api/client-profiles/account/${encodeURIComponent(account.id)}/portfolio`,
            { cache: "no-store" },
          );

          const holdingsPayload = holdingsResponse.ok
            ? await holdingsResponse.json().catch(() => null)
            : await holdingsResponse.json().catch(() => null);
          const holdingsResult = parseApiResult<ClientPortfolioRecord[]>(holdingsPayload);

          if (!holdingsResponse.ok) {
            throw new Error(
              holdingsResult.message || `Unable to load portfolio holdings (${holdingsResponse.status}).`,
            );
          }

          return {
            account,
            holdings: holdingsResult.data ?? [],
          };
        }),
      );

      setAccounts(bundles);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load portfolio data.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPlatformMappings() {
    if (useMockFallback || !clientId) {
      setPlatformMappings([]);
      setPlatformMappingsError(null);
      return;
    }

    setIsLoadingPlatformMappings(true);
    setPlatformMappingsError(null);

    try {
      const response = await fetch(
        `/api/PlatformIntegrations/Mapping/ClientProfile/${encodeURIComponent(clientId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => null);
      const result = parseApiResult<ExternalPlatformMapping[]>(payload);

      if (!response.ok) {
        throw new Error(result.message || `Unable to load platform mappings (${response.status}).`);
      }

      setPlatformMappings(result.data ?? []);
    } catch (error) {
      setPlatformMappings([]);
      setPlatformMappingsError(
        error instanceof Error ? error.message : "Unable to load platform mappings.",
      );
    } finally {
      setIsLoadingPlatformMappings(false);
    }
  }

  useEffect(() => {
    void loadPortfolioData();
  }, [profile.id, useMockFallback]);

  useEffect(() => {
    void loadPlatformMappings();
  }, [clientId, useMockFallback]);

  function resetHoldingDraft() {
    setPositionExchange(exchangeOptions[0]);
    setPositionDescription("");
    setInceptionDate("");
    setPositionCode("");
    setUnits("");
    setHoldingPrice("");
    setHoldingValue("");
    setNativeCurrency("AUD");
  }

  function openCreateModal() {
    setIsCreateModalOpen(true);
    setActiveStep(0);
    setSaveError(null);
    setIsSaving(false);
    setAccountName("");
    setAccountDescription("");
    setDraftHoldings([]);
    setSelectedOwnerId(ownerOptions[0]?.id ?? "");
    resetHoldingDraft();
  }

  function openImportModal() {
    setIsImportModalOpen(true);
    setDesktopBrokerImportError(null);
    setIsLoadingDesktopBrokerPreview(false);
    setIsImportingDesktopBroker(false);
    setDesktopBrokerClientId("");
    setDesktopBrokerAccountName("");
    setDesktopBrokerAccountDescription("");
    setDesktopBrokerPreview([]);
    setDesktopBrokerOwnerId((ownerOptions.find((option) => option.id !== JOINT_OWNER_ID) ?? ownerOptions[0])?.id ?? "");
  }

  function closeCreateModal() {
    if (isSaving) {
      return;
    }

    setIsCreateModalOpen(false);
    setSaveError(null);
  }

  function closeImportModal() {
    if (isLoadingDesktopBrokerPreview || isImportingDesktopBroker) {
      return;
    }

    setIsImportModalOpen(false);
    setDesktopBrokerImportError(null);
  }

  function openCreateMappingModal() {
    setEditingMapping(null);
    setMappingForm(createEmptyMappingFormState());
    setMappingFormError(null);
    setIsSavingMapping(false);
    setIsMappingModalOpen(true);
  }

  function openEditMappingModal(mapping: ExternalPlatformMapping) {
    setEditingMapping(mapping);
    setMappingForm({
      provider: mapping.provider ?? "desktop-broker",
      ownerId: mapping.owner?.id ?? (mapping.jointAccount ? JOINT_OWNER_ID : ""),
      externalClientId: mapping.externalClientId ?? "",
      externalAccountId: mapping.externalAccountId ?? "",
      externalAccountName: mapping.externalAccountName ?? "",
      accountDescription: mapping.accountDescription ?? mapping.externalRef ?? "",
      status: normalizeMappingStatus(mapping.status),
      syncMode: mapping.syncMode ?? "daily-feed",
    });
    setMappingFormError(null);
    setIsSavingMapping(false);
    setIsMappingModalOpen(true);
  }

  function closeMappingModal() {
    if (isSavingMapping) {
      return;
    }

    setIsMappingModalOpen(false);
    setEditingMapping(null);
    setMappingFormError(null);
  }

  async function savePlatformMapping() {
    if (!profile.id) {
      setMappingFormError("A live client profile is required before saving a platform mapping.");
      return;
    }

    if (!mappingForm.externalClientId.trim()) {
      setMappingFormError("External Client ID is required.");
      return;
    }

    if (!mappingForm.externalAccountId.trim()) {
      setMappingFormError("External Account ID is required.");
      return;
    }

    if (!mappingForm.externalAccountName.trim()) {
      setMappingFormError("Account Name is required.");
      return;
    }

    const ownerSelection = resolveOwnerSelection(mappingForm.ownerId);

    if (!ownerSelection) {
      setMappingFormError("Select an owner for the platform mapping.");
      return;
    }

    setIsSavingMapping(true);
    setMappingFormError(null);

    try {
      const normalizedStatus = normalizeMappingStatus(mappingForm.status);
      const isEditing = Boolean(editingMapping?.id);
      if (isEditing) {
        const response = await fetch(
          `/api/client-profiles/${encodeURIComponent(profile.id)}/platform-mappings/${encodeURIComponent(editingMapping?.id ?? "")}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              request: {
                provider: mappingForm.provider,
                owner: ownerSelection.owner,
                jointAccount: ownerSelection.jointAccount,
                externalClientId: mappingForm.externalClientId.trim(),
                externalAccountId: mappingForm.externalAccountId.trim() || null,
                externalAccountName: mappingForm.externalAccountName.trim() || null,
                externalRef: mappingForm.accountDescription.trim() || null,
                accountDescription: mappingForm.accountDescription.trim() || null,
                status: normalizedStatus,
                syncMode: "daily-feed",
              },
            }),
          },
        );
        const payload = await response.json().catch(() => null);
        const result = parseApiResult<ExternalPlatformMapping>(payload);

        if (!response.ok) {
          throw new Error(result.message || `Unable to save the platform mapping (${response.status}).`);
        }
      } else {
        const createdAccount = await createPortfolioAccount(
          mappingForm.ownerId,
          mappingForm.externalAccountName,
          mappingForm.accountDescription,
        );
        const platformIntegrationOwnerId = resolvePlatformIntegrationOwnerId(
          mappingForm.ownerId,
          profile,
          ownerOptions,
        );

        if (!createdAccount.id) {
          throw new Error("The account was created without a valid id.");
        }

        const nowIso = new Date().toISOString();
        const integrationResponse = await fetch("/api/PlatformIntegrations/Mapping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: crypto.randomUUID(),
            clientProfileId: clientId,
            ownerId: platformIntegrationOwnerId,
            jointAccount: ownerSelection.jointAccount,
            provider: mappingForm.provider,
            accountId: createdAccount.id,
            externalClientId: mappingForm.externalClientId.trim(),
            externalAccountId: mappingForm.externalAccountId.trim(),
            externalAccountName: mappingForm.externalAccountName.trim(),
            status: normalizedStatus,
            linkedAt: nowIso,
            lastSyncedAt: "",
            createdDate: nowIso,
            modifiedDate: nowIso,
          }),
        });
        const integrationPayload = await integrationResponse.json().catch(() => null);
        const integrationResult = parseApiResult<ExternalPlatformMapping>(integrationPayload);

        if (!integrationResponse.ok) {
          throw new Error(
            integrationResult.message || `Unable to create the platform integration (${integrationResponse.status}).`,
          );
        }
      }

      await Promise.all([loadPlatformMappings(), loadPortfolioData()]);
      setIsMappingModalOpen(false);
      setEditingMapping(null);
    } catch (error) {
      setMappingFormError(error instanceof Error ? error.message : "Unable to save the platform mapping.");
    } finally {
      setIsSavingMapping(false);
    }
  }

  async function syncPlatformMapping(mapping: ExternalPlatformMapping) {
    if (!mapping.id) {
      return;
    }

    setSyncingMappingId(mapping.id);
    setPlatformMappingsError(null);

    try {
      const response = await fetch("/api/PlatformIntegrations/Mapping/Sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: mapping.id,
        }),
      });
      const payload = await response.json().catch(() => null);
      const result = parseApiResult<unknown>(payload);

      if (!response.ok) {
        throw new Error(result.message || `Unable to sync mapping (${response.status}).`);
      }

      await Promise.all([loadPlatformMappings(), loadPortfolioData()]);
    } catch (error) {
      setPlatformMappingsError(error instanceof Error ? error.message : "Unable to sync platform mapping.");
    } finally {
      setSyncingMappingId(null);
    }
  }

  async function disconnectPlatformMapping(mapping: ExternalPlatformMapping) {
    if (!mapping.id) {
      return;
    }

    const confirmed = window.confirm(
      `Disconnect ${getProviderLabel(mapping.provider)} from this client? Existing synced holdings will remain visible until the backend reconciliation updates them.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        `/api/PlatformIntegrations/Mapping/${encodeURIComponent(mapping.id)}`,
        {
          method: "DELETE",
        },
      );
      const payload = await response.json().catch(() => null);
      const result = parseApiResult<boolean>(payload);

      if (!response.ok) {
        throw new Error(result.message || `Unable to disconnect mapping (${response.status}).`);
      }

      await Promise.all([loadPlatformMappings(), loadPortfolioData()]);
    } catch (error) {
      setPlatformMappingsError(error instanceof Error ? error.message : "Unable to disconnect platform mapping.");
    }
  }

  async function openSyncHistory(mapping: ExternalPlatformMapping) {
    if (!mapping.id) {
      return;
    }

    setHistoryMapping(mapping);
    setIsLoadingSyncHistory(true);
    setSyncHistoryError(null);
    setSyncHistory([]);

    try {
      const response = await fetch(
        `/api/PlatformIntegrations/Mapping/${encodeURIComponent(mapping.id)}/PortfolioSyncRun`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => null);
      const result = parseApiResult<PortfolioSyncRun[]>(payload);

      if (!response.ok) {
        throw new Error(result.message || `Unable to load sync history (${response.status}).`);
      }

      setSyncHistory(result.data ?? []);
    } catch (error) {
      setSyncHistoryError(error instanceof Error ? error.message : "Unable to load sync history.");
    } finally {
      setIsLoadingSyncHistory(false);
    }
  }

  function closeSyncHistory() {
    setHistoryMapping(null);
    setSyncHistory([]);
    setSyncHistoryError(null);
    setIsLoadingSyncHistory(false);
  }

  function resolveOwnerSelection(ownerId: string) {
    const jointSelected = ownerId === JOINT_OWNER_ID;

    if (jointSelected && profile.client?.id && profile.client?.name) {
      return {
        owner: { id: profile.client.id, name: profile.client.name },
        jointAccount: true,
      };
    }

    const owner = ownerOptions.find((option) => option.id === ownerId);

    return owner
      ? {
          owner: { id: owner.id, name: owner.name },
          jointAccount: false,
        }
      : null;
  }

  async function createPortfolioAccount(
    ownerId: string,
    nextAccountName: string,
    nextAccountDescription: string,
  ) {
    if (!profile.id) {
      throw new Error("A live client profile is required before creating a portfolio.");
    }

    const ownerSelection = resolveOwnerSelection(ownerId);

    if (!ownerSelection) {
      throw new Error("Select the portfolio owner before saving.");
    }

    const accountResponse = await fetch(`/api/client-profiles/${encodeURIComponent(profile.id)}/account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request: {
          accountName: nextAccountName.trim(),
          accountDescription: nextAccountDescription.trim(),
          owner: ownerSelection.owner,
          jointAccount: ownerSelection.jointAccount,
          practice: profile.practice ?? "",
          licensee: profile.licensee ?? "",
          clientId: profile.id,
        },
      }),
    });

    const accountPayload = await accountResponse.json().catch(() => null);
    const accountResult = parseApiResult<ClientPortfolioAccountRecord>(accountPayload);

    if (!accountResponse.ok || !accountResult.data?.id) {
      throw new Error(accountResult.message || `Unable to create the portfolio account (${accountResponse.status}).`);
    }

    return accountResult.data;
  }

  async function createAccountWithHoldings(
    ownerId: string,
    nextAccountName: string,
    nextAccountDescription: string,
    holdings: PortfolioDraftHolding[],
  ) {
    const accountResultData = await createPortfolioAccount(ownerId, nextAccountName, nextAccountDescription);

    for (const draftHolding of holdings) {
      const holdingResponse = await fetch(
        `/api/client-profiles/account/${encodeURIComponent(accountResultData.id ?? "")}/portfolio`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request: {
              account: {
                id: accountResultData.id,
                accountName: accountResultData.accountName ?? nextAccountName.trim(),
                accountDescription: accountResultData.accountDescription ?? nextAccountDescription.trim(),
              },
              licenseeName: profile.licensee ?? "",
              practiceName: profile.practice ?? "",
              positionExchange: draftHolding.positionExchange,
              positionDescription: draftHolding.positionDescription,
              inceptionDate: draftHolding.inceptionDate || null,
              positionCode: draftHolding.positionCode,
              units: Number(draftHolding.units || 0),
              holdingPrice: Number(draftHolding.holdingPrice || 0),
              holdingValue: Number(draftHolding.holdingValue || 0),
              nativeMarketprice: Number(draftHolding.nativeMarketprice || 0),
              nativeValue: Number(draftHolding.nativeValue || 0),
              nativeCurrency: draftHolding.nativeCurrency,
              valueCurrency: draftHolding.nativeCurrency,
            },
          }),
        },
      );

      const holdingPayload = await holdingResponse.json().catch(() => null);
      const holdingResult = parseApiResult<ClientPortfolioRecord>(holdingPayload);

      if (!holdingResponse.ok) {
        throw new Error(
          holdingResult.message || `Account created, but a holding could not be saved (${holdingResponse.status}).`,
        );
      }
    }

    return accountResultData;
  }

  function addHoldingToDraft() {
    if (!positionDescription.trim() || !units.trim()) {
      setSaveError("Add at least a position description and units for each holding.");
      return;
    }

    setDraftHoldings((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        positionExchange,
        positionDescription: positionDescription.trim(),
        inceptionDate,
        positionCode: positionCode.trim(),
        units: normalizeNumberInput(units),
        holdingPrice: normalizeCurrencyInput(holdingPrice),
        holdingValue: normalizeCurrencyInput(holdingValue),
        nativeMarketprice: calculatedMarketValue,
        nativeValue: calculatedNativeValue,
        nativeCurrency: nativeCurrency.trim().toUpperCase() || "AUD",
      },
    ]);

    setSaveError(null);
    resetHoldingDraft();
  }

  function removeDraftHolding(draftId: string) {
    setDraftHoldings((current) => current.filter((holding) => holding.id !== draftId));
  }

  function openEditHolding(account: ClientPortfolioAccountRecord, holding: ClientPortfolioRecord) {
    setEditPositionExchange(holding.positionExchange || exchangeOptions[0]);
    setEditPositionDescription(holding.positionDescription || "");
    setEditInceptionDate(holding.inceptionDate?.slice(0, 10) || "");
    setEditPositionCode(holding.positionCode || "");
    setEditUnits(String(holding.units ?? ""));
    setEditHoldingPrice(String(holding.holdingPrice ?? ""));
    setEditHoldingValue(String(holding.holdingValue ?? ""));
    setEditNativeCurrency(holding.nativeCurrency || holding.valueCurrency || "AUD");
    setEditError(null);
    setIsSavingEdit(false);
    setEditingHolding({ account, holding });
  }

  function openAddHolding(account: ClientPortfolioAccountRecord) {
    setAddPositionExchange(exchangeOptions[0]);
    setAddPositionDescription("");
    setAddInceptionDate("");
    setAddPositionCode("");
    setAddUnits("");
    setAddHoldingPrice("");
    setAddHoldingValue("");
    setAddNativeCurrency("AUD");
    setAddError(null);
    setIsSavingAdd(false);
    setAddingHolding({ account });
  }

  function closeAddHolding() {
    if (isSavingAdd) {
      return;
    }

    setAddingHolding(null);
    setAddError(null);
  }

  function closeEditHolding() {
    if (isSavingEdit) {
      return;
    }

    setEditingHolding(null);
    setEditError(null);
  }

  async function saveNewHolding() {
    if (!addingHolding?.account.id) {
      setAddError("The selected account could not be resolved for saving.");
      return;
    }

    if (!addPositionDescription.trim() || !addUnits.trim()) {
      setAddError("Description and units are required.");
      return;
    }

    setIsSavingAdd(true);
    setAddError(null);

    try {
      const response = await fetch(
        `/api/client-profiles/account/${encodeURIComponent(addingHolding.account.id)}/portfolio`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request: {
              account: {
                id: addingHolding.account.id,
                accountName: addingHolding.account.accountName ?? "",
                accountDescription: addingHolding.account.accountDescription ?? "",
              },
              licenseeName: profile.licensee ?? "",
              practiceName: profile.practice ?? "",
              positionExchange: addPositionExchange,
              positionDescription: addPositionDescription.trim(),
              inceptionDate: addInceptionDate || null,
              positionCode: addPositionCode.trim(),
              units: Number(normalizeNumberInput(addUnits) || 0),
              holdingPrice: Number(normalizeCurrencyInput(addHoldingPrice) || 0),
              holdingValue: Number(normalizeCurrencyInput(addHoldingValue) || 0),
              nativeMarketprice: Number(addCalculatedMarketValue || 0),
              nativeValue: Number(addCalculatedNativeValue || 0),
              nativeCurrency: addNativeCurrency.trim().toUpperCase() || "AUD",
              valueCurrency: addNativeCurrency.trim().toUpperCase() || "AUD",
            },
          }),
        },
      );

      const payload = await response.json().catch(() => null);
      const result = parseApiResult<ClientPortfolioRecord>(payload);

      if (!response.ok) {
        throw new Error(result.message || `Unable to add the holding (${response.status}).`);
      }

      await loadPortfolioData();
      setAddingHolding(null);
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "Unable to add the holding.");
    } finally {
      setIsSavingAdd(false);
    }
  }

  async function saveHoldingEdit() {
    if (!editingHolding?.holding.id || !editingHolding.account.id) {
      setEditError("The selected holding could not be resolved for saving.");
      return;
    }

    if (!editPositionDescription.trim() || !editUnits.trim()) {
      setEditError("Description and units are required.");
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);

    try {
      const response = await fetch(
        `/api/client-profiles/account/${encodeURIComponent(editingHolding.account.id)}/portfolio/${encodeURIComponent(editingHolding.holding.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request: {
              id: editingHolding.holding.id,
              account: {
                id: editingHolding.account.id,
                accountName: editingHolding.account.accountName ?? "",
                accountDescription: editingHolding.account.accountDescription ?? "",
              },
              licenseeName: editingHolding.holding.licenseeName ?? profile.licensee ?? "",
              practiceName: editingHolding.holding.practiceName ?? profile.practice ?? "",
              positionExchange: editPositionExchange,
              positionDescription: editPositionDescription.trim(),
              inceptionDate: editInceptionDate || null,
              positionCode: editPositionCode.trim(),
              units: Number(normalizeNumberInput(editUnits) || 0),
              holdingPrice: Number(normalizeCurrencyInput(editHoldingPrice) || 0),
              holdingValue: Number(normalizeCurrencyInput(editHoldingValue) || 0),
              nativeMarketprice: Number(editCalculatedMarketValue || 0),
              nativeValue: Number(editCalculatedNativeValue || 0),
              nativeCurrency: editNativeCurrency.trim().toUpperCase() || "AUD",
              valueCurrency: editNativeCurrency.trim().toUpperCase() || "AUD",
            },
          }),
        },
      );

      const payload = await response.json().catch(() => null);
      const result = parseApiResult<boolean>(payload);

      if (!response.ok) {
        throw new Error(result.message || `Unable to update the holding (${response.status}).`);
      }

      await loadPortfolioData();
      setEditingHolding(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Unable to update the holding.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  function openDeleteHolding(account: ClientPortfolioAccountRecord, holding: ClientPortfolioRecord) {
    setDeleteHoldingError(null);
    setIsDeletingHolding(false);
    setDeleteHoldingTarget({ account, holding });
  }

  function closeDeleteHolding() {
    if (isDeletingHolding) {
      return;
    }

    setDeleteHoldingTarget(null);
    setDeleteHoldingError(null);
  }

  async function confirmDeleteHolding() {
    if (!deleteHoldingTarget?.holding.id || !deleteHoldingTarget.account.id) {
      setDeleteHoldingError("The selected holding could not be resolved for deletion.");
      return;
    }

    setIsDeletingHolding(true);
    setDeleteHoldingError(null);

    try {
      const response = await fetch(
        `/api/client-profiles/account/${encodeURIComponent(deleteHoldingTarget.account.id)}/portfolio/${encodeURIComponent(deleteHoldingTarget.holding.id)}`,
        {
          method: "DELETE",
        },
      );

      const payload = await response.json().catch(() => null);
      const result = parseApiResult<boolean>(payload);

      if (!response.ok) {
        throw new Error(result.message || `Unable to delete the holding (${response.status}).`);
      }

      await loadPortfolioData();
      setDeleteHoldingTarget(null);
    } catch (error) {
      setDeleteHoldingError(error instanceof Error ? error.message : "Unable to delete the holding.");
    } finally {
      setIsDeletingHolding(false);
    }
  }

  async function savePortfolioWorkflow() {
    if (!accountName.trim()) {
      setSaveError("Enter the account name before saving.");
      return;
    }

    if (!draftHoldings.length) {
      setSaveError("Add at least one underlying holding before saving the portfolio.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      await createAccountWithHoldings(selectedOwnerId, accountName, accountDescription, draftHoldings);
      await loadPortfolioData();
      setIsCreateModalOpen(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save the portfolio workflow.");
    } finally {
      setIsSaving(false);
    }
  }

  async function loadDesktopBrokerPreview() {
    if (!desktopBrokerClientId.trim()) {
      setDesktopBrokerImportError("Enter the Desktop Broker client id before loading holdings.");
      return;
    }

    setIsLoadingDesktopBrokerPreview(true);
    setDesktopBrokerImportError(null);

    try {
      const response = await fetch(
        `/api/integrations/desktop-broker/holdings?clientId=${encodeURIComponent(desktopBrokerClientId.trim())}`,
        {
          cache: "no-store",
        },
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const result = parseApiResult<unknown>(payload);
        throw new Error(result.message || `Unable to load Desktop Broker holdings (${response.status}).`);
      }

      const rawItems = Array.isArray(payload) ? (payload as DesktopBrokerHoldingsPayload[]) : [];
      const mappedHoldings =
        rawItems
          .flatMap((item) => item.HoldingBalances ?? [])
          .map(mapDesktopBrokerHoldingToDraft)
          .filter((holding): holding is PortfolioDraftHolding => Boolean(holding)) ?? [];

      if (!mappedHoldings.length) {
        throw new Error("No live positive Desktop Broker holdings were found for that client id.");
      }

      setDesktopBrokerPreview(mappedHoldings);
      if (!desktopBrokerAccountName.trim()) {
        setDesktopBrokerAccountName("Desktop Broker Import");
      }
    } catch (error) {
      setDesktopBrokerPreview([]);
      setDesktopBrokerImportError(
        error instanceof Error ? error.message : "Unable to load Desktop Broker holdings.",
      );
    } finally {
      setIsLoadingDesktopBrokerPreview(false);
    }
  }

  async function saveDesktopBrokerImport() {
    if (!desktopBrokerAccountName.trim()) {
      setDesktopBrokerImportError("Enter the account name before importing holdings.");
      return;
    }

    if (!desktopBrokerPreview.length) {
      setDesktopBrokerImportError("Load and preview the Desktop Broker holdings before importing.");
      return;
    }

    setIsImportingDesktopBroker(true);
    setDesktopBrokerImportError(null);

    try {
      await createAccountWithHoldings(
        desktopBrokerOwnerId,
        desktopBrokerAccountName,
        desktopBrokerAccountDescription,
        desktopBrokerPreview,
      );
      await loadPortfolioData();
      setIsImportModalOpen(false);
    } catch (error) {
      setDesktopBrokerImportError(
        error instanceof Error ? error.message : "Unable to import Desktop Broker holdings.",
      );
    } finally {
      setIsImportingDesktopBroker(false);
    }
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <div className={styles.portfolioHeaderLeft}>
          <h1 className={styles.title}>Portfolio</h1>
          {ownerFilterOptions.length > 1 ? (
            <label className={styles.portfolioOwnerFilter}>
              <span className={styles.srOnly}>Filter portfolio accounts by owner</span>
              <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                {ownerFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className={styles.sectionHeaderActions}>
          <button type="button" className={styles.modalSecondary} onClick={openCreateMappingModal}>
            New Mapping
          </button>
          <button type="button" hidden aria-hidden="true" tabIndex={-1} onClick={openImportModal}>
            Import Desktop Broker
          </button>
          <button type="button" className={styles.plusButton} aria-label="Add portfolio item" onClick={openCreateModal}>
            +
          </button>
        </div>
      </div>

      <section className={styles.platformMappingsSection}>
        <div className={styles.platformMappingsHeader}>
          <div>
            <h2 className={styles.platformMappingsTitle}>Platform Mappings</h2>
            <p className={styles.platformMappingsIntro}>
              Manage external portfolio feeds for this client and trigger syncs from the same reusable mapping model.
            </p>
          </div>
          <button type="button" className={styles.modalSecondary} onClick={openCreateMappingModal}>
            Add mapping
          </button>
        </div>

        {platformMappingsError ? <p className={styles.dataNotice}>{platformMappingsError}</p> : null}

        {isLoadingPlatformMappings ? (
          <div className={styles.emptyStateCard}>Loading platform mappings...</div>
        ) : platformMappings.length ? (
          <>
            <div className={styles.platformMappingsTable}>
              <div className={styles.platformMappingsTableHeader}>
                <div>Provider</div>
                <div>External Ref</div>
                <div>Status</div>
                <div>Sync Mode</div>
                <div>Last Sync</div>
                <div>Actions</div>
              </div>

              {platformMappings.map((mapping) => {
                const isSyncing = syncingMappingId === mapping.id;

                return (
                  <div key={mapping.id ?? `${mapping.provider}-${resolveMappingReference(mapping)}`} className={styles.platformMappingRow}>
                    <div>
                      <span className={styles.providerBadge}>{getProviderLabel(mapping.provider)}</span>
                    </div>
                    <div className={styles.platformMappingRefCell}>{resolveMappingReference(mapping)}</div>
                      <div>
                        <span className={`${styles.statusChip} ${normalizeMappingStatus(mapping.status) === "active" ? styles.statusChipActive : styles.statusChipMuted}`}>
                          {getMappingStatusLabel(mapping.status)}
                        </span>
                      </div>
                    <div>
                      <span className={`${styles.statusChip} ${styles.statusChipOutline}`}>{getSyncModeLabel(mapping.syncMode)}</span>
                    </div>
                    <div className={styles.platformMappingTimestamp}>{formatDateTime(mapping.lastSyncedAt)}</div>
                    <div className={styles.platformMappingActions}>
                      <button
                        type="button"
                        className={styles.rowActionButton}
                        onClick={() => void syncPlatformMapping(mapping)}
                        disabled={isSyncing || !mapping.id}
                      >
                        {isSyncing ? "Syncing..." : "Sync now"}
                      </button>
                      <button type="button" className={styles.rowActionButton} onClick={() => openEditMappingModal(mapping)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.rowActionButton}
                        onClick={() => void openSyncHistory(mapping)}
                        disabled={!mapping.id}
                      >
                        History
                      </button>
                      <button
                        type="button"
                        className={`${styles.rowActionButton} ${styles.rowActionDanger}`}
                        onClick={() => void disconnectPlatformMapping(mapping)}
                        disabled={!mapping.id}
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.platformMappingsMobileList}>
              {platformMappings.map((mapping) => {
                const isSyncing = syncingMappingId === mapping.id;

                return (
                  <article key={`mobile-${mapping.id ?? resolveMappingReference(mapping)}`} className={styles.platformMappingCard}>
                    <div className={styles.platformMappingCardHeader}>
                      <h3 className={styles.platformMappingCardTitle}>{getProviderLabel(mapping.provider)}</h3>
                        <div className={styles.platformMappingCardBadges}>
                          <span className={`${styles.statusChip} ${normalizeMappingStatus(mapping.status) === "active" ? styles.statusChipActive : styles.statusChipMuted}`}>
                            {getMappingStatusLabel(mapping.status)}
                          </span>
                        <span className={`${styles.statusChip} ${styles.statusChipOutline}`}>{getSyncModeLabel(mapping.syncMode)}</span>
                      </div>
                    </div>
                    <p className={styles.platformMappingCardRef}>{resolveMappingReference(mapping)}</p>
                    <p className={styles.platformMappingCardMeta}>Last sync: {formatDateTime(mapping.lastSyncedAt)}</p>
                    <div className={styles.platformMappingCardActions}>
                      <button
                        type="button"
                        className={styles.rowActionButton}
                        onClick={() => void syncPlatformMapping(mapping)}
                        disabled={isSyncing || !mapping.id}
                      >
                        {isSyncing ? "Syncing..." : "Sync now"}
                      </button>
                      <button type="button" className={styles.rowActionButton} onClick={() => openEditMappingModal(mapping)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.rowActionButton}
                        onClick={() => void openSyncHistory(mapping)}
                        disabled={!mapping.id}
                      >
                        History
                      </button>
                      <button
                        type="button"
                        className={`${styles.rowActionButton} ${styles.rowActionDanger}`}
                        onClick={() => void disconnectPlatformMapping(mapping)}
                        disabled={!mapping.id}
                      >
                        Disconnect
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <div className={styles.emptyStateCard}>
            No platform mappings linked yet. Add a mapping when you are ready to connect a provider-owned portfolio feed.
          </div>
        )}
      </section>

      <section className={styles.entitiesSection}>
        {loadError ? <p className={styles.dataNotice}>{loadError}</p> : null}
        {isLoading ? (
          <div className={styles.emptyStateCard}>Loading portfolio accounts...</div>
        ) : accounts.length ? (
          <div className={styles.portfolioList}>
            <div className={styles.portfolioTableHeader}>
              <div>Exchange</div>
              <div>Code</div>
              <div>Description</div>
              <div>Units</div>
              <div>Currency</div>
              <div>Holding Value</div>
              <div>Market Value</div>
              <div>Cost Base</div>
              <div>Gain/Loss</div>
              <div className={styles.portfolioHeaderActions}>
                <span
                  className={`${styles.portfolioActionButton} ${styles.portfolioHeaderButton} ${styles.portfolioActionSpacer}`}
                  aria-hidden="true"
                >
                  +
                </span>
                <span
                  className={`${styles.portfolioActionButton} ${styles.portfolioHeaderButton} ${styles.portfolioActionSpacer}`}
                  aria-hidden="true"
                >
                  +
                </span>
              </div>
            </div>

            {filteredGroupedAccounts.map((group) => (
              <section key={group.ownerLabel} className={styles.portfolioOwnerGroup}>
                <h2 className={styles.portfolioOwnerTitle}>{group.ownerLabel}</h2>

                {group.bundles.map(({ account, holdings }) => {
                  const subtotal = holdings.reduce(
                    (totals, holding) => {
                      totals.marketValue += resolveMarketValue(holding);
                      totals.costBase += resolveCostBase(holding);
                      totals.gainLoss += resolveGainLoss(holding);
                      return totals;
                    },
                    { marketValue: 0, costBase: 0, gainLoss: 0 },
                  );
                  const accountSyncDetails = resolveAccountSyncDetails(account);

                  return (
                    <article key={account.id ?? account.accountName} className={styles.portfolioGroup}>
                      <div className={styles.portfolioGroupHeader}>
                        <div className={styles.portfolioAccountHeaderBlock}>
                          <h3 className={styles.portfolioAccountTitle}>{account.accountName || "Untitled account"}</h3>
                          <div className={styles.portfolioAccountBadges}>
                            {accountSyncDetails.providerLabel ? (
                              <span className={styles.providerBadge}>{accountSyncDetails.providerLabel}</span>
                            ) : null}
                            <span
                              className={`${styles.statusChip} ${
                                accountSyncDetails.ownershipLabel === "Synced" ? styles.statusChipActive : styles.statusChipMuted
                              }`}
                            >
                              {accountSyncDetails.ownershipLabel}
                            </span>
                            {accountSyncDetails.syncModeLabel ? (
                              <span className={`${styles.statusChip} ${styles.statusChipOutline}`}>
                                {accountSyncDetails.syncModeLabel}
                              </span>
                            ) : null}
                          </div>
                          <p className={styles.portfolioAccountSubmeta}>
                            {accountSyncDetails.lastSyncedAt
                              ? `Last synced ${formatDateTime(accountSyncDetails.lastSyncedAt)}`
                              : "Managed manually in iC2"}
                          </p>
                        </div>
                        <div className={styles.portfolioGroupHeaderRight}>
                          <div className={styles.portfolioAccountMeta}>
                            {holdings.length} holding{holdings.length === 1 ? "" : "s"}
                          </div>
                          <button
                            type="button"
                            className={`${styles.portfolioActionButton} ${styles.portfolioHeaderButton}`}
                            onClick={() => openAddHolding(account)}
                            aria-label={`Add holding to ${account.accountName || "portfolio"}`}
                            title="Add holding"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {holdings.length ? (
                        <>
                          {holdings.map((holding) => {
                            const holdingSyncDetails = resolveHoldingSyncDetails(holding);

                            return (
                              <div key={holding.id ?? `${holding.positionCode}-${holding.positionDescription}`} className={styles.portfolioHoldingWrap}>
                            <div className={styles.portfolioRow}>
                              <div>{holding.positionExchange || "—"}</div>
                              <div>{holding.positionCode || "—"}</div>
                              <div className={styles.portfolioDescriptionCell}>
                                <div>{holding.positionDescription || "—"}</div>
                                {holdingSyncDetails.providerLabel || holdingSyncDetails.syncStatusLabel ? (
                                  <div className={styles.portfolioHoldingBadges}>
                                    {holdingSyncDetails.providerLabel ? (
                                      <span className={styles.providerBadge}>{holdingSyncDetails.providerLabel}</span>
                                    ) : null}
                                    {holdingSyncDetails.syncStatusLabel ? (
                                      <span className={`${styles.statusChip} ${styles.statusChipOutline}`}>
                                        {holdingSyncDetails.syncStatusLabel}
                                      </span>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                              <div>{formatHoldingNumber(holding.units ?? null)}</div>
                              <div>{holding.nativeCurrency || holding.valueCurrency || "AUD"}</div>
                              <div>{formatMoney(holding.holdingValue ?? null)}</div>
                              <div>{formatMoney(resolveMarketValue(holding))}</div>
                              <div>{formatMoney(resolveCostBase(holding))}</div>
                              <div className={resolveGainLoss(holding) < 0 ? styles.negativeValue : undefined}>
                                {formatMoney(resolveGainLoss(holding))}
                              </div>
                              <div className={styles.portfolioRowActions}>
                                <button
                                  type="button"
                                  className={styles.portfolioActionButton}
                                  onClick={() => openEditHolding(account, holding)}
                                  aria-label={`Edit ${holding.positionDescription || "holding"}`}
                                  title="Edit holding"
                                >
                                  ✎
                                </button>
                                <button
                                  type="button"
                                  className={styles.portfolioActionButton}
                                  onClick={() => openDeleteHolding(account, holding)}
                                  aria-label={`Delete ${holding.positionDescription || "holding"}`}
                                  title="Delete holding"
                                >
                                  🗑
                                </button>
                              </div>
                            </div>
                                <article className={styles.portfolioHoldingCard}>
                                  <div className={styles.portfolioHoldingCardHeader}>
                                    <div>
                                      <h4 className={styles.portfolioHoldingCardTitle}>{holding.positionDescription || "Unnamed holding"}</h4>
                                      <p className={styles.portfolioHoldingCardCode}>
                                        {holding.positionCode || "—"} · {holding.positionExchange || "—"}
                                      </p>
                                    </div>
                                    <div className={styles.portfolioHoldingBadges}>
                                      {holdingSyncDetails.providerLabel ? (
                                        <span className={styles.providerBadge}>{holdingSyncDetails.providerLabel}</span>
                                      ) : null}
                                      {holdingSyncDetails.syncStatusLabel ? (
                                        <span className={`${styles.statusChip} ${styles.statusChipOutline}`}>
                                          {holdingSyncDetails.syncStatusLabel}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className={styles.portfolioHoldingCardGrid}>
                                    <div>
                                      <span className={styles.portfolioHoldingLabel}>Units</span>
                                      <span className={styles.portfolioHoldingValue}>{formatHoldingNumber(holding.units ?? null)}</span>
                                    </div>
                                    <div>
                                      <span className={styles.portfolioHoldingLabel}>Currency</span>
                                      <span className={styles.portfolioHoldingValue}>{holding.nativeCurrency || holding.valueCurrency || "AUD"}</span>
                                    </div>
                                    <div>
                                      <span className={styles.portfolioHoldingLabel}>Holding Value</span>
                                      <span className={styles.portfolioHoldingValue}>{formatMoney(holding.holdingValue ?? null)}</span>
                                    </div>
                                    <div>
                                      <span className={styles.portfolioHoldingLabel}>Market Value</span>
                                      <span className={styles.portfolioHoldingValue}>{formatMoney(resolveMarketValue(holding))}</span>
                                    </div>
                                    <div>
                                      <span className={styles.portfolioHoldingLabel}>Cost Base</span>
                                      <span className={styles.portfolioHoldingValue}>{formatMoney(resolveCostBase(holding))}</span>
                                    </div>
                                    <div>
                                      <span className={styles.portfolioHoldingLabel}>Gain/Loss</span>
                                      <span className={`${styles.portfolioHoldingValue} ${resolveGainLoss(holding) < 0 ? styles.negativeValue : ""}`.trim()}>
                                        {formatMoney(resolveGainLoss(holding))}
                                      </span>
                                    </div>
                                  </div>
                                  <div className={styles.portfolioHoldingCardActions}>
                                    <button type="button" className={styles.rowActionButton} onClick={() => openEditHolding(account, holding)}>
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className={`${styles.rowActionButton} ${styles.rowActionDanger}`}
                                      onClick={() => openDeleteHolding(account, holding)}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </article>
                              </div>
                            );
                          })}

                          <div className={`${styles.portfolioSummaryRow} ${styles.portfolioSubtotalRow}`}>
                            <div />
                            <div />
                            <div className={styles.portfolioSummaryLabel}>Subtotal</div>
                            <div />
                            <div />
                            <div />
                            <div>{formatMoney(subtotal.marketValue)}</div>
                            <div>{formatMoney(subtotal.costBase)}</div>
                            <div className={subtotal.gainLoss < 0 ? styles.negativeValue : undefined}>
                              {formatMoney(subtotal.gainLoss)}
                            </div>
                            <div className={styles.portfolioRowActions}>
                              <span
                                className={`${styles.portfolioActionButton} ${styles.portfolioActionSpacer}`}
                                aria-hidden="true"
                              >
                                ✎
                              </span>
                              <span
                                className={`${styles.portfolioActionButton} ${styles.portfolioActionSpacer}`}
                                aria-hidden="true"
                              >
                                🗑
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className={styles.emptyStateCard}>No underlying holdings added yet for this account.</div>
                      )}
                    </article>
                  );
                })}
              </section>
            ))}

            <div className={`${styles.portfolioSummaryRow} ${styles.portfolioOverallTotalRow}`}>
              <div />
              <div />
              <div className={styles.portfolioSummaryLabel}>Total</div>
              <div />
              <div />
              <div />
              <div>{formatMoney(consolidatedTotals.marketValue)}</div>
              <div>{formatMoney(consolidatedTotals.costBase)}</div>
              <div className={consolidatedTotals.gainLoss < 0 ? styles.negativeValue : undefined}>
                {formatMoney(consolidatedTotals.gainLoss)}
              </div>
              <div className={styles.portfolioRowActions}>
                <span
                  className={`${styles.portfolioActionButton} ${styles.portfolioActionSpacer}`}
                  aria-hidden="true"
                >
                  ✎
                </span>
                <span
                  className={`${styles.portfolioActionButton} ${styles.portfolioActionSpacer}`}
                  aria-hidden="true"
                >
                  🗑
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.emptyStateCard}>
            Create a portfolio account first, then add the underlying holdings inside that account.
          </div>
        )}
      </section>

      {isMappingModalOpen ? (
        <div className={styles.modalOverlay} role="presentation" onClick={closeMappingModal}>
          <div
            className={`${styles.modalCard} ${styles.mappingModalCard}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="platform-mapping-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 id="platform-mapping-title" className={styles.modalTitle}>
                {editingMapping ? "Edit Platform Mapping" : "Add Platform Mapping"}
              </h2>
              <button type="button" className={styles.modalClose} onClick={closeMappingModal} aria-label="Close">
                ×
              </button>
            </div>

            <div className={styles.modalGrid}>
              <label className={styles.modalField}>
                <span>Provider</span>
                <select
                  value={mappingForm.provider}
                  onChange={(event) =>
                    setMappingForm((current) => ({
                      ...current,
                      provider: event.target.value as ExternalPlatformProvider,
                    }))
                  }
                >
                  {providerOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.modalField}>
                <span>Status</span>
                <select
                  value={mappingForm.status}
                  onChange={(event) =>
                    setMappingForm((current) => ({
                      ...current,
                      status: event.target.value as ExternalPlatformMappingStatus,
                    }))
                  }
                >
                  {mappingStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.modalField}>
                <span>Owner</span>
                <select
                  value={mappingForm.ownerId}
                  onChange={(event) =>
                    setMappingForm((current) => ({
                      ...current,
                      ownerId: event.target.value,
                    }))
                  }
                >
                  {ownerOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.modalField}>
                <span>External Client ID</span>
                <input
                  required
                  value={mappingForm.externalClientId}
                  onChange={(event) =>
                    setMappingForm((current) => ({
                      ...current,
                      externalClientId: event.target.value,
                    }))
                  }
                  placeholder="e.g. 105143"
                />
              </label>
              <label className={styles.modalField}>
                <span>External Account ID</span>
                <input
                  required
                  value={mappingForm.externalAccountId}
                  onChange={(event) =>
                    setMappingForm((current) => ({
                      ...current,
                      externalAccountId: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.modalField}>
                <span>Account Name</span>
                <input
                  required
                  value={mappingForm.externalAccountName}
                  onChange={(event) =>
                    setMappingForm((current) => ({
                      ...current,
                      externalAccountName: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={`${styles.modalField} ${styles.modalFieldFull}`}>
                <span>Account Description</span>
                <textarea
                  className={styles.modalTextarea}
                  value={mappingForm.accountDescription}
                  onChange={(event) =>
                    setMappingForm((current) => ({
                      ...current,
                      accountDescription: event.target.value,
                    }))
                  }
                  placeholder="Description to carry into the linked account record"
                />
              </label>
            </div>

            {mappingFormError ? <p className={styles.modalError}>{mappingFormError}</p> : null}

            <div className={styles.modalActions}>
              <button type="button" className={styles.modalSecondary} onClick={closeMappingModal} disabled={isSavingMapping}>
                Cancel
              </button>
              <button type="button" className={styles.modalPrimary} onClick={savePlatformMapping} disabled={isSavingMapping}>
                {isSavingMapping ? "Saving..." : editingMapping ? "Save changes" : "Create mapping"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyMapping ? (
        <div className={styles.modalOverlay} role="presentation" onClick={closeSyncHistory}>
          <div
            className={`${styles.modalCard} ${styles.mappingModalCard}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-history-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 id="sync-history-title" className={styles.modalTitle}>
                Sync History
              </h2>
              <button type="button" className={styles.modalClose} onClick={closeSyncHistory} aria-label="Close">
                ×
              </button>
            </div>

            <div className={styles.syncHistoryHeader}>
              <span className={styles.providerBadge}>{getProviderLabel(historyMapping.provider)}</span>
              <span className={styles.syncHistoryRef}>{resolveMappingReference(historyMapping)}</span>
            </div>

            {isLoadingSyncHistory ? (
              <div className={styles.emptyStateCard}>Loading sync history...</div>
            ) : syncHistory.length ? (
              <div className={styles.syncHistoryList}>
                {syncHistory.map((run) => (
                  <article key={run.id ?? `${run.startedAt}-${run.status}`} className={styles.syncHistoryCard}>
                    <div className={styles.syncHistoryCardHeader}>
                      <div>
                        <h3 className={styles.syncHistoryCardTitle}>{formatDateTime(run.completedAt || run.startedAt)}</h3>
                        <p className={styles.syncHistoryCardMeta}>
                          Started {formatDateTime(run.startedAt)}{run.completedAt ? ` · Completed ${formatDateTime(run.completedAt)}` : ""}
                        </p>
                      </div>
                      <span
                        className={`${styles.statusChip} ${
                          run.status === "failed"
                            ? styles.statusChipDanger
                            : run.status === "partial"
                              ? styles.statusChipWarn
                              : styles.statusChipActive
                        }`}
                      >
                        {run.status ?? "Unknown"}
                      </span>
                    </div>
                    <div className={styles.syncHistoryStats}>
                      <span>Accounts +{run.createdAccounts ?? 0} / updated {run.updatedAccounts ?? 0}</span>
                      <span>Holdings +{run.createdHoldings ?? 0} / updated {run.updatedHoldings ?? 0}</span>
                      <span>Missing {run.missingHoldings ?? 0}</span>
                    </div>
                    {run.errors?.length ? (
                      <ul className={styles.syncHistoryErrors}>
                        {run.errors.map((error, index) => (
                          <li key={`${run.id ?? "run"}-${index}`}>{error}</li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.emptyStateCard}>No sync history has been recorded for this mapping yet.</div>
            )}

            {syncHistoryError ? <p className={styles.modalError}>{syncHistoryError}</p> : null}

            <div className={styles.modalActions}>
              <button type="button" className={styles.modalSecondary} onClick={closeSyncHistory}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateModalOpen ? (
        <div className={styles.modalOverlay} role="presentation" onClick={closeCreateModal}>
          <div
            className={`${styles.modalCard} ${styles.portfolioModalCard}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-portfolio-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 id="create-portfolio-title" className={styles.modalTitle}>
                Create Portfolio
              </h2>
              <button type="button" className={styles.modalClose} onClick={closeCreateModal} aria-label="Close">
                ×
              </button>
            </div>

            <div className={`${styles.modalStepTabs} ${styles.portfolioStepTabs}`}>
              {portfolioStepLabels.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={`${styles.modalStepTab} ${index === activeStep ? styles.modalStepTabActive : ""}`}
                  onClick={() => setActiveStep(index)}
                  disabled={isSaving}
                >
                  <span className={styles.modalStepNumber}>{index + 1}</span>
                  {label}
                </button>
              ))}
            </div>

            <div className={styles.portfolioStepBody}>
              {activeStep === 0 ? (
                <div className={styles.modalGrid}>
                  <label className={styles.modalField}>
                    <span>Owner</span>
                    <select
                      value={selectedOwnerId}
                      onChange={(event) => {
                        setSelectedOwnerId(event.target.value);
                      }}
                    >
                      {ownerOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : activeStep === 1 ? (
                <div className={styles.modalGrid}>
                  <label className={styles.modalField}>
                    <span>Account Name</span>
                    <input value={accountName} onChange={(event) => setAccountName(event.target.value)} />
                  </label>
                  <label className={`${styles.modalField} ${styles.modalFieldFull}`}>
                    <span>Account Description</span>
                    <textarea
                      className={styles.modalTextarea}
                      value={accountDescription}
                      onChange={(event) => setAccountDescription(event.target.value)}
                    />
                  </label>
                </div>
              ) : (
                <>
                  <div className={styles.modalGrid}>
                    <label className={styles.modalField}>
                      <span>Position Exchange</span>
                      <select
                        value={positionExchange}
                        onChange={(event) => setPositionExchange(event.target.value)}
                      >
                        {exchangeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.modalField}>
                      <span>Position Description</span>
                      <input value={positionDescription} onChange={(event) => setPositionDescription(event.target.value)} />
                    </label>
                    <label className={styles.modalField}>
                      <span>Inception Date</span>
                      <input
                        type="date"
                        value={inceptionDate}
                        onChange={(event) => setInceptionDate(event.target.value)}
                      />
                    </label>
                    <label className={styles.modalField}>
                      <span>Position Code</span>
                      <input value={positionCode} onChange={(event) => setPositionCode(event.target.value)} />
                    </label>
                    <label className={styles.modalField}>
                      <span>Units</span>
                      <input
                        value={formatGroupedNumberInput(units)}
                        onChange={(event) => setUnits(normalizeNumberInput(event.target.value))}
                        inputMode="decimal"
                      />
                    </label>
                    <label className={styles.modalField}>
                      <span>Cost Price</span>
                      <input
                        value={formatCurrencyInput(holdingPrice)}
                        onChange={(event) => setHoldingPrice(normalizeCurrencyInput(event.target.value))}
                        inputMode="decimal"
                      />
                    </label>
                    <label className={styles.modalField}>
                      <span>Holding Value</span>
                      <input
                        value={formatCurrencyInput(holdingValue)}
                        onChange={(event) => setHoldingValue(normalizeCurrencyInput(event.target.value))}
                        inputMode="decimal"
                      />
                    </label>
                    <label className={styles.modalField}>
                      <span>Market Value</span>
                      <input
                        value={formatFixedCurrencyInput(calculatedMarketValue)}
                        readOnly
                      />
                    </label>
                    <label className={styles.modalField}>
                      <span>Native Value</span>
                      <input value={formatFixedCurrencyInput(calculatedNativeValue)} readOnly />
                    </label>
                    <label className={styles.modalField}>
                      <span>Native Currency</span>
                      <input value={nativeCurrency} onChange={(event) => setNativeCurrency(event.target.value.toUpperCase())} />
                    </label>
                  </div>

                  <div className={styles.portfolioDraftActions}>
                    <button type="button" className={styles.modalSecondary} onClick={addHoldingToDraft} disabled={isSaving}>
                      Add holding
                    </button>
                  </div>

                  {draftHoldings.length ? (
                    <div className={styles.portfolioDraftList}>
                      <div className={styles.portfolioDraftHeader}>
                        <div>Description</div>
                        <div>Code</div>
                        <div>Units</div>
                        <div>Holding Value</div>
                        <div>Market Value</div>
                        <div />
                      </div>
                      {draftHoldings.map((holding) => (
                        <div key={holding.id} className={styles.portfolioDraftRow}>
                          <div>{holding.positionDescription || "—"}</div>
                          <div>{holding.positionCode || "—"}</div>
                          <div>{formatHoldingNumber(Number(holding.units || 0))}</div>
                          <div>{formatFixedCurrencyInput(holding.holdingValue)}</div>
                          <div>{formatFixedCurrencyInput(holding.nativeMarketprice)}</div>
                          <button
                            type="button"
                            className={styles.portfolioRemoveButton}
                            onClick={() => removeDraftHolding(holding.id)}
                            aria-label={`Remove ${holding.positionDescription || "holding"}`}
                            title="Remove holding"
                          >
                            🗑
                          </button>
                        </div>
                      ))}
                      <div className={styles.portfolioDraftTotalRow}>
                        <div />
                        <div />
                        <div />
                        <div className={styles.portfolioDraftTotalLabel}>Total</div>
                        <div className={styles.portfolioDraftTotalValue}>{formatMoney(draftMarketValueTotal)}</div>
                        <div />
                      </div>
                    </div>
                  ) : (
                    <div className={styles.emptyStateCard}>Add at least one holding to complete the portfolio workflow.</div>
                  )}
                </>
              )}
            </div>

            {saveError ? <p className={styles.modalError}>{saveError}</p> : null}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalSecondary}
                onClick={() => setActiveStep((current) => Math.max(0, current - 1))}
                disabled={activeStep === 0 || isSaving}
              >
                Back
              </button>
              <button type="button" className={styles.modalSecondary} onClick={closeCreateModal} disabled={isSaving}>
                Cancel
              </button>
              {activeStep < portfolioStepLabels.length - 1 ? (
                <button
                  type="button"
                  className={styles.modalPrimary}
                  onClick={() => {
                    if (activeStep === 0 && !selectedOwnerId) {
                      setSaveError("Select the portfolio owner before continuing.");
                      return;
                    }
                    if (activeStep === 1 && !accountName.trim()) {
                      setSaveError("Enter the account name before continuing.");
                      return;
                    }
                    setSaveError(null);
                    setActiveStep((current) => current + 1);
                  }}
                >
                  Next
                </button>
              ) : (
                <button type="button" className={styles.modalPrimary} onClick={savePortfolioWorkflow} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save portfolio"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isImportModalOpen ? (
        <div className={styles.modalOverlay} role="presentation" onClick={closeImportModal}>
          <div
            className={`${styles.modalCard} ${styles.portfolioModalCard}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="desktop-broker-import-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 id="desktop-broker-import-title" className={styles.modalTitle}>
                Import Desktop Broker Holdings
              </h2>
              <button type="button" className={styles.modalClose} onClick={closeImportModal} aria-label="Close">
                ×
              </button>
            </div>

            <div className={styles.portfolioStepBody}>
              <div className={styles.modalGrid}>
                <label className={styles.modalField}>
                  <span>Desktop Broker Client ID</span>
                  <input
                    value={desktopBrokerClientId}
                    onChange={(event) => setDesktopBrokerClientId(event.target.value)}
                    placeholder="e.g. 105143"
                  />
                </label>
                <label className={styles.modalField}>
                  <span>Owner</span>
                  <select value={desktopBrokerOwnerId} onChange={(event) => setDesktopBrokerOwnerId(event.target.value)}>
                    {ownerOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.modalField}>
                  <span>Account Name</span>
                  <input
                    value={desktopBrokerAccountName}
                    onChange={(event) => setDesktopBrokerAccountName(event.target.value)}
                    placeholder="Desktop Broker Import"
                  />
                </label>
                <label className={`${styles.modalField} ${styles.modalFieldFull}`}>
                  <span>Account Description</span>
                  <textarea
                    className={styles.modalTextarea}
                    value={desktopBrokerAccountDescription}
                    onChange={(event) => setDesktopBrokerAccountDescription(event.target.value)}
                    placeholder="Optional description for the imported portfolio account"
                  />
                </label>
              </div>

              <div className={styles.portfolioDraftActions}>
                <button
                  type="button"
                  className={styles.modalSecondary}
                  onClick={loadDesktopBrokerPreview}
                  disabled={isLoadingDesktopBrokerPreview || isImportingDesktopBroker}
                >
                  {isLoadingDesktopBrokerPreview ? "Loading..." : "Load holdings"}
                </button>
              </div>

              {desktopBrokerPreview.length ? (
                <>
                  <p className={styles.portfolioImportHint}>
                    Previewing live positive holdings only before import.
                  </p>
                  <div className={`${styles.portfolioDraftList} ${styles.portfolioImportPreviewList}`}>
                    <div className={styles.portfolioDraftHeader}>
                      <div>Description</div>
                      <div>Code</div>
                      <div>Units</div>
                      <div>Holding Value</div>
                      <div>Market Value</div>
                      <div />
                    </div>
                    {desktopBrokerPreview.map((holding) => (
                      <div key={holding.id} className={styles.portfolioDraftRow}>
                        <div>{holding.positionDescription || "—"}</div>
                        <div>{holding.positionCode || "—"}</div>
                        <div>{formatHoldingNumber(Number(holding.units || 0))}</div>
                        <div>{formatFixedCurrencyInput(holding.holdingValue)}</div>
                        <div>{formatFixedCurrencyInput(holding.nativeMarketprice)}</div>
                        <div />
                      </div>
                    ))}
                    <div className={styles.portfolioDraftTotalRow}>
                      <div />
                      <div />
                      <div />
                      <div className={styles.portfolioDraftTotalLabel}>Total</div>
                      <div className={styles.portfolioDraftTotalValue}>{formatMoney(desktopBrokerPreviewTotal)}</div>
                      <div />
                    </div>
                  </div>
                </>
              ) : (
                <div className={styles.emptyStateCard}>
                  Load Desktop Broker holdings to preview the import before creating the portfolio account.
                </div>
              )}
            </div>

            {desktopBrokerImportError ? <p className={styles.modalError}>{desktopBrokerImportError}</p> : null}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalSecondary}
                onClick={closeImportModal}
                disabled={isLoadingDesktopBrokerPreview || isImportingDesktopBroker}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalPrimary}
                onClick={saveDesktopBrokerImport}
                disabled={isLoadingDesktopBrokerPreview || isImportingDesktopBroker}
              >
                {isImportingDesktopBroker ? "Importing..." : "Import holdings"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingHolding ? (
        <div className={styles.modalOverlay} role="presentation" onClick={closeEditHolding}>
          <div className={`${styles.modalCard} ${styles.portfolioModalCard}`} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Edit Holding</h2>
              <button type="button" className={styles.modalClose} onClick={closeEditHolding} aria-label="Close">
                ×
              </button>
            </div>

            <div className={styles.modalGrid}>
              <label className={styles.modalField}>
                <span>Position Exchange</span>
                <select value={editPositionExchange} onChange={(event) => setEditPositionExchange(event.target.value)}>
                  {exchangeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.modalField}>
                <span>Position Description</span>
                <input value={editPositionDescription} onChange={(event) => setEditPositionDescription(event.target.value)} />
              </label>
              <label className={styles.modalField}>
                <span>Inception Date</span>
                <input
                  type="date"
                  value={editInceptionDate}
                  onChange={(event) => setEditInceptionDate(event.target.value)}
                />
              </label>
              <label className={styles.modalField}>
                <span>Position Code</span>
                <input value={editPositionCode} onChange={(event) => setEditPositionCode(event.target.value)} />
              </label>
              <label className={styles.modalField}>
                <span>Units</span>
                <input
                  value={formatGroupedNumberInput(editUnits)}
                  onChange={(event) => setEditUnits(normalizeNumberInput(event.target.value))}
                  inputMode="decimal"
                />
              </label>
              <label className={styles.modalField}>
                <span>Cost Price</span>
                <input
                  value={formatCurrencyInput(editHoldingPrice)}
                  onChange={(event) => setEditHoldingPrice(normalizeCurrencyInput(event.target.value))}
                  inputMode="decimal"
                />
              </label>
              <label className={styles.modalField}>
                <span>Holding Value</span>
                <input
                  value={formatCurrencyInput(editHoldingValue)}
                  onChange={(event) => setEditHoldingValue(normalizeCurrencyInput(event.target.value))}
                  inputMode="decimal"
                />
              </label>
              <label className={styles.modalField}>
                <span>Market Value</span>
                <input value={formatFixedCurrencyInput(editCalculatedMarketValue)} readOnly />
              </label>
              <label className={styles.modalField}>
                <span>Native Value</span>
                <input value={formatFixedCurrencyInput(editCalculatedNativeValue)} readOnly />
              </label>
              <label className={styles.modalField}>
                <span>Native Currency</span>
                <input value={editNativeCurrency} onChange={(event) => setEditNativeCurrency(event.target.value.toUpperCase())} />
              </label>
            </div>

            {editError ? <p className={styles.modalError}>{editError}</p> : null}

            <div className={styles.modalActions}>
              <button type="button" className={styles.modalSecondary} onClick={closeEditHolding} disabled={isSavingEdit}>
                Cancel
              </button>
              <button type="button" className={styles.modalPrimary} onClick={saveHoldingEdit} disabled={isSavingEdit}>
                {isSavingEdit ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addingHolding ? (
        <div className={styles.modalOverlay} role="presentation" onClick={closeAddHolding}>
          <div className={`${styles.modalCard} ${styles.portfolioModalCard}`} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Add Holding</h2>
              <button type="button" className={styles.modalClose} onClick={closeAddHolding} aria-label="Close">
                ×
              </button>
            </div>

            <div className={styles.modalGrid}>
              <label className={styles.modalField}>
                <span>Position Exchange</span>
                <select value={addPositionExchange} onChange={(event) => setAddPositionExchange(event.target.value)}>
                  {exchangeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.modalField}>
                <span>Position Description</span>
                <input
                  type="text"
                  value={addPositionDescription}
                  onChange={(event) => setAddPositionDescription(event.target.value)}
                  placeholder="Enter holding description"
                />
              </label>

              <label className={styles.modalField}>
                <span>Inception Date</span>
                <input
                  type="date"
                  value={addInceptionDate}
                  onChange={(event) => setAddInceptionDate(event.target.value)}
                />
              </label>

              <label className={styles.modalField}>
                <span>Position Code</span>
                <input
                  type="text"
                  value={addPositionCode}
                  onChange={(event) => setAddPositionCode(event.target.value.toUpperCase())}
                  placeholder="e.g. CBA.ASX"
                />
              </label>

              <label className={styles.modalField}>
                <span>Units</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formatGroupedNumberInput(addUnits)}
                  onChange={(event) => setAddUnits(event.target.value)}
                  placeholder="e.g. 1,000"
                />
              </label>

              <label className={styles.modalField}>
                <span>Cost Price</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formatCurrencyInput(addHoldingPrice)}
                  onChange={(event) => setAddHoldingPrice(event.target.value)}
                  placeholder="$0.00"
                />
              </label>

              <label className={styles.modalField}>
                <span>Holding Value</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formatCurrencyInput(addHoldingValue)}
                  onChange={(event) => setAddHoldingValue(event.target.value)}
                  placeholder="$0.00"
                />
              </label>

              <label className={styles.modalField}>
                <span>Market Value</span>
                <input type="text" value={formatFixedCurrencyInput(addCalculatedMarketValue)} readOnly />
              </label>

              <label className={styles.modalField}>
                <span>Native Value</span>
                <input type="text" value={formatFixedCurrencyInput(addCalculatedNativeValue)} readOnly />
              </label>

              <label className={styles.modalField}>
                <span>Native Currency</span>
                <input
                  type="text"
                  value={addNativeCurrency}
                  onChange={(event) => setAddNativeCurrency(event.target.value.toUpperCase())}
                  maxLength={3}
                  placeholder="AUD"
                />
              </label>
            </div>

            {addError ? <p className={styles.modalError}>{addError}</p> : null}

            <div className={styles.modalActions}>
              <button type="button" className={styles.modalSecondary} onClick={closeAddHolding} disabled={isSavingAdd}>
                Cancel
              </button>
              <button type="button" className={styles.modalPrimary} onClick={saveNewHolding} disabled={isSavingAdd}>
                {isSavingAdd ? "Adding..." : "Add holding"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteHoldingTarget ? (
        <div className={styles.modalOverlay} role="presentation" onClick={closeDeleteHolding}>
          <div className={styles.confirmDialog} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2 className={styles.confirmTitle}>Delete holding</h2>
            <p className={styles.confirmText}>
              Are you sure you want to delete <strong>{deleteHoldingTarget.holding.positionDescription || deleteHoldingTarget.holding.positionCode || "this holding"}</strong>?
            </p>
            {deleteHoldingError ? <p className={styles.modalError}>{deleteHoldingError}</p> : null}
            <div className={styles.confirmActions}>
              <button type="button" className={styles.modalSecondary} onClick={closeDeleteHolding} disabled={isDeletingHolding}>
                Cancel
              </button>
              <button type="button" className={`${styles.modalPrimary} ${styles.confirmDanger}`} onClick={confirmDeleteHolding} disabled={isDeletingHolding}>
                {isDeletingHolding ? "Deleting..." : "Delete holding"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
