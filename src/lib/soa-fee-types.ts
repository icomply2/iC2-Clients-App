import type { ProductFeeItemV1 } from "@/lib/soa-types";

type ProductFeeType = ProductFeeItemV1["feeType"];

export const PRODUCT_REX_FEE_TYPE_OPTIONS: Array<{ value: ProductFeeType; label: string }> = [
  { value: "investment-fee", label: "Investment Fee" },
  { value: "sliding-admin-fee", label: "Sliding Admin Fee" },
  { value: "admin-fee-flat", label: "Admin Fee (Flat)" },
  { value: "admin-fee-floating", label: "Admin Fee (Floating)" },
  { value: "expense-recovery-fee-flat", label: "Expense Recovery Fee (Flat)" },
  { value: "expense-recovery-fee-floating", label: "Expense Recovery Fee (Floating)" },
  { value: "orr-levy", label: "ORR Levy" },
  { value: "buy-sell-fees", label: "Buy/Sell Fees" },
  { value: "other", label: "Other" },
];

function normalizeFeeLabel(value?: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function inferProductFeeTypeFromLabel(label?: string | null): ProductFeeType {
  const normalized = normalizeFeeLabel(label);
  if (!normalized) return "other";
  if (normalized.includes("buy") && normalized.includes("sell")) return "buy-sell-fees";
  if (normalized.includes("orr")) return "orr-levy";
  if (normalized.includes("expense recovery") && normalized.includes("flat")) return "expense-recovery-fee-flat";
  if (normalized.includes("expense recovery") && normalized.includes("floating")) return "expense-recovery-fee-floating";
  if (normalized.includes("admin") && normalized.includes("sliding")) return "sliding-admin-fee";
  if (normalized.includes("admin") && normalized.includes("flat")) return "admin-fee-flat";
  if (normalized.includes("admin") && normalized.includes("floating")) return "admin-fee-floating";
  if (normalized.includes("investment")) return "investment-fee";
  return "other";
}

export function getProductFeeTypeLabel(feeType?: ProductFeeType | string | null) {
  const match = PRODUCT_REX_FEE_TYPE_OPTIONS.find((option) => option.value === feeType);
  if (match) return match.label;
  if (feeType === "investment") return "Investment Fee";
  if (feeType === "admin") return "Admin Fee";
  if (feeType === "platform") return "Platform Fee";
  return "Other";
}

export function getProductFeeTypeSelectValue(fee: Pick<ProductFeeItemV1, "feeType" | "amount" | "percentage">): ProductFeeType {
  if (fee.feeType === "investment") return "investment-fee";
  if (fee.feeType === "admin") {
    return (fee.percentage ?? 0) === 0 && (fee.amount ?? 0) > 0 ? "admin-fee-flat" : "sliding-admin-fee";
  }
  if (fee.feeType === "platform") {
    return "expense-recovery-fee-floating";
  }
  return fee.feeType;
}
