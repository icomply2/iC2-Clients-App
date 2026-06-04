"use client";

/* eslint-disable @next/next/no-img-element */

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  createAdminLicensee,
  createAdminPractice,
  deleteAdminLicenseeAssetClass,
  deleteAdminLicensee,
  deleteAdminPractice,
  getAdminLicensee,
  updateAdminLicenseeAssetClasses,
  updateAdminLicensee,
  updateAdminLicenseeRiskProfiles,
  updateAdminPractice,
} from "@/lib/api/admin";
import type { LicenseeSummary, PracticeSummary } from "@/lib/admin-data";
import type { LicenseeAssetClass, LicenseeDto, LicenseeRiskProfile } from "@/lib/api/types";
import styles from "@/app/admin/admin.module.css";

type Mode = "create" | "edit";
type LicenseeEditorTab = "information" | "riskProfiles" | "strategicAssetAllocations";

type StructureDraft = {
  name: string;
  licenseeId: string;
  abn: string;
  account: string;
  asicLicenseeNumber: string;
  b2bPay: string;
  bsb: string;
  customPrompt: boolean;
  hubDoc: string;
  licenseeAddress: string;
  licenseeLogo: string;
  licenseePostCode: string;
  licenseeState: string;
  suburb: string;
  xplanUrl: string;
};

type LicenseeTextDraftKey =
  | "abn"
  | "account"
  | "asicLicenseeNumber"
  | "bsb"
  | "licenseeAddress"
  | "licenseePostCode"
  | "licenseeState"
  | "suburb";

const licenseeTextFields: { key: LicenseeTextDraftKey; label: string; placeholder?: string }[] = [
  { key: "asicLicenseeNumber", label: "AFSL number", placeholder: "Australian Financial Services Licence number" },
  { key: "abn", label: "ABN", placeholder: "Licensee ABN" },
  { key: "licenseeAddress", label: "Street address", placeholder: "Licensee street address" },
  { key: "suburb", label: "Suburb", placeholder: "Suburb" },
  { key: "licenseeState", label: "State", placeholder: "State" },
  { key: "licenseePostCode", label: "Post code", placeholder: "Post code" },
  { key: "bsb", label: "BSB", placeholder: "Payment BSB" },
  { key: "account", label: "Account number", placeholder: "Payment account number" },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const ASSET_CLASS_CATEGORIES: LicenseeAssetClass["category"][] = ["Defensive", "Growth"];

function cleanText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function emptyDraft(): StructureDraft {
  return {
    name: "",
    licenseeId: "",
    abn: "",
    account: "",
    asicLicenseeNumber: "",
    b2bPay: "",
    bsb: "",
    customPrompt: false,
    hubDoc: "",
    licenseeAddress: "",
    licenseeLogo: "",
    licenseePostCode: "",
    licenseeState: "",
    suburb: "",
    xplanUrl: "",
  };
}

function licenseeToDraft(licensee: LicenseeDto | null | undefined, fallback?: LicenseeSummary | null): StructureDraft {
  return {
    ...emptyDraft(),
    name: cleanText(licensee?.name) || fallback?.name || "",
    abn: cleanText(licensee?.abn),
    account: cleanText(licensee?.account),
    asicLicenseeNumber: cleanText(licensee?.asicLicenseeNumber),
    b2bPay: cleanText(licensee?.b2bPay),
    bsb: cleanText(licensee?.bsb),
    customPrompt: Boolean(licensee?.customPrompt),
    hubDoc: cleanText(licensee?.hubDoc),
    licenseeAddress: cleanText(licensee?.licenseeAddress),
    licenseeLogo: cleanText(licensee?.licenseeLogo),
    licenseePostCode: cleanText(licensee?.licenseePostCode),
    licenseeState: cleanText(licensee?.licenseeState),
    suburb: cleanText(licensee?.suburb),
    xplanUrl: cleanText(licensee?.xplanUrl),
  };
}

function nullableText(value: string) {
  return value.trim() || null;
}

function nullableNumber(value: number | null | undefined) {
  return Number.isFinite(value) ? value : null;
}

function displayNumber(value: number | null | undefined) {
  return Number.isFinite(value) ? String(value) : "";
}

function readNumber(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function makeLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneAssetClasses(licensee: LicenseeDto | null | undefined): LicenseeAssetClass[] {
  return (licensee?.assetClasses ?? [])
    .map((item, index): LicenseeAssetClass => ({
      assetClassId: item.assetClassId?.trim() || null,
      name: item.name?.trim() || "",
      category: item.category === "Growth" ? "Growth" : "Defensive",
      displayOrder: item.displayOrder ?? index + 1,
      isActive: item.isActive ?? true,
    }))
    .sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0));
}

function createAssetClassDraft(order: number): LicenseeAssetClass {
  return {
    assetClassId: makeLocalId("asset-class"),
    name: "",
    category: "Defensive",
    displayOrder: order,
    isActive: true,
  };
}

function cloneRiskProfiles(licensee: LicenseeDto | null | undefined): LicenseeRiskProfile[] {
  return (licensee?.riskProfiles ?? [])
    .map((profile, index): LicenseeRiskProfile => ({
      riskProfileId: profile.riskProfileId?.trim() || makeLocalId("risk-profile"),
      riskProfileName: profile.riskProfileName?.trim() || "",
      description: profile.description ?? "",
      displayOrder: profile.displayOrder ?? index + 1,
      timeframe: {
        label: profile.timeframe?.label?.trim() || "",
        minimumYears: profile.timeframe?.minimumYears ?? null,
        maximumYears: profile.timeframe?.maximumYears ?? null,
      },
      assetAllocationSummary: {
        defensiveAssetsPercent: profile.assetAllocationSummary?.defensiveAssetsPercent ?? 0,
        growthAssetsPercent: profile.assetAllocationSummary?.growthAssetsPercent ?? 0,
      },
      strategicAssetAllocations: (profile.strategicAssetAllocations ?? []).map((allocation) => ({
        assetClassId: allocation.assetClassId,
        assetClassName: allocation.assetClassName,
        category: allocation.category === "Growth" ? "Growth" : "Defensive",
        targetPercent: allocation.targetPercent ?? 0,
        minimumPercent: allocation.minimumPercent ?? null,
        maximumPercent: allocation.maximumPercent ?? null,
      })),
      expectedReturns: {
        expectedIncomePercent: profile.expectedReturns?.expectedIncomePercent ?? 0,
        expectedGrowthPercent: profile.expectedReturns?.expectedGrowthPercent ?? 0,
        totalExpectedReturnPercent: profile.expectedReturns?.totalExpectedReturnPercent ?? 0,
        frankingPercent: profile.expectedReturns?.frankingPercent ?? 0,
      },
      negativeReturnFrequency: {
        frequencyYears: profile.negativeReturnFrequency?.frequencyYears ?? null,
        description: profile.negativeReturnFrequency?.description ?? "",
      },
      volatilityPercent: profile.volatilityPercent ?? null,
      isActive: profile.isActive ?? true,
      createdAt: profile.createdAt ?? null,
      updatedAt: profile.updatedAt ?? null,
    }))
    .sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0));
}

function createRiskProfileDraft(order: number): LicenseeRiskProfile {
  return {
    riskProfileId: makeLocalId("risk-profile"),
    riskProfileName: "",
    description: "",
    displayOrder: order,
    timeframe: {
      label: "",
      minimumYears: null,
      maximumYears: null,
    },
    assetAllocationSummary: {
      defensiveAssetsPercent: 0,
      growthAssetsPercent: 0,
    },
    strategicAssetAllocations: [],
    expectedReturns: {
      expectedIncomePercent: 0,
      expectedGrowthPercent: 0,
      totalExpectedReturnPercent: 0,
      frankingPercent: 0,
    },
    negativeReturnFrequency: {
      frequencyYears: null,
      description: "",
    },
    volatilityPercent: null,
    isActive: true,
  };
}

function isLocalId(value: string | null | undefined) {
  return Boolean(value?.startsWith("asset-class-") || value?.startsWith("risk-profile-"));
}

function buildRiskProfilePayload(profile: LicenseeRiskProfile, assetClasses: LicenseeAssetClass[]): LicenseeRiskProfile {
  const savedAssetClassIds = new Set(assetClasses.map((item) => item.assetClassId).filter((id): id is string => Boolean(id && !isLocalId(id))));
  const allocations = profile.strategicAssetAllocations
    .filter((allocation) => savedAssetClassIds.has(allocation.assetClassId))
    .map((allocation) => ({
      ...allocation,
      targetPercent: allocation.targetPercent ?? 0,
      minimumPercent: nullableNumber(allocation.minimumPercent),
      maximumPercent: nullableNumber(allocation.maximumPercent),
    }));
  const defensiveAssetsPercent = allocations
    .filter((allocation) => allocation.category === "Defensive")
    .reduce((total, allocation) => total + (allocation.targetPercent ?? 0), 0);
  const growthAssetsPercent = allocations
    .filter((allocation) => allocation.category === "Growth")
    .reduce((total, allocation) => total + (allocation.targetPercent ?? 0), 0);

  return {
    ...profile,
    riskProfileId: isLocalId(profile.riskProfileId) ? null : profile.riskProfileId ?? null,
    riskProfileName: profile.riskProfileName.trim() || "Untitled risk profile",
    description: nullableText(profile.description ?? ""),
    displayOrder: profile.displayOrder ?? 0,
    timeframe: {
      label: profile.timeframe.label.trim() || "Not specified",
      minimumYears: nullableNumber(profile.timeframe.minimumYears),
      maximumYears: nullableNumber(profile.timeframe.maximumYears),
    },
    assetAllocationSummary: {
      defensiveAssetsPercent,
      growthAssetsPercent,
    },
    strategicAssetAllocations: allocations,
    expectedReturns: {
      expectedIncomePercent: profile.expectedReturns.expectedIncomePercent ?? 0,
      expectedGrowthPercent: profile.expectedReturns.expectedGrowthPercent ?? 0,
      totalExpectedReturnPercent: profile.expectedReturns.totalExpectedReturnPercent ?? 0,
      frankingPercent: profile.expectedReturns.frankingPercent ?? 0,
    },
    negativeReturnFrequency: {
      frequencyYears: nullableNumber(profile.negativeReturnFrequency.frequencyYears),
      description: nullableText(profile.negativeReturnFrequency.description ?? ""),
    },
    volatilityPercent: nullableNumber(profile.volatilityPercent),
    isActive: profile.isActive ?? true,
  };
}

function remapRiskProfilesToSavedAssetClasses(
  profiles: LicenseeRiskProfile[],
  previousAssetClasses: LicenseeAssetClass[],
  savedAssetClasses: LicenseeAssetClass[],
) {
  const savedByPreviousId = new Map<string, LicenseeAssetClass>();

  previousAssetClasses.forEach((previous) => {
    if (!previous.assetClassId) {
      return;
    }

    const matchingSaved = savedAssetClasses.find(
      (saved) =>
        saved.name.trim().toLowerCase() === previous.name.trim().toLowerCase() &&
        saved.category === previous.category,
    );

    if (matchingSaved) {
      savedByPreviousId.set(previous.assetClassId, matchingSaved);
    }
  });

  return profiles.map((profile) => ({
    ...profile,
    strategicAssetAllocations: profile.strategicAssetAllocations.map((allocation) => {
      const savedAssetClass = savedByPreviousId.get(allocation.assetClassId);

      if (!savedAssetClass?.assetClassId) {
        return allocation;
      }

      return {
        ...allocation,
        assetClassId: savedAssetClass.assetClassId,
        assetClassName: savedAssetClass.name,
        category: savedAssetClass.category,
      };
    }),
  }));
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read file.")));
    reader.readAsDataURL(file);
  });
}

type AdminStructuresManagerProps =
  | {
      kind: "practices";
      initialItems: PracticeSummary[];
      licensees: LicenseeSummary[];
    }
  | {
      kind: "licensees";
      initialItems: LicenseeSummary[];
    };

export function AdminStructuresManager(props: AdminStructuresManagerProps) {
  const isPractice = props.kind === "practices";
  const [items, setItems] = useState(props.initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("create");
  const [draft, setDraft] = useState<StructureDraft | null>(null);
  const [licenseeEditorTab, setLicenseeEditorTab] = useState<LicenseeEditorTab>("information");
  const [assetClassesDraft, setAssetClassesDraft] = useState<LicenseeAssetClass[]>([]);
  const [riskProfilesDraft, setRiskProfilesDraft] = useState<LicenseeRiskProfile[]>([]);
  const [selectedRiskProfileId, setSelectedRiskProfileId] = useState<string>("");
  const [practiceQuery, setPracticeQuery] = useState("");
  const [selectedLicensee, setSelectedLicensee] = useState("All licensees");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedLicenseeId, setExpandedLicenseeId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const licenseeOptions = useMemo(() => {
    if (!isPractice) {
      return ["All licensees"];
    }

    const values = Array.from(
      new Set(
        items
          .map((item) => ("licenseeName" in item ? item.licenseeName?.trim() : ""))
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((left, right) => left.localeCompare(right));

    return ["All licensees", ...values];
  }, [isPractice, items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = practiceQuery.trim().toLowerCase();

    if (!isPractice) {
      return normalizedQuery ? items.filter((item) => item.name.toLowerCase().includes(normalizedQuery)) : items;
    }

    return items.filter((item) => {
      const matchesPractice = !normalizedQuery || item.name.toLowerCase().includes(normalizedQuery);
      const matchesLicensee =
        selectedLicensee === "All licensees" ||
        ("licenseeName" in item && item.licenseeName?.trim() === selectedLicensee);

      return matchesPractice && matchesLicensee;
    });
  }, [isPractice, items, practiceQuery, selectedLicensee]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const visiblePage = Math.min(currentPage, totalPages);
  const pageStartIndex = filteredItems.length ? (visiblePage - 1) * pageSize : 0;
  const pageEndIndex = Math.min(pageStartIndex + pageSize, filteredItems.length);
  const paginatedItems = filteredItems.slice(pageStartIndex, pageEndIndex);

  const editingItem = items.find((item) => item.id === editingId) ?? null;
  const selectedRiskProfile = riskProfilesDraft.find((profile) => profile.riskProfileId === selectedRiskProfileId) ?? null;

  useEffect(() => {
    setCurrentPage(1);
  }, [practiceQuery, selectedLicensee, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  function openCreate() {
    setMode("create");
    setEditingId(null);
    setSaveError(null);
    setSaveSuccess(null);
    setLicenseeEditorTab("information");
    setAssetClassesDraft([]);
    setRiskProfilesDraft([]);
    setSelectedRiskProfileId("");
    setDraft(emptyDraft());
  }

  async function openEdit(item: PracticeSummary | LicenseeSummary) {
    setMode("edit");
    setEditingId(item.id);
    setSaveError(null);
    setSaveSuccess(null);
    setLicenseeEditorTab("information");
    const summaryRecord = !isPractice && "record" in item ? item.record : null;
    const summaryRiskProfiles = cloneRiskProfiles(summaryRecord);
    setDraft(
      isPractice
        ? {
            ...emptyDraft(),
            name: item.name,
            licenseeId: "licenseeId" in item ? item.licenseeId?.trim() || "" : "",
          }
        : licenseeToDraft("record" in item ? item.record : null, item as LicenseeSummary),
    );
    setAssetClassesDraft(cloneAssetClasses(summaryRecord));
    setRiskProfilesDraft(summaryRiskProfiles);
    setSelectedRiskProfileId(summaryRiskProfiles[0]?.riskProfileId ?? "");

    if (!isPractice) {
      setIsLoadingDetails(true);

      try {
        const result = await getAdminLicensee(item.id);
        const fullRecord = result?.data ?? null;

        if (fullRecord) {
          const nextRiskProfiles = cloneRiskProfiles(fullRecord);
          setDraft(licenseeToDraft(fullRecord, item as LicenseeSummary));
          setAssetClassesDraft(cloneAssetClasses(fullRecord));
          setRiskProfilesDraft(nextRiskProfiles);
          setSelectedRiskProfileId(nextRiskProfiles[0]?.riskProfileId ?? "");
          setItems((existing) =>
            ((existing as LicenseeSummary[]).map((existingItem) =>
              existingItem.id === item.id && "practiceCount" in existingItem
                ? { ...existingItem, name: fullRecord.name?.trim() || existingItem.name, record: fullRecord }
                : existingItem,
            ) as LicenseeSummary[]),
          );
        }
      } catch (error) {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Unable to load the full licensee details. The summary details are still available.",
        );
      } finally {
        setIsLoadingDetails(false);
      }
    }
  }

  function closeEditor() {
    setEditingId(null);
    setDraft(null);
    setLicenseeEditorTab("information");
    setAssetClassesDraft([]);
    setRiskProfilesDraft([]);
    setSelectedRiskProfileId("");
    setIsSaving(false);
    setIsLoadingDetails(false);
    setSaveError(null);
  }

  async function handleLicenseeLogoUpload(file: File | null) {
    if (!draft) {
      return;
    }

    if (!file) {
      setDraft({ ...draft, licenseeLogo: "" });
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setDraft({ ...draft, licenseeLogo: dataUrl });
  }

  async function saveEntity() {
    if (!draft) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      if (isPractice) {
        const licenseeRecord = props.licensees.find((item) => item.id === draft.licenseeId) ?? null;
        const current = mode === "edit" ? (editingItem as PracticeSummary | null) : null;
        const payload = {
          ...(current?.record ?? {}),
          id: mode === "edit" ? current?.record.id ?? current?.id ?? null : null,
          name: draft.name.trim() || "Untitled practice",
          status: current?.record.status ?? current?.statusName ?? "Active",
          licensee: licenseeRecord
            ? {
                id: licenseeRecord.id,
                name: licenseeRecord.name,
              }
            : null,
        };

        const result =
          mode === "edit" && current
            ? await updateAdminPractice(current.id, payload)
            : await createAdminPractice(payload);

        const saved = result?.data ?? payload;
        const nextSummary: PracticeSummary = {
          id: saved.id?.trim() || current?.id || `practice-${Date.now()}`,
          name: saved.name?.trim() || payload.name,
          licenseeName: saved.licensee?.name?.trim() || licenseeRecord?.name || "Unassigned licensee",
          licenseeId: saved.licensee?.id?.trim() || licenseeRecord?.id || null,
          statusName: saved.status?.trim() || "Active",
          userCount: current?.userCount ?? 0,
          activeUserCount: current?.activeUserCount ?? 0,
          appAdminCount: current?.appAdminCount ?? 0,
          adviserCount: current?.adviserCount ?? 0,
          record: saved,
        };

        setItems((existing) =>
          mode === "edit" && current
            ? (existing.map((item) => (item.id === current.id ? nextSummary : item)) as PracticeSummary[])
            : ([...existing, nextSummary].sort((left, right) => left.name.localeCompare(right.name)) as PracticeSummary[]),
        );
      } else {
        const current = mode === "edit" ? (editingItem as LicenseeSummary | null) : null;
        const payload = {
          ...(current?.record ?? {}),
          id: mode === "edit" ? current?.record.id ?? current?.id ?? null : null,
          name: draft.name.trim() || "Untitled licensee",
          abn: nullableText(draft.abn),
          account: nullableText(draft.account),
          asicLicenseeNumber: nullableText(draft.asicLicenseeNumber),
          b2bPay: current?.record.b2bPay ?? null,
          bsb: nullableText(draft.bsb),
          customPrompt: draft.customPrompt,
          hubDoc: current?.record.hubDoc ?? null,
          licenseeAddress: nullableText(draft.licenseeAddress),
          licenseeLogo: nullableText(draft.licenseeLogo),
          licenseePostCode: nullableText(draft.licenseePostCode),
          licenseeState: nullableText(draft.licenseeState),
          suburb: nullableText(draft.suburb),
          xplanUrl: current?.record.xplanUrl ?? null,
        };

        const result =
          mode === "edit" && current
            ? await updateAdminLicensee(current.id, payload)
            : await createAdminLicensee(payload);

        const saved = result?.data ?? payload;
        const savedRecord = {
          ...saved,
          assetClasses: saved.assetClasses ?? current?.record.assetClasses ?? assetClassesDraft,
          riskProfiles: saved.riskProfiles ?? current?.record.riskProfiles ?? riskProfilesDraft,
        };
        const nextSummary: LicenseeSummary = {
          id: savedRecord.id?.trim() || current?.id || `licensee-${Date.now()}`,
          name: savedRecord.name?.trim() || payload.name,
          practiceCount: current?.practiceCount ?? 0,
          practices: current?.practices ?? [],
          userCount: current?.userCount ?? 0,
          activeUserCount: current?.activeUserCount ?? 0,
          appAdminCount: current?.appAdminCount ?? 0,
          record: savedRecord,
        };

        setItems((existing) =>
          mode === "edit" && current
            ? (existing.map((item) => (item.id === current.id ? nextSummary : item)) as LicenseeSummary[])
            : ([...existing, nextSummary].sort((left, right) => left.name.localeCompare(right.name)) as LicenseeSummary[]),
        );
      }

      setSaveSuccess(`${isPractice ? "Practice" : "Licensee"} saved.`);
      closeEditor();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : `Unable to save ${isPractice ? "practice" : "licensee"}.`);
      setIsSaving(false);
    }
  }

  function updateRiskProfile(profileId: string, updater: (profile: LicenseeRiskProfile) => LicenseeRiskProfile) {
    setRiskProfilesDraft((existing) =>
      existing.map((profile) => (profile.riskProfileId === profileId ? updater(profile) : profile)),
    );
  }

  async function saveAssetClasses() {
    const current = editingItem as LicenseeSummary | null;

    if (!current) {
      setSaveError("Save the licensee information before configuring asset classes.");
      return null;
    }

    const payload = assetClassesDraft
      .filter((item) => item.name.trim())
      .map((item, index) => ({
        ...item,
        assetClassId: isLocalId(item.assetClassId) ? null : item.assetClassId ?? null,
        name: item.name.trim(),
        category: item.category,
        displayOrder: item.displayOrder ?? index + 1,
        isActive: item.isActive ?? true,
      }));

    const result = await updateAdminLicenseeAssetClasses(current.id, payload);
    const savedAssetClasses = result?.data ?? payload;

    setAssetClassesDraft(savedAssetClasses);
    setItems((existing) =>
      (existing as LicenseeSummary[]).map((item) =>
        item.id === current.id ? { ...item, record: { ...item.record, assetClasses: savedAssetClasses } } : item,
      ),
    );

    return savedAssetClasses;
  }

  async function saveRiskProfiles(assetClassesForSave = assetClassesDraft, profilesForSave = riskProfilesDraft) {
    const current = editingItem as LicenseeSummary | null;

    if (!current) {
      setSaveError("Save the licensee information before configuring risk profiles.");
      return null;
    }

    const payload = profilesForSave
      .filter((profile) => profile.riskProfileName.trim())
      .map((profile) => buildRiskProfilePayload(profile, assetClassesForSave));
    const result = await updateAdminLicenseeRiskProfiles(current.id, payload);
    const savedRiskProfiles = result?.data ?? payload;
    const clonedSavedRiskProfiles = cloneRiskProfiles({ riskProfiles: savedRiskProfiles });

    setRiskProfilesDraft(clonedSavedRiskProfiles);
    setSelectedRiskProfileId((existing) => existing || clonedSavedRiskProfiles[0]?.riskProfileId || "");
    setItems((existing) =>
      (existing as LicenseeSummary[]).map((item) =>
        item.id === current.id ? { ...item, record: { ...item.record, riskProfiles: savedRiskProfiles } } : item,
      ),
    );

    return savedRiskProfiles;
  }

  async function saveRiskProfileTab() {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      await saveRiskProfiles();
      setSaveSuccess("Risk profiles saved.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save risk profiles.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveStrategicAssetAllocationTab() {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const previousAssetClasses = assetClassesDraft;
      const savedAssetClasses = await saveAssetClasses();

      if (savedAssetClasses) {
        const remappedRiskProfiles = remapRiskProfilesToSavedAssetClasses(
          riskProfilesDraft,
          previousAssetClasses,
          savedAssetClasses,
        );

        setRiskProfilesDraft(remappedRiskProfiles);
        await saveRiskProfiles(savedAssetClasses, remappedRiskProfiles);
        setSaveSuccess("Strategic asset allocations saved.");
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save strategic asset allocations.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeAssetClass(assetClass: LicenseeAssetClass, index: number) {
    const current = editingItem as LicenseeSummary | null;

    if (current && assetClass.assetClassId && !isLocalId(assetClass.assetClassId)) {
      await deleteAdminLicenseeAssetClass(current.id, assetClass.assetClassId);
    }

    setAssetClassesDraft((existing) => existing.filter((_, itemIndex) => itemIndex !== index));
    setRiskProfilesDraft((existing) =>
      existing.map((profile) => ({
        ...profile,
        strategicAssetAllocations: profile.strategicAssetAllocations.filter(
          (allocation) => allocation.assetClassId !== assetClass.assetClassId,
        ),
      })),
    );
  }

  function handleModalSave() {
    if (!isPractice && licenseeEditorTab === "riskProfiles") {
      void saveRiskProfileTab();
      return;
    }

    if (!isPractice && licenseeEditorTab === "strategicAssetAllocations") {
      void saveStrategicAssetAllocationTab();
      return;
    }

    void saveEntity();
  }

  async function deleteStructure(item: PracticeSummary | LicenseeSummary) {
    const label = isPractice ? "practice" : "licensee";
    const confirmed = window.confirm(`Delete ${label} "${item.name}"? This cannot be undone.`);

    if (!confirmed) {
      return;
    }

    setDeletingId(item.id);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      if (isPractice) {
        await deleteAdminPractice(item.id);
      } else {
        await deleteAdminLicensee(item.id);
      }

      setItems((existing) =>
        isPractice
          ? (existing.filter((existingItem) => existingItem.id !== item.id) as PracticeSummary[])
          : (existing.filter((existingItem) => existingItem.id !== item.id) as LicenseeSummary[]),
      );
      setSaveSuccess(`${isPractice ? "Practice" : "Licensee"} deleted.`);

      if (editingId === item.id) {
        closeEditor();
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : `Unable to delete ${label}.`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <section className={styles.contentCard}>
        <div className={styles.contentCardHeader}>
          <div>
            <h2 className={styles.cardTitle}>{isPractice ? "Practices" : "Licensees"}</h2>
            {isPractice ? (
              <p className={styles.cardText}>
                Live practices are now loaded from the backend and can be created or updated directly from this screen.
              </p>
            ) : null}
          </div>

          <button type="button" className={styles.primaryButton} onClick={openCreate}>
            {isPractice ? "Add practice" : "Add licensee"}
          </button>
        </div>

        <div className={styles.filterRowCompact}>
          <label className={styles.field}>
            <span>{isPractice ? "Practice name" : "Licensee name"}</span>
            <input
              value={practiceQuery}
              onChange={(event) => setPracticeQuery(event.target.value)}
              placeholder={isPractice ? "Search by practice name" : "Search by licensee name"}
            />
          </label>

          {isPractice ? (
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
          ) : null}
        </div>

        {saveSuccess ? <p className={styles.successText}>{saveSuccess}</p> : null}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{isPractice ? "Practice" : "Licensee"}</th>
                {isPractice ? <th>Licensee</th> : <th>Practices</th>}
                <th>Users</th>
                <th>Active users</th>
                {isPractice ? <th>Advisers</th> : null}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <Fragment key={item.id}>
                  <tr>
                    <td>
                      {isPractice ? (
                        item.name
                      ) : (
                        <button
                          type="button"
                          className={styles.expandRowButton}
                          onClick={() => setExpandedLicenseeId(expandedLicenseeId === item.id ? null : item.id)}
                          aria-expanded={expandedLicenseeId === item.id}
                        >
                          <span aria-hidden="true" className={styles.expandIcon}>
                            {expandedLicenseeId === item.id ? "v" : ">"}
                          </span>
                          <span>{item.name}</span>
                        </button>
                      )}
                    </td>
                  {isPractice ? (
                    <td>{"licenseeName" in item ? item.licenseeName : "Unassigned licensee"}</td>
                  ) : (
                    <td>{"practiceCount" in item ? item.practiceCount : 0}</td>
                  )}
                  <td>{"userCount" in item ? item.userCount : 0}</td>
                  <td>{"activeUserCount" in item ? item.activeUserCount : 0}</td>
                  {isPractice ? <td>{"adviserCount" in item ? item.adviserCount : 0}</td> : null}
                  <td>
                    <div className={styles.tableActions}>
                      <button type="button" className={styles.secondaryButton} onClick={() => void openEdit(item)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => void deleteStructure(item)}
                        disabled={deletingId === item.id}
                      >
                        {deletingId === item.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
                {!isPractice && expandedLicenseeId === item.id ? (
                  <tr className={styles.subListRow}>
                    <td colSpan={5}>
                      <div className={styles.subListPanel}>
                        <strong>Practices</strong>
                        {"practices" in item && item.practices.length ? (
                          <ul className={styles.subList}>
                            {item.practices.map((practice) => (
                              <li key={practice.id}>
                                <span>{practice.name}</span>
                                <span>
                                  {practice.activeUserCount} active / {practice.userCount} total users
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className={styles.helperText}>No practices are assigned to this licensee.</p>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              ))}
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={isPractice ? 6 : 5}>
                    No {isPractice ? "practices" : "licensees"} match the selected filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className={styles.paginationBar}>
          <span className={styles.paginationSummary}>
            {filteredItems.length
              ? `Showing ${pageStartIndex + 1}-${pageEndIndex} of ${filteredItems.length} ${
                  isPractice ? "practices" : "licensees"
                }`
              : `Showing 0 ${isPractice ? "practices" : "licensees"}`}
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

      {draft ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.contentCardHeader}>
              <div>
                <h3 className={styles.cardTitle}>
                  {mode === "edit" ? `Edit ${isPractice ? "practice" : "licensee"}` : `Create ${isPractice ? "practice" : "licensee"}`}
                </h3>
                <p className={styles.cardText}>
                  {mode === "edit"
                    ? `Update the ${isPractice ? "practice" : "licensee"} and save it to the live API.`
                    : `Create a new ${isPractice ? "practice" : "licensee"} in the live API.`}
                </p>
              </div>
            </div>

            {!isPractice ? (
              <div className={styles.editorTabs} role="tablist" aria-label="Licensee editor sections">
                <button
                  type="button"
                  className={`${styles.editorTab} ${licenseeEditorTab === "information" ? styles.editorTabActive : ""}`}
                  onClick={() => setLicenseeEditorTab("information")}
                >
                  Licensee Information
                </button>
                <button
                  type="button"
                  className={`${styles.editorTab} ${licenseeEditorTab === "riskProfiles" ? styles.editorTabActive : ""}`}
                  onClick={() => setLicenseeEditorTab("riskProfiles")}
                  disabled={mode !== "edit"}
                >
                  Risk Profiles
                </button>
                <button
                  type="button"
                  className={`${styles.editorTab} ${licenseeEditorTab === "strategicAssetAllocations" ? styles.editorTabActive : ""}`}
                  onClick={() => setLicenseeEditorTab("strategicAssetAllocations")}
                  disabled={mode !== "edit"}
                >
                  Strategic Asset Allocations
                </button>
              </div>
            ) : null}

            {isPractice || licenseeEditorTab === "information" ? (
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>{isPractice ? "Practice name" : "Licensee name"}</span>
                  <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </label>

                {isPractice ? (
                  <label className={styles.field}>
                    <span>Licensee</span>
                    <select
                      value={draft.licenseeId}
                      onChange={(event) => setDraft({ ...draft, licenseeId: event.target.value })}
                    >
                      <option value="">Unassigned licensee</option>
                      {props.licensees.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {!isPractice
                  ? licenseeTextFields.map((field) => (
                      <label className={styles.field} key={field.key}>
                        <span>{field.label}</span>
                        <input
                          value={draft[field.key]}
                          onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                          placeholder={field.placeholder}
                        />
                      </label>
                    ))
                  : null}

                {!isPractice ? (
                  <label className={`${styles.field} ${styles.logoUploadField}`}>
                    <span>Licensee logo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => void handleLicenseeLogoUpload(event.target.files?.[0] ?? null)}
                    />
                    <span className={styles.uploadMeta}>
                      {draft.licenseeLogo ? "Licensee logo saved" : "Choose a logo file to upload"}
                    </span>
                    {draft.licenseeLogo ? (
                      <img src={draft.licenseeLogo} alt="Licensee logo preview" className={styles.imagePreview} />
                    ) : null}
                  </label>
                ) : null}

                {!isPractice ? (
                  <label className={styles.field}>
                    <span>Custom prompt</span>
                    <select
                      value={draft.customPrompt ? "true" : "false"}
                      onChange={(event) => setDraft({ ...draft, customPrompt: event.target.value === "true" })}
                    >
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}

            {!isPractice && licenseeEditorTab === "riskProfiles" ? (
              <div className={styles.editorPanel}>
                <div className={styles.contentCardHeader}>
                  <div>
                    <h4 className={styles.cardTitle}>Risk Profiles</h4>
                    <p className={styles.helperText}>Create, update, or remove this licensee&apos;s risk profile options.</p>
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      const next = createRiskProfileDraft(riskProfilesDraft.length + 1);
                      setRiskProfilesDraft((existing) => [...existing, next]);
                      setSelectedRiskProfileId(next.riskProfileId ?? "");
                    }}
                  >
                    Add risk profile
                  </button>
                </div>

                {riskProfilesDraft.length ? (
                  <div className={styles.stackList}>
                    {riskProfilesDraft.map((profile, index) => (
                      <div className={styles.editorSubcard} key={profile.riskProfileId ?? index}>
                        <div className={styles.formGrid}>
                          <label className={styles.field}>
                            <span>Risk profile name</span>
                            <input
                              value={profile.riskProfileName}
                              onChange={(event) =>
                                updateRiskProfile(profile.riskProfileId ?? "", (existing) => ({
                                  ...existing,
                                  riskProfileName: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className={styles.field}>
                            <span>Display order</span>
                            <input
                              type="number"
                              value={displayNumber(profile.displayOrder)}
                              onChange={(event) =>
                                updateRiskProfile(profile.riskProfileId ?? "", (existing) => ({
                                  ...existing,
                                  displayOrder: readNumber(event.target.value),
                                }))
                              }
                            />
                          </label>
                          <label className={styles.field}>
                            <span>Timeframe label</span>
                            <input
                              value={profile.timeframe.label}
                              onChange={(event) =>
                                updateRiskProfile(profile.riskProfileId ?? "", (existing) => ({
                                  ...existing,
                                  timeframe: { ...existing.timeframe, label: event.target.value },
                                }))
                              }
                            />
                          </label>
                          <label className={styles.field}>
                            <span>Minimum years</span>
                            <input
                              type="number"
                              value={displayNumber(profile.timeframe.minimumYears)}
                              onChange={(event) =>
                                updateRiskProfile(profile.riskProfileId ?? "", (existing) => ({
                                  ...existing,
                                  timeframe: { ...existing.timeframe, minimumYears: readNumber(event.target.value) },
                                }))
                              }
                            />
                          </label>
                          <label className={styles.field}>
                            <span>Maximum years</span>
                            <input
                              type="number"
                              value={displayNumber(profile.timeframe.maximumYears)}
                              onChange={(event) =>
                                updateRiskProfile(profile.riskProfileId ?? "", (existing) => ({
                                  ...existing,
                                  timeframe: { ...existing.timeframe, maximumYears: readNumber(event.target.value) },
                                }))
                              }
                            />
                          </label>
                          <label className={styles.field}>
                            <span>Volatility %</span>
                            <input
                              type="number"
                              value={displayNumber(profile.volatilityPercent)}
                              onChange={(event) =>
                                updateRiskProfile(profile.riskProfileId ?? "", (existing) => ({
                                  ...existing,
                                  volatilityPercent: readNumber(event.target.value),
                                }))
                              }
                            />
                          </label>
                          <label className={styles.field}>
                            <span>Negative return frequency years</span>
                            <input
                              type="number"
                              value={displayNumber(profile.negativeReturnFrequency.frequencyYears)}
                              onChange={(event) =>
                                updateRiskProfile(profile.riskProfileId ?? "", (existing) => ({
                                  ...existing,
                                  negativeReturnFrequency: {
                                    ...existing.negativeReturnFrequency,
                                    frequencyYears: readNumber(event.target.value),
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className={styles.field}>
                            <span>Status</span>
                            <select
                              value={profile.isActive === false ? "false" : "true"}
                              onChange={(event) =>
                                updateRiskProfile(profile.riskProfileId ?? "", (existing) => ({
                                  ...existing,
                                  isActive: event.target.value === "true",
                                }))
                              }
                            >
                              <option value="true">Active</option>
                              <option value="false">Inactive</option>
                            </select>
                          </label>
                        </div>

                        <label className={styles.field}>
                          <span>Description</span>
                          <input
                            value={profile.description ?? ""}
                            onChange={(event) =>
                              updateRiskProfile(profile.riskProfileId ?? "", (existing) => ({
                                ...existing,
                                description: event.target.value,
                              }))
                            }
                          />
                        </label>

                        <label className={styles.field}>
                          <span>Negative return frequency description</span>
                          <input
                            value={profile.negativeReturnFrequency.description ?? ""}
                            onChange={(event) =>
                              updateRiskProfile(profile.riskProfileId ?? "", (existing) => ({
                                ...existing,
                                negativeReturnFrequency: {
                                  ...existing.negativeReturnFrequency,
                                  description: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>

                        <div className={styles.tableActions}>
                          <button
                            type="button"
                            className={styles.dangerButton}
                            onClick={() =>
                              setRiskProfilesDraft((existing) =>
                                existing.filter((existingProfile) => existingProfile.riskProfileId !== profile.riskProfileId),
                              )
                            }
                          >
                            Delete risk profile
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.helperText}>No risk profiles configured yet.</p>
                )}
              </div>
            ) : null}

            {!isPractice && licenseeEditorTab === "strategicAssetAllocations" ? (
              <div className={styles.editorPanel}>
                <div className={styles.contentCardHeader}>
                  <div>
                    <h4 className={styles.cardTitle}>Asset Classes</h4>
                    <p className={styles.helperText}>Define the licensee asset classes used by strategic allocations.</p>
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setAssetClassesDraft((existing) => [...existing, createAssetClassDraft(existing.length + 1)])}
                  >
                    Add asset class
                  </button>
                </div>

                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Category</th>
                        <th>Display order</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assetClassesDraft.map((assetClass, index) => (
                        <tr key={assetClass.assetClassId ?? index}>
                          <td>
                            <input
                              className={styles.inlineInput}
                              value={assetClass.name}
                              onChange={(event) =>
                                setAssetClassesDraft((existing) =>
                                  existing.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, name: event.target.value } : item,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td>
                            <select
                              className={styles.inlineInput}
                              value={assetClass.category}
                              onChange={(event) =>
                                setAssetClassesDraft((existing) =>
                                  existing.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, category: event.target.value === "Growth" ? "Growth" : "Defensive" }
                                      : item,
                                  ),
                                )
                              }
                            >
                              {ASSET_CLASS_CATEGORIES.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              className={styles.inlineInput}
                              type="number"
                              value={displayNumber(assetClass.displayOrder)}
                              onChange={(event) =>
                                setAssetClassesDraft((existing) =>
                                  existing.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, displayOrder: readNumber(event.target.value) } : item,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td>
                            <select
                              className={styles.inlineInput}
                              value={assetClass.isActive === false ? "false" : "true"}
                              onChange={(event) =>
                                setAssetClassesDraft((existing) =>
                                  existing.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, isActive: event.target.value === "true" } : item,
                                  ),
                                )
                              }
                            >
                              <option value="true">Active</option>
                              <option value="false">Inactive</option>
                            </select>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={styles.dangerButton}
                              onClick={() => void removeAssetClass(assetClass, index)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                      {assetClassesDraft.length === 0 ? (
                        <tr>
                          <td colSpan={5}>No asset classes configured yet.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div className={styles.editorDivider} />

                <label className={styles.field}>
                  <span>Risk profile</span>
                  <select value={selectedRiskProfileId} onChange={(event) => setSelectedRiskProfileId(event.target.value)}>
                    <option value="">Select a risk profile</option>
                    {riskProfilesDraft.map((profile) => (
                      <option key={profile.riskProfileId} value={profile.riskProfileId ?? ""}>
                        {profile.riskProfileName || "Untitled risk profile"}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedRiskProfile ? (
                  <>
                    <div className={styles.formGrid}>
                      <label className={styles.field}>
                        <span>Expected income %</span>
                        <input
                          type="number"
                          value={displayNumber(selectedRiskProfile.expectedReturns.expectedIncomePercent)}
                          onChange={(event) =>
                            updateRiskProfile(selectedRiskProfile.riskProfileId ?? "", (profile) => ({
                              ...profile,
                              expectedReturns: {
                                ...profile.expectedReturns,
                                expectedIncomePercent: readNumber(event.target.value) ?? 0,
                              },
                            }))
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Expected growth %</span>
                        <input
                          type="number"
                          value={displayNumber(selectedRiskProfile.expectedReturns.expectedGrowthPercent)}
                          onChange={(event) =>
                            updateRiskProfile(selectedRiskProfile.riskProfileId ?? "", (profile) => ({
                              ...profile,
                              expectedReturns: {
                                ...profile.expectedReturns,
                                expectedGrowthPercent: readNumber(event.target.value) ?? 0,
                              },
                            }))
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Total expected return %</span>
                        <input
                          type="number"
                          value={displayNumber(selectedRiskProfile.expectedReturns.totalExpectedReturnPercent)}
                          onChange={(event) =>
                            updateRiskProfile(selectedRiskProfile.riskProfileId ?? "", (profile) => ({
                              ...profile,
                              expectedReturns: {
                                ...profile.expectedReturns,
                                totalExpectedReturnPercent: readNumber(event.target.value) ?? 0,
                              },
                            }))
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Franking %</span>
                        <input
                          type="number"
                          value={displayNumber(selectedRiskProfile.expectedReturns.frankingPercent)}
                          onChange={(event) =>
                            updateRiskProfile(selectedRiskProfile.riskProfileId ?? "", (profile) => ({
                              ...profile,
                              expectedReturns: { ...profile.expectedReturns, frankingPercent: readNumber(event.target.value) ?? 0 },
                            }))
                          }
                        />
                      </label>
                    </div>

                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Asset class</th>
                            <th>Category</th>
                            <th>Target %</th>
                            <th>Minimum %</th>
                            <th>Maximum %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assetClassesDraft
                            .filter((assetClass) => assetClass.name.trim())
                            .map((assetClass) => {
                              const assetClassId = assetClass.assetClassId ?? "";
                              const allocation =
                                selectedRiskProfile.strategicAssetAllocations.find(
                                  (item) => item.assetClassId === assetClassId,
                                ) ?? null;

                              function updateAllocation(
                                key: "targetPercent" | "minimumPercent" | "maximumPercent",
                                value: number | null,
                              ) {
                                updateRiskProfile(selectedRiskProfileId, (profile) => {
                                  const existingAllocation = profile.strategicAssetAllocations.find(
                                    (item) => item.assetClassId === assetClassId,
                                  );
                                  const nextAllocation = {
                                    assetClassId,
                                    assetClassName: assetClass.name,
                                    category: assetClass.category,
                                    targetPercent: 0,
                                    minimumPercent: null,
                                    maximumPercent: null,
                                    ...existingAllocation,
                                    [key]: value,
                                  };
                                  const otherAllocations = profile.strategicAssetAllocations.filter(
                                    (item) => item.assetClassId !== assetClassId,
                                  );

                                  return {
                                    ...profile,
                                    strategicAssetAllocations: [...otherAllocations, nextAllocation],
                                  };
                                });
                              }

                              return (
                                <tr key={assetClassId}>
                                  <td>{assetClass.name}</td>
                                  <td>{assetClass.category}</td>
                                  <td>
                                    <input
                                      className={styles.inlineInput}
                                      type="number"
                                      value={displayNumber(allocation?.targetPercent)}
                                      onChange={(event) => updateAllocation("targetPercent", readNumber(event.target.value) ?? 0)}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className={styles.inlineInput}
                                      type="number"
                                      value={displayNumber(allocation?.minimumPercent)}
                                      onChange={(event) => updateAllocation("minimumPercent", readNumber(event.target.value))}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className={styles.inlineInput}
                                      type="number"
                                      value={displayNumber(allocation?.maximumPercent)}
                                      onChange={(event) => updateAllocation("maximumPercent", readNumber(event.target.value))}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className={styles.helperText}>Select a risk profile to configure strategic allocations and expected returns.</p>
                )}
              </div>
            ) : null}

            {isLoadingDetails ? <p className={styles.cardText}>Loading full licensee details...</p> : null}

            {saveError ? <p className={styles.errorText}>{saveError}</p> : null}

            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={closeEditor} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className={styles.primaryButton} onClick={handleModalSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
