function getClientFirstName(clientName?: string | null) {
  const cleaned = clientName?.trim();
  if (!cleaned || cleaned.includes("&")) {
    return null;
  }

  return cleaned.split(/\s+/)[0] || null;
}

function stripDuplicateClientGreeting(text: string, firstName: string) {
  return text.replace(new RegExp(`^${firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*,\\s*`, "i"), "");
}

export function sanitizeClientFacingResearchLanguage(text: string) {
  return text
    .replace(/\baccording to\s+(?:the\s+)?ProductRex(?:\s+report)?\b/gi, "based on our product research")
    .replace(/\b(?:the\s+)?ProductRex\s+report\s+(shows|indicates|identifies|confirms|compares|notes|states)\b/gi, "our product research $1")
    .replace(/\bProductRex\s+(shows|indicates|identifies|confirms|compares|notes|states)\b/gi, "our product research $1")
    .replace(/\bProductRex\s+report\b/gi, "product research")
    .replace(/\bProductRex\s+platform\s+option\b/gi, "platform option")
    .replace(/\bProductRex\b/g, "product research")
    .replace(/\bproduct research product research\b/gi, "product research")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRecommendationLanguage(text: string, clientName?: string | null) {
  const trimmed = sanitizeClientFacingResearchLanguage(text).trim();
  if (!trimmed) return trimmed;

  let next = trimmed
    .replace(/\b[Yy]ou should not\b/g, "we recommend you do not")
    .replace(/\b[Yy]ou should\b/g, "we recommend you")
    .replace(/\b[Yy]ou need to\b/g, "we recommend you")
    .replace(/\b[Yy]ou must\b/g, "we recommend you")
    .replace(/\b[Ii]t is recommended that you\b/g, "we recommend you");

  next = next.replace(/^we recommend\b/, "We recommend");

  const firstName = getClientFirstName(clientName);
  if (firstName && /^We recommend\b/.test(next)) {
    const addressedRecommendation = stripDuplicateClientGreeting(next, firstName).replace(/^We recommend\b/, "we recommend");
    next = `${firstName}, ${addressedRecommendation}`;
  }

  return next;
}
