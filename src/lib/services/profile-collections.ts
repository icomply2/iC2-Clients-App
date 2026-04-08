import type {
  ClientAssetRecord,
  ClientExpenseRecord,
  ClientIncomeRecord,
  ClientInsuranceRecord,
  ClientLiabilityRecord,
  ClientPensionRecord,
  ClientSuperannuationRecord,
} from "@/lib/api/types";
import type {
  FinancialCollectionKind,
  ProfileCollectionRecord,
  ProfileCollectionSavePayload,
} from "@/lib/api/contracts/profile-collections";
import {
  deleteProfileCollectionItem,
  saveProfileCollection,
} from "@/lib/api/adapters/profile-collections";

type RequestContext = {
  origin?: string | null;
  cookieHeader?: string | null;
};

function normalizeFrequency(value?: { type?: string | null; value?: string | null } | null) {
  if (value?.type || value?.value) {
    return {
      type: value.type ?? value.value ?? "",
      value: value.value ?? value.type ?? "",
    };
  }

  return {
    type: "",
    value: "",
  };
}

function normalizeOwner(value?: { id?: string | null; name?: string | null } | null) {
  return value
    ? {
        id: value.id ?? null,
        name: value.name ?? null,
      }
    : null;
}

function normalizeLinkedRecord(value?: { id?: string | null; type?: string | null; description?: string | null } | null) {
  if (!value) {
    return null;
  }

  return {
    id: value.id ?? "",
    type: value.type ?? "",
    ...("description" in value ? { description: value.description ?? null } : {}),
  };
}

function buildAssetSavePayload(records: ClientAssetRecord[]): ProfileCollectionSavePayload<"assets"> {
  return {
    currentUser: null,
    request: records.map((asset) => ({
      id: asset.id ?? null,
      type: asset.type ?? null,
      assetType: asset.assetType ?? null,
      currentValue: asset.currentValue ?? null,
      cost: asset.cost ?? null,
      incomeAmount: asset.incomeAmount ?? null,
      incomeFrequency: normalizeFrequency(asset.incomeFrequency),
      acquisitionDate: asset.acquisitionDate ?? null,
      joint: Boolean(asset.joint),
      description: asset.description ?? null,
      owner: normalizeOwner(asset.owner),
    })),
  };
}

function buildFinancialSavePayload<K extends FinancialCollectionKind>(kind: K, records: Array<ProfileCollectionRecord<K>>): ProfileCollectionSavePayload<K> {
  const request = records.map((record) => {
    switch (kind) {
      case "liabilities": {
        const item = record as ClientLiabilityRecord;
        return {
          id: item.id ?? null,
          loanType: item.loanType ?? null,
          accountNumber: item.accountNumber ?? null,
          bankName: item.bankName ?? null,
          outstandingBalance: item.outstandingBalance ?? null,
          interestRate: item.interestRate ?? null,
          repaymentAmount: item.repaymentAmount ?? null,
          joint: Boolean(item.joint),
          repaymentFrequency: normalizeFrequency(item.repaymentFrequency),
          owner: normalizeOwner(item.owner),
          securityAssets: normalizeLinkedRecord(item.securityAssets),
        };
      }
      case "income": {
        const item = record as ClientIncomeRecord;
        return {
          id: item.id ?? null,
          type: item.type ?? null,
          description: item.description ?? null,
          joint: Boolean(item.joint),
          amount: item.amount ?? null,
          taxType: item.taxType ?? null,
          pension: normalizeLinkedRecord(item.pension),
          owner: normalizeOwner(item.owner),
          frequency: normalizeFrequency(item.frequency),
        };
      }
      case "expenses": {
        const item = record as ClientExpenseRecord;
        return {
          id: item.id ?? null,
          type: item.type ?? null,
          description: item.description ?? null,
          joint: Boolean(item.joint),
          amount: item.amount ?? null,
          indexation: item.indexation ?? null,
          liability: normalizeLinkedRecord(item.liability),
          owner: normalizeOwner(item.owner),
          frequency: normalizeFrequency(item.frequency),
        };
      }
      case "superannuation": {
        const item = record as ClientSuperannuationRecord;
        return {
          id: item.id ?? null,
          joint: Boolean(item.joint),
          type: item.type ?? null,
          balance: item.balance ?? null,
          superFund: item.superFund ?? null,
          accountNumber: item.accountNumber ?? null,
          contributionAmount: item.contributionAmount ?? null,
          owner: normalizeOwner(item.owner),
          frequency: normalizeFrequency(item.frequency),
        };
      }
      case "retirement-income": {
        const item = record as ClientPensionRecord;
        return {
          id: item.id ?? null,
          type: item.type ?? null,
          balance: item.balance ?? null,
          superFund: item.superFund ?? null,
          accountNumber: item.accountNumber ?? null,
          annualReturn: item.annualReturn ?? null,
          payment: item.payment ?? null,
          owner: normalizeOwner(item.owner),
          frequency: normalizeFrequency(item.frequency),
        };
      }
      case "insurance": {
        const item = record as ClientInsuranceRecord;
        return {
          id: item.id ?? null,
          coverRequired: item.coverRequired ?? null,
          sumInsured: item.sumInsured ?? null,
          premiumAmount: item.premiumAmount ?? null,
          frequency: normalizeFrequency(item.frequency),
          joint: Boolean(item.joint),
          insurer: item.insurer ?? null,
          status: item.status ?? null,
          superFund: normalizeLinkedRecord(item.superFund),
          owner: normalizeOwner(item.owner),
        };
      }
    }
  }) as Array<ProfileCollectionRecord<K>>;

  return {
    currentUser: null,
    request,
  };
}

function mergeAssetCollection(returnedRecords: ClientAssetRecord[], submittedRecords: ClientAssetRecord[]) {
  return returnedRecords.map((returnedRecord) => {
    const matchedRecord =
      submittedRecords.find((submittedRecord) => submittedRecord.id && returnedRecord.id && submittedRecord.id === returnedRecord.id) ??
      submittedRecords.find(
        (submittedRecord) =>
          (submittedRecord.description ?? "").trim().toLowerCase() === (returnedRecord.description ?? "").trim().toLowerCase() &&
          (submittedRecord.owner?.id ?? "") === (returnedRecord.owner?.id ?? "") &&
          (submittedRecord.assetType ?? "") === (returnedRecord.assetType ?? ""),
      );

    return {
      ...returnedRecord,
      type: matchedRecord?.type ?? returnedRecord.type ?? null,
    };
  });
}

function mergeFinancialCollection<K extends FinancialCollectionKind>(
  returnedRecords: Array<ProfileCollectionRecord<K>>,
  submittedRecords: Array<ProfileCollectionRecord<K>>,
) {
  return returnedRecords.map((returnedRecord) => {
    const matchedRecord =
      submittedRecords.find((submittedRecord) => submittedRecord.id && returnedRecord.id && submittedRecord.id === returnedRecord.id) ??
      submittedRecords.find((submittedRecord) => JSON.stringify(submittedRecord.owner) === JSON.stringify(returnedRecord.owner));

    return { ...returnedRecord, ...matchedRecord };
  });
}

export function upsertAssetCollection(currentRecords: ClientAssetRecord[], nextRecord: ClientAssetRecord, editingId?: string | null) {
  return editingId
    ? currentRecords.map((record) => (record.id === editingId ? { ...record, ...nextRecord } : record))
    : [...currentRecords.map((record) => ({ ...record })), { id: null, ...nextRecord }];
}

export async function saveAssetCollection(
  profileId: string,
  records: ClientAssetRecord[],
  context?: RequestContext,
) {
  const returnedRecords = await saveProfileCollection("assets", profileId, buildAssetSavePayload(records), context);
  return returnedRecords ? mergeAssetCollection(returnedRecords, records) : records;
}

export async function deleteAssetCollectionItem(profileId: string, recordId: string, context?: RequestContext) {
  return deleteProfileCollectionItem("assets", profileId, recordId, context);
}

export function upsertFinancialCollection<K extends FinancialCollectionKind>(
  _kind: K,
  currentRecords: Array<ProfileCollectionRecord<K>>,
  nextRecord: ProfileCollectionRecord<K>,
  editingId?: string | null,
) {
  return editingId
    ? currentRecords.map((record) => (record.id === editingId ? { ...record, ...nextRecord } : record))
    : [...currentRecords.map((record) => ({ ...record })), { id: null, ...nextRecord }];
}

export async function saveFinancialCollection<K extends FinancialCollectionKind>(
  kind: K,
  profileId: string,
  records: Array<ProfileCollectionRecord<K>>,
  context?: RequestContext,
) {
  const returnedRecords = await saveProfileCollection(kind, profileId, buildFinancialSavePayload(kind, records), context);
  return returnedRecords ? mergeFinancialCollection(returnedRecords, records) : records;
}

export async function deleteFinancialCollectionItem(
  kind: FinancialCollectionKind,
  profileId: string,
  recordId: string,
  context?: RequestContext,
) {
  return deleteProfileCollectionItem(kind, profileId, recordId, context);
}
