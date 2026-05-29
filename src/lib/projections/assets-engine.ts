import type { ProjectionAsset, ProjectionAssumptions } from "./types";

export function isCashAssetType(type: ProjectionAsset["type"]) {
  return type === "cash" || type === "bank-account" || type === "offset-account" || type === "term-deposit";
}

export function isInvestmentAssetType(type: ProjectionAsset["type"]) {
  return (
    type === "investment" ||
    type === "investment-property" ||
    type === "australian-shares" ||
    type === "international-shares" ||
    type === "managed-fund" ||
    type === "etf"
  );
}

export function getAssetGrowthRate(asset: ProjectionAsset, assumptions: ProjectionAssumptions) {
  if (asset.growthRateKey === "cpi") {
    return assumptions.economic.cpiRate;
  }

  if (asset.growthRateKey === "cash") {
    return assumptions.investmentProfiles.profiles.Cash.totalReturn;
  }

  if (asset.growthRateKey in assumptions.investmentProfiles.profiles) {
    return assumptions.investmentProfiles.profiles[asset.growthRateKey]?.totalReturn ?? 0;
  }

  return 0;
}

export function projectAssetValue(asset: ProjectionAsset, previousValue: number, assumptions: ProjectionAssumptions) {
  return previousValue * (1 + getAssetGrowthRate(asset, assumptions));
}

export function sumAssessableAssets(input: {
  assets: ProjectionAsset[];
  assetValues: Record<string, number>;
  retirementAccountBalances: Record<string, number>;
  retirementAccountCentrelinkValues: Array<{
    accountId: string;
    centrelink: "financial-asset" | "exempt" | "unknown";
  }>;
}) {
  const assetAssessableTotal = input.assets.reduce((total, asset) => {
    if (asset.centrelink === "exempt") {
      return total;
    }

    return total + (input.assetValues[asset.assetId] ?? 0);
  }, 0);

  const retirementAssessableTotal = input.retirementAccountCentrelinkValues.reduce((total, account) => {
    if (account.centrelink === "exempt") {
      return total;
    }

    return total + (input.retirementAccountBalances[account.accountId] ?? 0);
  }, 0);

  return assetAssessableTotal + retirementAssessableTotal;
}

export function sumFinancialAssets(input: {
  assets: ProjectionAsset[];
  assetValues: Record<string, number>;
  retirementAccountBalances: Record<string, number>;
  retirementAccountCentrelinkValues: Array<{
    accountId: string;
    centrelink: "financial-asset" | "exempt" | "unknown";
  }>;
}) {
  const financialAssetTotal = input.assets.reduce((total, asset) => {
    if (asset.centrelink !== "financial-asset") {
      return total;
    }

    return total + (input.assetValues[asset.assetId] ?? 0);
  }, 0);

  const retirementFinancialTotal = input.retirementAccountCentrelinkValues.reduce((total, account) => {
    if (account.centrelink !== "financial-asset") {
      return total;
    }

    return total + (input.retirementAccountBalances[account.accountId] ?? 0);
  }, 0);

  return financialAssetTotal + retirementFinancialTotal;
}
