"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import type { ClientProfile, PersonRecord } from "@/lib/api/types";
import type {
  AdviceCaseV1,
  AlternativeConsideredV1,
  InsurancePolicyOwnershipGroupV1,
  InsurancePolicyReplacementV1,
  ProductAlternativeConsideredV1,
  PortfolioHoldingV1,
  RecommendationConsequenceV1,
} from "@/lib/soa-types";
import type { IntakeAssessmentV1 } from "@/lib/soa-output-contracts";
import {
  SERVICE_FEE_FREQUENCY_OPTIONS,
  addDays,
  buildServiceAgreementSectionModel,
  getServiceFeeAnnualAmount,
} from "@/lib/documents/document-sections";
import {
  DEFAULT_DOCUMENT_STYLE_PROFILE,
  DOCUMENT_FONT_OPTIONS,
} from "@/lib/documents/document-style-profile";
import { getPortfolioAccountViews, getPrimaryAllocationRows } from "@/lib/soa-portfolio-accounts";
import { getSoaScenario } from "@/lib/soa-scenarios";
import styles from "./soa-print.module.css";

const SOA_PRINT_STORAGE_KEY = "finley-soa-print-preview-v1";
const DEFAULT_UPFRONT_COMMISSION_PERCENTAGE = 22;
const DEFAULT_ONGOING_COMMISSION_PERCENTAGE = 11;
const STRATEGY_RECOMMENDATIONS_INTRO =
  "This section outlines our recommendations, the benefits to you, how these strategies place you in a better position and other key information.";
const REPLACEMENT_ANALYSIS_INTRO =
  "As part of our recommendation I have completed an investigation into your existing investments and compared both advantages and disadvantages of replacing your investment. This information has been provided to help you identify the reason why I have recommended a switch and assist you in deciding whether to act upon our advice. The research I undertook prior to making our recommendation has been retained on your client file. Should you require a copy, please let me know and I’ll provide it free of charge.";
const FEES_AND_DISCLOSURES_INTRO =
  "This section outlines the amounts you pay for our advice and the services provided. We have also shown the amounts we receive. All amounts are inclusive of GST (where applicable).";
const PRODUCT_FEES_INTRO =
  "The following tables outline the ongoing fees you will incur because of implementing the recommended products in this report:";
const EXECUTIVE_SUMMARY_INTRO =
  "This section summarises the scope of advice, explains how our recommendations are appropriate for your objectives, financial situation and needs and explains how our recommendations will help to achieve your goals and objectives. To help you make an informed decision, we’ll outline the consequences and implications of our advice and our fees. Additional details are contained in the body of this Statement of Advice (SoA) and the Appendix.";
const EXECUTIVE_SUMMARY_SCOPE_INTRO =
  "During our meeting we discussed and agreed that our advice will cover the following areas:";
const BETTER_POSITION_STATEMENT_INTRO =
  "The table below provides a brief summary of our recommendation and snapshot of how our recommendations are likely to leave you in a better position compared to your current situation.";
const SUMMARY_OF_ADVICE_FEES_INTRO =
  "The following is a summary of our advice fees. For further details please refer to the Disclosures section:";
const INSURANCE_RECOMMENDATIONS_INTRO =
  "This section summarises the personal insurance policies we recommend you apply for, retain, vary or replace, including ownership, cover levels, premium structure, optional benefits and important underwriting notes.";
const ABOUT_ADVICE_WARNINGS = [
  {
    title: "Incomplete or Inaccurate Information Warning",
    text: "Should you not have provided us all the relevant information, this will limit our ability to provide appropriate advice with regard to your objectives, financial situation and needs.",
  },
  {
    title: "Taxation Considerations",
    text: "Whilst every effort has been made to include relevant tax considerations, we recommend you seek advice from your accountant or an appropriately qualified tax agent about the impact on your tax liabilities and other tax implications arising from the recommended strategies before proceeding.",
  },
  {
    title: "Approved Product List",
    text: "The products I have recommended for you are drawn from the Approved Product List. I can obtain permission to recommend other financial products, but I believe that the products contained on the APL are appropriate for your needs. If you’d like a copy of the Approved Product List please let me know and I’ll provide a copy to you.",
  },
];

type StoredPrintPayload = {
  savedAt: string;
  clientId?: string | null;
  soaId?: string | null;
  clientName?: string | null;
  adviserName?: string | null;
  practiceName?: string | null;
  practiceAbn?: string | null;
  adviceCase: AdviceCaseV1;
  intakeAssessment?: IntakeAssessmentV1 | null;
  confirmedSections?: Record<string, boolean>;
};

type ClientProfileResponse = {
  profile?: ClientProfile | null;
  source?: "live" | "mock";
  error?: string;
};

const PIE_SLICE_COLORS = [
  "#113864",
  "#f2c500",
  "#2f855a",
  "#c05621",
  "#6b46c1",
  "#00897b",
  "#c53030",
  "#4a5568",
];

const DEFAULT_RENDER_STYLE = {
  fontFamily: DEFAULT_DOCUMENT_STYLE_PROFILE.fontFamily,
  fontColor: DEFAULT_DOCUMENT_STYLE_PROFILE.bodyTextColor,
  tableHeaderColor: DEFAULT_DOCUMENT_STYLE_PROFILE.tableHeaderColor,
  tableAccentColor: DEFAULT_DOCUMENT_STYLE_PROFILE.headingColor,
};

const ALLOWED_RENDER_FONTS = new Set(DOCUMENT_FONT_OPTIONS.map((option) => option.value));

function getRenderFont(value?: string | null) {
  return value && ALLOWED_RENDER_FONTS.has(value) ? value : DEFAULT_RENDER_STYLE.fontFamily;
}

function getRenderColor(value: string | null | undefined, fallback: string) {
  const nextValue = value?.trim() ?? "";
  return /^#[0-9a-f]{6}$/i.test(nextValue) ? nextValue : fallback;
}

function getContrastColor(hexColor: string) {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance >= 145 ? "#113864" : "#ffffff";
}

function getPreviewSectionAnchorId(sectionId?: string | null) {
  switch (sectionId) {
    case "soa-introduction":
      return "soa-preview-section-soa-introduction";
    case "objectives":
      return "soa-preview-section-objectives";
    case "scope-of-advice":
      return "soa-preview-section-scope-of-advice";
    case "risk-profile":
      return "soa-preview-section-risk-profile";
    case "strategy-recommendations":
      return "soa-preview-section-strategy-recommendations";
    case "product-recommendations":
      return "soa-preview-section-product-recommendations";
    case "replacement-analysis":
      return "soa-preview-section-replacement-analysis";
    case "portfolio-allocation":
      return "soa-preview-section-portfolio-allocation";
    case "projections":
      return "soa-preview-section-projections";
    case "insurance-analysis":
      return "soa-preview-section-insurance-needs-analysis";
    case "insurance-policies":
      return "soa-preview-section-insurance-analysis";
    case "insurance-replacement":
      return "soa-preview-section-insurance-replacement";
    case "disclosure":
      return "soa-preview-section-disclosure";
    case "service-agreement":
      return "soa-preview-section-service-agreement";
    case "appendix":
      return "soa-preview-section-appendix";
    default:
      return "";
  }
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Draft";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `${value.toFixed(2)}%`;
}

function formatInsuranceOwnership(value?: InsurancePolicyOwnershipGroupV1["ownership"] | null) {
  switch (value) {
    case "inside-super":
      return "Superannuation";
    case "outside-super":
      return "Non-superannuation";
    case "flexi-linked":
      return "Flexi-linked";
    case "smsf":
      return "SMSF";
    case "employer":
      return "Employer";
    case "other":
      return "Other";
    case "unknown":
    default:
      return "Ownership to be confirmed";
  }
}

function formatInsurancePremiumType(value?: string | null) {
  return value?.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "—";
}

function formatInsuranceFrequency(value?: string | null) {
  return value?.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "—";
}

function getInsuranceAnnualisedPremium(group: InsurancePolicyOwnershipGroupV1) {
  if (group.annualisedPremium !== null && group.annualisedPremium !== undefined) {
    return group.annualisedPremium;
  }

  const multiplier =
    group.premiumFrequency === "weekly"
      ? 52
      : group.premiumFrequency === "fortnightly"
        ? 26
        : group.premiumFrequency === "monthly"
          ? 12
          : group.premiumFrequency === "quarterly"
            ? 4
            : group.premiumFrequency === "half-yearly"
              ? 2
              : group.premiumFrequency === "annually"
                ? 1
                : 0;

  return multiplier && group.premiumAmount != null ? group.premiumAmount * multiplier : null;
}

function getInsurancePolicySnapshotValue(
  snapshot: InsurancePolicyReplacementV1["currentPolicy"],
  key: keyof InsurancePolicyReplacementV1["currentPolicy"],
) {
  const value = snapshot[key];
  return typeof value === "number" ? formatCurrency(value) : value || "—";
}

function getInsuranceCoverTypeKey(policyType?: string | null) {
  switch (policyType) {
    case "life":
      return "life";
    case "tpd":
      return "tpd";
    case "trauma":
      return "trauma";
    case "income-protection":
      return "incomeProtection";
    default:
      return null;
  }
}

function formatDateValue(value?: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function calculateAge(value?: string | null) {
  if (!value) {
    return null;
  }

  const dob = new Date(value);
  if (Number.isNaN(dob.getTime())) {
    return null;
  }

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }

  return age;
}

function parseNumericValue(value?: string | number | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const cleaned = String(value).replace(/[$,%\s,]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toAnnualAmount(value?: string | null, frequencyType?: string | null) {
  const amount = parseNumericValue(value);
  const frequency = frequencyType?.trim().toLowerCase() ?? "";

  switch (frequency) {
    case "weekly":
      return amount * 52;
    case "fortnightly":
      return amount * 26;
    case "monthly":
      return amount * 12;
    case "quarterly":
      return amount * 4;
    default:
      return amount;
  }
}

function resolveOwnerName(
  owner?: {
    name?: string | null;
  } | null,
  joint?: boolean | null,
) {
  if (joint) {
    return "Joint";
  }

  return owner?.name?.trim() || "—";
}

function renderBulletList(items: string[], emptyLabel: string) {
  if (!items.length) {
    return <p className={styles.emptyState}>{emptyLabel}</p>;
  }

  return (
    <ul className={styles.bulletList}>
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}

function renderConsequenceList(items?: RecommendationConsequenceV1[] | null, emptyLabel = "No consequences drafted yet.") {
  return renderBulletList(
    (items ?? []).map((item) => item.text).filter(Boolean),
    emptyLabel,
  );
}

function renderAlternatives(
  items?: AlternativeConsideredV1[] | ProductAlternativeConsideredV1[] | null,
  emptyLabel = "No alternatives drafted yet.",
) {
  const values = (items ?? [])
    .map((item) => {
      if ("optionText" in item) {
        return item.reasonNotRecommended
          ? `${item.optionText} — ${item.reasonNotRecommended}`
          : item.optionText;
      }

      const name = [item.productName, item.provider].filter(Boolean).join(" / ");
      if (!name) {
        return null;
      }

      return item.reasonDiscounted ? `${name} — ${item.reasonDiscounted}` : name;
    })
    .filter((item): item is string => Boolean(item));

  return renderBulletList(values, emptyLabel);
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [`M`, cx, cy, `L`, start.x, start.y, `A`, radius, radius, 0, largeArcFlag, 0, end.x, end.y, `Z`].join(" ");
}

function buildAllocationSlices(
  allocationRows:
    | {
        assetClass: string;
        recommendedPct?: number | null;
      }[]
    | null
    | undefined,
) {
  return (allocationRows ?? [])
    .filter(
      (row) =>
        row.recommendedPct !== null &&
        row.recommendedPct !== undefined &&
        row.recommendedPct > 0 &&
        !row.assetClass.toLowerCase().startsWith("total "),
    )
    .map((row, index) => ({
      assetClass: row.assetClass,
      recommendedPct: row.recommendedPct as number,
      color: PIE_SLICE_COLORS[index % PIE_SLICE_COLORS.length],
    }));
}

function pickAddressPerson(profile?: ClientProfile | null) {
  return profile?.client ?? profile?.partner ?? null;
}

function getPersonName(person?: PersonRecord | null) {
  return person?.name?.trim() || null;
}

function getFormalPersonName(person?: PersonRecord | null) {
  const name = getPersonName(person);
  if (!name) {
    return null;
  }

  return [person?.title?.trim(), name].filter(Boolean).join(" ");
}

function buildAddress(person?: PersonRecord | null) {
  const street = person?.street ?? person?.addressStreet ?? person?.address?.street ?? person?.address?.line1 ?? null;
  const suburb = person?.suburb ?? person?.addressSuburb ?? person?.address?.suburb ?? person?.address?.city ?? null;
  const state = person?.state ?? person?.addressState ?? person?.address?.state ?? person?.address?.region ?? null;
  const postCode =
    person?.postCode ??
    person?.postcode ??
    person?.addressPostCode ??
    person?.address?.postCode ??
    person?.address?.postcode ??
    person?.address?.zipCode ??
    null;

  return {
    street: street?.trim() || null,
    locality: [suburb?.trim(), state?.trim(), postCode?.trim()].filter(Boolean).join(" ") || null,
  };
}

function buildPreferredContact(person?: PersonRecord | null) {
  return (
    person?.preferredPhone?.trim() ||
    person?.mobile?.trim() ||
    person?.mobilePhone?.trim() ||
    person?.phone?.trim() ||
    person?.contact?.preferredPhone?.trim() ||
    person?.contact?.phone?.trim() ||
    person?.email?.trim() ||
    "—"
  );
}

function buildPersonSnapshot(person?: PersonRecord | null) {
  return {
    name: getPersonName(person) ?? "Client",
    age: calculateAge(person?.dob),
    dob: formatDateValue(person?.dob),
    maritalStatus: person?.maritalStatus?.trim() || "—",
    residentStatus: person?.residentStatus?.trim() || "—",
    preferredContact: buildPreferredContact(person),
    address: buildAddress(person),
    employmentStatus: person?.employment?.[0]?.status?.trim() || "—",
    jobTitle: person?.employment?.[0]?.jobTitle?.trim() || person?.employment?.[0]?.job_title?.trim() || "—",
    healthStatus: person?.health_status?.trim() || person?.healthStatus?.trim() || "—",
    healthInsurance: person?.health_insurance?.trim() || person?.healthInsurance?.trim() || "—",
  };
}

function readPersonRiskProfile(person?: PersonRecord | null) {
  return (
    person?.riskProfileResponse?.resultDisplay?.trim() ||
    person?.riskProfileResponse?.score?.trim() ||
    null
  );
}

function groupByPlatformName<T extends { platformName?: string | null }>(rows: T[]) {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const key = row.platformName?.trim() || "Unspecified platform";
    const items = groups.get(key) ?? [];
    items.push(row);
    groups.set(key, items);
  }

  return [...groups.entries()].map(([platformName, items]) => ({ platformName, items }));
}

function getPortfolioHoldingAmounts(holding: PortfolioHoldingV1) {
  const currentAmount =
    holding.currentAmount ??
    (holding.transactionAmount && holding.transactionAmount < 0 ? Math.abs(holding.transactionAmount) : 0);
  const proposedAmount = holding.proposedAmount ?? holding.amount ?? 0;
  const changeAmount = holding.changeAmount ?? holding.transactionAmount ?? proposedAmount - currentAmount;

  return { currentAmount, changeAmount, proposedAmount };
}

function getProductRexComparisonColumns(report: NonNullable<AdviceCaseV1["productRexReports"]>[number]) {
  if (report.comparisonColumns?.length) {
    return report.comparisonColumns;
  }

  return [
    { columnId: `${report.reportId}-current`, status: "current" as const, productName: report.currentPlatform ?? null },
    { columnId: `${report.reportId}-recommended`, status: "recommended" as const, productName: report.recommendedPlatform ?? null },
    { columnId: `${report.reportId}-alternative`, status: "alternative" as const, productName: report.alternativePlatform ?? null },
  ];
}

function toTitleCase(value?: string | null) {
  if (!value) {
    return "Balanced";
  }

  return value
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getRiskProfileBenchmarkRows(
  allocationRows:
    | {
        assetClass: string;
        riskProfilePct?: number | null;
      }[]
    | null
    | undefined,
) {
  const ranges: Record<string, { min?: number; max?: number }> = {
    "Domestic Equity": { min: 15, max: 50 },
    "Australian Shares": { min: 15, max: 50 },
    "International Equity": { min: 10, max: 40 },
    "International Shares": { min: 10, max: 40 },
    "Domestic Property": { min: 0, max: 7.5 },
    Property: { min: 0, max: 7.5 },
    "International Property": { min: 0, max: 7.5 },
    Alternative: { min: 0, max: 15 },
    "Domestic Fixed Interest": { min: 5, max: 17.5 },
    "Diversified Fixed Interest": { min: 5, max: 17.5 },
    "International Fixed Interest": { min: 5, max: 17.5 },
    Cash: { min: 0, max: 15 },
    "Domestic Cash": { min: 0, max: 15 },
    "International Cash": { min: 0, max: 8 },
  };

  return (allocationRows ?? []).map((row) => {
    const range = ranges[row.assetClass] ?? {};
    return {
      assetClass: row.assetClass,
      targetPct: row.riskProfilePct ?? null,
      minimumPct: range.min ?? null,
      maximumPct: range.max ?? null,
    };
  });
}

export function SoaPrintPreview() {
  const [payload, setPayload] = useState<StoredPrintPayload | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const searchParams = useSearchParams();
  const isEmbedded = searchParams.get("embed") === "1";
  const activePreviewAnchorId = getPreviewSectionAnchorId(searchParams.get("section")?.trim());
  const renderFontFamily = getRenderFont(searchParams.get("font"));
  const renderFontColor = getRenderColor(searchParams.get("fontColor"), DEFAULT_RENDER_STYLE.fontColor);
  const tableHeaderColor = getRenderColor(searchParams.get("tableHeaderColor"), DEFAULT_RENDER_STYLE.tableHeaderColor);
  const tableAccentColor = getRenderColor(searchParams.get("tableAccentColor"), DEFAULT_RENDER_STYLE.tableAccentColor);
  const previewStyle = {
    "--soa-font-family": renderFontFamily,
    "--soa-text-color": renderFontColor,
    "--soa-heading-color": tableAccentColor,
    "--soa-table-header-bg": tableHeaderColor,
    "--soa-table-header-text": getContrastColor(tableHeaderColor),
  } as CSSProperties;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const raw =
      window.localStorage.getItem(SOA_PRINT_STORAGE_KEY) ??
      window.sessionStorage.getItem(SOA_PRINT_STORAGE_KEY);
    const clientId = searchParams.get("clientId")?.trim() || "";
    const soaId = searchParams.get("soaId")?.trim() || "";

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as StoredPrintPayload;
        if (!soaId || parsed.soaId === soaId) {
          setPayload(parsed);
          return;
        }
      } catch {
        setPayload(null);
      }
    }

    if (clientId && soaId) {
      const scenario = getSoaScenario(clientId, soaId);
      if (scenario?.draft) {
        setPayload({
          savedAt: scenario.updatedAt,
          clientId,
          soaId,
          clientName: null,
          adviserName: null,
          practiceName: null,
          practiceAbn: null,
          adviceCase: scenario.draft.adviceCase,
          intakeAssessment: scenario.draft.intakeAssessment,
          confirmedSections: scenario.draft.confirmedSections,
        });
        return;
      }
    }

    setPayload(null);
  }, [searchParams]);

  useEffect(() => {
    const clientId = searchParams.get("clientId")?.trim() || payload?.clientId?.trim() || "";

    if (!clientId) {
      setClientProfile(null);
      return;
    }

    let isCancelled = false;

    async function loadClientProfile() {
      try {
        const response = await fetch(`/api/finley/soa/client-profile?clientId=${encodeURIComponent(clientId)}`, {
          method: "GET",
          cache: "no-store",
        });

        const body = (await response.json().catch(() => null)) as ClientProfileResponse | null;
        if (!response.ok) {
          throw new Error(body?.error || "Unable to load the client profile for the SOA preview.");
        }

        if (!isCancelled) {
          setClientProfile(body?.profile ?? null);
        }
      } catch {
        if (!isCancelled) {
          setClientProfile(null);
        }
      }
    }

    void loadClientProfile();

    return () => {
      isCancelled = true;
    };
  }, [payload?.clientId, searchParams]);

  useEffect(() => {
    if (!payload || !activePreviewAnchorId || typeof window === "undefined") {
      return;
    }

    const scrollToActiveSection = () => {
      document.getElementById(activePreviewAnchorId)?.scrollIntoView({ block: "start" });
    };

    const animationFrameId = window.requestAnimationFrame(() => {
      scrollToActiveSection();
      window.setTimeout(scrollToActiveSection, 150);
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [activePreviewAnchorId, clientProfile, payload]);

  const clientNames = useMemo(
    () =>
      [getPersonName(clientProfile?.client), getPersonName(clientProfile?.partner)].filter(Boolean).join(" & ") ||
      payload?.adviceCase.clientGroup.clients.map((client) => client.fullName).filter(Boolean).join(" & ") ||
      payload?.clientName ||
      "Client",
    [clientProfile, payload],
  );
  const addresseeNames = useMemo(
    () =>
      [getPersonName(clientProfile?.client), getPersonName(clientProfile?.partner)].filter(Boolean) ||
      payload?.adviceCase.clientGroup.clients.map((client) => client.fullName).filter(Boolean) ||
      [],
    [clientProfile, payload],
  );

  if (!payload) {
    return (
      <main className={`${styles.previewPage} ${isEmbedded ? styles.previewPageEmbedded : ""}`.trim()} style={previewStyle}>
        <section className={styles.previewShell}>
          <div className={styles.emptyCard}>
            <h1 className={styles.emptyTitle}>No SOA draft is available yet</h1>
            <p className={styles.emptyText}>
              Open the Finley SOA workflow, build or review a draft, then use <strong>Print preview</strong> again.
            </p>
          </div>
        </section>
      </main>
    );
  }

  const { adviceCase } = payload;
  const productRexReports = adviceCase.productRexReports ?? [];
  const addresseeLine = addresseeNames.length > 1 ? addresseeNames.join(" and ") : addresseeNames[0] ?? "<<clientname>>";
  const address = buildAddress(pickAddressPerson(clientProfile));
  const adviserName = clientProfile?.adviser?.name?.trim() || payload.adviserName || "<<adviser>>";
  const adviserEmail = clientProfile?.adviser?.email?.trim() || "<<adviser.email>>";
  const adviserAsicNumber = clientProfile?.adviser?.asicNumber?.trim() || "<<car_number>>";
  const adviserAddressRecord = clientProfile?.adviser?.address;
  const adviserLocality = [
    adviserAddressRecord?.suburb?.trim() || adviserAddressRecord?.city?.trim(),
    adviserAddressRecord?.state?.trim() || adviserAddressRecord?.region?.trim(),
    adviserAddressRecord?.postCode?.trim() || adviserAddressRecord?.postalCode?.trim(),
  ]
    .filter(Boolean)
    .join(" ");
  const adviserAddress = {
    street: adviserAddressRecord?.street?.trim() || "<<adviser.address>>",
    locality: adviserLocality || "<<adviser.suburb>> <<adviser.state>> <<adviser.postcode>>",
    phone: clientProfile?.adviser?.officeNumber?.trim() || clientProfile?.adviser?.phoneNumber?.trim() || "<<adviser.phone>>",
  };
  const practiceName =
    clientProfile?.adviser?.practice?.name?.trim() ||
    clientProfile?.practice?.trim() ||
    payload.practiceName ||
    adviceCase.practice.name ||
    "<<practice>>";
  const practiceAbn = clientProfile?.adviser?.abn?.trim() || payload.practiceAbn || "<<abn>>";
  const practiceLogo = clientProfile?.adviser?.practiceLogo?.trim() || "";
  const licenseeName =
    clientProfile?.adviser?.licensee?.name?.trim() ||
    clientProfile?.licensee?.trim() ||
    adviceCase.licensee.name ||
    "Insight Investment Partners";
  const portfolioAccountViews = getPortfolioAccountViews(adviceCase);
  const primaryAllocationRows = getPrimaryAllocationRows(adviceCase);
  const portfolioHoldings = portfolioAccountViews.flatMap((account) => account.holdings);
  const preparationFee =
    adviceCase.fees.adviceFees.find((fee) => fee.type === "preparation")?.amount ?? null;
  const implementationFee =
    adviceCase.fees.adviceFees.find((fee) => fee.type === "implementation")?.amount ?? null;
  const hasAdviceFeeData = preparationFee !== null || implementationFee !== null;
  const totalAdviceFees = (preparationFee ?? 0) + (implementationFee ?? 0);
  const hasProductFeeAmount = adviceCase.fees.productFees.some(
    (fee) => fee.amount !== null && fee.amount !== undefined && !Number.isNaN(fee.amount),
  );
  const totalProductFees = adviceCase.fees.productFees.reduce((sum, fee) => sum + (fee.amount ?? 0), 0);
  const productFeeGroups = (() => {
    const groupedFeeIds = new Set<string>();
    const groups = portfolioAccountViews
      .map((account) => {
        const fees = adviceCase.fees.productFees.filter((fee) => {
          const matchesReport =
            Boolean(account.productRexReportId && fee.productRexReportId === account.productRexReportId) ||
            Boolean(account.sourceFileName && fee.sourceFileName === account.sourceFileName);
          const matchesProduct =
            Boolean(account.recommendedProductName && fee.productName === account.recommendedProductName) &&
            Boolean(account.label && fee.ownerName === account.label);
          return matchesReport || matchesProduct;
        });
        fees.forEach((fee) => groupedFeeIds.add(fee.feeId));
        return { key: account.accountId, label: account.label, fees };
      })
      .filter((group) => group.fees.length);
    const ungroupedFees = adviceCase.fees.productFees.filter((fee) => !groupedFeeIds.has(fee.feeId));

    return ungroupedFees.length
      ? [...groups, { key: "other-product-fees", label: groups.length ? "Other product fees" : "Product fees", fees: ungroupedFees }]
      : groups;
  })();
  const hasReplacementAnalysis = adviceCase.recommendations.replacement.length > 0;
  const serviceAgreementSection = buildServiceAgreementSectionModel({
    adviceCase,
    savedAt: payload.savedAt,
    clientNames: addresseeLine,
    adviserName,
    adviserEmail,
    adviserPhone: adviserAddress.phone,
    practiceName,
    licenseeName,
    getOwnerName: (ownerPersonId?: string | null) => {
      const owner = adviceCase.clientGroup.clients.find((person) => person.personId === ownerPersonId);
      return owner?.fullName?.trim() || addresseeNames[0] || "Client";
    },
  });
  const hasServiceAgreement = Boolean(serviceAgreementSection);
  const isFixedTermAgreement = serviceAgreementSection?.isFixedTermAgreement ?? false;
  const serviceAgreementTitle = serviceAgreementSection?.agreementTitle ?? "Ongoing Service Agreement";
  const serviceAgreementContentsLabel = serviceAgreementSection?.contentsLabel ?? "Ongoing Service Agreement";
  const serviceAgreementServiceGroups = serviceAgreementSection?.serviceGroups ?? [];
  const betterPositionRows = [
    ...adviceCase.recommendations.strategic.map((recommendation) => ({
      id: recommendation.recommendationId,
      recommendation: recommendation.recommendationText || "Draft strategy recommendation not yet written.",
      betterPosition:
        [
          ...recommendation.clientBenefits.map((benefit) => benefit.text).filter(Boolean),
          recommendation.rationale ?? "",
        ]
          .filter(Boolean)
          .join(" ") || "Benefits to be confirmed.",
    })),
    ...adviceCase.recommendations.product.map((recommendation) => ({
      id: recommendation.recommendationId,
      recommendation: recommendation.recommendationText || "Draft product recommendation not yet written.",
      betterPosition:
        [
          ...recommendation.clientBenefits.map((benefit) => benefit.text).filter(Boolean),
          recommendation.suitabilityRationale ?? "",
        ]
          .filter(Boolean)
          .join(" ") || "Benefits to be confirmed.",
    })),
  ];
  const hasInsurancePolicyRecommendations = Boolean(adviceCase.recommendations.insurancePolicies?.length);
  const hasInsuranceNeedsAnalysis = Boolean(adviceCase.recommendations.insuranceNeedsAnalyses?.length);
  const hasInsuranceReplacement = Boolean(adviceCase.recommendations.insuranceReplacements?.length);
  const contentsItems = [
    "Statement of Advice",
    "Executive Summary",
    "About This Advice",
    "Your Personal and Financial Position",
    "Risk Profile",
    "Strategy Recommendations",
    "Product Recommendations",
    "Investment Portfolio Recommendations",
    "Portfolio Allocation",
    ...(hasReplacementAnalysis ? ["Replacement Analysis"] : []),
    ...(hasInsuranceNeedsAnalysis ? ["Insurance Needs Analysis"] : []),
    ...(hasInsurancePolicyRecommendations ? ["Recommended Insurance Policies"] : []),
    ...(hasInsuranceReplacement ? ["Insurance Product Replacement"] : []),
    "Projections",
    "Fees and Disclosures",
    "Actions Required by You",
    "Authority to Proceed",
    ...(hasServiceAgreement ? [serviceAgreementContentsLabel] : []),
    ...(hasServiceAgreement ? ["Consent to Deduct Fees"] : []),
    "Appendix",
  ];
  const strategyPageCount = Math.max(adviceCase.recommendations.strategic.length, 1);
  const productPageCount = Math.max(adviceCase.recommendations.product.length, 1);
  const insuranceNeedsPageCount = hasInsuranceNeedsAnalysis ? 1 : 0;
  const insurancePolicyPageCount = hasInsurancePolicyRecommendations ? 1 : 0;
  const insuranceReplacementPageCount = hasInsuranceReplacement ? 1 : 0;
  const executiveSummaryPageNumber = 4;
  const aboutThisAdvicePageNumber = executiveSummaryPageNumber + 1;
  const personalAndFinancialPositionPageNumber = aboutThisAdvicePageNumber + 1;
  const personalAndFinancialPositionPageCount = 3;
  const riskProfilePageNumber = personalAndFinancialPositionPageNumber + personalAndFinancialPositionPageCount;
  const strategyStartPageNumber = riskProfilePageNumber + 1;
  const productStartPageNumber = strategyStartPageNumber + strategyPageCount;
  const investmentPortfolioPageNumber = productStartPageNumber + productPageCount;
  const assetAllocationPageNumber = investmentPortfolioPageNumber + 1;
  const replacementAnalysisPageNumber = assetAllocationPageNumber + 1;
  const insuranceNeedsPageNumber = replacementAnalysisPageNumber + (hasReplacementAnalysis ? 1 : 0);
  const insurancePoliciesPageNumber = insuranceNeedsPageNumber + insuranceNeedsPageCount;
  const insuranceReplacementPageNumber = insurancePoliciesPageNumber + insurancePolicyPageCount;
  const projectionsPageNumber = insuranceReplacementPageNumber + insuranceReplacementPageCount;
  const feesPageNumber = projectionsPageNumber + 1;
  const actionsRequiredPageNumber = feesPageNumber + 1;
  const authorityToProceedPageNumber = actionsRequiredPageNumber + 1;
  const serviceAgreementPageNumber = hasServiceAgreement ? authorityToProceedPageNumber + 1 : null;
  const consentToDeductPageNumber = hasServiceAgreement && serviceAgreementPageNumber ? serviceAgreementPageNumber + 1 : null;
  const appendixPageNumber = authorityToProceedPageNumber + (hasServiceAgreement ? 3 : 1);
  const productDisclosurePageNumber = appendixPageNumber + 1;
  const transactionCostsPageNumber = productDisclosurePageNumber + 1;
  const previewSectionOrder = {
    letter: 10,
    cover: 20,
    contents: 30,
    executiveSummary: 40,
    aboutThisAdvice: 50,
    personalPosition: 600,
    riskProfile: 700,
    strategyRecommendations: 800,
    productRecommendations: 900,
    investmentPortfolio: 1000,
    portfolioAllocation: 1100,
    replacementAnalysis: 1200,
    insuranceNeeds: 1300,
    insurancePolicies: 1310,
    insuranceReplacement: 1320,
    projections: 1400,
    fees: 1500,
    actionsRequired: 1600,
    authorityToProceed: 1700,
    serviceAgreement: 1800,
    consentToDeduct: 1900,
    appendix: 2000,
    productDisclosure: 2010,
    transactionCosts: 2020,
  } as const;
  const renderPageNumber = (pageNumber: number) => <div className={styles.pageNumber}>{pageNumber}</div>;
  const clientSnapshot = buildPersonSnapshot(clientProfile?.client);
  const partnerSnapshot = buildPersonSnapshot(clientProfile?.partner);
  const hasPartner = Boolean(getPersonName(clientProfile?.partner));
  const combinedAddress = [clientSnapshot.address.street, clientSnapshot.address.locality].filter(Boolean).join(", ") || "—";
  const dependants = clientProfile?.dependants ?? [];
  const incomeRows = (clientProfile?.income ?? []).map((entry) => ({
    id: entry.id ?? `${entry.description ?? entry.type}-${entry.owner?.name ?? "owner"}`,
    description: entry.description?.trim() || entry.type?.trim() || "Income",
    owner: resolveOwnerName(entry.owner, entry.joint),
    amount: toAnnualAmount(entry.amount, entry.frequency?.type ?? entry.frequency?.value),
  }));
  const expenseRows = [
    ...(clientProfile?.expense ?? []).map((entry) => ({
      id: entry.id ?? `${entry.description ?? entry.type}-${entry.owner?.name ?? "owner"}`,
      description: entry.description?.trim() || entry.type?.trim() || "Expense",
      owner: resolveOwnerName(entry.owner, entry.joint),
      amount: toAnnualAmount(entry.amount, entry.frequency?.type ?? entry.frequency?.value),
    })),
    ...(clientProfile?.liabilities ?? [])
      .filter((entry) => parseNumericValue(entry.repaymentAmount) > 0)
      .map((entry) => ({
        id: entry.id ?? `${entry.loanType ?? entry.bankName ?? "liability"}-repayment`,
        description: entry.loanType?.trim() || entry.bankName?.trim() || "Liability repayment",
        owner: resolveOwnerName(entry.owner, entry.joint),
        amount: toAnnualAmount(entry.repaymentAmount, entry.repaymentFrequency?.type ?? entry.repaymentFrequency?.value),
      })),
  ];
  const assetRows = clientProfile?.assets ?? [];
  const liabilityRows = clientProfile?.liabilities ?? [];
  const superRows = clientProfile?.superannuation ?? [];
  const pensionRows = clientProfile?.pension ?? [];
  const insuranceRows = clientProfile?.insurance ?? [];
  const entityRows = clientProfile?.entities ?? [];
  const totalExpenses = expenseRows.reduce((sum, entry) => sum + entry.amount, 0);
  const totalAssets = assetRows.reduce((sum, entry) => sum + parseNumericValue(entry.currentValue), 0);
  const totalLiabilities = liabilityRows.reduce((sum, entry) => sum + parseNumericValue(entry.outstandingBalance), 0);
  const riskProfileLabel = toTitleCase(
    adviceCase.riskProfile?.profile && adviceCase.riskProfile.profile !== "unknown"
      ? adviceCase.riskProfile.profile
      : readPersonRiskProfile(clientProfile?.client) ?? readPersonRiskProfile(clientProfile?.partner),
  );
  const riskProfileBenchmarkRows = getRiskProfileBenchmarkRows(primaryAllocationRows);
  const productRexTransactionRows = productRexReports.flatMap((report) => report.transactionRows);
  const transactionRowsByPlatform = groupByPlatformName(productRexTransactionRows);
  const totalTransactionAmount = productRexTransactionRows.reduce(
    (sum, row) => sum + (row.transactionAmount ?? 0),
    0,
  );
  const totalBuySellSpreadAmount = productRexTransactionRows.reduce(
    (sum, row) => sum + (row.buySellSpreadAmount ?? 0),
    0,
  );
  const totalBrokerageAmount = productRexTransactionRows.reduce(
    (sum, row) => sum + (row.brokerageAmount ?? 0),
    0,
  );
  const clientFormalName = getFormalPersonName(clientProfile?.client) ?? addresseeNames[0] ?? "<<clientname>>";
  const partnerFormalName = getFormalPersonName(clientProfile?.partner);
  const coverPreparedFor = [clientFormalName, partnerFormalName].filter(Boolean).join(" and ") || addresseeLine;
  const signaturePeople = [
    { key: "client", name: clientFormalName },
    ...(hasPartner && partnerFormalName ? [{ key: "partner", name: partnerFormalName }] : []),
  ];
  const serviceAgreementFeeItems = serviceAgreementSection?.feeItems ?? [];
  const getServiceAgreementOwnerName = (ownerPersonId?: string | null) => {
    const owner = adviceCase.clientGroup.clients.find((person) => person.personId === ownerPersonId);
    return owner?.fullName?.trim() || addresseeNames[0] || "Client";
  };
  const totalServiceAgreementFees = serviceAgreementSection?.totalAnnualFees ?? 0;
  const serviceAgreementReferenceDate = serviceAgreementSection?.referenceDate ?? payload.savedAt;
  const serviceAgreementExpiryDate = serviceAgreementSection?.expiryDate ?? addDays(serviceAgreementReferenceDate, 150);
  const serviceAgreementArrangementLabel = serviceAgreementSection?.arrangementLabel ?? "ongoing fee arrangement";
  const insuranceCommissions = adviceCase.fees.commissions;
  const hasInsuranceCommissionConsent = insuranceCommissions.length > 0;
  const getCommissionOwnerLabel = (ownerPersonId?: string | null) => {
    const owner = adviceCase.clientGroup.clients.find((person) => person.personId === ownerPersonId);
    return owner?.fullName?.trim() || (owner?.role === "partner" ? "Partner" : "Client");
  };
  const getCommissionOwnerKey = (ownerPersonId?: string | null) =>
    ownerPersonId && adviceCase.clientGroup.clients.some((person) => person.personId === ownerPersonId)
      ? ownerPersonId
      : adviceCase.clientGroup.clients[0]?.personId ?? "client";
  const getCommissionUpfrontPercentage = (commission: AdviceCaseV1["fees"]["commissions"][number]) =>
    commission.upfrontPercentage ?? (commission.type === "upfront" ? commission.percentage : null) ?? DEFAULT_UPFRONT_COMMISSION_PERCENTAGE;
  const getCommissionUpfrontAmount = (commission: AdviceCaseV1["fees"]["commissions"][number]) =>
    commission.upfrontAmount ?? (commission.type === "upfront" ? commission.amount : null);
  const getCommissionOngoingPercentage = (commission: AdviceCaseV1["fees"]["commissions"][number]) =>
    commission.ongoingPercentage ?? (commission.type === "ongoing" ? commission.percentage : null) ?? DEFAULT_ONGOING_COMMISSION_PERCENTAGE;
  const getCommissionOngoingAmount = (commission: AdviceCaseV1["fees"]["commissions"][number]) =>
    commission.ongoingAmount ?? (commission.type === "ongoing" ? commission.amount : null);
  const insuranceCommissionGroups = insuranceCommissions.reduce<
    Array<{
      ownerKey: string;
      ownerName: string;
      commissions: typeof insuranceCommissions;
    }>
  >((groups, commission) => {
    const ownerKey = getCommissionOwnerKey(commission.ownerPersonId);
    const existingGroup = groups.find((group) => group.ownerKey === ownerKey);

    if (existingGroup) {
      existingGroup.commissions.push(commission);
      return groups;
    }

    groups.push({
      ownerKey,
      ownerName: getCommissionOwnerLabel(ownerKey),
      commissions: [commission],
    });
    return groups;
  }, []);
  const totalUpfrontCommission = insuranceCommissions
    .reduce((sum, commission) => sum + (getCommissionUpfrontAmount(commission) ?? 0), 0);
  const totalOngoingCommission = insuranceCommissions
    .reduce((sum, commission) => sum + (getCommissionOngoingAmount(commission) ?? 0), 0);
  const investmentPdsRows = Array.from(
    new Map(
      [
        ...adviceCase.recommendations.product
          .filter((recommendation) => recommendation.productType !== "insurance")
          .map((recommendation) => [
            [
              recommendation.recommendedProvider?.trim(),
              recommendation.recommendedProductName?.trim(),
            ].filter(Boolean).join(" - ") || recommendation.recommendedProductName?.trim() || recommendation.recommendationText,
            {
              productName:
                [
                  recommendation.recommendedProvider?.trim(),
                  recommendation.recommendedProductName?.trim(),
                ].filter(Boolean).join(" - ") || recommendation.recommendedProductName?.trim() || "Recommended product",
              pdsLink: "To be provided",
            },
          ] as const),
        ...portfolioHoldings.map((holding) => [
          holding.fundName,
          {
            productName: holding.code ? `${holding.fundName} (${holding.code})` : holding.fundName,
            pdsLink: "To be provided",
          },
        ] as const),
      ].filter(([key]) => Boolean(key)),
    ).values(),
  );
  const investmentPdsGroups = (() => {
    const accountGroups = portfolioAccountViews
      .map((account) => {
        const rows = Array.from(
          new Map(
            account.holdings
              .filter((holding) => getPortfolioHoldingAmounts(holding).proposedAmount > 0)
              .map((holding) => [
                holding.fundName,
                {
                  productName: holding.code ? `${holding.fundName} (${holding.code})` : holding.fundName,
                  pdsLink: "To be provided",
                },
              ] as const),
          ).values(),
        );

        return { key: account.accountId, label: account.label, rows };
      })
      .filter((group) => group.rows.length);
    const groupedProducts = new Set(accountGroups.flatMap((group) => group.rows.map((row) => row.productName)));
    const ungroupedRows = investmentPdsRows.filter((row) => !groupedProducts.has(row.productName));

    return ungroupedRows.length
      ? [...accountGroups, { key: "other-investment-pds", label: accountGroups.length ? "Other recommended products" : "Investment products", rows: ungroupedRows }]
      : accountGroups;
  })();
  const insurancePdsRows = Array.from(
    new Map(
      [
        ...(adviceCase.recommendations.insurance ?? []).map((recommendation) => [
          [
            recommendation.recommendedProvider?.trim(),
            recommendation.recommendedProductName?.trim(),
          ].filter(Boolean).join(" - ") || recommendation.recommendedProductName?.trim() || recommendation.recommendationText,
          {
            insurer: recommendation.recommendedProvider?.trim() || recommendation.recommendedProductName?.trim() || "Insurance product",
            pdsLink: "To be provided",
          },
        ] as const),
        ...adviceCase.recommendations.product
          .filter((recommendation) => recommendation.productType === "insurance")
          .map((recommendation) => [
            [
              recommendation.recommendedProvider?.trim(),
              recommendation.recommendedProductName?.trim(),
            ].filter(Boolean).join(" - ") || recommendation.recommendedProductName?.trim() || recommendation.recommendationText,
            {
              insurer: recommendation.recommendedProvider?.trim() || recommendation.recommendedProductName?.trim() || "Insurance product",
              pdsLink: "To be provided",
            },
          ] as const),
        ...(adviceCase.recommendations.insurancePolicies ?? []).map((recommendation) => [
          [
            recommendation.insurerName?.trim(),
            recommendation.productName?.trim(),
            recommendation.policyName?.trim(),
          ].filter(Boolean).join(" - ") || recommendation.recommendationText,
          {
            insurer:
              [
                recommendation.insurerName?.trim(),
                recommendation.productName?.trim(),
                recommendation.policyName?.trim(),
              ].filter(Boolean).join(" - ") || "Insurance product",
            pdsLink: "To be provided",
          },
        ] as const),
      ].filter(([key]) => Boolean(key)),
    ).values(),
  );
  const hasInsuranceRecommendations = insurancePdsRows.length > 0;

  return (
    <main className={`${styles.previewPage} ${isEmbedded ? styles.previewPageEmbedded : ""}`.trim()} style={previewStyle}>
      {!isEmbedded ? (
        <div className={styles.toolbar}>
          <button type="button" className={styles.toolbarButton} onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>
      ) : null}

      <article className={styles.document}>
        <section
          id="soa-preview-section-soa-introduction"
          className={`${styles.page} ${styles.letterPage}`.trim()}
          style={{ order: previewSectionOrder.letter }}
        >
          <div className={styles.letterDate}>{formatDate(payload.savedAt)}</div>

          <div className={styles.letterAddressBlock}>
            <div>{addresseeLine}</div>
            <div>{address.street ?? "<<address>>"}</div>
            <div>{address.locality ?? "<<Suburb>> <<State>> <<Postcode>>"}</div>
          </div>

          <div className={styles.letterGreeting}>{`Dear ${addresseeLine},`}</div>

          <h1 className={styles.letterTitle}>Statement of Advice</h1>

          <div className={styles.letterBody}>
            <p>
              Thank you for the opportunity to advise on your financial affairs. We have pleasure in presenting your Statement of Advice (SoA), which sets out our specific recommendations for your consideration.
            </p>
            <p>
              This Statement of Advice (SoA) is based on details of your relevant personal circumstances and forms the basis of our recommendations. If any information in this report is incorrect, or if you have anything further to add, please advise us before proceeding any further.
            </p>
            <p>
              Several steps are involved in designing a strategy to reflect your personal circumstances. The recommendations made in this Statement of Advice (SoA) are the starting point of this process and therefore should only be undertaken after consulting with us.
            </p>
            <p>
              It is very important that you take full ownership of your financial decisions. To that end, we can assist you in making the appropriate decisions, but those decisions remain yours. If necessary, please seek more information and advice from us until you are comfortable to do so.
            </p>
            <p>
              We look forward to being of service to you in implementing the recommended strategies and assisting you in the attainment of your personal and investment objectives.
            </p>
            <p>
              Should you have any queries in relation to the above or should you wish to fine-tune any aspect of the recommended strategy, please do not hesitate to contact me.
            </p>
          </div>

          <div className={styles.letterSignatureBlock}>
            <div>Yours sincerely,</div>
            <div className={styles.signatureMark}>{adviserName}</div>
            <div>{adviserName}</div>
            <div>{practiceName}</div>
            <div>{`ABN: ${practiceAbn}`}</div>
            <div>AFSL: 368175</div>
          </div>
          {renderPageNumber(1)}
        </section>

        <section className={`${styles.page} ${styles.coverPage}`.trim()} style={{ order: previewSectionOrder.cover }}>
          <div className={styles.coverTitleBlock}>
            <h1 className={styles.coverTitle}>Statement of Advice</h1>
          </div>

          <div className={styles.coverPreparedBlock}>
            <div className={styles.coverLabel}>Prepared for</div>
            <div className={styles.coverPreparedName}>{coverPreparedFor}</div>
          </div>

          {practiceLogo ? (
            <img className={styles.coverLogoImage} src={practiceLogo} alt={`${practiceName} logo`} />
          ) : (
            <div className={styles.coverLogoMark}>
              <span>Your</span>
              <strong>Logo</strong>
              <span>Here</span>
            </div>
          )}

          <div className={styles.coverPreparedBlock}>
            <div className={styles.coverLabel}>Prepared by</div>
            <div className={styles.coverPreparedName}>{adviserName}</div>
            <div className={styles.coverDetailLine}>ASIC Adviser Number: {adviserAsicNumber}</div>
            <div className={styles.coverDate}>{formatDate(payload.savedAt)}</div>
          </div>

          <div className={styles.coverDetailsGrid}>
            <div className={styles.coverDetailSection}>
              <h2>Financial Adviser of</h2>
              <p>{practiceName}</p>
              <p>Corporate Authorised Rep of {licenseeName}</p>
              <p>ASIC Adviser Number: {adviserAsicNumber}</p>
              <p>ABN: {practiceAbn}</p>
            </div>

            <div className={styles.coverDetailSection}>
              <p>{adviserAddress.street}</p>
              <p>{adviserAddress.locality}</p>
              <p>Telephone: {adviserAddress.phone}</p>
              <p>Email: {adviserEmail}</p>
            </div>

            <div className={styles.coverDetailSection}>
              <h2>Australian Financial Services Licensee</h2>
              <p>Licensee Name: {licenseeName}</p>
              <p>AFSL No: 368175</p>
            </div>
          </div>
          {renderPageNumber(2)}
        </section>

        <section className={`${styles.page} ${styles.contentsPage}`.trim()} style={{ order: previewSectionOrder.contents }}>
          <div className={styles.contentsEyebrow}>Document Overview</div>
          <h2 className={styles.contentsTitle}>Table of Contents</h2>
          <div className={styles.contentsList}>
            {contentsItems.map((item, index) => (
              <div key={item} className={styles.contentsRow}>
                <span className={styles.contentsIndex}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.contentsLabel}>{item}</span>
                <span className={styles.contentsLeader} />
              </div>
            ))}
          </div>
          {renderPageNumber(3)}
        </section>

        <section className={styles.page} style={{ order: previewSectionOrder.executiveSummary }}>
          <h2 className={styles.sectionHeading}>Executive Summary</h2>
          <p className={styles.sectionIntro}>{EXECUTIVE_SUMMARY_INTRO}</p>
          <div className={styles.card}>
            <h3>What Our Advice Covers</h3>
            <p>{EXECUTIVE_SUMMARY_SCOPE_INTRO}</p>
            {renderBulletList(
              adviceCase.scope.included.map((item) => item.topic),
              "No scope items drafted yet.",
            )}
          </div>
          <div className={styles.card}>
            <h3>Better Position Statement</h3>
            <p>{BETTER_POSITION_STATEMENT_INTRO}</p>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Recommendation</th>
                  <th>Better position</th>
                </tr>
              </thead>
              <tbody>
                {betterPositionRows.length ? (
                  betterPositionRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.recommendation}</td>
                      <td>{row.betterPosition}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2}>No recommendations have been drafted yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className={styles.card}>
            <h3>Summary of Advice Fees</h3>
            <p>{SUMMARY_OF_ADVICE_FEES_INTRO}</p>
            <h4 className={styles.feeSubheading}>Advice Preparation &amp; Implementation Fee</h4>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Fee Type</th>
                  <th>Amount (Include GST)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Plan Preparation Fee</td>
                  <td>{formatCurrency(preparationFee)}</td>
                </tr>
                <tr>
                  <td>Implementation Fee</td>
                  <td>{formatCurrency(implementationFee)}</td>
                </tr>
                <tr className={styles.totalRow}>
                  <td><strong>Total</strong></td>
                  <td><strong>{formatCurrency(hasAdviceFeeData ? totalAdviceFees : null)}</strong></td>
                </tr>
              </tbody>
            </table>
            <h4 className={styles.feeSubheading}>Ongoing Fees</h4>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Product</th>
                  <th>Account Number</th>
                  <th>Fee Amount</th>
                  <th>Frequency</th>
                  <th>Total Annual Fee</th>
                </tr>
              </thead>
              <tbody>
                {serviceAgreementFeeItems.length ? (
                  <>
                    {serviceAgreementFeeItems.map((feeItem) => (
                      <tr key={feeItem.feeItemId}>
                        <td>{getServiceAgreementOwnerName(feeItem.ownerPersonId)}</td>
                        <td>{feeItem.productName || "—"}</td>
                        <td>{feeItem.accountNumber || "—"}</td>
                        <td>{formatCurrency(feeItem.feeAmount)}</td>
                        <td>{SERVICE_FEE_FREQUENCY_OPTIONS.find((option) => option.value === feeItem.frequency)?.label ?? feeItem.frequency}</td>
                        <td>{formatCurrency(getServiceFeeAnnualAmount(feeItem))}</td>
                      </tr>
                    ))}
                    <tr className={styles.totalRow}>
                      <td colSpan={5}><strong>Total Annual Advice Fees</strong></td>
                      <td><strong>{formatCurrency(totalServiceAgreementFees)}</strong></td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td colSpan={6}>No ongoing fee rows have been drafted yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {renderPageNumber(executiveSummaryPageNumber)}
        </section>

        <section className={styles.page} style={{ order: previewSectionOrder.aboutThisAdvice }}>
          <h2 className={styles.sectionHeading}>About This Advice</h2>
          <div id="soa-preview-section-scope-of-advice" className={styles.card}>
            <h3>Scope of Advice</h3>
            <h4 className={styles.subheading}>Included scope</h4>
            {renderBulletList(
              adviceCase.scope.included.map((item) => item.topic),
              "No scope items drafted yet.",
            )}
            <h4 className={styles.subheading}>Limitations and exclusions</h4>
            {renderBulletList(
              [...adviceCase.scope.excluded.map((item) => item.topic), ...adviceCase.scope.limitations],
              "No exclusions drafted yet.",
            )}
          </div>
          <div id="soa-preview-section-objectives" className={styles.card}>
            <h3>Client Objectives</h3>
            {renderBulletList(
              adviceCase.objectives.map((objective) => objective.text),
              "No objectives drafted yet.",
            )}
          </div>
          <div className={styles.card}>
            <h3>Warnings and limitations</h3>
            <div className={styles.warningDisclosureStack}>
              {ABOUT_ADVICE_WARNINGS.map((warning) => (
                <div key={warning.title} className={styles.warningDisclosureBlock}>
                  <h4>{warning.title}</h4>
                  <p>{warning.text}</p>
                </div>
              ))}
            </div>
          </div>
          {renderPageNumber(aboutThisAdvicePageNumber)}
        </section>

        <section className={styles.page} style={{ order: previewSectionOrder.personalPosition }}>
          <h2 className={styles.sectionHeading}>Your Personal and Financial Position</h2>
          <p className={styles.sectionIntro}>
            Here is a summary of the relevant aspects of your personal and financial details that you have provided to us.
            We have taken this into consideration when developing our advice so if any information is incomplete or
            incorrect, please advise us before proceeding.
          </p>

          <div className={styles.card}>
            <h3>{`${clientNames}'s Current Situation`}</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>{clientSnapshot.name}</th>
                  <th>{hasPartner ? partnerSnapshot.name : ""}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Age</td>
                  <td>{clientSnapshot.age ?? "—"}</td>
                  <td>{hasPartner ? partnerSnapshot.age ?? "—" : "—"}</td>
                </tr>
                <tr>
                  <td>Date of birth</td>
                  <td>{clientSnapshot.dob}</td>
                  <td>{hasPartner ? partnerSnapshot.dob : "—"}</td>
                </tr>
                <tr>
                  <td>Marital status</td>
                  <td>{clientSnapshot.maritalStatus}</td>
                  <td>{hasPartner ? partnerSnapshot.maritalStatus : "—"}</td>
                </tr>
                <tr>
                  <td>Resident status</td>
                  <td>{clientSnapshot.residentStatus}</td>
                  <td>{hasPartner ? partnerSnapshot.residentStatus : "—"}</td>
                </tr>
                <tr>
                  <td>Preferred contact</td>
                  <td>{clientSnapshot.preferredContact}</td>
                  <td>{hasPartner ? partnerSnapshot.preferredContact : "—"}</td>
                </tr>
                <tr>
                  <td>Preferred address</td>
                  <td colSpan={hasPartner ? 2 : 1}>{combinedAddress}</td>
                </tr>
                <tr>
                  <td>Employment status</td>
                  <td>{clientSnapshot.employmentStatus}</td>
                  <td>{hasPartner ? partnerSnapshot.employmentStatus : "—"}</td>
                </tr>
                <tr>
                  <td>Job title</td>
                  <td>{clientSnapshot.jobTitle}</td>
                  <td>{hasPartner ? partnerSnapshot.jobTitle : "—"}</td>
                </tr>
                <tr>
                  <td>Current state of health</td>
                  <td>{clientSnapshot.healthStatus}</td>
                  <td>{hasPartner ? partnerSnapshot.healthStatus : "—"}</td>
                </tr>
                <tr>
                  <td>Private health insurance</td>
                  <td>{clientSnapshot.healthInsurance}</td>
                  <td>{hasPartner ? partnerSnapshot.healthInsurance : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className={styles.card}>
            <h3>Children/Dependants</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Date of birth</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {dependants.length ? (
                  dependants.map((entry) => (
                    <tr key={entry.id ?? `${entry.name ?? "dependant"}-${entry.birthday ?? ""}`}>
                      <td>{entry.name ?? "—"}</td>
                      <td>{formatDateValue(entry.birthday)}</td>
                      <td>{entry.owner?.name?.trim() || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>No dependants have been recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {renderPageNumber(personalAndFinancialPositionPageNumber)}
        </section>

        <section className={styles.page} style={{ order: previewSectionOrder.personalPosition + 1 }}>
          <div className={styles.card}>
            <h3>Income</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Income</th>
                  <th>Owner</th>
                  <th>Amount (p.a.)</th>
                </tr>
              </thead>
              <tbody>
                {incomeRows.length ? (
                  incomeRows.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.description}</td>
                      <td>{entry.owner}</td>
                      <td>{formatCurrency(entry.amount)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>No income has been recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.card}>
            <h3>Expenditure</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Expense</th>
                  <th>Owner</th>
                  <th>Amount (p.a.)</th>
                </tr>
              </thead>
              <tbody>
                {expenseRows.length ? (
                  <>
                    {expenseRows.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.description}</td>
                        <td>{entry.owner}</td>
                        <td>{formatCurrency(entry.amount)}</td>
                      </tr>
                    ))}
                    <tr className={styles.totalRow}>
                      <td colSpan={2}><strong>Total expenses (per annum)</strong></td>
                      <td><strong>{formatCurrency(totalExpenses)}</strong></td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td colSpan={3}>No expenses have been recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.card}>
            <h3>Assets</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Owner</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {assetRows.length ? (
                  <>
                    {assetRows.map((entry) => (
                      <tr key={entry.id ?? `${entry.description ?? entry.assetType ?? entry.type}-${entry.owner?.name ?? "owner"}`}>
                        <td>{entry.description?.trim() || entry.assetType?.trim() || entry.type?.trim() || "Asset"}</td>
                        <td>{resolveOwnerName(entry.owner, entry.joint)}</td>
                        <td>{formatCurrency(parseNumericValue(entry.currentValue))}</td>
                      </tr>
                    ))}
                    <tr className={styles.totalRow}>
                      <td colSpan={2}><strong>Total assets</strong></td>
                      <td><strong>{formatCurrency(totalAssets)}</strong></td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td colSpan={3}>No assets have been recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.card}>
            <h3>Liabilities</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Owner</th>
                  <th>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {liabilityRows.length ? (
                  <>
                    {liabilityRows.map((entry) => (
                      <tr key={entry.id ?? `${entry.loanType ?? entry.bankName}-${entry.owner?.name ?? "owner"}`}>
                        <td>{entry.loanType?.trim() || entry.bankName?.trim() || "Liability"}</td>
                        <td>{resolveOwnerName(entry.owner, entry.joint)}</td>
                        <td>{formatCurrency(parseNumericValue(entry.outstandingBalance))}</td>
                      </tr>
                    ))}
                    <tr className={styles.totalRow}>
                      <td colSpan={2}><strong>Total liabilities</strong></td>
                      <td><strong>{formatCurrency(totalLiabilities)}</strong></td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td colSpan={3}>No liabilities have been recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {renderPageNumber(personalAndFinancialPositionPageNumber + 1)}
        </section>

        <section className={styles.page} style={{ order: previewSectionOrder.personalPosition + 2 }}>
          <div className={styles.card}>
            <h3>Superannuation funds</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Owner</th>
                  <th>Current Balance</th>
                </tr>
              </thead>
              <tbody>
                {superRows.length ? (
                  superRows.map((entry) => (
                    <tr key={entry.id ?? `${entry.superFund ?? entry.type}-${entry.owner?.name ?? "owner"}`}>
                      <td>{entry.superFund?.trim() || entry.type?.trim() || "Super fund"}</td>
                      <td>{resolveOwnerName(entry.owner, entry.joint)}</td>
                      <td>{formatCurrency(parseNumericValue(entry.balance))}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>No superannuation funds have been recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.card}>
            <h3>Pension funds</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Owner</th>
                  <th>Current Balance</th>
                </tr>
              </thead>
              <tbody>
                {pensionRows.length ? (
                  pensionRows.map((entry) => (
                    <tr key={entry.id ?? `${entry.superFund ?? entry.type}-${entry.owner?.name ?? "owner"}`}>
                      <td>{entry.superFund?.trim() || entry.type?.trim() || "Pension fund"}</td>
                      <td>{resolveOwnerName(entry.owner, false)}</td>
                      <td>{formatCurrency(parseNumericValue(entry.balance))}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>No pension funds have been recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.card}>
            <h3>Personal insurance policies</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Policy Purpose</th>
                  <th>Owner</th>
                  <th>Type</th>
                  <th>Cover</th>
                  <th>Premium</th>
                </tr>
              </thead>
              <tbody>
                {insuranceRows.length ? (
                  insuranceRows.map((entry) => (
                    <tr key={entry.id ?? `${entry.coverRequired ?? entry.insurer}-${entry.owner?.name ?? "owner"}`}>
                      <td>{entry.insurer?.trim() || "Insurance policy"}</td>
                      <td>{resolveOwnerName(entry.owner, entry.joint)}</td>
                      <td>{entry.coverRequired?.trim() || "—"}</td>
                      <td>{formatCurrency(parseNumericValue(entry.sumInsured))}</td>
                      <td>{formatCurrency(parseNumericValue(entry.premiumAmount))}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>No personal insurance policies have been recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.card}>
            <h3>Linked entities</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Owner</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {entityRows.length ? (
                  entityRows.map((entry) => (
                    <tr key={entry.id ?? entry.entitiesId ?? `${entry.name ?? "entity"}-${entry.owner?.name ?? "owner"}`}>
                      <td>{entry.name?.trim() || "—"}</td>
                      <td>{entry.owner?.name?.trim() || "—"}</td>
                      <td>{entry.type?.trim() || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>No linked entities have been recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {renderPageNumber(personalAndFinancialPositionPageNumber + 2)}
        </section>

        <section
          id="soa-preview-section-risk-profile"
          className={styles.page}
          style={{ order: previewSectionOrder.riskProfile }}
        >
          <h2 className={styles.sectionHeading}>Risk Profile</h2>
          <p className={styles.sectionIntro}>
            We discussed your attitude to investment risk and your degree of concern regarding several investment related
            issues. As we discussed, we assess your appetite for, and tolerance of, investment risk to assist us to
            develop an investment strategy appropriate to your particular circumstances.
          </p>
          <p className={styles.sectionIntro}>
            When designing a portfolio consistent with your risk profile, we considered your preferences, the appropriate
            exposure to investment sectors and asset classes such as cash, fixed interest, property, and shares.
          </p>
          <p className={styles.sectionIntro}>
            {clientNames}, based on your previous responses to the risk profile questionnaire and our discussions about
            your preferences, experience, and knowledge, we have classified you as {riskProfileLabel} investors.
          </p>
          <div className={styles.card}>
            <h3>{`Benchmark Asset Allocation for a ${riskProfileLabel} Investor`}</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Asset Class</th>
                  <th className={styles.targetAllocationCell}>Recommended Target Asset Allocation</th>
                  <th>Minimum</th>
                  <th>Maximum</th>
                </tr>
              </thead>
              <tbody>
                {riskProfileBenchmarkRows.length ? (
                  riskProfileBenchmarkRows.map((row) => (
                    <tr key={row.assetClass}>
                      <td>{row.assetClass}</td>
                      <td className={styles.targetAllocationCell}>{formatPercent(row.targetPct)}</td>
                      <td>{formatPercent(row.minimumPct)}</td>
                      <td>{formatPercent(row.maximumPct)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>No risk profile benchmark allocation has been drafted yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {renderPageNumber(riskProfilePageNumber)}
        </section>

        {adviceCase.recommendations.strategic.length ? (
          adviceCase.recommendations.strategic.map((recommendation, index) => (
            <section
              key={recommendation.recommendationId}
              id={index === 0 ? "soa-preview-section-strategy-recommendations" : undefined}
              className={styles.page}
              style={{ order: previewSectionOrder.strategyRecommendations + index }}
            >
              {index === 0 ? (
                <>
                  <h2 className={styles.sectionHeading}>Strategy Recommendations</h2>
                  <p className={styles.sectionIntro}>{STRATEGY_RECOMMENDATIONS_INTRO}</p>
                </>
              ) : null}
              <div className={styles.recommendationBlock}>
                <h3>{`Recommendation ${index + 1}`}</h3>
                <p className={styles.recommendationText}>{recommendation.recommendationText || "Draft recommendation not yet written."}</p>
                <div className={styles.recommendationDetailStack}>
                  <div className={styles.card}>
                    <h4>Benefits</h4>
                    {renderBulletList(
                      [
                        ...recommendation.clientBenefits.map((benefit) => benefit.text).filter(Boolean),
                        recommendation.rationale ?? "",
                      ].filter(Boolean),
                      "No benefits drafted yet.",
                    )}
                  </div>
                  <div className={styles.card}>
                    <h4>Consequences and trade-offs</h4>
                    {renderConsequenceList(recommendation.consequences)}
                  </div>
                </div>
                <div className={styles.card}>
                  <h4>Alternatives considered</h4>
                  {renderAlternatives(recommendation.alternativesConsidered)}
                </div>
              </div>
              {renderPageNumber(strategyStartPageNumber + index)}
            </section>
          ))
        ) : (
          <section
            id="soa-preview-section-strategy-recommendations"
            className={styles.page}
            style={{ order: previewSectionOrder.strategyRecommendations }}
          >
            <h2 className={styles.sectionHeading}>Strategy Recommendations</h2>
            <p className={styles.emptyState}>No strategy recommendations drafted yet.</p>
            {renderPageNumber(strategyStartPageNumber)}
          </section>
        )}

        {adviceCase.recommendations.product.length ? (
          adviceCase.recommendations.product.map((recommendation, index) => (
            <section
              key={recommendation.recommendationId}
              id={index === 0 ? "soa-preview-section-product-recommendations" : undefined}
              className={styles.page}
              style={{ order: previewSectionOrder.productRecommendations + index }}
            >
              <h2 className={styles.sectionHeading}>Product Recommendations</h2>
              <div className={styles.recommendationBlock}>
                <h3>{`Product Recommendation ${index + 1}`}</h3>
                <p className={styles.recommendationText}>{recommendation.recommendationText || "Draft product recommendation not yet written."}</p>
                <div className={styles.recommendationDetailStack}>
                  <div className={styles.card}>
                    <h4>Benefits</h4>
                    {renderBulletList(
                      [
                        ...recommendation.clientBenefits.map((benefit) => benefit.text).filter(Boolean),
                        recommendation.suitabilityRationale ?? "",
                      ].filter(Boolean),
                      "No benefits drafted yet.",
                    )}
                  </div>
                  <div className={styles.card}>
                    <h4>Consequences and trade-offs</h4>
                    {renderConsequenceList(recommendation.consequences)}
                  </div>
                </div>
              </div>
              {renderPageNumber(productStartPageNumber + index)}
            </section>
          ))
        ) : (
          <section
            id="soa-preview-section-product-recommendations"
            className={styles.page}
            style={{ order: previewSectionOrder.productRecommendations }}
          >
            <h2 className={styles.sectionHeading}>Product Recommendations</h2>
            <p className={styles.emptyState}>No product recommendations drafted yet.</p>
            {renderPageNumber(productStartPageNumber)}
          </section>
        )}

        {hasInsuranceNeedsAnalysis ? (
          <section
            id="soa-preview-section-insurance-needs-analysis"
            className={styles.page}
            style={{ order: previewSectionOrder.insuranceNeeds }}
          >
            <h2 className={styles.sectionHeading}>Insurance Needs Analysis</h2>
            <p className={styles.sectionIntro}>The following is a summary analysis of your insurance needs.</p>
            <div className={styles.recommendationDetailStack}>
              {adviceCase.clientGroup.clients
                .map((person) => {
                  const analyses = (adviceCase.recommendations.insuranceNeedsAnalyses ?? []).filter((analysis) =>
                    analysis.ownerPersonIds.includes(person.personId),
                  );
                  if (!analyses.length) {
                    return null;
                  }

                  const totals = analyses.reduce(
                    (sum, analysis) => {
                      const key = getInsuranceCoverTypeKey(analysis.policyType);
                      if (key) {
                        sum.required[key] += analysis.outputs.targetCoverAmount ?? 0;
                        sum.available[key] += analysis.inputs.existingCoverAmount ?? 0;
                        sum.cover[key] += analysis.outputs.coverGapAmount ?? Math.max((analysis.outputs.targetCoverAmount ?? 0) - (analysis.inputs.existingCoverAmount ?? 0), 0);
                      }
                      return sum;
                    },
                    {
                      required: { life: 0, tpd: 0, trauma: 0, incomeProtection: 0 },
                      available: { life: 0, tpd: 0, trauma: 0, incomeProtection: 0 },
                      cover: { life: 0, tpd: 0, trauma: 0, incomeProtection: 0 },
                    },
                  );

                  return (
                    <div key={`insurance-needs-${person.personId}`} className={styles.card}>
                      <h3>{person.fullName}</h3>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>{person.fullName}</th>
                            <th>Life</th>
                            <th>TPD</th>
                            <th>Trauma</th>
                            <th>IP (p.a.)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className={styles.platformSubheadingRow}><td colSpan={5}>Capital Requirements</td></tr>
                          {analyses.map((analysis) => {
                            const key = getInsuranceCoverTypeKey(analysis.policyType);
                            return (
                              <tr key={`${analysis.analysisId}-required`}>
                                <td>{analysis.purpose || `${toTitleCase(analysis.policyType)} cover required`}</td>
                                <td>{key === "life" ? formatCurrency(analysis.outputs.targetCoverAmount) : "—"}</td>
                                <td>{key === "tpd" ? formatCurrency(analysis.outputs.targetCoverAmount) : "—"}</td>
                                <td>{key === "trauma" ? formatCurrency(analysis.outputs.targetCoverAmount) : "—"}</td>
                                <td>{key === "incomeProtection" ? formatCurrency(analysis.outputs.targetCoverAmount) : "—"}</td>
                              </tr>
                            );
                          })}
                          <tr className={styles.totalRow}>
                            <td><strong>Total Capital Required</strong></td>
                            <td><strong>{formatCurrency(totals.required.life)}</strong></td>
                            <td><strong>{formatCurrency(totals.required.tpd)}</strong></td>
                            <td><strong>{formatCurrency(totals.required.trauma)}</strong></td>
                            <td><strong>{formatCurrency(totals.required.incomeProtection)}</strong></td>
                          </tr>
                          <tr className={styles.platformSubheadingRow}><td colSpan={5}>Capital Provisions</td></tr>
                          {analyses.map((analysis) => {
                            const key = getInsuranceCoverTypeKey(analysis.policyType);
                            return (
                              <tr key={`${analysis.analysisId}-available`}>
                                <td>Existing cover and available provisions</td>
                                <td>{key === "life" ? formatCurrency(analysis.inputs.existingCoverAmount) : "—"}</td>
                                <td>{key === "tpd" ? formatCurrency(analysis.inputs.existingCoverAmount) : "—"}</td>
                                <td>{key === "trauma" ? formatCurrency(analysis.inputs.existingCoverAmount) : "—"}</td>
                                <td>{key === "incomeProtection" ? formatCurrency(analysis.inputs.existingCoverAmount) : "—"}</td>
                              </tr>
                            );
                          })}
                          <tr className={styles.totalRow}>
                            <td><strong>Total Capital Available</strong></td>
                            <td><strong>{formatCurrency(totals.available.life)}</strong></td>
                            <td><strong>{formatCurrency(totals.available.tpd)}</strong></td>
                            <td><strong>{formatCurrency(totals.available.trauma)}</strong></td>
                            <td><strong>{formatCurrency(totals.available.incomeProtection)}</strong></td>
                          </tr>
                          <tr className={styles.totalRow}>
                            <td><strong>Total Cover Required</strong></td>
                            <td><strong>{formatCurrency(totals.cover.life)}</strong></td>
                            <td><strong>{formatCurrency(totals.cover.tpd)}</strong></td>
                            <td><strong>{formatCurrency(totals.cover.trauma)}</strong></td>
                            <td><strong>{formatCurrency(totals.cover.incomeProtection)}</strong></td>
                          </tr>
                        </tbody>
                      </table>
                      <h3>Basis</h3>
                      {renderBulletList(
                        analyses.map((analysis) => analysis.rationale || analysis.inputs.notes || analysis.outputs.suggestedStructureNotes || "").filter(Boolean),
                        "Needs analysis basis has not been drafted yet.",
                      )}
                    </div>
                  );
                })
                .filter(Boolean)}
            </div>
            {renderPageNumber(insuranceNeedsPageNumber)}
          </section>
        ) : null}

        {hasInsurancePolicyRecommendations ? (
          <section
            id="soa-preview-section-insurance-analysis"
            className={styles.page}
            style={{ order: previewSectionOrder.insurancePolicies }}
          >
            <h2 className={styles.sectionHeading}>Recommended Insurance Policies</h2>
            <p className={styles.sectionIntro}>{INSURANCE_RECOMMENDATIONS_INTRO}</p>
            <div className={styles.recommendationDetailStack}>
              {(adviceCase.recommendations.insurancePolicies ?? []).map((policy) => {
                const insuredPerson = adviceCase.clientGroup.clients.find((person) => person.personId === policy.insuredPersonId);
                const insuredName = insuredPerson?.fullName || "Insured person to be confirmed";

                return (
                  <div key={policy.policyRecommendationId} className={styles.card}>
                    <h3>{insuredName}</h3>
                    <div className={styles.insurancePolicyHeader}>
                      <div>
                        <strong>{policy.insurerName || "Insurer to be confirmed"}</strong>
                        <span>{[policy.productName, policy.policyName].filter(Boolean).join(" - ") || "Product details to be confirmed"}</span>
                      </div>
                    </div>
                    {policy.recommendationText ? <p>{policy.recommendationText}</p> : null}
                    {policy.ownershipGroups.map((group) => (
                      <div key={group.groupId} className={styles.insurancePolicyGroup}>
                        <h4>{formatInsuranceOwnership(group.ownership)}</h4>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>Cover type</th>
                              <th>Details</th>
                              <th>Premium type</th>
                              <th>Sum insured / benefit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.covers.length ? (
                              group.covers.map((cover) => (
                                <tr key={cover.coverId}>
                                  <td>{toTitleCase(cover.coverType)}</td>
                                  <td>{[cover.details, cover.waitingPeriod ? `Wait: ${cover.waitingPeriod}` : "", cover.benefitPeriod ? `Benefit: ${cover.benefitPeriod}` : ""].filter(Boolean).join(", ") || "—"}</td>
                                  <td>{formatInsurancePremiumType(cover.premiumType)}</td>
                                  <td>{cover.coverType === "income-protection" ? `${formatCurrency(cover.monthlyBenefit)}/month` : formatCurrency(cover.sumInsured)}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={4}>No cover components have been recorded.</td>
                              </tr>
                            )}
                            <tr className={styles.totalRow}>
                              <td colSpan={3}>
                                <strong>
                                  {formatInsuranceFrequency(group.premiumFrequency)} premium
                                  {group.fundingSource ? ` funded via ${group.fundingSource}` : ""}
                                </strong>
                              </td>
                              <td><strong>{formatCurrency(group.premiumAmount)}</strong></td>
                            </tr>
                            <tr className={styles.totalRow}>
                              <td colSpan={3}><strong>Annualised premium subtotal</strong></td>
                              <td><strong>{formatCurrency(getInsuranceAnnualisedPremium(group))}</strong></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ))}
                    {(policy.optionalBenefits ?? []).length ? (
                      <div className={styles.card}>
                        <h4>Optional benefits</h4>
                        {renderBulletList(policy.optionalBenefits ?? [], "No optional benefits have been recorded.")}
                      </div>
                    ) : null}
                    {policy.underwritingNotes || policy.replacementNotes ? (
                      <p>{[policy.underwritingNotes, policy.replacementNotes].filter(Boolean).join(" ")}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {renderPageNumber(insurancePoliciesPageNumber)}
          </section>
        ) : null}

        {hasInsuranceReplacement ? (
          <section
            id="soa-preview-section-insurance-replacement"
            className={styles.page}
            style={{ order: previewSectionOrder.insuranceReplacement }}
          >
            <h2 className={styles.sectionHeading}>Insurance Product Replacement</h2>
            <p className={styles.sectionIntro}>The table below shows a direct cost comparison of your current cover against the recommended replacements.</p>
            <div className={styles.recommendationDetailStack}>
              {(adviceCase.recommendations.insuranceReplacements ?? []).map((replacement) => {
                const owner = adviceCase.clientGroup.clients.find((person) => person.personId === replacement.ownerPersonId);
                const premiumDifference =
                  replacement.premiumDifference ??
                  ((replacement.recommendedPolicy.totalAnnualPremium ?? 0) - (replacement.currentPolicy.totalAnnualPremium ?? 0));

                return (
                  <div key={replacement.replacementId} className={styles.card}>
                    <h3>{owner?.fullName || "Policy owner to be confirmed"}</h3>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th />
                          <th>Current insurance policy/policies</th>
                          <th>Recommended insurance policy</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Insurer</td>
                          <td>{replacement.currentPolicy.insurer || "—"}</td>
                          <td>{replacement.recommendedPolicy.insurer || "—"}</td>
                        </tr>
                        <tr>
                          <td>Total Life Cover</td>
                          <td>{getInsurancePolicySnapshotValue(replacement.currentPolicy, "totalLifeCover")}</td>
                          <td>{getInsurancePolicySnapshotValue(replacement.recommendedPolicy, "totalLifeCover")}</td>
                        </tr>
                        <tr>
                          <td>Total TPD Cover</td>
                          <td>{getInsurancePolicySnapshotValue(replacement.currentPolicy, "totalTpdCover")}</td>
                          <td>{getInsurancePolicySnapshotValue(replacement.recommendedPolicy, "totalTpdCover")}</td>
                        </tr>
                        <tr>
                          <td>Total Income Protection Cover</td>
                          <td>{getInsurancePolicySnapshotValue(replacement.currentPolicy, "totalIncomeProtectionCover")}</td>
                          <td>{getInsurancePolicySnapshotValue(replacement.recommendedPolicy, "totalIncomeProtectionCover")}</td>
                        </tr>
                        <tr>
                          <td>Total Trauma Cover</td>
                          <td>{getInsurancePolicySnapshotValue(replacement.currentPolicy, "totalTraumaCover")}</td>
                          <td>{getInsurancePolicySnapshotValue(replacement.recommendedPolicy, "totalTraumaCover")}</td>
                        </tr>
                        <tr>
                          <td>Total Premium (Annual)</td>
                          <td>{getInsurancePolicySnapshotValue(replacement.currentPolicy, "totalAnnualPremium")}</td>
                          <td>{getInsurancePolicySnapshotValue(replacement.recommendedPolicy, "totalAnnualPremium")}</td>
                        </tr>
                        <tr className={styles.totalRow}>
                          <td><strong>Difference in Premiums</strong></td>
                          <td colSpan={2}><strong>{formatCurrency(premiumDifference)}</strong></td>
                        </tr>
                      </tbody>
                    </table>
                    <h3>Replacement Details</h3>
                    <h4>Reasons for Replacement</h4>
                    {renderBulletList(replacement.reasons, "Replacement reasons have not been drafted yet.")}
                    <h4>Costs of Replacement</h4>
                    {renderBulletList(replacement.costs, "Replacement costs have not been drafted yet.")}
                    <h3>Policy Benefits</h3>
                    <div className={styles.twoColumnGrid}>
                      <div>
                        <h4>Gained</h4>
                        {renderBulletList(replacement.benefitsGained, "Benefits gained have not been drafted yet.")}
                      </div>
                      <div>
                        <h4>Lost</h4>
                        {renderBulletList(replacement.benefitsLost, "Benefits lost have not been drafted yet.")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {renderPageNumber(insuranceReplacementPageNumber)}
          </section>
        ) : null}

        <section className={styles.page} style={{ order: previewSectionOrder.investmentPortfolio }}>
          <h2 className={styles.sectionHeading}>Investment Portfolio Recommendations</h2>
          {portfolioAccountViews.some((account) => account.holdings.length) ? (
            <>
              <div className={styles.card}>
                <h3>Recommended Holdings</h3>
                {portfolioAccountViews
                  .filter((account) => account.holdings.length)
                  .map((account) => (
                    <div key={account.accountId} className={styles.portfolioAccountGroup}>
                      <h4>{account.label}</h4>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Fund</th>
                            <th>Current</th>
                            <th>Change</th>
                            <th>Proposed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupByPlatformName(account.holdings).flatMap(({ platformName, items }) => {
                            const subtotalCurrent = items.reduce(
                              (sum, holding) => sum + getPortfolioHoldingAmounts(holding).currentAmount,
                              0,
                            );
                            const subtotalChange = items.reduce(
                              (sum, holding) => sum + getPortfolioHoldingAmounts(holding).changeAmount,
                              0,
                            );
                            const subtotalProposed = items.reduce(
                              (sum, holding) => sum + getPortfolioHoldingAmounts(holding).proposedAmount,
                              0,
                            );

                            return [
                              <tr key={`${account.accountId}-${platformName}-heading`} className={styles.platformSubheadingRow}>
                                <td colSpan={4}>{platformName}</td>
                              </tr>,
                              ...items.map((holding) => {
                                const { currentAmount, changeAmount, proposedAmount } = getPortfolioHoldingAmounts(holding);

                                return (
                                  <tr key={`${account.accountId}-${holding.holdingId}`}>
                                    <td>{holding.fundName}</td>
                                    <td>{formatCurrency(currentAmount)}</td>
                                    <td>{formatCurrency(changeAmount)}</td>
                                    <td>{formatCurrency(proposedAmount)}</td>
                                  </tr>
                                );
                              }),
                              <tr key={`${account.accountId}-${platformName}-subtotal`} className={styles.platformSubtotalRow}>
                                <td><strong>Subtotal</strong></td>
                                <td><strong>{formatCurrency(subtotalCurrent)}</strong></td>
                                <td><strong>{formatCurrency(subtotalChange)}</strong></td>
                                <td><strong>{formatCurrency(subtotalProposed)}</strong></td>
                              </tr>,
                            ];
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <p className={styles.emptyState}>No portfolio data has been populated yet.</p>
          )}
          {renderPageNumber(investmentPortfolioPageNumber)}
        </section>

        <section
          id="soa-preview-section-portfolio-allocation"
          className={styles.page}
          style={{ order: previewSectionOrder.portfolioAllocation }}
        >
          {portfolioAccountViews.some((account) => account.allocationComparison.length) ? (
            <div className={styles.recommendationDetailStack}>
              {portfolioAccountViews
                .filter((account) => account.allocationComparison.length)
                .map((account) => {
                  const accountSlices = buildAllocationSlices(account.allocationComparison);
                  let accountAngle = 0;

                  return (
                    <div key={`${account.accountId}-allocation`} className={styles.card}>
                      <h3>Asset Allocation Comparison</h3>
                      <h4 className={styles.accountSectionHeading}>{account.label}</h4>
                      <p>Upon implementation of our recommendations, the asset allocation of each entity will be as shown below:</p>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Asset class</th>
                            <th>Current</th>
                            <th>Risk profile</th>
                            <th>Recommended</th>
                            <th>Variance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {account.allocationComparison.map((row) => (
                            <tr
                              key={`${account.accountId}-${row.rowId}`}
                              className={
                                row.assetClass.toLowerCase().startsWith("total defensive") ||
                                row.assetClass.toLowerCase().startsWith("total growth")
                                  ? styles.allocationTotalRow
                                  : undefined
                              }
                            >
                              <td>{row.assetClass}</td>
                              <td>{formatPercent(row.currentPct)}</td>
                              <td>{formatPercent(row.riskProfilePct)}</td>
                              <td>{formatPercent(row.recommendedPct)}</td>
                              <td>{formatPercent(row.variancePct)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {accountSlices.length ? (
                        <div className={styles.allocationAccountChart}>
                          <h3>Recommended Asset Allocation Split</h3>
                          <div className={styles.allocationChartWrap}>
                            <svg viewBox="0 0 220 220" className={styles.allocationPieChart} role="img" aria-label={`${account.label} recommended asset allocation pie chart`}>
                              {accountSlices.map((slice) => {
                                const sliceAngle = (slice.recommendedPct / 100) * 360;
                                const startAngle = accountAngle;
                                const endAngle = accountAngle + sliceAngle;
                                accountAngle = endAngle;

                                return (
                                  <path
                                    key={`${account.accountId}-${slice.assetClass}`}
                                    d={describeArc(110, 110, 92, startAngle, endAngle)}
                                    fill={slice.color}
                                    stroke="#ffffff"
                                    strokeWidth="2"
                                  />
                                );
                              })}
                            </svg>
                          </div>
                          <div className={styles.allocationLegend} aria-label={`${account.label} recommended asset allocation legend`}>
                            {accountSlices.map((slice) => (
                              <div key={`${account.accountId}-${slice.assetClass}`} className={styles.allocationLegendItem}>
                                <span className={styles.allocationLegendSwatch} style={{ backgroundColor: slice.color }} />
                                <span className={styles.allocationLegendLabel}>{slice.assetClass}</span>
                                <span className={styles.allocationLegendValue}>{formatPercent(slice.recommendedPct)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className={styles.emptyState}>No asset allocation data has been populated yet.</p>
          )}
          {renderPageNumber(assetAllocationPageNumber)}
        </section>

        {hasReplacementAnalysis ? (
          <section
            id="soa-preview-section-replacement-analysis"
            className={styles.page}
            style={{ order: previewSectionOrder.replacementAnalysis }}
          >
            <h2 className={styles.sectionHeading}>Replacement Analysis</h2>
            <p className={styles.sectionIntro}>{REPLACEMENT_ANALYSIS_INTRO}</p>
            <div className={styles.recommendationDetailStack}>
              {productRexReports.map((report) => (
                <div className={styles.card} key={report.reportId}>
                  <h3>Platform Fee Comparison</h3>
                  {report.ownerName ? <h4 className={styles.accountSectionHeading}>{report.ownerName}</h4> : null}
                  {productRexReports.length > 1 ? <p>{report.sourceFileName}</p> : null}
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Item</th>
                        {getProductRexComparisonColumns(report).map((column) => (
                          <th key={column.columnId}>{toTitleCase(column.status)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className={styles.platformColumnHeadingRow}>
                        <td />
                        {getProductRexComparisonColumns(report).map((column) => (
                          <td key={column.columnId}>{column.productName ?? "—"}</td>
                        ))}
                      </tr>
                      {report.platformComparisonRows.map((row) => (
                        <tr key={`${report.reportId}-${row.rowId}`}>
                          <td>{row.label}</td>
                          {getProductRexComparisonColumns(report).map((column, columnIndex) => (
                            <td key={`${row.rowId}-${column.columnId}`}>{row.values?.[columnIndex] ?? "—"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              <div className={styles.recommendationBlock}>
                <h3>Replacement Reasons</h3>
                {adviceCase.recommendations.replacement.map((recommendation, index) => (
                  <p key={recommendation.recommendationId} className={styles.recommendationText}>
                    {adviceCase.recommendations.replacement.length > 1 ? `Replacement ${index + 1}: ` : ""}
                    {recommendation.replacementReasonText || "Replacement rationale has not been drafted yet."}
                  </p>
                ))}
              </div>
            </div>
            {renderPageNumber(replacementAnalysisPageNumber)}
          </section>
        ) : null}

        <section id="soa-preview-section-projections" className={styles.page} style={{ order: previewSectionOrder.projections }}>
          <h2 className={styles.sectionHeading}>Projected Outcomes</h2>
          <div className={styles.recommendationDetailStack}>
            <div className={styles.card}>
              <h3>Assumptions</h3>
              <p>Projection assumptions will be included here once the projection modelling has been completed.</p>
            </div>
            <div className={styles.card}>
              <h3>Cashflow and Taxation Projections</h3>
              <p>
                Maintaining adequate cashflow to meet living expenses is fundamental to the success of your plan. A summary of estimated income, expenses, tax and overall cashflow after implementing our recommendations will be included here.
              </p>
            </div>
            <div className={styles.card}>
              <h3>Capital Projections</h3>
              <p>
                Charts showing your projected cashflow and capital position will be included here. Values will be adjusted for inflation and shown in today&apos;s dollars where applicable.
              </p>
            </div>
            <div className={styles.card}>
              <h3>Key Outcome</h3>
              <p>The key projected outcome will be included here once the projection analysis has been completed.</p>
            </div>
          </div>
          {renderPageNumber(projectionsPageNumber)}
        </section>

        <section id="soa-preview-section-disclosure" className={styles.page} style={{ order: previewSectionOrder.fees }}>
          <h2 className={styles.sectionHeading}>Fees and Disclosures</h2>
          <p className={styles.sectionIntro}>{FEES_AND_DISCLOSURES_INTRO}</p>
          <div className={styles.recommendationDetailStack}>
            <div className={styles.card}>
              <h3>Advice Preparation &amp; Implementation Fee</h3>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Fee Type</th>
                    <th>Amount (Include GST)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Plan Preparation Fee</td>
                    <td>{formatCurrency(preparationFee)}</td>
                  </tr>
                  <tr>
                    <td>Implementation Fee</td>
                    <td>{formatCurrency(implementationFee)}</td>
                  </tr>
                  <tr className={styles.totalRow}>
                    <td><strong>Total</strong></td>
                    <td><strong>{formatCurrency(hasAdviceFeeData ? totalAdviceFees : null)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className={styles.card}>
              <h3>Product Fees</h3>
              <p>{PRODUCT_FEES_INTRO}</p>
              {productFeeGroups.length ? (
                productFeeGroups.map((group) => (
                  <div key={group.key} className={styles.portfolioAccountGroup}>
                    <h4>{group.label}</h4>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Fee type</th>
                          <th>%</th>
                          <th>$</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.fees.map((fee) => (
                          <tr key={fee.feeId}>
                            <td>{fee.productName ?? "—"}</td>
                            <td>{fee.feeType}</td>
                            <td>{formatPercent(fee.percentage)}</td>
                            <td>{formatCurrency(fee.amount)}</td>
                          </tr>
                        ))}
                        <tr className={styles.totalRow}>
                          <td colSpan={3}><strong>Total</strong></td>
                          <td><strong>{formatCurrency(group.fees.some((fee) => fee.amount != null) ? group.fees.reduce((sum, fee) => sum + (fee.amount ?? 0), 0) : null)}</strong></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ))
              ) : (
                <table className={styles.table}>
                  <tbody>
                    <tr>
                      <td>No product fees drafted yet.</td>
                    </tr>
                  </tbody>
                </table>
              )}
              {productFeeGroups.length > 1 ? (
                <table className={styles.table}>
                  <tbody>
                    <tr className={styles.totalRow}>
                      <td><strong>Total product fees</strong></td>
                      <td><strong>{formatCurrency(hasProductFeeAmount ? totalProductFees : null)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              ) : null}
              <h4 className={styles.feeSubheading}>Ongoing Fees</h4>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Entity</th>
                    <th>Product</th>
                    <th>Account Number</th>
                    <th>Fee Amount</th>
                    <th>Frequency</th>
                    <th>Total Annual Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceAgreementFeeItems.length ? (
                    <>
                      {serviceAgreementFeeItems.map((feeItem) => (
                        <tr key={feeItem.feeItemId}>
                          <td>{getServiceAgreementOwnerName(feeItem.ownerPersonId)}</td>
                          <td>{feeItem.productName || "—"}</td>
                          <td>{feeItem.accountNumber || "—"}</td>
                          <td>{formatCurrency(feeItem.feeAmount)}</td>
                          <td>{SERVICE_FEE_FREQUENCY_OPTIONS.find((option) => option.value === feeItem.frequency)?.label ?? feeItem.frequency}</td>
                          <td>{formatCurrency(getServiceFeeAnnualAmount(feeItem))}</td>
                        </tr>
                      ))}
                      <tr className={styles.totalRow}>
                        <td colSpan={5}><strong>Total Annual Advice Fees</strong></td>
                        <td><strong>{formatCurrency(totalServiceAgreementFees)}</strong></td>
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td colSpan={6}>No ongoing fee rows have been drafted yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {hasInsuranceCommissionConsent ? (
              <div className={styles.card}>
                <h3>Insurance Commissions</h3>
                <p>
                  The insurance commissions noted in the table below are not in addition to the premiums. The only amount you pay is the premium plus the policy fee.
                </p>
                <table className={`${styles.table} ${styles.insuranceCommissionTable}`.trim()}>
                  <thead>
                    <tr>
                      <th rowSpan={2}>Insurance Details</th>
                      <th colSpan={2}>Annualised Initial Commission</th>
                      <th colSpan={2}>Annualised Ongoing Commission</th>
                    </tr>
                    <tr>
                      <th>%</th>
                      <th>$</th>
                      <th>%</th>
                      <th>$</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insuranceCommissionGroups.flatMap((group) => [
                      <tr key={`${group.ownerKey}-owner`} className={styles.insuranceCommissionOwnerRow}>
                        <td colSpan={5}>{group.ownerName}</td>
                      </tr>,
                      ...group.commissions.map((commission, index) => (
                        <tr key={commission.commissionId}>
                          <td>{commission.productName?.trim() || `Insurance commission ${index + 1}`}</td>
                          <td>{formatPercent(getCommissionUpfrontPercentage(commission))}</td>
                          <td>{formatCurrency(getCommissionUpfrontAmount(commission))}</td>
                          <td>{formatPercent(getCommissionOngoingPercentage(commission))}</td>
                          <td>{formatCurrency(getCommissionOngoingAmount(commission))}</td>
                        </tr>
                      )),
                    ])}
                    <tr className={styles.insuranceCommissionTotalRow}>
                      <td colSpan={2}><strong>Total Commission Amount</strong></td>
                      <td><strong>{formatCurrency(totalUpfrontCommission)}</strong></td>
                      <td />
                      <td><strong>{formatCurrency(totalOngoingCommission)}</strong></td>
                    </tr>
                  </tbody>
                </table>
                <div className={styles.insuranceCommissionNotes}>
                  <p>
                    <strong>Please note the following:</strong> Insurance commission is calculated as a percentage of the premium less stamp duty. Commissions are already incorporated into the premium and are not an additional cost to you. The premium quoted above is based on an annualised premium. The insurance premium and commission amount shown above are estimates for the first year. The actual amounts may vary and may increase in future years.
                  </p>
                  <p>
                    <strong>Obtaining Your Informed Consent</strong> The law requires that a client’s consent is obtained before an insurance commission is paid. Your informed consent, once given to us, is irrevocable.
                  </p>
                  <p>
                    If you consent to us receiving the monetary benefits detailed above, please sign, date and return the Authority to Proceed. We will not arrange for the issue or sale of the insurance policy to you until we have received your consent.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
          {renderPageNumber(feesPageNumber)}
        </section>

        <section className={styles.page} style={{ order: previewSectionOrder.actionsRequired }}>
          <h2 className={styles.sectionHeading}>Actions Required by You</h2>
          <div className={styles.actionsRequiredBody}>
            <p>To proceed with our advice, you will need to undertake the following steps:</p>
            <ul className={styles.actionsRequiredList}>
              <li>Sign the Authority to Proceed page.</li>
              <li>Sign implementation documentation provided by {practiceName}.</li>
            </ul>
          </div>
          {renderPageNumber(actionsRequiredPageNumber)}
        </section>

        <section className={styles.page} style={{ order: previewSectionOrder.authorityToProceed }}>
          <h2 className={styles.sectionHeading}>Authority to Proceed</h2>
          <div className={styles.authorityIntro}>
            <div>{formatDate(payload.savedAt)}</div>
            <div>{addresseeLine}</div>
            <div>{address.street ?? "<<address>>"}</div>
            <div>{address.locality ?? "<<Suburb>> <<State>> <<Postcode>>"}</div>
          </div>

          <div className={styles.authorityText}>
            <ul className={styles.authorityDisclosureList}>
              <li>
                I have read and understood this Statement of Advice (SOA) prepared by my adviser and dated {formatDate(payload.savedAt)}, including the disclosure of fees and commission.
              </li>
              <li>
                I confirm that the information provided by me and restated in this SOA accurately summarises my current circumstances. I understand that if any of this information is incomplete or inaccurate then the advice may not be appropriate to my circumstances.
              </li>
              <li>
                I understand that the recommendations in this SOA have been prepared for my sole use and are current for a period of 60 days from the date of the SOA. I acknowledge that after this time I should not implement the recommendations without further review from my adviser to ensure they remain appropriate.
              </li>
              <li>I have received your Financial Services Guide and understood the contents.</li>
              <li>
                I have received Product Disclosure Statements for all products recommended within this SOA and any additional information listed in this SOA, where applicable.
              </li>
              {hasInsuranceCommissionConsent ? (
                <li>
                  I/we consent to {practiceName} receiving the monetary benefits in connection with the life risk insurance product recommendations as set out in the insurance commission disclosure section of this SOA.
                </li>
              ) : null}
            </ul>
            <p>I accept the recommendations offered in this document and authorise {adviserName} to implement all recommendations.</p>
          </div>

          <div className={styles.authorityVariationBox}>
            <h3>Variations to Advice</h3>
            <p>
              I agree to proceed as varied below. I understand that by choosing to implement a variation to the advice, I risk making a financial decision that may be inappropriate to my needs.
            </p>
            <div className={styles.authorityVariationLines}>
              <span />
              <span />
              <span />
            </div>
          </div>

          <div className={styles.authoritySignatureGrid}>
            {signaturePeople.map((person) => (
              <div key={person.key} className={styles.authoritySignatureBlock}>
                <div className={styles.authoritySignatureLine}>Signed:</div>
                <div className={styles.authoritySignatureName}>{person.name}</div>
                <div className={styles.authoritySignatureLine}>Date:</div>
              </div>
            ))}
          </div>

          {renderPageNumber(authorityToProceedPageNumber)}
        </section>

        {hasServiceAgreement && serviceAgreementPageNumber ? (
          <section
            id="soa-preview-section-service-agreement"
            className={styles.page}
            style={{ order: previewSectionOrder.serviceAgreement }}
          >
            <h2 className={styles.sectionHeading}>{serviceAgreementTitle}</h2>
            <div className={styles.serviceAgreementIntro}>
              <div>{formatDate(payload.savedAt)}</div>
              <div>{addresseeLine}</div>
              <div>{address.street ?? "<<address>>"}</div>
              <div>{address.locality ?? "<<Suburb>> <<State>> <<Postcode>>"}</div>
            </div>

            <div className={styles.serviceAgreementBody}>
              <p>Dear {addresseeLine},</p>
              {isFixedTermAgreement ? (
                <>
                  <p>
                    As your Financial Adviser, it is our role to provide you with the advice you need to achieve your financial goals. The purpose of this letter is to establish an Annual Advice Agreement.
                  </p>
                  <p>
                    The services you receive as part of your Annual Advice Agreement are important as they offer support to help you stay on track. The terms of the Annual Advice Agreement, including the services you are entitled to and the cost, are set out below.
                  </p>
                  <p>This arrangement will be between {addresseeLine} and {practiceName}. The arrangement will commence on the date you sign this agreement.</p>
                </>
              ) : (
                <>
                  <p>
                    As your Financial Adviser, it is our role to provide you with the advice you need to achieve your financial goals. This Ongoing Service Agreement sets out the terms and conditions of our services.
                  </p>
                  <p>
                    We cannot enter into an Ongoing Service Agreement without this agreement and the relevant fee consent being signed and dated by you. Your ongoing fee arrangement will need to be renewed annually.
                  </p>
                  <p>
                    The commencement date of this arrangement is the date you sign this agreement. Upon signing this agreement, any existing service agreement between us is deemed to be automatically terminated and replaced by this agreement.
                  </p>
                </>
              )}

              <div className={styles.card}>
                <h3>{isFixedTermAgreement ? "My Annual Advice Service Includes" : "The Services You Are Entitled To Receive"}</h3>
                <div className={styles.serviceAgreementServices}>
                  {serviceAgreementServiceGroups.map((group, groupIndex) => (
                    <div className={styles.serviceAgreementServiceGroup} key={`${group.heading ?? "service"}-${groupIndex}`}>
                      {group.heading ? <h4>{group.heading}</h4> : null}
                      {group.items.length ? (
                        <ul className={styles.bulletList}>
                          {group.items.map((service, serviceIndex) => (
                            <li key={`${service}-${serviceIndex}`}>{service}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.card}>
                <h3>Fees Payable</h3>
                <p>
                  The fees payable for this agreement are set out in the Fees and Disclosures section of this Statement of Advice. All fees include GST where applicable.
                </p>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Entity</th>
                      <th>Product</th>
                      <th>Account Number</th>
                      <th>Fee Amount</th>
                      <th>Frequency</th>
                      <th>Total Annual Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceAgreementFeeItems.length ? (
                      <>
                        {serviceAgreementFeeItems.map((feeItem) => (
                          <tr key={feeItem.feeItemId}>
                            <td>{getServiceAgreementOwnerName(feeItem.ownerPersonId)}</td>
                            <td>{feeItem.productName || "—"}</td>
                            <td>{feeItem.accountNumber || "—"}</td>
                            <td>{formatCurrency(feeItem.feeAmount)}</td>
                            <td>{SERVICE_FEE_FREQUENCY_OPTIONS.find((option) => option.value === feeItem.frequency)?.label ?? feeItem.frequency}</td>
                            <td>{formatCurrency(getServiceFeeAnnualAmount(feeItem))}</td>
                          </tr>
                        ))}
                        <tr className={styles.totalRow}>
                          <td colSpan={5}><strong>Total Annual Advice Fees</strong></td>
                          <td><strong>{formatCurrency(totalServiceAgreementFees)}</strong></td>
                        </tr>
                      </>
                    ) : (
                      <tr>
                        <td colSpan={6}>No annual advice fee rows have been drafted yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {isFixedTermAgreement ? (
                <div className={styles.serviceAgreementTextBlock}>
                  <h3>Next Steps</h3>
                  <p>Please sign the acknowledgement below and accept the Annual Advice Agreement outlined in this letter.</p>
                  <p>You may terminate this service at any time by contacting us. If terminated, we will cancel this service and turn off any applicable Annual Advice Agreement costs.</p>
                </div>
              ) : (
                <div className={styles.serviceAgreementTextBlock}>
                  <h3>Your Acknowledgement</h3>
                  <ul className={styles.bulletList}>
                    <li>You agree to be bound by the terms and conditions of this agreement.</li>
                    <li>You acknowledge that this agreement will continue, subject to annual renewal, until either party provides notice of termination in writing.</li>
                    <li>You acknowledge that entering into this agreement will replace and terminate any existing service agreement between us.</li>
                    <li>You may terminate or vary the agreement at any time by notifying us in writing.</li>
                  </ul>
                </div>
              )}

              <div className={styles.authoritySignatureGrid}>
                {signaturePeople.map((person) => (
                  <div key={person.key} className={styles.authoritySignatureBlock}>
                    <div className={styles.authoritySignatureLine}>Signed:</div>
                    <div className={styles.authoritySignatureName}>{person.name}</div>
                    <div className={styles.authoritySignatureLine}>Date:</div>
                  </div>
                ))}
              </div>
            </div>

            {renderPageNumber(serviceAgreementPageNumber)}
          </section>
        ) : null}

        {hasServiceAgreement && consentToDeductPageNumber ? (
          <section className={styles.page} style={{ order: previewSectionOrder.consentToDeduct }}>
            <h2 className={styles.sectionHeading}>Consent To Deduct Fees From Your Account</h2>
            <div className={styles.serviceAgreementBody}>
              <p>
                We are required to obtain your written consent to deduct the fees payable for our services for the upcoming 12 months. Without your consent, this agreement cannot be entered into.
              </p>
              <p>
                Accordingly, no ongoing services or advice will be delivered if you do not return this signed and dated form consenting to payment of our advice fees.
              </p>
              <p>
                You can terminate this {serviceAgreementArrangementLabel} at any time by providing us with written notice. If you terminate the arrangement in writing, no further fees will be charged to you, and no further services will be provided by us.
              </p>

              <div className={styles.card}>
                <h3>What fees are payable under my {serviceAgreementArrangementLabel}?</h3>
                <p>The following fees will be payable to cover the services you are entitled to receive under the arrangement:</p>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Fee Structure</th>
                      <th>Frequency</th>
                      <th>Adviser Service Fee</th>
                      <th>Annualised</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceAgreementFeeItems.length ? (
                      <>
                        {serviceAgreementFeeItems.map((feeItem) => (
                          <tr key={`consent-${feeItem.feeItemId}`}>
                            <td>
                              <strong>{getServiceAgreementOwnerName(feeItem.ownerPersonId)}</strong>
                              <br />
                              {[feeItem.productName, feeItem.accountNumber ? `(${feeItem.accountNumber})` : ""].filter(Boolean).join(" ")}
                            </td>
                            <td>Flat Fee</td>
                            <td>{SERVICE_FEE_FREQUENCY_OPTIONS.find((option) => option.value === feeItem.frequency)?.label ?? feeItem.frequency}</td>
                            <td>{formatCurrency(feeItem.feeAmount)}</td>
                            <td>{formatCurrency(getServiceFeeAnnualAmount(feeItem))}</td>
                          </tr>
                        ))}
                        <tr className={styles.totalRow}>
                          <td colSpan={4}><strong>Total Annual Adviser Service Fee</strong></td>
                          <td><strong>{formatCurrency(totalServiceAgreementFees)}</strong></td>
                        </tr>
                      </>
                    ) : (
                      <tr>
                        <td colSpan={5}>No advice fee rows have been drafted.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className={styles.card}>
                <h3>The services you are entitled to receive</h3>
                <p>The terms of this service arrangement, including the services you are entitled to and the cost, are set out below.</p>
                <div className={styles.serviceAgreementServices}>
                  {serviceAgreementServiceGroups.map((group, groupIndex) => (
                    <div className={styles.serviceAgreementServiceGroup} key={`consent-${group.heading ?? "service"}-${groupIndex}`}>
                      {group.heading ? <h4>{group.heading}</h4> : null}
                      {group.items.length ? (
                        <ul className={styles.bulletList}>
                          {group.items.map((service, serviceIndex) => (
                            <li key={`consent-${service}-${serviceIndex}`}>{service}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.serviceAgreementTextBlock}>
                <h3>Who is my financial adviser under this agreement?</h3>
                <p>Your financial adviser and fee recipient is:</p>
                <p>
                  <strong>{adviserName}</strong>
                  <br />
                  {practiceName}
                  <br />
                  {adviserEmail}
                  <br />
                  {adviserAddress.phone}
                  <br />
                  Authorised Representative of {licenseeName}
                  <br />
                  AFSL No: 368175
                </p>
              </div>

              <div className={styles.serviceAgreementTextBlock}>
                <h3>How long will my consent last?</h3>
                <p>Your ongoing fee arrangement reference day is {formatDate(serviceAgreementReferenceDate)}.</p>
                <p>Your consent will expire on {formatDate(serviceAgreementExpiryDate)}.</p>
                <p>
                  We will contact you prior to this with instructions about how you can renew your fee arrangement. If you choose not to provide your consent to renew the arrangement, no further fees will be charged, or services provided, after {formatDate(serviceAgreementExpiryDate)}.
                </p>
              </div>

              <div className={styles.serviceAgreementTextBlock}>
                <h3>Your consent to deduct fees from your account</h3>
                <p>I/we consent to the payment of advice fees in accordance with the terms of this fee consent form.</p>
              </div>

              <div className={styles.authoritySignatureGrid}>
                {signaturePeople.map((person) => (
                  <div key={`consent-${person.key}`} className={styles.authoritySignatureBlock}>
                    <div className={styles.authoritySignatureLine}>Signed:</div>
                    <div className={styles.authoritySignatureName}>{person.name}</div>
                    <div className={styles.authoritySignatureLine}>Date:</div>
                  </div>
                ))}
              </div>
            </div>

            {renderPageNumber(consentToDeductPageNumber)}
          </section>
        ) : null}

        <section id="soa-preview-section-appendix" className={styles.page} style={{ order: previewSectionOrder.appendix }}>
          <h2 className={styles.sectionHeading}>Appendix</h2>
          <div className={styles.card}>
            <p>
              Supporting material, calculations, additional comparisons, and reference tables can be included in this appendix
              as the SOA draft is refined further.
            </p>
          </div>
          {renderPageNumber(appendixPageNumber)}
        </section>

        <section className={styles.page} style={{ order: previewSectionOrder.productDisclosure }}>
          <h2 className={styles.sectionHeading}>Product Disclosure Statements (PDS)</h2>
          <div className={styles.card}>
            <p>
              A PDS is a document or a set of documents that contain detailed information about a financial product, such as
              any significant benefits, risks, fees and other costs, and application. The following table below shows the
              products recommended to you and their corresponding PDS.
            </p>
          </div>
          <div className={styles.card}>
            {investmentPdsGroups.length ? (
              investmentPdsGroups.map((group) => (
                <div key={group.key} className={styles.portfolioAccountGroup}>
                  <h4>{group.label}</h4>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Investment</th>
                        <th>PDS Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={`${group.key}-${row.productName}`}>
                          <td>{row.productName}</td>
                          <td>{row.pdsLink}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            ) : (
              <table className={styles.table}>
                <tbody>
                  <tr>
                    <td>No investment product disclosure statements have been recorded.</td>
                  </tr>
                </tbody>
              </table>
            )}

            {hasInsuranceRecommendations ? (
              <div className={styles.appendixSubsection}>
                <h4>Insurance Products</h4>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Insurer</th>
                      <th>PDS Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insurancePdsRows.map((row) => (
                      <tr key={row.insurer}>
                        <td>{row.insurer}</td>
                        <td>{row.pdsLink}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
          {renderPageNumber(productDisclosurePageNumber)}
        </section>

          {productRexTransactionRows.length ? (
            <section className={styles.page} style={{ order: previewSectionOrder.transactionCosts }}>
              <h2 className={styles.sectionHeading}>Transaction Costs</h2>
              <div className={styles.card}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Fund</th>
                      <th>Transaction</th>
                      <th>Buy/Sell %</th>
                      <th>Buy/Sell $</th>
                      <th>Brokerage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactionRowsByPlatform.flatMap(({ platformName, items }) => [
                      <tr key={`${platformName}-heading`} className={styles.platformSubheadingRow}>
                        <td colSpan={5}>{platformName}</td>
                      </tr>,
                      ...items.map((row) => (
                        <tr key={row.transactionId}>
                          <td>{row.fundName}</td>
                          <td>{formatCurrency(row.transactionAmount)}</td>
                          <td>{formatPercent(row.buySellSpreadPct)}</td>
                          <td>{formatCurrency(row.buySellSpreadAmount)}</td>
                          <td>{formatCurrency(row.brokerageAmount)}</td>
                        </tr>
                      )),
                    ])}
                    <tr className={styles.totalRow}>
                      <td><strong>Total</strong></td>
                      <td><strong>{formatCurrency(totalTransactionAmount)}</strong></td>
                      <td><strong>—</strong></td>
                      <td><strong>{formatCurrency(totalBuySellSpreadAmount)}</strong></td>
                      <td><strong>{formatCurrency(totalBrokerageAmount)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {renderPageNumber(transactionCostsPageNumber)}
            </section>
          ) : null}
      </article>
    </main>
  );
}
