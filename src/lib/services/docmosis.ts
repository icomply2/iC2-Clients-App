import "server-only";

import type {
  ClientAssetRecord,
  ClientDependantRecord,
  ClientInsuranceRecord,
  ClientLiabilityRecord,
  ClientPensionRecord,
  ClientProfile,
  ClientSuperannuationRecord,
  PersonRecord,
} from "@/lib/api/types";

export const DOCMOSIS_FACT_FIND_TEMPLATE_NAME =
  process.env.DOCMOSIS_FACT_FIND_TEMPLATE_NAME ?? "Acacia Financial Advisory/FactFind.docx";
export const DOCMOSIS_INVOICE_TEMPLATE_NAME =
  process.env.DOCMOSIS_INVOICE_TEMPLATE_NAME ?? "bubble/Invoice.docx";
export const DOCMOSIS_ENGAGEMENT_TEMPLATE_NAME =
  process.env.DOCMOSIS_ENGAGEMENT_TEMPLATE_NAME ?? "Insight Investment Partners/Engagement.docx";

const DOCMOSIS_API_URL = process.env.DOCMOSIS_API_URL ?? "https://au.dws3.docmosis.com/api";
const DOCMOSIS_ACCESS_KEY = process.env.DOCMOSIS_ACCESS_KEY ?? "";

type ContactRow = {
  name: string;
  type: string;
  number: string;
};

type EmploymentRow = {
  job_title: string;
  status: string;
  employer: string;
  salary: string;
  frequency: string;
};

type DependantRow = {
  name: string;
  birthday: string;
};

type EntityRow = {
  name: string;
  type: string;
};

type AssetRow = {
  asset_type: string;
  owner: string;
  current_value: string;
};

type LiabilityRow = {
  type: string;
  owner: string;
  outstanding_balance: string;
};

type SuperRow = {
  super_fund: string;
  owner: string;
  balance: string;
};

type IncomeRow = {
  description: string;
  owner: string;
  amount: number;
};

type ExpenseRow = {
  description: string;
  owner: string;
  amount: number;
};

type InsuranceItemRow = {
  type: string;
  sum_insured: string;
  premium_type: string;
  held_super: string;
  premium: string;
  frequency: string;
};

type InsuranceGroupRow = {
  owner: string;
  insurer: string;
  items: InsuranceItemRow[];
};

type RiskProfileBlock = {
  riskprofile_outcome: string;
  riskprofile_result: string;
  riskprofile_reason: string;
  q_and_a: Array<{
    q: string;
    a: string;
  }>;
};

export type InvoiceDocmosisItem = {
  description: string;
  quantity: string;
  unitprice: string;
  gst: string;
  total_: string;
};

export type InvoiceDocmosisInput = {
  referenceNumber?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  adviserName?: string | null;
  serviceType?: string | null;
  clientEntityId?: string | null;
  dueDate?: string | null;
  includeStripePaymentLink?: boolean;
  hostedUrl?: string | null;
  items?: Array<{
    description?: string | null;
    quantity?: string | null;
    priceExGst?: string | null;
    totalGst?: string | null;
  }>;
};

export type InvoiceDocmosisModel = {
  client: string;
  clientemail: string;
  addressstreet: string;
  addresssuburb: string;
  addressstate: string;
  addresspostcode: string;
  date: string;
  invnumber: string;
  practiceabn: string;
  duedate: string;
  practicename: string;
  Adviser: string;
  cliententitiyID: string;
  servicetype: string;
  is_stripe_tick: boolean;
  hosted_url: string;
  isInsight: boolean;
  licensee: string;
  licenseeaddress: string;
  licenseestate: string;
  licenseepostcode: string;
  bsb: string;
  account: string;
  items: InvoiceDocmosisItem[];
};

export type EngagementLetterDocmosisInput = {
  reasonsHtml?: string | null;
  servicesHtml?: string | null;
  advicePreparationFee?: string | null;
  implementationFee?: string | null;
};

export type EngagementLetterDocmosisModel = {
  client: string;
  partner: string;
  addressstreet: string;
  addresssuburb: string;
  addressstate: string;
  addresspostcode: string;
  clientfirstname: string;
  partnerfirstname: string;
  keyreasons: string;
  preparation: string;
  implementation: string;
  services: string;
  practice: string;
};

export type FactFindDocmosisModel = {
  client: {
    name: string;
    adviser: string;
    date: string;
    haspartner: boolean;
    age: string;
    gender: string;
    birthday: string;
    marital_status: string;
    address: string;
    suburb: string;
    state: string;
    postal_code: string;
    health_status: string;
    health_history: string;
    smoker: string;
    health_insurance: string;
    contacts: ContactRow[];
    dependants: DependantRow[];
    employment: EmploymentRow[];
    employment_not_empty: boolean;
  };
  partner: {
    name: string;
    age: string;
    gender: string;
    birthday: string;
    marital_status: string;
    health_status: string;
    health_history: string;
    smoker: string;
    health_insurance: string;
    contacts: ContactRow[];
    dependants: DependantRow[];
    employment: EmploymentRow[];
  };
  risk_profile_empty: boolean;
  declaration: boolean;
  entities_not_empty: boolean;
  entities: EntityRow[];
  assets_not_empty: boolean;
  assets: AssetRow[];
  total_assets: string;
  liabilities_not_empty: boolean;
  liabilities: LiabilityRow[];
  total_outstanding_balance: string;
  superannuation_not_empty: boolean;
  superannuation: SuperRow[];
  total_superannuation: string;
  pension_not_empty: boolean;
  pension: SuperRow[];
  total_pension: string;
  income_not_empty: boolean;
  income: IncomeRow[];
  total_income: number;
  expense_not_empty: boolean;
  expense: ExpenseRow[];
  total_expense: number;
  insurance_not_empty: boolean;
  insurance: InsuranceGroupRow[];
  riskProfileClient: RiskProfileBlock;
  riskProfilePartner: RiskProfileBlock;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstName(value: unknown) {
  const name = text(value);
  if (!name) return "";

  return name.split(/\s+/)[0] ?? "";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value.replace(/[^0-9.-]/g, "").trim());
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
}

function currency(value: unknown) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numberValue(value));
}

function dateValue(value: unknown) {
  const raw = text(value);
  if (!raw) return "";

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[1].padStart(2, "0")}/${slashMatch[2].padStart(2, "0")}/${slashMatch[3]}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  return `${String(parsed.getDate()).padStart(2, "0")}/${String(parsed.getMonth() + 1).padStart(2, "0")}/${parsed.getFullYear()}`;
}

function calculateAge(value: unknown) {
  const raw = text(value);
  if (!raw) return "";

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";

  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const monthDelta = now.getMonth() - parsed.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < parsed.getDate())) {
    age -= 1;
  }

  return String(age);
}

function readArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readContacts(person: PersonRecord | null | undefined): ContactRow[] {
  const source = readArray<Record<string, unknown>>(readObject(person)?.contacts);
  return source.map((entry) => ({
    name: text(entry.name),
    type: text(entry.type),
    number: text(entry.number ?? entry.value ?? entry.phone),
  }));
}

function readEmployment(person: PersonRecord | null | undefined): EmploymentRow[] {
  const source = readArray<Record<string, unknown>>(readObject(person)?.employment);
  return source.map((entry) => ({
    job_title: text(entry.job_title ?? entry.jobTitle),
    status: text(entry.status),
    employer: text(entry.employer),
    salary: currency(entry.salary),
    frequency: text(entry.frequency ?? readObject(entry.frequency)?.type),
  }));
}

function buildAddress(person: PersonRecord | null | undefined) {
  const line = text(person?.street ?? person?.address?.street ?? person?.address?.line1);
  const suburb = text(person?.suburb ?? person?.address?.suburb ?? person?.address?.city);
  const state = text(person?.state ?? person?.address?.state ?? person?.address?.region);
  const postCode = text(person?.postCode ?? person?.postcode ?? person?.address?.postCode ?? person?.address?.postcode ?? person?.address?.zipCode);
  const parts = [line, suburb, state, postCode].filter(Boolean);

  return {
    address: parts.join(", "),
    suburb,
    state,
    postCode,
  };
}

function maybeCurrency(value: number) {
  return new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function buildPersonBlock(person: PersonRecord | null | undefined) {
  const address = buildAddress(person);

  return {
    name: text(person?.name),
    age: calculateAge(person?.dob),
    gender: text(person?.gender),
    birthday: dateValue(person?.dob),
    marital_status: text(person?.maritalStatus),
    address: address.address,
    suburb: address.suburb,
    state: address.state,
    postal_code: address.postCode,
    health_status: text(readObject(person)?.health_status ?? readObject(person)?.healthStatus),
    health_history: text(readObject(person)?.health_history ?? readObject(person)?.healthHistory),
    smoker: text(readObject(person)?.smoker),
    health_insurance: text(readObject(person)?.health_insurance ?? readObject(person)?.healthInsurance),
    contacts: readContacts(person),
    employment: readEmployment(person),
  };
}

function groupDependantsByOwner(
  dependants: ClientDependantRecord[],
  ownerName: string,
  ownerId?: string | null,
) {
  return dependants
    .filter((entry) => {
      const dependantOwnerName = text(entry.owner?.name);
      const dependantOwnerId = text(entry.owner?.id);
      if (ownerId && dependantOwnerId) return dependantOwnerId === ownerId;
      return dependantOwnerName === ownerName;
    })
    .map((entry) => ({
      name: text(entry.name),
      birthday: dateValue(entry.birthday),
    }));
}

function buildAssetRows(assets: ClientAssetRecord[]): AssetRow[] {
  return assets.map((entry) => ({
    asset_type: text(entry.description) || text(entry.assetType) || text(entry.type),
    owner: text(entry.owner?.name),
    current_value: currency(entry.currentValue),
  }));
}

function buildLiabilityRows(liabilities: ClientLiabilityRecord[]): LiabilityRow[] {
  return liabilities.map((entry) => ({
    type: text(entry.loanType),
    owner: text(entry.owner?.name),
    outstanding_balance: currency(entry.outstandingBalance),
  }));
}

function buildSuperRows(records: Array<ClientSuperannuationRecord | ClientPensionRecord>): SuperRow[] {
  return records.map((entry) => ({
    super_fund: text(entry.superFund),
    owner: text(entry.owner?.name),
    balance: currency(entry.balance),
  }));
}

function buildIncomeRows(profile: ClientProfile): IncomeRow[] {
  const direct = (profile.income ?? []).map((entry) => ({
    description: text(entry.description) || text(entry.type),
    owner: text(entry.owner?.name),
    amount: numberValue(entry.amount),
  }));

  const assetDerived = (profile.assets ?? [])
    .filter((entry) => numberValue(entry.incomeAmount) > 0)
    .map((entry) => {
      const frequency = text(entry.incomeFrequency?.type ?? entry.incomeFrequency?.value).toLowerCase();
      const multiplier = frequency === "weekly" ? 52 : frequency === "fortnightly" ? 26 : frequency === "monthly" ? 12 : frequency === "quarterly" ? 4 : 1;
      return {
        description: text(entry.description) || text(entry.assetType),
        owner: text(entry.owner?.name),
        amount: numberValue(entry.incomeAmount) * multiplier,
      };
    });

  const pensionDerived = (profile.pension ?? [])
    .filter((entry) => numberValue(entry.payment) > 0)
    .map((entry) => {
      const frequency = text(entry.frequency?.type ?? entry.frequency?.value).toLowerCase();
      const multiplier = frequency === "weekly" ? 52 : frequency === "fortnightly" ? 26 : frequency === "monthly" ? 12 : frequency === "quarterly" ? 4 : 1;
      return {
        description: text(entry.type) || text(entry.superFund),
        owner: text(entry.owner?.name),
        amount: numberValue(entry.payment) * multiplier,
      };
    });

  return [...direct, ...assetDerived, ...pensionDerived];
}

function buildExpenseRows(profile: ClientProfile): ExpenseRow[] {
  const direct = (profile.expense ?? []).map((entry) => ({
    description: text(entry.description) || text(entry.type),
    owner: text(entry.owner?.name),
    amount: numberValue(entry.amount),
  }));

  const liabilityDerived = (profile.liabilities ?? [])
    .filter((entry) => numberValue(entry.repaymentAmount) > 0)
    .map((entry) => {
      const frequency = text(entry.repaymentFrequency?.type ?? entry.repaymentFrequency?.value).toLowerCase();
      const multiplier = frequency === "weekly" ? 52 : frequency === "fortnightly" ? 26 : frequency === "monthly" ? 12 : frequency === "quarterly" ? 4 : 1;
      return {
        description: text(entry.loanType) || text(entry.bankName),
        owner: text(entry.owner?.name),
        amount: numberValue(entry.repaymentAmount) * multiplier,
      };
    });

  return [...direct, ...liabilityDerived];
}

function buildInsuranceRows(insurance: ClientInsuranceRecord[]): InsuranceGroupRow[] {
  const groups = new Map<string, InsuranceGroupRow>();

  for (const entry of insurance) {
    const owner = text(entry.owner?.name);
    const insurer = text(entry.insurer);
    const key = `${owner}::${insurer}`;
    const current =
      groups.get(key) ??
      {
        owner,
        insurer,
        items: [],
      };

    current.items.push({
      type: text(entry.coverRequired),
      sum_insured: currency(entry.sumInsured),
      premium_type: text(entry.frequency?.type ?? entry.frequency?.value),
      held_super: entry.superFund?.id || entry.superFund?.type ? "Yes" : "No",
      premium: currency(entry.premiumAmount),
      frequency: text(entry.frequency?.type ?? entry.frequency?.value),
    });

    groups.set(key, current);
  }

  return [...groups.values()];
}

function buildRiskProfileBlock(person: PersonRecord | null | undefined): RiskProfileBlock {
  return {
    riskprofile_outcome: text(person?.riskProfileResponse?.resultDisplay),
    riskprofile_result: text(person?.riskProfileResponse?.resultDisplay),
    riskprofile_reason: text(person?.riskProfileResponse?.score),
    q_and_a: readArray<Record<string, unknown>>(readObject(person)?.q_and_a ?? readObject(person)?.qAndA).map((entry) => ({
      q: text(entry.q),
      a: text(entry.a),
    })),
  };
}

export function buildFactFindDocmosisModel(profile: ClientProfile): FactFindDocmosisModel {
  const client = profile.client ?? null;
  const partner = profile.partner ?? null;
  const clientBlock = buildPersonBlock(client);
  const partnerBlock = buildPersonBlock(partner);

  const dependants = profile.dependants ?? [];
  const clientDependants = groupDependantsByOwner(dependants, clientBlock.name, client?.id);
  const partnerDependants = groupDependantsByOwner(dependants, partnerBlock.name, partner?.id);

  const entities = (profile.entities ?? []).map((entry) => ({
    name: text(entry.name),
    type: text(entry.type),
  }));

  const assets = buildAssetRows(profile.assets ?? []);
  const liabilities = buildLiabilityRows(profile.liabilities ?? []);
  const superannuation = buildSuperRows(profile.superannuation ?? []);
  const pension = buildSuperRows(profile.pension ?? []);
  const income = buildIncomeRows(profile);
  const expense = buildExpenseRows(profile);
  const insurance = buildInsuranceRows(profile.insurance ?? []);
  const partnerPresent = Boolean(partner?.id || partnerBlock.name || partnerBlock.birthday || partnerBlock.gender);
  const riskProfileClient = buildRiskProfileBlock(client);
  const riskProfilePartner = buildRiskProfileBlock(partner);
  const riskProfilePresent = Boolean(
    riskProfileClient.riskprofile_outcome ||
      riskProfileClient.riskprofile_result ||
      riskProfileClient.q_and_a.length ||
      riskProfilePartner.riskprofile_outcome ||
      riskProfilePartner.riskprofile_result ||
      riskProfilePartner.q_and_a.length,
  );

  return {
    client: {
      name: clientBlock.name,
      adviser: text(profile.adviser?.name),
      date: dateValue(new Date().toISOString()),
      haspartner: partnerPresent,
      age: clientBlock.age,
      gender: clientBlock.gender,
      birthday: clientBlock.birthday,
      marital_status: clientBlock.marital_status,
      address: clientBlock.address,
      suburb: clientBlock.suburb,
      state: clientBlock.state,
      postal_code: clientBlock.postal_code,
      health_status: clientBlock.health_status,
      health_history: clientBlock.health_history,
      smoker: clientBlock.smoker,
      health_insurance: clientBlock.health_insurance,
      contacts: clientBlock.contacts,
      dependants: clientDependants,
      employment: clientBlock.employment,
      employment_not_empty: clientBlock.employment.length > 0,
    },
    partner: {
      name: partnerBlock.name,
      age: partnerBlock.age,
      gender: partnerBlock.gender,
      birthday: partnerBlock.birthday,
      marital_status: partnerBlock.marital_status,
      health_status: partnerBlock.health_status,
      health_history: partnerBlock.health_history,
      smoker: partnerBlock.smoker,
      health_insurance: partnerBlock.health_insurance,
      contacts: partnerBlock.contacts,
      dependants: partnerDependants,
      employment: partnerBlock.employment,
    },
    risk_profile_empty: riskProfilePresent,
    declaration: true,
    entities_not_empty: entities.length > 0,
    entities,
    assets_not_empty: assets.length > 0,
    assets,
    total_assets: currency((profile.assets ?? []).reduce((sum, entry) => sum + numberValue(entry.currentValue), 0)),
    liabilities_not_empty: liabilities.length > 0,
    liabilities,
    total_outstanding_balance: currency((profile.liabilities ?? []).reduce((sum, entry) => sum + numberValue(entry.outstandingBalance), 0)),
    superannuation_not_empty: superannuation.length > 0,
    superannuation,
    total_superannuation: currency((profile.superannuation ?? []).reduce((sum, entry) => sum + numberValue(entry.balance), 0)),
    pension_not_empty: pension.length > 0,
    pension,
    total_pension: currency((profile.pension ?? []).reduce((sum, entry) => sum + numberValue(entry.balance), 0)),
    income_not_empty: income.length > 0,
    income,
    total_income: income.reduce((sum, entry) => sum + entry.amount, 0),
    expense_not_empty: expense.length > 0,
    expense,
    total_expense: expense.reduce((sum, entry) => sum + entry.amount, 0),
    insurance_not_empty: insurance.length > 0,
    insurance,
    riskProfileClient,
    riskProfilePartner,
  };
}

export function buildInvoiceDocmosisModel(
  profile: ClientProfile,
  input: InvoiceDocmosisInput,
): InvoiceDocmosisModel {
  const client = profile.client ?? null;
  const address = buildAddress(client);
  const practice = text(profile.practice);
  const licensee = text(profile.licensee);
  const adviserName = text(input.adviserName) || text(profile.adviser?.name);
  const rawItems = Array.isArray(input.items) ? input.items : [];
  const items = rawItems
    .filter((entry) => {
      const description = text(entry.description);
      const quantity = text(entry.quantity);
      const price = text(entry.priceExGst);
      const total = text(entry.totalGst);
      return Boolean(description || quantity || price || total);
    })
    .map<InvoiceDocmosisItem>((entry) => {
      const quantity = numberValue(entry.quantity) || 1;
      const unitPrice = numberValue(entry.priceExGst);
      const enteredTotal = numberValue(entry.totalGst);
      const subTotal = quantity * unitPrice;
      const gstAmount = subTotal * 0.1;
      const total = enteredTotal > 0 ? enteredTotal : subTotal + gstAmount;

      return {
        description: text(entry.description),
        quantity: String(quantity),
        unitprice: maybeCurrency(unitPrice),
        gst: maybeCurrency(gstAmount),
        total_: maybeCurrency(total),
      };
    });

  return {
    client: text(input.clientName) || text(client?.name),
    clientemail: text(input.clientEmail) || text(client?.email),
    addressstreet: text(client?.street ?? client?.address?.street ?? client?.address?.line1),
    addresssuburb: address.suburb,
    addressstate: address.state,
    addresspostcode: address.postCode,
    date: dateValue(new Date().toISOString()),
    invnumber: text(input.referenceNumber),
    practiceabn: "",
    duedate: dateValue(input.dueDate),
    practicename: practice,
    Adviser: adviserName,
    cliententitiyID: text(input.clientEntityId) || text(profile.id),
    servicetype: text(input.serviceType),
    is_stripe_tick: Boolean(input.includeStripePaymentLink),
    hosted_url: text(input.hostedUrl),
    isInsight: /insight/i.test(licensee) || /insight/i.test(practice),
    licensee,
    licenseeaddress: "",
    licenseestate: "",
    licenseepostcode: "",
    bsb: "",
    account: "",
    items,
  };
}

export function buildEngagementLetterDocmosisModel(
  profile: ClientProfile,
  input: EngagementLetterDocmosisInput,
): EngagementLetterDocmosisModel {
  const client = profile.client ?? null;
  const partner = profile.partner ?? null;
  const address = buildAddress(client);

  return {
    client: text(client?.name),
    partner: text(partner?.name),
    addressstreet: text(client?.street ?? client?.address?.street ?? client?.address?.line1),
    addresssuburb: address.suburb,
    addressstate: address.state,
    addresspostcode: address.postCode,
    clientfirstname: firstName(client?.name),
    partnerfirstname: firstName(partner?.name),
    keyreasons: text(input.reasonsHtml),
    preparation: text(input.advicePreparationFee),
    implementation: text(input.implementationFee),
    services: text(input.servicesHtml),
    practice: text(profile.practice),
  };
}

function sanitizeOutputName(value: string) {
  const cleaned = value.replace(/[<>:"/\\|?*]/g, "").trim();
  return cleaned || "FactFind";
}

export function buildFactFindOutputName(profile: ClientProfile) {
  const primaryName = text(profile.client?.name) || "Client";
  return `${sanitizeOutputName(primaryName)}-FactFind.docx`;
}

export function buildInvoiceOutputName(profile: ClientProfile, printAsPdf = false) {
  const primaryName = text(profile.client?.name) || "Client";
  return `${sanitizeOutputName(primaryName)}-Invoice.${printAsPdf ? "pdf" : "docx"}`;
}

export function buildEngagementLetterOutputName(profile: ClientProfile) {
  const primaryName = text(profile.client?.name) || "Client";
  return `${sanitizeOutputName(primaryName)}-Engagement.docx`;
}

export async function renderDocmosisDocx(input: {
  templateName?: string;
  outputName?: string;
  data: Record<string, unknown>;
}) {
  if (!DOCMOSIS_ACCESS_KEY) {
    throw new Error("Docmosis access key is not configured.");
  }

  const form = new FormData();
  form.append("accessKey", DOCMOSIS_ACCESS_KEY);
  form.append("templateName", input.templateName ?? DOCMOSIS_FACT_FIND_TEMPLATE_NAME);
  form.append("outputName", input.outputName ?? "FactFind.docx");
  form.append("data", JSON.stringify(input.data));

  const response = await fetch(`${DOCMOSIS_API_URL.replace(/\/$/, "")}/render`, {
    method: "POST",
    body: form,
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Docmosis render failed: ${response.status}${message ? ` ${message}` : ""}`.trim());
  }

  return Buffer.from(await response.arrayBuffer());
}
