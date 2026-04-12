"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ClientProfile, PersonRecord } from "@/lib/api/types";
import type {
  AdviceCaseV1,
  AlternativeConsideredV1,
  ProductAlternativeConsideredV1,
  RecommendationBenefitV1,
  RecommendationConsequenceV1,
} from "@/lib/soa-types";
import type { IntakeAssessmentV1 } from "@/lib/soa-output-contracts";
import { getSoaScenario } from "@/lib/soa-scenarios";
import styles from "./soa-print.module.css";

const SOA_PRINT_STORAGE_KEY = "finley-soa-print-preview-v1";

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
  "#1f5d99",
  "#2f7dbd",
  "#4b98d1",
  "#76b5e3",
  "#9fcdea",
  "#f2c500",
  "#e39a11",
];

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
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function renderBenefitList(items?: RecommendationBenefitV1[] | null, emptyLabel = "No benefits drafted yet.") {
  return renderBulletList(
    (items ?? []).map((item) => item.text).filter(Boolean),
    emptyLabel,
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
      <main className={styles.previewPage}>
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

  const { adviceCase, intakeAssessment } = payload;
  const latestProductRexReport = adviceCase.productRexReports?.[0] ?? null;
  const addresseeLine = addresseeNames.length > 1 ? addresseeNames.join(" and ") : addresseeNames[0] ?? "<<clientname>>";
  const address = buildAddress(pickAddressPerson(clientProfile));
  const adviserName = clientProfile?.adviser?.name?.trim() || payload.adviserName || "<<adviser>>";
  const practiceName = clientProfile?.practice?.trim() || payload.practiceName || adviceCase.practice.name || "<<practice>>";
  const practiceAbn = payload.practiceAbn ?? "<<abn>>";
  const allocationSlices = buildAllocationSlices(adviceCase.recommendations.portfolio?.allocationComparison);
  const portfolioHoldings = adviceCase.recommendations.portfolio?.holdings ?? [];
  const preparationFee =
    adviceCase.fees.adviceFees.find((fee) => fee.type === "preparation")?.amount ?? null;
  const implementationFee =
    adviceCase.fees.adviceFees.find((fee) => fee.type === "implementation")?.amount ?? null;
  const hasAdviceFeeData = preparationFee !== null || implementationFee !== null;
  const totalAdviceFees = (preparationFee ?? 0) + (implementationFee ?? 0);
  const currentPortfolioAmount = portfolioHoldings.reduce(
    (sum, holding) => sum + (holding.transactionAmount && holding.transactionAmount < 0 ? Math.abs(holding.transactionAmount) : 0),
    0,
  );
  const proposedPortfolioAmount = portfolioHoldings.reduce((sum, holding) => sum + (holding.amount ?? 0), 0);
  const totalPortfolioAmount = proposedPortfolioAmount || currentPortfolioAmount;
  let currentAngle = 0;
  const contentsItems = [
    "Statement of Advice",
    "Advice Summary",
    "About This Advice",
    "Your Personal and Financial Position",
    "Risk Profile",
    "Strategy Recommendations",
    "Product Recommendations",
    "Replacement Analysis",
    "Portfolio Allocation",
    "Fees and Disclosures",
    "Appendix",
  ];
  const strategyPageCount = Math.max(adviceCase.recommendations.strategic.length, 1);
  const productPageCount = Math.max(adviceCase.recommendations.product.length, 1);
  const aboutThisAdvicePageNumber = 4;
  const personalAndFinancialPositionPageNumber = aboutThisAdvicePageNumber + 1;
  const riskProfilePageNumber = personalAndFinancialPositionPageNumber + 1;
  const strategyStartPageNumber = riskProfilePageNumber + 1;
  const productStartPageNumber = strategyStartPageNumber + strategyPageCount;
  const investmentPortfolioPageNumber = productStartPageNumber + productPageCount;
  const feesPageNumber = investmentPortfolioPageNumber + 1;
  const appendixPageNumber = feesPageNumber + 1;
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
  const totalExpenses = expenseRows.reduce((sum, entry) => sum + entry.amount, 0);
  const totalAssets = assetRows.reduce((sum, entry) => sum + parseNumericValue(entry.currentValue), 0);
  const totalLiabilities = liabilityRows.reduce((sum, entry) => sum + parseNumericValue(entry.outstandingBalance), 0);
  const riskProfileLabel = toTitleCase(adviceCase.riskProfile?.profile);
  const riskProfileBenchmarkRows = getRiskProfileBenchmarkRows(adviceCase.recommendations.portfolio?.allocationComparison);
  const holdingsByPlatform = groupByPlatformName(portfolioHoldings);
  const transactionRowsByPlatform = groupByPlatformName(latestProductRexReport?.transactionRows ?? []);

  return (
    <main className={styles.previewPage}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.toolbarButton} onClick={() => window.print()}>
          Print / Save PDF
        </button>
      </div>

      <article className={styles.document}>
        <section className={`${styles.page} ${styles.letterPage}`.trim()}>
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

        <section className={`${styles.page} ${styles.coverPage}`.trim()}>
          <div className={styles.coverEyebrow}>Statement of Advice</div>
          <h1 className={styles.coverTitle}>{clientNames}</h1>
          <div className={styles.coverMeta}>
            <span>{adviceCase.practice.name ?? "Advice practice"}</span>
            <span>{adviceCase.licensee.name ?? "Licensee"}</span>
            <span>{formatDate(payload.savedAt)}</span>
          </div>
          <div className={styles.coverSummary}>
            <h2>Advice Summary</h2>
            <p>{intakeAssessment?.matterSummary ?? "Draft SOA assembled from the Finley workflow."}</p>
          </div>
          {renderPageNumber(2)}
        </section>

        <section className={`${styles.page} ${styles.contentsPage}`.trim()}>
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

        <section className={styles.page}>
          <h2 className={styles.sectionHeading}>About This Advice</h2>
          <div className={styles.card}>
            <h3>Client Objectives</h3>
            {renderBulletList(
              adviceCase.objectives.map((objective) => objective.text),
              "No objectives drafted yet.",
            )}
          </div>
          <div className={styles.card}>
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
          <div className={styles.card}>
            <h3>Warnings and limitations</h3>
            {renderBulletList(
              [...adviceCase.disclosures.limitations, ...adviceCase.disclosures.warnings.map((warning) => warning.text)],
              "No disclosure items drafted yet.",
            )}
          </div>
          {renderPageNumber(4)}
        </section>

        <section className={styles.page}>
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
                    <td colSpan={3}>No income has been recorded yet.</td>
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
                    <td colSpan={3}>No expenses have been recorded yet.</td>
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
                    <td colSpan={3}>No assets have been recorded yet.</td>
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
                    <td colSpan={3}>No liabilities have been recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

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
                    <td colSpan={3}>No superannuation funds have been recorded yet.</td>
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
                    <td colSpan={3}>No pension funds have been recorded yet.</td>
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
                    <td colSpan={5}>No personal insurance policies have been recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {renderPageNumber(personalAndFinancialPositionPageNumber)}
        </section>

        <section className={styles.page}>
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
                  <th>Recommended Target Asset Allocation</th>
                  <th>Minimum</th>
                  <th>Maximum</th>
                </tr>
              </thead>
              <tbody>
                {riskProfileBenchmarkRows.length ? (
                  riskProfileBenchmarkRows.map((row) => (
                    <tr key={row.assetClass}>
                      <td>{row.assetClass}</td>
                      <td>{formatPercent(row.targetPct)}</td>
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
            <section key={recommendation.recommendationId} className={styles.page}>
              <h2 className={styles.sectionHeading}>Strategy Recommendations</h2>
              <div className={styles.recommendationBlock}>
                <h3>{`Recommendation ${index + 1}`}</h3>
                <p className={styles.recommendationText}>{recommendation.recommendationText || "Draft recommendation not yet written."}</p>
                <div className={styles.recommendationDetailStack}>
                  <div className={styles.card}>
                    <h4>Benefits</h4>
                    {renderBenefitList(recommendation.clientBenefits)}
                  </div>
                  <div className={styles.card}>
                    <h4>Consequences and trade-offs</h4>
                    {renderConsequenceList(recommendation.consequences)}
                  </div>
                </div>
                <div className={styles.card}>
                  <h4>Why this recommendation is appropriate</h4>
                  <p>{recommendation.rationale ?? "Rationale has not been drafted yet."}</p>
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
          <section className={styles.page}>
            <h2 className={styles.sectionHeading}>Strategy Recommendations</h2>
            <p className={styles.emptyState}>No strategy recommendations drafted yet.</p>
            {renderPageNumber(strategyStartPageNumber)}
          </section>
        )}

        {adviceCase.recommendations.product.length ? (
          adviceCase.recommendations.product.map((recommendation, index) => (
            <section key={recommendation.recommendationId} className={styles.page}>
              <h2 className={styles.sectionHeading}>Product Recommendations</h2>
              <div className={styles.recommendationBlock}>
                <h3>{`Product Recommendation ${index + 1}`}</h3>
                <p className={styles.recommendationText}>{recommendation.recommendationText || "Draft product recommendation not yet written."}</p>
                <div className={styles.recommendationDetailStack}>
                  <div className={styles.card}>
                    <h4>Benefits</h4>
                    {renderBenefitList(recommendation.clientBenefits)}
                  </div>
                  <div className={styles.card}>
                    <h4>Consequences and trade-offs</h4>
                    {renderConsequenceList(recommendation.consequences)}
                  </div>
                </div>
                <div className={styles.card}>
                  <h4>Suitability rationale</h4>
                  <p>{recommendation.suitabilityRationale ?? "Suitability rationale has not been drafted yet."}</p>
                </div>
              </div>
              {renderPageNumber(productStartPageNumber + index)}
            </section>
          ))
        ) : (
          <section className={styles.page}>
            <h2 className={styles.sectionHeading}>Product Recommendations</h2>
            <p className={styles.emptyState}>No product recommendations drafted yet.</p>
            {renderPageNumber(productStartPageNumber)}
          </section>
        )}

        <section className={styles.page}>
          <h2 className={styles.sectionHeading}>Investment Portfolio Recommendations</h2>
          {adviceCase.recommendations.portfolio?.holdings?.length ? (
            <>
              <div className={styles.card}>
                <h3>Recommended Holdings</h3>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Fund</th>
                      <th>Code</th>
                      <th>Current</th>
                      <th>Change</th>
                      <th>Proposed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdingsByPlatform.flatMap(({ platformName, items }) => {
                      const subtotalCurrent = items.reduce(
                        (sum, holding) => sum + (holding.transactionAmount && holding.transactionAmount < 0 ? Math.abs(holding.transactionAmount) : 0),
                        0,
                      );
                      const subtotalProposed = items.reduce((sum, holding) => sum + (holding.amount ?? 0), 0);
                      const subtotalChange = subtotalProposed - subtotalCurrent;

                      return [
                        <tr key={`${platformName}-heading`} className={styles.platformSubheadingRow}>
                          <td colSpan={5}>{platformName}</td>
                        </tr>,
                        ...items.map((holding) => {
                          const currentAmount =
                            holding.transactionAmount && holding.transactionAmount < 0 ? Math.abs(holding.transactionAmount) : 0;
                          const proposedAmount = holding.amount ?? 0;
                          const changeAmount = proposedAmount - currentAmount;

                          return (
                            <tr key={holding.holdingId}>
                              <td>{holding.fundName}</td>
                              <td>{holding.code ?? "—"}</td>
                              <td>{formatCurrency(currentAmount)}</td>
                              <td>{formatCurrency(changeAmount)}</td>
                              <td>{formatCurrency(proposedAmount)}</td>
                            </tr>
                          );
                        }),
                        <tr key={`${platformName}-subtotal`} className={styles.platformSubtotalRow}>
                          <td colSpan={2}><strong>Subtotal</strong></td>
                          <td><strong>{formatCurrency(subtotalCurrent)}</strong></td>
                          <td><strong>{formatCurrency(subtotalChange)}</strong></td>
                          <td><strong>{formatCurrency(subtotalProposed)}</strong></td>
                        </tr>,
                      ];
                    })}
                    <tr>
                      <td colSpan={2}><strong>Total portfolio amount</strong></td>
                      <td><strong>{formatCurrency(currentPortfolioAmount)}</strong></td>
                      <td><strong>{formatCurrency(proposedPortfolioAmount - currentPortfolioAmount)}</strong></td>
                      <td><strong>{formatCurrency(totalPortfolioAmount)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className={styles.card}>
                <h3>Asset Allocation Comparison</h3>
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
                    {latestProductRexReport?.recommendedPlatform ? (
                      <tr className={styles.platformSubheadingRow}>
                        <td colSpan={5}>{latestProductRexReport.recommendedPlatform}</td>
                      </tr>
                    ) : null}
                    {(adviceCase.recommendations.portfolio.allocationComparison ?? []).map((row) => (
                      <tr
                        key={row.rowId}
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
              </div>
              {allocationSlices.length ? (
                <div className={styles.card}>
                  <h3>Recommended Asset Allocation Split</h3>
                  <div className={styles.allocationChartWrap}>
                    <svg viewBox="0 0 220 220" className={styles.allocationPieChart} role="img" aria-label="Recommended asset allocation pie chart">
                      {allocationSlices.map((slice) => {
                        const sliceAngle = (slice.recommendedPct / 100) * 360;
                        const startAngle = currentAngle;
                        const endAngle = currentAngle + sliceAngle;
                        currentAngle = endAngle;

                        return (
                          <path
                            key={slice.assetClass}
                            d={describeArc(110, 110, 92, startAngle, endAngle)}
                            fill={slice.color}
                            stroke="#ffffff"
                            strokeWidth="2"
                          />
                        );
                      })}
                      <circle cx="110" cy="110" r="42" fill="#ffffff" />
                      <text x="110" y="104" textAnchor="middle" className={styles.allocationPieLabel}>
                        Recommended
                      </text>
                      <text x="110" y="124" textAnchor="middle" className={styles.allocationPieValue}>
                        100%
                      </text>
                    </svg>
                    <div className={styles.allocationLegend}>
                      {allocationSlices.map((slice) => (
                        <div key={slice.assetClass} className={styles.allocationLegendItem}>
                          <span className={styles.allocationLegendSwatch} style={{ backgroundColor: slice.color }} />
                          <span className={styles.allocationLegendText}>{slice.assetClass}</span>
                          <span className={styles.allocationLegendValue}>{formatPercent(slice.recommendedPct)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              {latestProductRexReport ? (
                <div className={styles.card}>
                  <h3>Platform Fee Comparison</h3>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Current</th>
                        <th>Recommended</th>
                        <th>Alternative</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className={styles.platformColumnHeadingRow}>
                        <td />
                        <td>{latestProductRexReport.currentPlatform ?? "—"}</td>
                        <td>{latestProductRexReport.recommendedPlatform ?? "—"}</td>
                        <td>{latestProductRexReport.alternativePlatform ?? "—"}</td>
                      </tr>
                      {latestProductRexReport.platformComparisonRows.map((row) => (
                        <tr key={row.rowId}>
                          <td>{row.label}</td>
                          <td>{row.currentValue ?? "—"}</td>
                          <td>{row.recommendedValue ?? "—"}</td>
                          <td>{row.alternativeValue ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {adviceCase.recommendations.replacement.length ? (
                <div className={styles.replacementSectionWrap}>
                  <h3 className={styles.inlineSectionHeading}>Replacement Analysis</h3>
                  {adviceCase.recommendations.replacement.map((recommendation, index) => (
                    <div key={recommendation.recommendationId} className={styles.recommendationBlock}>
                      <h3>{`Replacement Analysis ${index + 1}`}</h3>
                      <p className={styles.recommendationText}>{recommendation.replacementReasonText || "Replacement rationale has not been drafted yet."}</p>
                      <div className={styles.card}>
                        <h4>Reasons for replacement</h4>
                        {renderBenefitList(recommendation.clientBenefits, "No replacement benefits drafted yet.")}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className={styles.emptyState}>No portfolio data has been populated yet.</p>
          )}
          {renderPageNumber(investmentPortfolioPageNumber)}
        </section>

        <section className={styles.page}>
          <h2 className={styles.sectionHeading}>Fees and Disclosures</h2>
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
                  {latestProductRexReport?.recommendedPlatform ? (
                    <tr className={styles.platformSubheadingRow}>
                      <td colSpan={4}>{latestProductRexReport.recommendedPlatform}</td>
                    </tr>
                  ) : null}
                  {adviceCase.fees.productFees.length ? (
                    adviceCase.fees.productFees.map((fee) => (
                      <tr key={fee.feeId}>
                        <td>{fee.productName ?? "—"}</td>
                        <td>{fee.feeType}</td>
                        <td>{formatPercent(fee.percentage)}</td>
                        <td>{formatCurrency(fee.amount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4}>No product fees drafted yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {renderPageNumber(feesPageNumber)}
        </section>

        <section className={styles.page}>
          <h2 className={styles.sectionHeading}>Appendix</h2>
          <div className={styles.card}>
            <p>
              Supporting material, calculations, additional comparisons, and reference tables can be included in this appendix
              as the SOA draft is refined further.
            </p>
          </div>
          {latestProductRexReport?.transactionRows.length ? (
            <div className={styles.card}>
              <h3>Transaction Costs</h3>
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
                </tbody>
              </table>
            </div>
          ) : null}
          {renderPageNumber(appendixPageNumber)}
        </section>
      </article>
    </main>
  );
}
