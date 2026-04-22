import type {
  ClientAssetRecord,
  ClientExpenseRecord,
  ClientIncomeRecord,
  ClientInsuranceRecord,
  ClientLiabilityRecord,
  ClientPensionRecord,
  ClientSuperannuationRecord,
} from "@/lib/api/types";

export type ProfileCollectionKind =
  | "assets"
  | "liabilities"
  | "income"
  | "expenses"
  | "superannuation"
  | "retirement-income"
  | "insurance";

export type FinancialCollectionKind = Exclude<ProfileCollectionKind, "assets">;

export type ProfileCollectionRecordMap = {
  assets: ClientAssetRecord;
  liabilities: ClientLiabilityRecord;
  income: ClientIncomeRecord;
  expenses: ClientExpenseRecord;
  superannuation: ClientSuperannuationRecord;
  "retirement-income": ClientPensionRecord;
  insurance: ClientInsuranceRecord;
};

export type ProfileCollectionRecord<K extends ProfileCollectionKind> = ProfileCollectionRecordMap[K];

export type ProfileCollectionSavePayload<K extends ProfileCollectionKind> = {
  currentUser: null;
  request: Array<ProfileCollectionRecord<K>>;
};
