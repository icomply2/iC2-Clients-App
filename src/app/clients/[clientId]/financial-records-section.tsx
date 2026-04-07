"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ApiResult,
  ClientExpenseRecord,
  ClientIncomeRecord,
  ClientInsuranceRecord,
  ClientLiabilityRecord,
  ClientPensionRecord,
  ClientProfile,
  ClientSuperannuationRecord,
} from "@/lib/api/types";
import styles from "./page.module.css";

type SectionKind = "liabilities" | "income" | "expenses" | "superannuation" | "retirement-income" | "insurance";
type FinancialRecord =
  | ClientLiabilityRecord
  | ClientIncomeRecord
  | ClientExpenseRecord
  | ClientSuperannuationRecord
  | ClientPensionRecord
  | ClientInsuranceRecord;

type DisplayRow = {
  id: string;
  cells: string[];
  label: string;
  derived?: boolean;
  sourceLabel?: string;
  amount?: number;
  annualised?: number;
  secondaryAmount?: number;
};

type Props = {
  profile: ClientProfile;
  kind: SectionKind;
  useMockFallback?: boolean;
};

const frequencyOptions = ["Weekly", "Fortnightly", "Monthly", "Quarterly", "Annually"];
const liabilityTypeOptions = ["Home Loan", "Investment Loan", "Personal Loan", "Credit Card", "Other"];
const incomeTypeOptions = ["Salary", "Bonus", "Rental", "Investment", "Pension", "Other"];
const taxTypeOptions = ["Taxable", "Non-taxable"];
const expenseTypeOptions = ["Living", "Mortgage", "Rent", "Utilities", "Insurance", "Other"];
const superTypeOptions = ["Industry Fund", "Retail Fund", "SMSF", "Defined Benefit", "Other"];
const pensionTypeOptions = ["Account Based Pension", "Allocated Pension", "Annuity", "Other"];
const insuranceCoverOptions = ["Life", "TPD", "Trauma", "Income Protection", "Health", "Other"];
const insuranceStatusOptions = ["Active", "Pending", "Cancelled", "Claimed"];

function normalizeCurrencyInput(value: string) {
  const digitsOnly = value.replace(/[^\d.]/g, "");
  const firstDecimalIndex = digitsOnly.indexOf(".");
  if (firstDecimalIndex === -1) return digitsOnly;
  const integerPart = digitsOnly.slice(0, firstDecimalIndex + 1);
  const decimalPart = digitsOnly.slice(firstDecimalIndex + 1).replace(/\./g, "").slice(0, 2);
  return `${integerPart}${decimalPart}`;
}

function formatCurrencyField(value: string) {
  const normalizedValue = normalizeCurrencyInput(value);
  if (!normalizedValue) return "";
  const [integerPartRaw, decimalPartRaw = ""] = normalizedValue.split(".");
  const groupedIntegerPart = Number(integerPartRaw || "0").toLocaleString("en-AU");
  return normalizedValue.includes(".") ? `$${groupedIntegerPart}.${decimalPartRaw}` : `$${groupedIntegerPart}`;
}

function toStoredCurrencyValue(value: string) {
  const normalizedValue = normalizeCurrencyInput(value);
  if (!normalizedValue) return null;
  const numericValue = Number(normalizedValue);
  return Number.isNaN(numericValue) ? null : numericValue.toFixed(2);
}

function formatCurrency(value?: string | null) {
  if (!value) return "";
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return value;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
}

function toNumericValue(value?: string | null) {
  if (!value) {
    return 0;
  }

  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? 0 : numericValue;
}

function annualiseAmount(amount: number, frequency?: string | null) {
  switch ((frequency ?? "").toLowerCase()) {
    case "weekly":
      return amount * 52;
    case "fortnightly":
      return amount * 26;
    case "monthly":
      return amount * 12;
    case "quarterly":
      return amount * 4;
    case "annually":
    case "annual":
      return amount;
    default:
      return amount;
  }
}

function parseResponseBody<T>(responseText: string) {
  if (!responseText) return null;
  try {
    return JSON.parse(responseText) as
      | ApiResult<T[]>
      | { message?: string | null; modelErrors?: { errorMessage?: string | null }[] | null };
  } catch {
    return null;
  }
}

function ownerOptionsFromProfile(profile: ClientProfile) {
  return [
    profile.client?.name && profile.client?.id ? { value: profile.client.id, label: profile.client.name } : null,
    profile.partner?.name && profile.partner?.id ? { value: profile.partner.id, label: profile.partner.name } : null,
    ...(profile.entities ?? []).filter((entity) => entity.id && entity.name).map((entity) => ({ value: entity.id ?? "", label: entity.name ?? "" })),
  ].filter((option): option is { value: string; label: string } => Boolean(option));
}

function optionFromValue(value?: string | null) {
  return value ? { type: value, value } : null;
}

function normalizeLinkedRecord(
  value?: {
    id?: string | null;
    type?: string | null;
  } | null,
) {
  if (value?.id || value?.type) {
    return {
      id: value.id ?? "",
      type: value.type ?? "",
    };
  }

  return {
    id: "",
    type: "",
  };
}

function defaultPrimaryType(kind: SectionKind) {
  switch (kind) {
    case "liabilities":
      return liabilityTypeOptions[0];
    case "income":
      return incomeTypeOptions[0];
    case "expenses":
      return expenseTypeOptions[0];
    case "superannuation":
      return superTypeOptions[0];
    case "retirement-income":
      return pensionTypeOptions[0];
    case "insurance":
      return insuranceCoverOptions[0];
  }
}

function defaultFrequency(kind: SectionKind) {
  switch (kind) {
    case "liabilities":
    case "income":
    case "expenses":
    case "superannuation":
    case "retirement-income":
      return frequencyOptions[0];
    case "insurance":
      return "Monthly";
  }
}

function defaultSecondaryText(kind: SectionKind) {
  switch (kind) {
    case "expenses":
      return "3.00%";
    default:
      return "";
  }
}

function getErrorMessage(
  result: ReturnType<typeof parseResponseBody<FinancialRecord>>,
  responseText: string,
  fallback: string,
  status: number,
) {
  const modelError =
    result && "modelErrors" in result && Array.isArray(result.modelErrors)
      ? result.modelErrors.find((entry) => entry?.errorMessage)?.errorMessage
      : null;
  return modelError ?? (result && "message" in result && result.message ? result.message : responseText || `${fallback} (status ${status}).`);
}

function getFallbackMessage() {
  return "Live client data is temporarily unavailable. Editing is disabled while sample data is shown.";
}

export function FinancialRecordsSection({ profile, kind, useMockFallback = false }: Props) {
  const router = useRouter();
  const hasPartner = Boolean(profile.partner?.id);
  const ownerOptions = useMemo(() => ownerOptionsFromProfile(profile), [profile]);
  const assetOptions = useMemo(
    () => (profile.assets ?? []).filter((asset) => asset.id).map((asset) => ({ value: asset.id ?? "", label: asset.description ?? asset.assetType ?? "Asset" })),
    [profile.assets],
  );
  const liabilityOptions = useMemo(
    () => (profile.liabilities ?? []).filter((item) => item.id).map((item) => ({ value: item.id ?? "", label: item.loanType ?? item.bankName ?? "Liability" })),
    [profile.liabilities],
  );
  const superOptions = useMemo(
    () => (profile.superannuation ?? []).filter((item) => item.id).map((item) => ({ value: item.id ?? "", label: item.superFund ?? item.type ?? "Super Fund" })),
    [profile.superannuation],
  );
  const initialRecords = useMemo(() => {
    switch (kind) {
      case "liabilities":
        return (profile.liabilities ?? []) as FinancialRecord[];
      case "income":
        return (profile.income ?? []) as FinancialRecord[];
      case "expenses":
        return (profile.expense ?? []) as FinancialRecord[];
      case "superannuation":
        return (profile.superannuation ?? []) as FinancialRecord[];
      case "retirement-income":
        return (profile.pension ?? []) as FinancialRecord[];
      case "insurance":
        return (profile.insurance ?? []) as FinancialRecord[];
    }
  }, [kind, profile.expense, profile.income, profile.insurance, profile.liabilities, profile.pension, profile.superannuation]);

  const [records, setRecords] = useState<FinancialRecord[]>(initialRecords);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");
  const [ownerId, setOwnerId] = useState(ownerOptions[0]?.value ?? "");
  const [primaryType, setPrimaryType] = useState("");
  const [secondaryText, setSecondaryText] = useState("");
  const [description, setDescription] = useState("");
  const [amountOne, setAmountOne] = useState("");
  const [amountTwo, setAmountTwo] = useState("");
  const [textOne, setTextOne] = useState("");
  const [textTwo, setTextTwo] = useState("");
  const [frequency, setFrequency] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [joint, setJoint] = useState(false);

  useEffect(() => {
    setRecords(initialRecords);
  }, [initialRecords]);

  useEffect(() => {
    if (!ownerOptions.some((option) => option.value === ownerId)) {
      setOwnerId(ownerOptions[0]?.value ?? "");
    }
  }, [ownerId, ownerOptions]);

  function resetForm() {
    setOwnerId(ownerOptions[0]?.value ?? "");
    setPrimaryType(defaultPrimaryType(kind));
    setSecondaryText(defaultSecondaryText(kind));
    setDescription("");
    setAmountOne("");
    setAmountTwo("");
    setTextOne("");
    setTextTwo("");
    setFrequency(defaultFrequency(kind));
    setReferenceId("");
    setJoint(false);
    setEditingId(null);
    setErrorMessage("");
  }

  function getSectionMeta() {
    switch (kind) {
      case "liabilities":
        return { title: "Liabilities", deleteTitle: "Delete Liability", savePath: "liabilities", deletePath: "liabilities", emptyName: "liability" };
      case "income":
        return { title: "Income", deleteTitle: "Delete Income", savePath: "income", deletePath: "income", emptyName: "income record" };
      case "expenses":
        return { title: "Expense", deleteTitle: "Delete Expense", savePath: "expenses", deletePath: "expenses", emptyName: "expense" };
      case "superannuation":
        return { title: "Superannuation", deleteTitle: "Delete Superannuation", savePath: "superannuation", deletePath: "superannuation", emptyName: "superannuation record" };
      case "retirement-income":
        return { title: "Pensions", deleteTitle: "Delete Pension", savePath: "retirement-income", deletePath: "retirement-income", emptyName: "pension record" };
      case "insurance":
        return { title: "Insurance", deleteTitle: "Delete Insurance", savePath: "insurance", deletePath: "insurance", emptyName: "insurance record" };
    }
  }

  function columns() {
    switch (kind) {
      case "liabilities":
        return ["Owner", "Type", "Bank", "Balance", "Repayment"];
      case "income":
        return ["Owner", "Description", "Amount", "Frequency", "Annualised"];
      case "expenses":
        return ["Owner", "Type", "Description", "Amount", "Frequency", "Annualised"];
      case "superannuation":
        return ["Owner", "Type", "Fund", "Balance", "Contribution"];
      case "retirement-income":
        return ["Owner", "Fund", "Balance", "Payment", "Frequency"];
      case "insurance":
        return ["Owner", "Cover", "Insurer", "Sum Insured", "Premium", "Frequency", "Status"];
    }
  }

  function displayRows() {
    switch (kind) {
      case "liabilities":
        return (records as ClientLiabilityRecord[]).map((record): DisplayRow => ({
          id: record.id ?? "",
          cells: [record.owner?.name ?? "", record.loanType ?? "", record.bankName ?? "", formatCurrency(record.outstandingBalance), formatCurrency(record.repaymentAmount)],
          label: record.loanType ?? "liability",
          amount: toNumericValue(record.outstandingBalance),
          secondaryAmount: toNumericValue(record.repaymentAmount),
        }));
      case "income":
        return [
          ...(records as ClientIncomeRecord[]).map((record): DisplayRow => ({
            id: record.id ?? "",
            cells: [
              record.owner?.name ?? "",
              record.description ?? "",
              formatCurrency(record.amount),
              record.frequency?.value ?? "",
              formatCurrency(annualiseAmount(toNumericValue(record.amount), record.frequency?.value ?? record.frequency?.type).toFixed(2)),
            ],
            label: record.description ?? record.type ?? "income record",
            amount: toNumericValue(record.amount),
            annualised: annualiseAmount(toNumericValue(record.amount), record.frequency?.value ?? record.frequency?.type),
          })),
          ...(profile.assets ?? [])
            .filter((asset) => asset.id && asset.incomeAmount)
            .map(
              (asset): DisplayRow => ({
                id: `derived-asset-${asset.id}`,
                cells: [
                  asset.owner?.name ?? "",
                  asset.description ?? asset.assetType ?? "",
                  formatCurrency(asset.incomeAmount),
                  asset.incomeFrequency?.value ?? asset.incomeFrequency?.type ?? "",
                  formatCurrency(annualiseAmount(toNumericValue(asset.incomeAmount), asset.incomeFrequency?.value ?? asset.incomeFrequency?.type).toFixed(2)),
                ],
                label: asset.description ?? asset.assetType ?? "asset income",
                derived: true,
                sourceLabel: "From Assets",
                amount: toNumericValue(asset.incomeAmount),
                annualised: annualiseAmount(toNumericValue(asset.incomeAmount), asset.incomeFrequency?.value ?? asset.incomeFrequency?.type),
              }),
            ),
          ...(profile.pension ?? [])
            .filter((pension) => pension.id && pension.payment)
            .map(
              (pension): DisplayRow => ({
                id: `derived-pension-${pension.id}`,
                cells: [
                  pension.owner?.name ?? "",
                  pension.superFund ?? pension.type ?? "",
                  formatCurrency(pension.payment),
                  pension.frequency?.value ?? pension.frequency?.type ?? "",
                  formatCurrency(annualiseAmount(toNumericValue(pension.payment), pension.frequency?.value ?? pension.frequency?.type).toFixed(2)),
                ],
                label: pension.superFund ?? pension.type ?? "retirement income",
                derived: true,
                sourceLabel: "From Retirement Income",
                amount: toNumericValue(pension.payment),
                annualised: annualiseAmount(toNumericValue(pension.payment), pension.frequency?.value ?? pension.frequency?.type),
              }),
            ),
        ];
      case "expenses":
        return [
          ...(records as ClientExpenseRecord[]).map((record): DisplayRow => ({
            id: record.id ?? "",
            cells: [
              record.owner?.name ?? "",
              record.type ?? "",
              record.description ?? "",
              formatCurrency(record.amount),
              record.frequency?.value ?? "",
              formatCurrency(annualiseAmount(toNumericValue(record.amount), record.frequency?.value ?? record.frequency?.type).toFixed(2)),
            ],
            label: record.description ?? record.type ?? "expense",
            amount: toNumericValue(record.amount),
            annualised: annualiseAmount(toNumericValue(record.amount), record.frequency?.value ?? record.frequency?.type),
          })),
          ...(profile.liabilities ?? [])
            .filter((liability) => liability.id && liability.repaymentAmount)
            .map(
              (liability): DisplayRow => ({
                id: `derived-liability-${liability.id}`,
                cells: [
                  liability.owner?.name ?? "",
                  liability.loanType ?? "Liability Repayment",
                  liability.bankName ?? "",
                  formatCurrency(liability.repaymentAmount),
                  liability.repaymentFrequency?.value ?? liability.repaymentFrequency?.type ?? "",
                  formatCurrency(
                    annualiseAmount(
                      toNumericValue(liability.repaymentAmount),
                      liability.repaymentFrequency?.value ?? liability.repaymentFrequency?.type,
                    ).toFixed(2),
                  ),
                ],
                label: liability.loanType ?? liability.bankName ?? "liability repayment",
                derived: true,
                sourceLabel: "From Liabilities",
                amount: toNumericValue(liability.repaymentAmount),
                annualised: annualiseAmount(
                  toNumericValue(liability.repaymentAmount),
                  liability.repaymentFrequency?.value ?? liability.repaymentFrequency?.type,
                ),
              }),
            ),
        ];
      case "superannuation":
        return (records as ClientSuperannuationRecord[]).map((record): DisplayRow => ({
          id: record.id ?? "",
          cells: [record.owner?.name ?? "", record.type ?? "", record.superFund ?? "", formatCurrency(record.balance), formatCurrency(record.contributionAmount)],
          label: record.superFund ?? record.type ?? "superannuation record",
          amount: toNumericValue(record.balance),
          secondaryAmount: toNumericValue(record.contributionAmount),
        }));
      case "retirement-income":
        return (records as ClientPensionRecord[]).map((record): DisplayRow => ({
          id: record.id ?? "",
          cells: [
            record.owner?.name ?? "",
            record.superFund ?? "",
            formatCurrency(record.balance),
            formatCurrency(record.payment),
            record.frequency?.value ?? record.frequency?.type ?? "",
          ],
          label: record.type ?? record.superFund ?? "retirement income record",
          amount: toNumericValue(record.balance),
          secondaryAmount: toNumericValue(record.payment),
        }));
      case "insurance":
        return (records as ClientInsuranceRecord[]).map((record): DisplayRow => ({
          id: record.id ?? "",
          cells: [
            record.owner?.name ?? "",
            record.coverRequired ?? "",
            record.insurer ?? "",
            formatCurrency(record.sumInsured),
            formatCurrency(record.premiumAmount),
            record.frequency?.value ?? record.frequency?.type ?? "",
            record.status ?? "",
          ],
          label: record.coverRequired ?? record.insurer ?? "insurance record",
        }));
    }
  }

  function summaryCells(rows: DisplayRow[]) {
    switch (kind) {
      case "liabilities": {
        const totalBalance = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
        const totalRepayment = rows.reduce((sum, row) => sum + (row.secondaryAmount ?? 0), 0);
        return ["", "", "Total", formatCurrency(totalBalance.toFixed(2)), formatCurrency(totalRepayment.toFixed(2))];
      }
      case "income": {
        const totalAmount = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
        const totalAnnualised = rows.reduce((sum, row) => sum + (row.annualised ?? 0), 0);
        return ["", "Total", formatCurrency(totalAmount.toFixed(2)), "", formatCurrency(totalAnnualised.toFixed(2))];
      }
      case "expenses": {
        const totalAmount = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
        const totalAnnualised = rows.reduce((sum, row) => sum + (row.annualised ?? 0), 0);
        return ["", "", "Total", formatCurrency(totalAmount.toFixed(2)), "", formatCurrency(totalAnnualised.toFixed(2))];
      }
      case "superannuation": {
        const totalBalance = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
        const totalContribution = rows.reduce((sum, row) => sum + (row.secondaryAmount ?? 0), 0);
        return ["", "", "Total", formatCurrency(totalBalance.toFixed(2)), formatCurrency(totalContribution.toFixed(2))];
      }
      case "retirement-income": {
        const totalBalance = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
        const totalPayment = rows.reduce((sum, row) => sum + (row.secondaryAmount ?? 0), 0);
        return ["", "Total", formatCurrency(totalBalance.toFixed(2)), formatCurrency(totalPayment.toFixed(2)), ""];
      }
      default:
        return null;
    }
  }

  function buildRecord(): FinancialRecord {
    const owner = ownerOptions.find((option) => option.value === ownerId);
    if (!owner) throw new Error("Please choose an owner.");

    switch (kind) {
      case "liabilities":
        if (!primaryType) throw new Error("Please choose a liability type.");
        return {
          loanType: primaryType,
          bankName: secondaryText.trim() || null,
          outstandingBalance: toStoredCurrencyValue(amountOne),
          repaymentAmount: toStoredCurrencyValue(amountTwo),
          accountNumber: textOne.trim() || null,
          interestRate: textTwo.trim() || null,
          repaymentFrequency: optionFromValue(frequency),
          securityAssets: referenceId ? { id: referenceId, type: assetOptions.find((o) => o.value === referenceId)?.label ?? "Asset", description: assetOptions.find((o) => o.value === referenceId)?.label ?? null } : null,
          joint: hasPartner ? joint : false,
          owner: { id: owner.value, name: owner.label },
        };
      case "income":
        if (!primaryType) throw new Error("Please choose an income type.");
        return {
          type: primaryType,
          description: description.trim() || null,
          amount: toStoredCurrencyValue(amountOne),
          taxType: secondaryText.trim() || null,
          frequency: optionFromValue(frequency),
          pension: normalizeLinkedRecord(null),
          joint: hasPartner ? joint : false,
          owner: { id: owner.value, name: owner.label },
        };
      case "expenses":
        if (!primaryType) throw new Error("Please choose an expense type.");
        return {
          type: primaryType,
          description: description.trim() || null,
          amount: toStoredCurrencyValue(amountOne),
          indexation: secondaryText.trim() || null,
          frequency: optionFromValue(frequency),
          liability: normalizeLinkedRecord(
            referenceId
              ? {
                  id: referenceId,
                  type: liabilityOptions.find((o) => o.value === referenceId)?.label ?? "Liability",
                }
              : null,
          ),
          joint: hasPartner ? joint : false,
          owner: { id: owner.value, name: owner.label },
        };
      case "superannuation":
        if (!primaryType) throw new Error("Please choose a superannuation type.");
        return {
          type: primaryType,
          superFund: secondaryText.trim() || null,
          balance: toStoredCurrencyValue(amountOne),
          contributionAmount: toStoredCurrencyValue(amountTwo),
          accountNumber: textOne.trim() || null,
          frequency: optionFromValue(frequency),
          joint: hasPartner ? joint : false,
          owner: { id: owner.value, name: owner.label },
        };
      case "retirement-income":
        if (!primaryType) throw new Error("Please choose a retirement income type.");
        return {
          type: primaryType,
          superFund: secondaryText.trim() || null,
          balance: toStoredCurrencyValue(amountOne),
          payment: toStoredCurrencyValue(amountTwo),
          accountNumber: textOne.trim() || null,
          annualReturn: textTwo.trim() || null,
          frequency: optionFromValue(frequency),
          owner: { id: owner.value, name: owner.label },
        };
      case "insurance":
        if (!primaryType) throw new Error("Please choose a cover type.");
        return {
          coverRequired: primaryType,
          insurer: secondaryText.trim() || null,
          sumInsured: toStoredCurrencyValue(amountOne),
          premiumAmount: toStoredCurrencyValue(amountTwo),
          frequency: optionFromValue(frequency),
          status: textOne.trim() || null,
          superFund: referenceId ? { id: referenceId, type: superOptions.find((o) => o.value === referenceId)?.label ?? "Super" } : null,
          joint: hasPartner ? joint : false,
          owner: { id: owner.value, name: owner.label },
        };
    }
  }

  function mergeReturnedRecords(returnedRecords: FinancialRecord[], submittedRecords: FinancialRecord[]) {
    return returnedRecords.map((returnedRecord) => {
      const matchedRecord =
        submittedRecords.find((submittedRecord) => submittedRecord.id && returnedRecord.id && submittedRecord.id === returnedRecord.id) ??
        submittedRecords.find((submittedRecord) => JSON.stringify(submittedRecord.owner) === JSON.stringify(returnedRecord.owner));
      return { ...returnedRecord, ...matchedRecord };
    });
  }

  async function saveRecords(nextRecords: FinancialRecord[], fallbackError: string) {
    if (!profile.id) throw new Error("This client profile does not have a profile id yet.");
    const meta = getSectionMeta();
    const response = await fetch(`/api/client-profiles/${encodeURIComponent(profile.id)}/${meta.savePath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentUser: null, request: nextRecords }),
    });
    const responseText = await response.text();
    const result = parseResponseBody<FinancialRecord>(responseText);
    if (!response.ok) {
      throw new Error(`Save failed (${response.status}): ${getErrorMessage(result, responseText, fallbackError, response.status)}`);
    }
    const returnedRecords = result && "data" in result && Array.isArray(result.data) ? (result.data as FinancialRecord[]) : null;
    setRecords(returnedRecords ? mergeReturnedRecords(returnedRecords, nextRecords) : nextRecords);
    router.refresh();
  }

  async function handleSave() {
    if (useMockFallback) {
      setErrorMessage(getFallbackMessage());
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    try {
      const record = buildRecord();
      const nextRecords = editingId
        ? records.map((item) => (item.id === editingId ? { ...item, ...record } : item))
        : [...records.map((item) => ({ ...item })), { id: null, ...record }];
      await saveRecords(nextRecords, `Unable to save the ${getSectionMeta().emptyName} right now`);
      resetForm();
      setIsOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save this record right now.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleEditClick(recordId: string) {
    if (useMockFallback) {
      setErrorMessage(getFallbackMessage());
      return;
    }

    const record = records.find((item) => item.id === recordId);
    if (!record) return;
    setEditingId(record.id ?? null);
    setErrorMessage("");

    switch (kind) {
      case "liabilities": {
        const item = record as ClientLiabilityRecord;
        setOwnerId(item.owner?.id ?? ownerOptions[0]?.value ?? "");
        setPrimaryType(item.loanType ?? "");
        setSecondaryText(item.bankName ?? "");
        setAmountOne(formatCurrencyField(item.outstandingBalance ?? ""));
        setAmountTwo(formatCurrencyField(item.repaymentAmount ?? ""));
        setTextOne(item.accountNumber ?? "");
        setTextTwo(item.interestRate ?? "");
        setFrequency(item.repaymentFrequency?.value ?? "");
        setReferenceId(item.securityAssets?.id ?? "");
        setJoint(hasPartner ? Boolean(item.joint) : false);
        break;
      }
      case "income": {
        const item = record as ClientIncomeRecord;
        setOwnerId(item.owner?.id ?? ownerOptions[0]?.value ?? "");
        setPrimaryType(item.type ?? "");
        setDescription(item.description ?? "");
        setAmountOne(formatCurrencyField(item.amount ?? ""));
        setSecondaryText(item.taxType ?? "");
        setFrequency(item.frequency?.value ?? "");
        setJoint(hasPartner ? Boolean(item.joint) : false);
        break;
      }
      case "expenses": {
        const item = record as ClientExpenseRecord;
        setOwnerId(item.owner?.id ?? ownerOptions[0]?.value ?? "");
        setPrimaryType(item.type ?? "");
        setDescription(item.description ?? "");
        setAmountOne(formatCurrencyField(item.amount ?? ""));
        setSecondaryText(item.indexation ?? "");
        setFrequency(item.frequency?.value ?? "");
        setReferenceId(item.liability?.id ?? "");
        setJoint(hasPartner ? Boolean(item.joint) : false);
        break;
      }
      case "superannuation": {
        const item = record as ClientSuperannuationRecord;
        setOwnerId(item.owner?.id ?? ownerOptions[0]?.value ?? "");
        setPrimaryType(item.type ?? "");
        setSecondaryText(item.superFund ?? "");
        setAmountOne(formatCurrencyField(item.balance ?? ""));
        setAmountTwo(formatCurrencyField(item.contributionAmount ?? ""));
        setTextOne(item.accountNumber ?? "");
        setFrequency(item.frequency?.value ?? "");
        setJoint(hasPartner ? Boolean(item.joint) : false);
        break;
      }
      case "retirement-income": {
        const item = record as ClientPensionRecord;
        setOwnerId(item.owner?.id ?? ownerOptions[0]?.value ?? "");
        setPrimaryType(item.type ?? "");
        setSecondaryText(item.superFund ?? "");
        setAmountOne(formatCurrencyField(item.balance ?? ""));
        setAmountTwo(formatCurrencyField(item.payment ?? ""));
        setTextOne(item.accountNumber ?? "");
        setTextTwo(item.annualReturn ?? "");
        setFrequency(item.frequency?.value ?? "");
        break;
      }
      case "insurance": {
        const item = record as ClientInsuranceRecord;
        setOwnerId(item.owner?.id ?? ownerOptions[0]?.value ?? "");
        setPrimaryType(item.coverRequired ?? "");
        setSecondaryText(item.insurer ?? "");
        setAmountOne(formatCurrencyField(item.sumInsured ?? ""));
        setAmountTwo(formatCurrencyField(item.premiumAmount ?? ""));
        setTextOne(item.status ?? "");
        setFrequency(item.frequency?.value ?? item.frequency?.type ?? defaultFrequency(kind));
        setReferenceId(item.superFund?.id ?? "");
        setJoint(hasPartner ? Boolean(item.joint) : false);
        break;
      }
    }

    setIsOpen(true);
  }

  async function handleDelete() {
    if (useMockFallback) {
      setDeleteErrorMessage(getFallbackMessage());
      return;
    }

    if (!profile.id || !deleteCandidateId) return;
    const meta = getSectionMeta();
    setIsSaving(true);
    setDeleteErrorMessage("");
    try {
      const response = await fetch(`/api/client-profiles/${encodeURIComponent(profile.id)}/${meta.deletePath}/${encodeURIComponent(deleteCandidateId)}`, { method: "DELETE" });
      const responseText = await response.text();
      const result = parseResponseBody<FinancialRecord>(responseText);
      if (!response.ok) {
        throw new Error(`Delete failed (${response.status}): ${getErrorMessage(result, responseText, `Unable to delete the ${meta.emptyName} right now`, response.status)}`);
      }
      setRecords((current) => current.filter((item) => item.id !== deleteCandidateId));
      router.refresh();
      setDeleteCandidateId(null);
    } catch (error) {
      setDeleteErrorMessage(error instanceof Error ? error.message : "Unable to delete this record right now.");
    } finally {
      setIsSaving(false);
    }
  }

  const meta = getSectionMeta();
  const headerColumns = columns();
  const rowData = displayRows();
  const totals = summaryCells(rowData);
  const usesAnnualisedGrid = kind === "income" || kind === "expenses" || kind === "insurance";
  const usesIncomeGrid = kind === "income";
  const usesFinancialSummaryRow = kind === "liabilities" || kind === "superannuation" || kind === "retirement-income";
  const usesAnnualisedSummaryRow = kind === "income" || kind === "expenses";
  const summaryLabelIndex = kind === "income" ? 1 : kind === "retirement-income" ? 1 : 2;
  const summaryValueIndexes =
    kind === "income"
      ? [2, 4]
      : kind === "retirement-income"
        ? [2, 3]
        : usesAnnualisedSummaryRow
          ? [3, 5]
          : [3, 4];

  return (
    <>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>{meta.title}</h1>
        <button
          type="button"
          className={styles.plusButton}
          aria-label={`Add ${meta.emptyName}`}
          onClick={() => {
            if (useMockFallback) {
              setErrorMessage(getFallbackMessage());
              return;
            }
            resetForm();
            setIsOpen(true);
          }}
          disabled={useMockFallback}
          title={useMockFallback ? getFallbackMessage() : undefined}
        >
          +
        </button>
      </div>

      {useMockFallback ? <p className={styles.actionNotice}>{getFallbackMessage()}</p> : null}

      {kind === "income" || kind === "expenses" ? (
        <p className={styles.dataNotice}>
          Some records on this page are created automatically from Assets, Liabilities, and Retirement Income to avoid double entry.
        </p>
      ) : null}

      <section className={styles.financialSection}>
        <div
          className={`${styles.financialHeader} ${
            usesIncomeGrid ? styles.financialRowIncomeAnnualised : usesAnnualisedGrid ? styles.financialRowAnnualised : ""
          }`.trim()}
        >
          {headerColumns.map((column) => (
            <div key={column}>{column}</div>
          ))}
          <div className={styles.entitiesActionsHeader}></div>
        </div>

        {rowData.map((row) => (
          <div
            key={row.id || row.label}
            className={`${styles.financialRow} ${
              usesIncomeGrid ? styles.financialRowIncomeAnnualised : usesAnnualisedGrid ? styles.financialRowAnnualised : ""
            }`.trim()}
          >
            {row.cells.map((cell, index) => (
              <div key={`${row.id}-${index}`} className={index === 2 ? styles.financialWideCell : undefined}>
                {cell}
              </div>
            ))}
            <div className={styles.entitiesActions}>
              {row.derived ? (
                <span className={styles.derivedTag}>{row.sourceLabel ?? "Auto"}</span>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.rowActionButton}
                    onClick={() => handleEditClick(row.id)}
                    aria-label={`Edit ${row.label}`}
                    disabled={useMockFallback}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`${styles.rowActionButton} ${styles.rowActionDanger}`.trim()}
                    onClick={() => {
                      if (useMockFallback) {
                        setDeleteErrorMessage(getFallbackMessage());
                        return;
                      }
                      setDeleteCandidateId(row.id);
                      setDeleteErrorMessage("");
                    }}
                    aria-label={`Delete ${row.label}`}
                    disabled={useMockFallback}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {totals ? (
          <div
            className={`${
              usesFinancialSummaryRow
                ? styles.financialSummaryRow
                : usesAnnualisedSummaryRow
                  ? usesIncomeGrid
                    ? styles.financialSummaryRowIncomeAnnualised
                    : styles.financialSummaryRowAnnualised
                  : styles.financialRow
            } ${styles.summaryRow}`.trim()}
          >
            {totals.map((cell, index) => (
              <div
                key={`summary-${index}`}
                className={
                  index === summaryLabelIndex
                    ? `${styles.summaryLabel} ${
                        usesFinancialSummaryRow || usesAnnualisedSummaryRow ? styles.financialSummaryLabelStart : ""
                      }`.trim()
                    : summaryValueIndexes.includes(index)
                      ? `${styles.summaryValue} ${
                          usesFinancialSummaryRow || usesAnnualisedSummaryRow ? styles.financialSummaryValueStart : ""
                        }`.trim()
                      : undefined
                }
              >
                {cell}
              </div>
            ))}
            <div
              className={
                usesFinancialSummaryRow || usesAnnualisedSummaryRow
                  ? kind === "income"
                    ? styles.incomeSummarySpacer
                    : kind === "expenses"
                      ? styles.expenseSummarySpacer
                      : styles.financialSummarySpacer
                  : undefined
              }
              aria-hidden="true"
            />
          </div>
        ) : null}
      </section>

      {isOpen ? (
        <div className={styles.modalOverlay}>
          <div className={styles.financialModalCard}>
            <div className={styles.identityModalHeader}>{editingId ? `Edit ${meta.title}` : `Add ${meta.title}`}</div>
            <div className={styles.identityModalBody}>
              <SelectRow label="Owner" value={ownerId} onChange={setOwnerId} options={ownerOptions} />
              {kind === "liabilities" ? <SelectRow label="Type" value={primaryType} onChange={setPrimaryType} options={liabilityTypeOptions.map((value) => ({ value, label: value }))} /> : null}
              {kind === "income" ? <SelectRow label="Type" value={primaryType} onChange={setPrimaryType} options={incomeTypeOptions.map((value) => ({ value, label: value }))} /> : null}
              {kind === "expenses" ? <SelectRow label="Type" value={primaryType} onChange={setPrimaryType} options={expenseTypeOptions.map((value) => ({ value, label: value }))} /> : null}
              {kind === "superannuation" ? <SelectRow label="Type" value={primaryType} onChange={setPrimaryType} options={superTypeOptions.map((value) => ({ value, label: value }))} /> : null}
              {kind === "retirement-income" ? <SelectRow label="Type" value={primaryType} onChange={setPrimaryType} options={pensionTypeOptions.map((value) => ({ value, label: value }))} /> : null}
              {kind === "insurance" ? <SelectRow label="Cover" value={primaryType} onChange={setPrimaryType} options={insuranceCoverOptions.map((value) => ({ value, label: value }))} /> : null}
              {kind === "liabilities" ? <InputRow label="Bank" value={secondaryText} onChange={setSecondaryText} /> : null}
              {kind === "income" ? <SelectRow label="Tax Type" value={secondaryText} onChange={setSecondaryText} options={[{ value: "", label: "" }, ...taxTypeOptions.map((value) => ({ value, label: value }))]} /> : null}
              {kind === "superannuation" ? <InputRow label="Fund" value={secondaryText} onChange={setSecondaryText} /> : null}
              {kind === "retirement-income" ? <InputRow label="Fund" value={secondaryText} onChange={setSecondaryText} /> : null}
              {kind === "insurance" ? <InputRow label="Insurer" value={secondaryText} onChange={setSecondaryText} /> : null}
              {kind === "income" || kind === "expenses" ? <InputRow label="Description" value={description} onChange={setDescription} /> : null}
              {kind === "superannuation" ? <InputRow label="Account No." value={textOne} onChange={setTextOne} /> : null}
              {kind === "retirement-income" ? <InputRow label="Account No." value={textOne} onChange={setTextOne} /> : null}
              {kind === "liabilities" ? <InputRow label="Account No." value={textOne} onChange={setTextOne} /> : null}
              {kind === "liabilities" ? <CurrencyRow label="Balance" value={amountOne} onChange={setAmountOne} /> : null}
              {kind === "income" ? <CurrencyRow label="Amount" value={amountOne} onChange={setAmountOne} /> : null}
              {kind === "expenses" ? <CurrencyRow label="Amount" value={amountOne} onChange={setAmountOne} /> : null}
              {kind === "superannuation" ? <CurrencyRow label="Balance" value={amountOne} onChange={setAmountOne} /> : null}
              {kind === "retirement-income" ? <CurrencyRow label="Balance" value={amountOne} onChange={setAmountOne} /> : null}
              {kind === "insurance" ? <CurrencyRow label="Sum Insured" value={amountOne} onChange={setAmountOne} /> : null}
              {kind === "liabilities" ? <CurrencyRow label="Repayment" value={amountTwo} onChange={setAmountTwo} /> : null}
              {kind === "superannuation" ? <CurrencyRow label="Contribution" value={amountTwo} onChange={setAmountTwo} /> : null}
              {kind === "retirement-income" ? <CurrencyRow label="Payment" value={amountTwo} onChange={setAmountTwo} /> : null}
              {kind === "insurance" ? <CurrencyRow label="Premium Amount" value={amountTwo} onChange={setAmountTwo} /> : null}
              {kind === "liabilities" ? <InputRow label="Interest Rate" value={textTwo} onChange={setTextTwo} /> : null}
              {kind === "retirement-income" ? <InputRow label="Annual Return" value={textTwo} onChange={setTextTwo} /> : null}
              {kind === "insurance" ? <SelectRow label="Status" value={textOne} onChange={setTextOne} options={insuranceStatusOptions.map((value) => ({ value, label: value }))} /> : null}
              {kind === "liabilities" || kind === "income" || kind === "expenses" || kind === "superannuation" || kind === "retirement-income" || kind === "insurance" ? <SelectRow label="Frequency" value={frequency} onChange={setFrequency} options={[{ value: "", label: "" }, ...frequencyOptions.map((value) => ({ value, label: value }))]} /> : null}
              {kind === "expenses" ? <InputRow label="Indexation" value={secondaryText} onChange={setSecondaryText} /> : null}
              {kind === "liabilities" ? <SelectRow label="Security Asset" value={referenceId} onChange={setReferenceId} options={[{ value: "", label: "" }, ...assetOptions]} /> : null}
              {kind === "expenses" ? <SelectRow label="Linked Liability" value={referenceId} onChange={setReferenceId} options={[{ value: "", label: "" }, ...liabilityOptions]} /> : null}
              {kind === "insurance" ? <SelectRow label="Super Fund" value={referenceId} onChange={setReferenceId} options={[{ value: "", label: "" }, ...superOptions]} /> : null}
              {kind !== "retirement-income" && hasPartner ? <CheckboxRow label="Joint Record" checked={joint} onChange={setJoint} /> : null}
            </div>
            <div className={styles.identityModalActions}>
              <button type="button" className={styles.identityCreateButton} onClick={() => void handleSave()} disabled={isSaving}>
                {isSaving ? "Saving..." : editingId ? "Save" : "Add"}
              </button>
              <button type="button" className={styles.modalSecondary} onClick={() => { resetForm(); setIsOpen(false); }} disabled={isSaving}>
                Cancel
              </button>
            </div>
            {errorMessage ? <p className={styles.modalError}>{errorMessage}</p> : null}
          </div>
        </div>
      ) : null}

      {deleteCandidateId ? (
        <div className={styles.modalOverlay}>
          <div className={styles.confirmDialog}>
            <h2 className={styles.confirmTitle}>{meta.deleteTitle}</h2>
            <p className={styles.confirmText}>Are you sure you want to delete this record? This action cannot be undone.</p>
            <div className={styles.confirmActions}>
              <button type="button" className={`${styles.modalPrimary} ${styles.confirmDanger}`.trim()} onClick={() => void handleDelete()} disabled={isSaving}>
                {isSaving ? "Deleting..." : "Delete"}
              </button>
              <button type="button" className={styles.modalSecondary} onClick={() => { setDeleteCandidateId(null); setDeleteErrorMessage(""); }} disabled={isSaving}>
                Cancel
              </button>
            </div>
            {deleteErrorMessage ? <p className={styles.modalError}>{deleteErrorMessage}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function InputRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className={styles.identityFieldRow}><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function CurrencyRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className={styles.identityFieldRow}><span>{label}</span><input type="text" value={value} onChange={(event) => onChange(formatCurrencyField(event.target.value))} inputMode="decimal" placeholder="$0.00" /></label>;
}

function SelectRow({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; }) {
  return <label className={styles.identityFieldRow}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={`${label}-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>;
}

function CheckboxRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className={styles.assetCheckboxRow}><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}
