export function isTruthyAccessValue(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === "true" ||
      normalized === "yes" ||
      normalized === "y" ||
      normalized === "1" ||
      normalized === "app admin" ||
      normalized === "ic2 app admin"
    );
  }

  return false;
}

export function isAppAdminValue(value: unknown) {
  return isTruthyAccessValue(value);
}
