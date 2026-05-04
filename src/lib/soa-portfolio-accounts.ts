import type {
  AdviceCaseV1,
  PortfolioAccountV1,
  PortfolioAllocationRowV1,
  PortfolioHoldingV1,
} from "@/lib/soa-types";

export type PortfolioAccountView = {
  accountId: string;
  label: string;
  ownerPersonIds: string[];
  accountType?: PortfolioAccountV1["accountType"];
  accountNumber?: string | null;
  currentProductName?: string | null;
  recommendedProductName?: string | null;
  sourceFileName?: string | null;
  productRexReportId?: string | null;
  linkedReplacementRecommendationIds: string[];
  holdings: PortfolioHoldingV1[];
  allocationComparison: PortfolioAllocationRowV1[];
};

function clean(value?: string | null) {
  return value?.trim() || "";
}

function getFallbackAccountLabel(adviceCase: AdviceCaseV1) {
  const report = adviceCase.productRexReports?.[0] ?? null;
  return clean(report?.recommendedPlatform) || clean(report?.currentPlatform) || "Recommended Portfolio";
}

function getAccountLabel(account: PortfolioAccountV1, adviceCase: AdviceCaseV1) {
  return (
    clean(account.entityName) ||
    clean(account.accountName) ||
    clean(account.recommendedProductName) ||
    clean(account.currentProductName) ||
    getFallbackAccountLabel(adviceCase)
  );
}

export function getPortfolioAccountViews(adviceCase: AdviceCaseV1): PortfolioAccountView[] {
  const portfolio = adviceCase.recommendations.portfolio;

  if (!portfolio) {
    return [];
  }

  const explicitAccounts = portfolio.accounts?.filter(Boolean) ?? [];
  if (explicitAccounts.length) {
    return explicitAccounts.map((account) => ({
      accountId: account.accountId,
      label: getAccountLabel(account, adviceCase),
      ownerPersonIds: account.ownerPersonIds ?? [],
      accountType: account.accountType ?? null,
      accountNumber: account.accountNumber ?? null,
      currentProductName: account.currentProductName ?? null,
      recommendedProductName: account.recommendedProductName ?? null,
      sourceFileName: account.sourceFileName ?? portfolio.sourceFileName ?? null,
      productRexReportId: account.productRexReportId ?? null,
      linkedReplacementRecommendationIds: account.linkedReplacementRecommendationIds ?? [],
      holdings: account.holdings ?? [],
      allocationComparison: account.allocationComparison ?? [],
    }));
  }

  const holdings = portfolio.holdings ?? [];
  const allocationComparison = portfolio.allocationComparison ?? [];

  if (!holdings.length && !allocationComparison.length) {
    return [];
  }

  return [
    {
      accountId: "legacy-portfolio",
      label: getFallbackAccountLabel(adviceCase),
      ownerPersonIds: [],
      accountType: null,
      accountNumber: null,
      currentProductName: adviceCase.productRexReports?.[0]?.currentPlatform ?? null,
      recommendedProductName: adviceCase.productRexReports?.[0]?.recommendedPlatform ?? null,
      sourceFileName: portfolio.sourceFileName ?? adviceCase.productRexReports?.[0]?.sourceFileName ?? null,
      productRexReportId: adviceCase.productRexReports?.[0]?.reportId ?? null,
      linkedReplacementRecommendationIds: adviceCase.recommendations.replacement.map(
        (recommendation) => recommendation.recommendationId,
      ),
      holdings,
      allocationComparison,
    },
  ];
}

export function getPrimaryAllocationRows(adviceCase: AdviceCaseV1) {
  const portfolio = adviceCase.recommendations.portfolio;
  const accountWithAllocation = getPortfolioAccountViews(adviceCase).find(
    (account) => account.allocationComparison.length,
  );

  return accountWithAllocation?.allocationComparison ?? portfolio?.allocationComparison ?? [];
}
