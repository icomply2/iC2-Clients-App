import { currentProjectionAssumptions } from "../src/lib/projections/assumptions";
import { runProjection } from "../src/lib/projections/engine";
import { margaretCurrentScenario } from "../src/lib/projections/fixtures/margaret-current";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const result = runProjection(margaretCurrentScenario, currentProjectionAssumptions);
const firstYear = result.years[0];
const finalYear = result.years[result.years.length - 1];

assert(result.years.length > 10, "Projection should run through life expectancy.");
assert(Boolean(finalYear), "Projection should have a final year.");
assert(firstYear.agePension.annualPayment >= 0, "Age Pension must not be negative.");
assert(firstYear.agePension.assessableAssets > 0, "Age Pension should calculate assessable assets.");
assert(firstYear.tax.taxableIncome >= firstYear.tax.taxableBankInterest, "Taxable income should include taxable bank interest.");
assert(firstYear.tax.taxPayable >= 0, "Tax payable must not be negative.");
assert(firstYear.cashReserve >= 0, "Cash reserve must not be negative.");
assert(firstYear.totalAssets >= firstYear.cashReserve, "Total assets should include cash reserve.");
assert(finalYear?.netWorth !== undefined && finalYear.netWorth > 0, "Final net worth should remain calculable.");

console.log(
  JSON.stringify(
    {
      years: result.years.length,
      firstYearAgePension: Math.round(firstYear.agePension.annualPayment),
      firstYearTaxPayable: Math.round(firstYear.tax.taxPayable),
      finalYear: finalYear?.year,
      finalCashReserve: Math.round(finalYear?.cashReserve ?? 0),
    },
    null,
    2,
  ),
);
