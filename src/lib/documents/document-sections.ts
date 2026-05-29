import type { AdviceCaseV1, ServiceAgreementFeeItemV1 } from "@/lib/soa-types";

export type DocumentSectionKey =
  | "factFind"
  | "engagementLetter"
  | "invoice"
  | "coverPage"
  | "tableOfContents"
  | "letter"
  | "executiveSummary"
  | "aboutThisAdvice"
  | "scopeOfAdvice"
  | "personalFinancialPosition"
  | "riskProfile"
  | "strategyRecommendations"
  | "productRecommendations"
  | "investmentPortfolioRecommendations"
  | "portfolioAllocation"
  | "replacementAnalysis"
  | "insuranceNeedsAnalysis"
  | "recommendedInsurancePolicies"
  | "insuranceProductReplacement"
  | "projections"
  | "feesAndDisclosures"
  | "actionsRequired"
  | "authorityToProceed"
  | "serviceAgreement"
  | "consentToDeductFees"
  | "appendix";

export type DocumentTemplate = {
  key: string;
  label: string;
  description: string;
  engine: "Finley DOCX" | "Finley workflow";
  scope: "Standalone document" | "Reusable section bundle" | "Client data workflow";
  status: "Active" | "In progress" | "Planned";
  sections: DocumentSectionKey[];
};

export const DOCUMENT_TEMPLATES = {
  factFind: {
    key: "fact-find",
    label: "Fact Find",
    description: "Extracts fact find documents into client, partner, entity, asset, liability, income, expense, superannuation, pension, and insurance records.",
    engine: "Finley workflow",
    scope: "Client data workflow",
    status: "Active",
    sections: ["factFind"],
  },
  engagementLetter: {
    key: "engagement-letter",
    label: "Engagement Letter",
    description: "Standalone engagement letter with client, adviser, service scope, fee estimate, terms of engagement, and Word export.",
    engine: "Finley DOCX",
    scope: "Standalone document",
    status: "Active",
    sections: ["engagementLetter"],
  },
  invoice: {
    key: "invoice",
    label: "Invoice",
    description: "Standalone invoice render and Word export with bill-to/from details, revenue items, GST totals, payment advice, and Xero-ready line data.",
    engine: "Finley DOCX",
    scope: "Standalone document",
    status: "Active",
    sections: ["invoice"],
  },
  statementOfAdvice: {
    key: "statement-of-advice",
    label: "Statement of Advice",
    description: "Full SOA document assembled from reusable advice, disclosure, agreement, authority, appendix, and export sections.",
    engine: "Finley DOCX",
    scope: "Reusable section bundle",
    status: "Active",
    sections: [
      "letter",
      "coverPage",
      "tableOfContents",
      "executiveSummary",
      "aboutThisAdvice",
      "personalFinancialPosition",
      "riskProfile",
      "strategyRecommendations",
      "productRecommendations",
      "investmentPortfolioRecommendations",
      "portfolioAllocation",
      "replacementAnalysis",
      "insuranceNeedsAnalysis",
      "recommendedInsurancePolicies",
      "insuranceProductReplacement",
      "projections",
      "feesAndDisclosures",
      "actionsRequired",
      "authorityToProceed",
      "serviceAgreement",
      "consentToDeductFees",
      "appendix",
    ],
  },
  ongoingServiceAgreement: {
    key: "ongoing-service-agreement",
    label: "Ongoing Service Agreement",
    description: "Standalone ongoing agreement assembled from the shared service agreement and consent-to-deduct sections.",
    engine: "Finley DOCX",
    scope: "Standalone document",
    status: "Active",
    sections: ["coverPage", "serviceAgreement", "consentToDeductFees"],
  },
  fixedTermAgreement: {
    key: "fixed-term-agreement",
    label: "Fixed Term Agreement",
    description: "Standalone fixed term agreement assembled from the shared service agreement and consent-to-deduct sections.",
    engine: "Finley DOCX",
    scope: "Standalone document",
    status: "Active",
    sections: ["coverPage", "serviceAgreement", "consentToDeductFees"],
  },
  consentToDeductFees: {
    key: "consent-to-deduct-fees",
    label: "Consent to Deduct Fees",
    description: "Standalone fee consent form that can also be embedded after ongoing or fixed term agreements.",
    engine: "Finley DOCX",
    scope: "Standalone document",
    status: "Active",
    sections: ["consentToDeductFees"],
  },
  recordOfAdvice: {
    key: "record-of-advice",
    label: "Record of Advice",
    description: "Reusable ROA bundle for advice updates that can share scope, recommendation, portfolio, fee, and authority sections.",
    engine: "Finley DOCX",
    scope: "Reusable section bundle",
    status: "Planned",
    sections: [
      "coverPage",
      "scopeOfAdvice",
      "strategyRecommendations",
      "productRecommendations",
      "investmentPortfolioRecommendations",
      "portfolioAllocation",
      "replacementAnalysis",
      "feesAndDisclosures",
      "authorityToProceed",
    ],
  },
} satisfies Record<string, DocumentTemplate>;

export const SERVICE_FEE_FREQUENCY_OPTIONS: Array<{
  value: ServiceAgreementFeeItemV1["frequency"];
  label: string;
  annualMultiplier: number;
}> = [
  { value: "weekly", label: "Weekly", annualMultiplier: 52 },
  { value: "fortnightly", label: "Fortnightly", annualMultiplier: 26 },
  { value: "monthly", label: "Monthly", annualMultiplier: 12 },
  { value: "quarterly", label: "Quarterly", annualMultiplier: 4 },
  { value: "half-yearly", label: "Half yearly", annualMultiplier: 2 },
  { value: "annually", label: "Annually", annualMultiplier: 1 },
];

export const DEFAULT_SERVICE_AGREEMENT_SERVICES = [
  "Review Your Financial Plan",
  "- I will review your plan, strategy, and investment portfolio on an annual basis. As part of this review, I will re-assess your personal circumstances, risk profile, needs and objectives.",
  "- If I recommend a significant change or there is a significant change to your personal circumstances, needs or objectives, I will provide you with a Statement of Advice (SoA) explaining the changes and my recommendations.",
  "Access",
  "- You can contact me at any time if your circumstances have changed and, if you would like me to review these changes, I will do so.",
  "- Where you have queries or concerns, please contact me via telephone during business hours or email me at any time.",
];

export const ONGOING_SERVICE_AGREEMENT_OPENING_PARAGRAPHS = [
  "As your Financial Adviser, it is our role to provide you with the advice you need to achieve your financial goals.",
  "The purpose of this letter is to set out the terms and conditions of our services, while the attached Fee Deduction Consent details the services we will provide, the fees payable, and the account from which these fees will be deducted. We cannot enter into an Ongoing Service Agreement without this agreement, and the fee consent signed and dated by you.",
  "Our advice fees may be partially or fully tax deductible; you should consult your registered tax agent or accountant to obtain specific advice about the tax-deductibility of our fees.",
  "If we provide advice and for any reason you elect not to proceed with the recommendations, you will be liable for the associated fees to cover the cost or expense incurred for work already undertaken on your behalf.",
  "If your circumstances, or the scope of the advice you require, changes significantly and a new Statement of Advice is required, additional advice preparation fees may be payable. This will be discussed with you and agreed to prior to any work commencing.",
  "Fees can be paid by way of deduction from your investments/super; however, you may elect to pay by cheque or direct debit. You can nominate and amend your chosen method of payment at any time. If you change how you want to pay your fees, we will provide you with another fee consent form.",
];

export const ANNUAL_ADVICE_AGREEMENT_OPENING_PARAGRAPHS = [
  "As your Financial Adviser, it is our role to provide you with the advice you need to achieve your financial goals.",
  "The purpose of this letter is to set out the terms and conditions of our services, while the attached Fee Deduction Consent details the services we will provide, the fees payable, and the account from which these fees will be deducted. We cannot enter into an Annual Advice Agreement without this agreement, and the fee consent signed and dated by you.",
  "Our advice fees may be partially or fully tax deductible; you should consult your registered tax agent or accountant to obtain specific advice about the tax-deductibility of our fees.",
  "If we provide advice and for any reason you elect not to proceed with the recommendations, you will be liable for the associated fees to cover the cost or expense incurred for work already undertaken on your behalf.",
  "If your circumstances, or the scope of the advice you require, changes significantly and a new Statement of Advice is required, additional advice preparation fees may be payable. This will be discussed with you and agreed to prior to any work commencing.",
  "Fees can be paid by way of deduction from your investments/super; however, you may elect to pay by cheque or direct debit. You can nominate and amend your chosen method of payment at any time. If you change how you want to pay your fees, we will provide you with another fee consent form.",
];

export const ONGOING_SERVICE_AGREEMENT_DETAIL_SECTIONS = [
  {
    heading: "Commencement and Terms of the Agreement",
    paragraphs: [
      "The commencement date of this arrangement is the date you sign this agreement. Upon signing this agreement, any existing service agreement between us is deemed to be automatically terminated and replaced by this agreement.",
      "We may amend the terms on which we provide our services (including the fees we charge for those services) by the mutual agreement of the parties, or by providing you 30 days' written notice.",
    ],
  },
  {
    heading: "Renewing this agreement",
    paragraphs: [
      "You will be required to consent to renew this agreement and continue to deduct ongoing fees annually.",
      "We will provide you with a Fee Consent Form to renew your ongoing fee deduction within 60 days before the 12-month anniversary of you entering into this agreement, or no later than 150 days after the anniversary date. The Fee Consent Form will explain the services we will provide, and the fees we will charge, for the following year. If you wish to renew the agreement, you will need to sign, date and return that form to us within the timeframe specified at that time.",
    ],
  },
  {
    heading: "Termination",
    paragraphs: [
      "You may terminate or vary the agreement at any time by notifying us in writing. You may also vary or withdraw your consent to the deduction of advice fees at any time by providing written notice to us, your account provider or superannuation fund.",
      "We may also terminate the agreement at any time by providing written notice to you.",
      "If this agreement expires or is terminated, no further advice will be provided, or fees charged.",
    ],
  },
  {
    heading: "Your Participation",
    paragraphs: [
      "To ensure that the services provided continue to meet your needs, your participation is important. As part of this participation, you agree to provide me with all the information required to provide the service you have requested, and to engage with us for a review of your situation.",
      "If you choose to withhold or are unable to provide information, or you have provided inaccurate information, then there is a risk that I may not be able to provide you with advice or that the advice I provide is not appropriate for your personal circumstances. If this situation arises, I will warn you of the consequences and ask that you reconsider your stance before proceeding.",
    ],
  },
];

export const ANNUAL_ADVICE_AGREEMENT_DETAIL_SECTIONS = [
  {
    heading: "Commencement and Terms of the Agreement",
    paragraphs: [
      "The commencement date of this arrangement is the date you sign this agreement. Upon signing this agreement, any existing service agreement between us is deemed to be automatically terminated and replaced by this agreement.",
      "We may amend the terms on which we provide our services (including the fees we charge for those services) by the mutual agreement of the parties, or by providing you 30 days' written notice.",
    ],
  },
  {
    heading: "Termination",
    paragraphs: [
      "You may terminate or vary the agreement at any time by notifying us in writing. You may also vary or withdraw your consent to the deduction of advice fees at any time by providing written notice to us, your account provider or superannuation fund.",
      "We may also terminate the agreement at any time by providing written notice to you.",
      "If this agreement expires or is terminated, no further advice will be provided, or fees charged.",
    ],
  },
  {
    heading: "Your Participation",
    paragraphs: [
      "To ensure that the services provided continue to meet your needs, your participation is important. As part of this participation, you agree to provide me with all the information required to provide the service you have requested, and to engage with us for a review of your situation.",
      "If you choose to withhold or are unable to provide information, or you have provided inaccurate information, then there is a risk that I may not be able to provide you with advice or that the advice I provide is not appropriate for your personal circumstances. If this situation arises, I will warn you of the consequences and ask that you reconsider your stance before proceeding.",
    ],
  },
];

export const ONGOING_SERVICE_AGREEMENT_ACKNOWLEDGEMENT_PARAGRAPHS = [
  "We have discussed these terms, and you have had the opportunity to clarify anything that is unclear. If you have any further queries, please ask me for clarification before agreeing to proceed with the service.",
  "If you wish to proceed with the service, please acknowledge this by signing below and returning it to me.",
  "By entering into an Ongoing Service Agreement with us, you:",
];

export const ANNUAL_ADVICE_AGREEMENT_ACKNOWLEDGEMENT_PARAGRAPHS = [
  "We have discussed these terms, and you have had the opportunity to clarify anything that is unclear. If you have any further queries, please ask me for clarification before agreeing to proceed with the service.",
  "If you wish to proceed with the service, please acknowledge this by signing below and returning it to me.",
  "By entering into an Annual Advice Agreement with us, you:",
];

export const ONGOING_SERVICE_AGREEMENT_ACKNOWLEDGEMENT_ITEMS = [
  "agree to be bound by the terms and conditions of this agreement;",
  "acknowledge that this agreement will continue, subject to your annual renewal, until such time as either party provides notice of termination in writing;",
  "have read, understood and agree to the services we will provide, and the fees you will be charged, in the attached Consent to commence an ongoing fee deduction form;",
  "acknowledge that entering into this agreement will automatically replace and terminate any existing service agreement between us; and",
  "acknowledge that on termination we will cease charging you fees and cease providing you with the services under this agreement.",
];

export const ANNUAL_ADVICE_AGREEMENT_ACKNOWLEDGEMENT_ITEMS = [
  "agree to be bound by the terms and conditions of this agreement;",
  "acknowledge that this agreement will continue until such time as either party provides notice of termination in writing;",
  "have read, understood and agree to the services we will provide, and the fees you will be charged, in the attached Consent to commence a non-ongoing fee deduction form;",
  "acknowledge that entering into this agreement will automatically replace and terminate any existing service agreement between us; and",
  "acknowledge that on termination we will cease charging you fees and cease providing you with the services under this agreement.",
];

export type ServiceAgreementServiceGroup = {
  heading: string | null;
  items: string[];
};

export type ServiceAgreementSectionModel = {
  sectionKey: "serviceAgreement";
  consentSectionKey: "consentToDeductFees";
  present: boolean;
  isFixedTermAgreement: boolean;
  agreementTitle: string;
  contentsLabel: string;
  arrangementLabel: string;
  serviceHeading: string;
  openingParagraphs: string[];
  nextStepHeading: string;
  nextStepParagraphs: string[];
  acknowledgementItems: string[];
  services: string[];
  serviceGroups: ServiceAgreementServiceGroup[];
  feeItems: ServiceAgreementFeeItemV1[];
  feeRows: Array<{
    feeItem: ServiceAgreementFeeItemV1;
    ownerName: string;
    productName: string;
    accountNumber: string;
    accountLabel: string;
    frequencyLabel: string;
    annualAmount: number;
  }>;
  totalAnnualFees: number;
  referenceDate: string;
  expiryDate: string;
  signatureNames: string[];
  adviser: {
    name: string;
    practiceName: string;
    email: string;
    phone: string;
    licenseeName: string;
  };
};

function isServiceBullet(line: string) {
  return /^[-*•]\s+/.test(line.trim());
}

function normalizeServiceBullet(line: string) {
  return line.trim().replace(/^[-*•]\s+/, "");
}

export function groupServiceAgreementServices(services: string[]): ServiceAgreementServiceGroup[] {
  const cleanedServices = services.map((service) => service.trim()).filter(Boolean);
  const hasStructuredBullets = cleanedServices.some(isServiceBullet);

  if (!hasStructuredBullets) {
    return cleanedServices.length ? [{ heading: null, items: cleanedServices }] : [];
  }

  const groups: ServiceAgreementServiceGroup[] = [];
  let currentGroup: ServiceAgreementServiceGroup | null = null;

  cleanedServices.forEach((service) => {
    if (isServiceBullet(service)) {
      if (!currentGroup) {
        currentGroup = { heading: null, items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(normalizeServiceBullet(service));
      return;
    }

    currentGroup = { heading: service, items: [] };
    groups.push(currentGroup);
  });

  return groups;
}

export function addDays(value: string, days: number) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function getServiceFeeAnnualAmount(feeItem: ServiceAgreementFeeItemV1) {
  const multiplier = SERVICE_FEE_FREQUENCY_OPTIONS.find((option) => option.value === feeItem.frequency)?.annualMultiplier ?? 1;
  return (feeItem.feeAmount ?? 0) * multiplier;
}

export function getServiceFeeFrequencyLabel(frequency: ServiceAgreementFeeItemV1["frequency"]) {
  return SERVICE_FEE_FREQUENCY_OPTIONS.find((option) => option.value === frequency)?.label ?? frequency;
}

export function getAdviceCaseOwnerName(adviceCase: AdviceCaseV1, ownerPersonId?: string | null) {
  const owner = adviceCase.clientGroup.clients.find((person) => person.personId === ownerPersonId);
  return owner?.fullName?.trim() || adviceCase.clientGroup.clients[0]?.fullName?.trim() || "Client";
}

export function buildServiceAgreementSectionModel({
  adviceCase,
  savedAt,
  clientNames,
  adviserName,
  adviserEmail,
  adviserPhone,
  practiceName,
  licenseeName,
  getOwnerName,
}: {
  adviceCase: AdviceCaseV1;
  savedAt: string;
  clientNames: string;
  adviserName: string;
  adviserEmail: string;
  adviserPhone: string;
  practiceName: string;
  licenseeName: string;
  getOwnerName?: (ownerPersonId?: string | null) => string;
}): ServiceAgreementSectionModel | null {
  const feeAgreement = adviceCase.agreements.feeAgreement;

  if (!feeAgreement?.present) {
    return null;
  }

  const isFixedTermAgreement = feeAgreement.agreementType === "fixed-term";
  const services = feeAgreement.services.length ? feeAgreement.services : DEFAULT_SERVICE_AGREEMENT_SERVICES;
  const feeItems = feeAgreement.feeItems ?? [];
  const referenceDate = feeAgreement.referenceDate || feeAgreement.startDate || savedAt;
  const resolveOwnerName = getOwnerName ?? ((ownerPersonId?: string | null) => getAdviceCaseOwnerName(adviceCase, ownerPersonId));
  const feeRows = feeItems.map((feeItem) => {
    const ownerName = resolveOwnerName(feeItem.ownerPersonId);
    const productName = feeItem.productName || "-";
    const accountNumber = feeItem.accountNumber || "-";

    return {
      feeItem,
      ownerName,
      productName,
      accountNumber,
      accountLabel: `${ownerName} - ${[feeItem.productName, feeItem.accountNumber ? `(${feeItem.accountNumber})` : ""]
        .filter(Boolean)
        .join(" ") || "Account"}`,
      frequencyLabel: getServiceFeeFrequencyLabel(feeItem.frequency),
      annualAmount: getServiceFeeAnnualAmount(feeItem),
    };
  });

  return {
    sectionKey: "serviceAgreement",
    consentSectionKey: "consentToDeductFees",
    present: true,
    isFixedTermAgreement,
    agreementTitle: isFixedTermAgreement ? "Annual Advice Agreement" : "Ongoing Service Agreement",
    contentsLabel: isFixedTermAgreement ? "Fixed Term Agreement" : "Ongoing Service Agreement",
    arrangementLabel: isFixedTermAgreement ? "fixed term advice agreement" : "ongoing fee arrangement",
    serviceHeading: isFixedTermAgreement ? "My Annual Advice Service Includes" : "The Services You Are Entitled To Receive",
    openingParagraphs: isFixedTermAgreement
      ? ANNUAL_ADVICE_AGREEMENT_OPENING_PARAGRAPHS
      : ONGOING_SERVICE_AGREEMENT_OPENING_PARAGRAPHS,
    nextStepHeading: isFixedTermAgreement ? "Your Acknowledgement" : "Your Acknowledgement",
    nextStepParagraphs: isFixedTermAgreement
      ? ANNUAL_ADVICE_AGREEMENT_ACKNOWLEDGEMENT_PARAGRAPHS
      : [],
    acknowledgementItems: isFixedTermAgreement
      ? ANNUAL_ADVICE_AGREEMENT_ACKNOWLEDGEMENT_ITEMS
      : ONGOING_SERVICE_AGREEMENT_ACKNOWLEDGEMENT_ITEMS,
    services,
    serviceGroups: groupServiceAgreementServices(services),
    feeItems,
    feeRows,
    totalAnnualFees: feeRows.reduce((sum, feeRow) => sum + feeRow.annualAmount, 0),
    referenceDate,
    expiryDate: addDays(referenceDate, 150),
    signatureNames: adviceCase.clientGroup.clients.length
      ? adviceCase.clientGroup.clients.slice(0, 2).map((person) => person.fullName || "Client")
      : [clientNames],
    adviser: {
      name: adviserName,
      practiceName,
      email: adviserEmail,
      phone: adviserPhone,
      licenseeName,
    },
  };
}
