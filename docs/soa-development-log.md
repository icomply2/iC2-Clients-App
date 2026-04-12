# SOA Development Log

## Strategy Knowledge Base

- Introduce a reusable strategy knowledge base for common advice patterns such as salary sacrifice, education funding, cash reserve, and debt reduction.
- Use this knowledge base to guide Finley toward more specific, calculation-aware, client-relevant strategy recommendations.
- Combine template rules with known client inputs so recommendations can state amounts, cadence, priorities, and review triggers when available.
- Where values are incomplete, Finley should mark them as estimated or pending confirmation rather than reverting to generic wording.

## Structured Strategy Inputs

- Extend `StrategicRecommendationV1` with optional structured planning inputs to support more specific drafting:
  - `targetAmount`
  - `monthlyContribution`
  - `annualContribution`
  - `contributionFrequency`
  - `targetDate`
  - `reviewFrequency`
  - `fundingSource`
  - `priorityRank`
  - `assumptionNote`
  - `amountConfidence`
- Use `amountConfidence` to distinguish between:
  - `exact`
  - `estimated`
  - `pending-confirmation`
- Populate these fields progressively as Finley gains better client data, calculations, and supporting integrations.

## Product Knowledge Base

- Introduce a reusable product recommendation knowledge base for common product scenarios such as retain, replace, rollover, obtain, and dispose.
- Use this knowledge base to guide Finley toward more specific product recommendation wording tied to implementation amounts, rollover amounts, funding cadence, and decision rationale.
- Combine product template rules with ProductRex data, current-vs-proposed comparisons, and known client objectives so recommendations can be more specific without exposing unnecessary complexity in the adviser UI.
- Where values are incomplete, Finley should mark them as estimated or pending confirmation rather than writing generic product recommendation language.

## Structured Product Inputs

- Extend `ProductRecommendationV1` with optional hidden planning inputs to support more specific drafting:
  - `targetAmount`
  - `transferAmount`
  - `monthlyFundingAmount`
  - `annualFundingAmount`
  - `implementationDate`
  - `reviewFrequency`
  - `fundingSource`
  - `priorityRank`
  - `assumptionNote`
  - `amountConfidence`
- Use these fields as internal guidance for Finley and future integrations, not as adviser-facing UI by default.
