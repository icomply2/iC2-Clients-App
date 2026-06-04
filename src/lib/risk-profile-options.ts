import type { ClientProfile, LicenseeDto } from "@/lib/api/types";

export type SelectOption = {
  label: string;
  value: string;
};

type CurrentUserLicenseeScope = {
  licensee?: {
    id?: string | null;
    name?: string | null;
  } | null;
} | null;

const DEFAULT_RISK_PROFILE_LABELS = ["Cash", "Defensive", "Moderate", "Balanced", "Growth", "High Growth"];

export const DEFAULT_RISK_PROFILE_OPTIONS: SelectOption[] = DEFAULT_RISK_PROFILE_LABELS.map((label) => ({
  label,
  value: label,
}));

export function isRiskProfileFieldKey(fieldKey: string) {
  return fieldKey === "riskProfile" || fieldKey === "clientRiskProfile" || fieldKey === "partnerRiskProfile";
}

export function withCurrentRiskProfileOption(options: SelectOption[], currentValue?: string | null) {
  const trimmed = currentValue?.trim();
  if (!trimmed) {
    return options;
  }

  if (options.some((option) => option.value.trim().toLowerCase() === trimmed.toLowerCase())) {
    return options;
  }

  return [...options, { label: trimmed, value: trimmed }];
}

export function resolveRiskProfileOptions(
  licensees: LicenseeDto[],
  profile: ClientProfile,
  currentUserScope?: CurrentUserLicenseeScope,
) {
  const targetLicenseeId = firstNonEmpty(profile.adviser?.licensee?.id, currentUserScope?.licensee?.id);
  const targetLicenseeName = firstNonEmpty(profile.adviser?.licensee?.name, profile.licensee, currentUserScope?.licensee?.name);

  const licensee =
    (targetLicenseeId
      ? licensees.find((item) => normalize(item.id) === normalize(targetLicenseeId))
      : null) ??
    (targetLicenseeName
      ? licensees.find((item) => normalize(item.name) === normalize(targetLicenseeName))
      : null);

  const options = Array.from(
    new Map(
      (licensee?.riskProfiles ?? [])
        .filter((item) => item?.isActive !== false)
        .sort((left, right) => {
          const leftOrder = typeof left.displayOrder === "number" ? left.displayOrder : Number.MAX_SAFE_INTEGER;
          const rightOrder = typeof right.displayOrder === "number" ? right.displayOrder : Number.MAX_SAFE_INTEGER;
          if (leftOrder !== rightOrder) return leftOrder - rightOrder;
          return left.riskProfileName.localeCompare(right.riskProfileName);
        })
        .map((item) => item.riskProfileName?.trim())
        .filter((label): label is string => Boolean(label))
        .map((label) => [normalize(label), { label, value: label }] as const),
    ).values(),
  );

  return options.length ? options : DEFAULT_RISK_PROFILE_OPTIONS;
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() ?? "";
}

function normalize(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}
