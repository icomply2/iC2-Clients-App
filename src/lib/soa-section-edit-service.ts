export type SoaSectionEditRequest = {
  sectionId: string;
  clientName?: string | null;
  adviserInstruction: string;
  sectionState: unknown;
  recentMessages?: Array<{
    role?: "assistant" | "user";
    content?: string;
  }> | null;
};

export type SoaSectionEditResponse = {
  sectionId: string;
  summary: string;
  source: "llm" | "fallback";
  model: string | null;
  warning?: string | null;
  scope?: {
    included: string[];
    exclusions: string[];
  } | null;
  objectives?: Array<{
    text: string;
    priority: "high" | "medium" | "low" | "unknown" | null;
  }> | null;
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() ?? "";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_SECTION_EDIT_MODEL = process.env.OPENAI_SECTION_EDIT_MODEL?.trim() || process.env.OPENAI_SOA_INTAKE_MODEL?.trim() || "gpt-5.2";

const sectionEditJsonSchema = {
  name: "soa_section_edit",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      sectionId: { type: "string" },
      summary: { type: "string" },
      scope: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: {
              included: { type: "array", items: { type: "string" } },
              exclusions: { type: "array", items: { type: "string" } },
            },
            required: ["included", "exclusions"],
          },
          { type: "null" },
        ],
      },
      objectives: {
        anyOf: [
          {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                text: { type: "string" },
                priority: {
                  anyOf: [
                    { type: "string", enum: ["high", "medium", "low", "unknown"] },
                    { type: "null" },
                  ],
                },
              },
              required: ["text", "priority"],
            },
          },
          { type: "null" },
        ],
      },
    },
    required: ["sectionId", "summary", "scope", "objectives"],
  },
} as const;

function isAzureOpenAiBaseUrl(baseUrl: string) {
  return /(?:\.openai\.azure\.com|\.services\.ai\.azure\.com)/i.test(baseUrl);
}

function getMissingConfigurationWarning() {
  const missingKeys: string[] = [];

  if (!OPENAI_API_KEY) {
    missingKeys.push("OPENAI_API_KEY");
  }

  if (!OPENAI_BASE_URL) {
    missingKeys.push("OPENAI_BASE_URL");
  }

  if (!OPENAI_SECTION_EDIT_MODEL) {
    missingKeys.push("OPENAI_SECTION_EDIT_MODEL");
  }

  return missingKeys.length
    ? `Finley section editing is not configured yet. Add ${missingKeys.join(", ")} to your local server environment to enable schema-aware card edits.`
    : null;
}

function parseJsonObject(text: string) {
  return JSON.parse(text) as unknown;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizePriority(value: unknown): "high" | "medium" | "low" | "unknown" | null {
  return value === "high" || value === "medium" || value === "low" || value === "unknown" ? value : null;
}

function normalizeObjectives(value: unknown) {
  if (!Array.isArray(value)) return null;

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return {
          text: entry.trim(),
          priority: "unknown" as const,
        };
      }

      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const text = typeof record.text === "string" ? record.text.trim() : "";

      if (!text) {
        return null;
      }

      return {
        text,
        priority: normalizePriority(record.priority) ?? "unknown",
      };
    })
    .filter((entry): entry is { text: string; priority: "high" | "medium" | "low" | "unknown" } => Boolean(entry));
}

function normalizeSectionEdit(
  value: unknown,
  sectionId: string,
): Pick<SoaSectionEditResponse, "sectionId" | "summary" | "scope" | "objectives"> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const responseSectionId = typeof record.sectionId === "string" && record.sectionId.trim() ? record.sectionId.trim() : sectionId;
  const summary = typeof record.summary === "string" && record.summary.trim() ? record.summary.trim() : "Updated section.";
  const scope =
    record.scope && typeof record.scope === "object"
      ? {
          included: normalizeStringArray((record.scope as Record<string, unknown>).included),
          exclusions: normalizeStringArray((record.scope as Record<string, unknown>).exclusions),
        }
      : null;
  const objectives = normalizeObjectives(record.objectives);

  return {
    sectionId: responseSectionId,
    summary,
    scope,
    objectives,
  };
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function appendUniqueValues(current: string[], next: string[]) {
  const seen = new Set(current.map(normalizeText));
  const merged = [...current];

  next.forEach((item) => {
    const normalized = normalizeText(item);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    merged.push(item);
  });

  return merged;
}

function hasRemovalIntent(text: string) {
  return /\b(remove|delete|drop|omit|take out)\b/i.test(text);
}

function hasReplacementIntent(text: string) {
  return /\b(replace|rewrite|change|update|edit|amend)\b/i.test(text);
}

function extractFallbackLines(instruction: string) {
  return instruction
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
}

function fallbackScopeEdit(request: SoaSectionEditRequest, warning?: string | null): SoaSectionEditResponse {
  const record = request.sectionState && typeof request.sectionState === "object" ? (request.sectionState as Record<string, unknown>) : {};
  const included = normalizeStringArray(record.included);
  const exclusions = normalizeStringArray(record.exclusions);
  const instruction = request.adviserInstruction.trim();
  const isExclusionInstruction = /\b(limitations?|exclusions?|exclude|excluded|outside scope|out of scope|not in scope|not requested)\b/i.test(instruction);
  const normalizedInstruction = normalizeText(instruction);
  const cleanedIncluded = included.filter((item) => !normalizedInstruction.includes(normalizeText(item)) && !normalizeText(item).includes("edit the limitation"));

  if (!isExclusionInstruction) {
    return {
      sectionId: request.sectionId,
      summary: "Updated agreed scope.",
      source: "fallback",
      model: null,
      warning,
      scope: {
        included: appendUniqueValues(cleanedIncluded, [instruction]),
        exclusions,
      },
      objectives: null,
    };
  }

  const subjectMatch =
    instruction.match(/\b(?:limitations?|exclusions?)\s+(?:for|around|regarding|on)\s+(.+?)\s+(?:as|because|since|due to)\b/i) ??
    instruction.match(/\b(?:edit|update|change|replace)\s+(.+?)\s+(?:as|because|since|due to)\b/i);
  const subject = subjectMatch?.[1]?.replace(/\b(?:limitations?|exclusions?)\b/gi, "").replace(/\b(?:for|around|regarding|on)\b/gi, "").trim();
  const reasonMatch = instruction.match(/\b(as|because|since|due to)\s+(.+)$/i);
  const reason = reasonMatch?.[2]?.trim();
  const replacement = subject && reason ? `${subject.charAt(0).toUpperCase()}${subject.slice(1)} ${reason}` : instruction;
  const normalizedSubject = subject ? normalizeText(subject) : "";
  let replaced = false;
  const nextExclusions = exclusions.map((item) => {
    if (!normalizedSubject || !normalizeText(item).includes(normalizedSubject)) {
      return item;
    }

    replaced = true;
    return replacement;
  });

  return {
    sectionId: request.sectionId,
    summary: "Updated limitations and exclusions.",
    source: "fallback",
    model: null,
    warning,
    scope: {
      included: cleanedIncluded,
      exclusions: replaced ? nextExclusions : appendUniqueValues(nextExclusions, [replacement]),
    },
    objectives: null,
  };
}

function fallbackObjectivesEdit(request: SoaSectionEditRequest, warning?: string | null): SoaSectionEditResponse {
  const record = request.sectionState && typeof request.sectionState === "object" ? (request.sectionState as Record<string, unknown>) : {};
  const currentObjectives = normalizeObjectives(record.objectives) ?? [];
  const instruction = request.adviserInstruction.trim();
  const lines = extractFallbackLines(instruction);
  const instructionLines = lines.length ? lines : [instruction].filter(Boolean);

  if (hasRemovalIntent(instruction)) {
    const nextObjectives = currentObjectives.filter(
      (objective) =>
        !instructionLines.some((line) => normalizeText(objective.text).includes(normalizeText(line)) || normalizeText(line).includes(normalizeText(objective.text))),
    );

    return {
      sectionId: request.sectionId,
      summary: "Removed matching objectives.",
      source: "fallback",
      model: null,
      warning,
      scope: null,
      objectives: nextObjectives,
    };
  }

  if (hasReplacementIntent(instruction) && currentObjectives.length) {
    const [firstLine, ...remainingLines] = instructionLines;
    const nextObjectives = [
      {
        text: firstLine,
        priority: currentObjectives[0]?.priority ?? "unknown",
      },
      ...currentObjectives.slice(1),
      ...remainingLines.map((line) => ({
        text: line,
        priority: "unknown" as const,
      })),
    ];

    return {
      sectionId: request.sectionId,
      summary: "Updated objectives.",
      source: "fallback",
      model: null,
      warning,
      scope: null,
      objectives: nextObjectives,
    };
  }

  const currentObjectiveText = currentObjectives.map((objective) => objective.text);
  const nextObjectiveText = appendUniqueValues(currentObjectiveText, instructionLines);

  return {
    sectionId: request.sectionId,
    summary: "Updated objectives.",
    source: "fallback",
    model: null,
    warning,
    scope: null,
    objectives: nextObjectiveText.map((text) => ({
      text,
      priority: currentObjectives.find((objective) => normalizeText(objective.text) === normalizeText(text))?.priority ?? "unknown",
    })),
  };
}

async function requestOpenAiSectionEdit(request: SoaSectionEditRequest) {
  const isAzure = isAzureOpenAiBaseUrl(OPENAI_BASE_URL);
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(isAzure ? { "api-key": OPENAI_API_KEY } : { authorization: `Bearer ${OPENAI_API_KEY}` }),
    },
    body: JSON.stringify({
      model: OPENAI_SECTION_EDIT_MODEL,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: [
            "You are Finley, a schema-aware SOA drafting assistant for Australian financial advisers.",
            "You receive the current card schema and an adviser instruction.",
            "Return only JSON that matches the schema.",
            "Reason over the current field values and the instruction before editing.",
            "Do not copy meta-instructions like 'edit', 'update', or 'change' into document wording.",
            "Preserve field values that the adviser did not ask to change.",
            "If the adviser asks to update, edit, change, or replace wording, find the most semantically relevant existing item and rewrite it instead of appending a duplicate.",
            "If text has previously been accidentally added to the wrong field, move or remove it when the latest instruction makes the intended field clear.",
            "For scope-of-advice: included is Agreed Scope, exclusions is Limitations / Exclusions.",
            "For scope-of-advice, use concise professional wording suitable for an SOA workflow card.",
            "For objectives: return the complete updated objectives array. Preserve unchanged objectives and priorities.",
            "For objectives, rewrite the semantically matching objective when the adviser asks to edit, update, change, or refine it.",
            "For objectives, add a new objective only when the adviser asks to add or include one, and remove objectives only when asked to remove, delete, or omit them.",
            "For objectives, use client-focused financial planning wording and never copy the adviser's instruction text into the objective unless it is itself suitable objective wording.",
            "For sections that are not being edited, return null for their schema fields.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Edit an SOA workflow card.",
            sectionId: request.sectionId,
            clientName: request.clientName ?? null,
            currentSectionState: request.sectionState,
            latestAdviserInstruction: request.adviserInstruction,
            recentMessages: request.recentMessages ?? [],
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: sectionEditJsonSchema,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI section edit request failed with status ${response.status}.`);
  }

  const body = (await response.json().catch(() => null)) as
    | {
        choices?: Array<{
          message?: {
            content?: string | null;
          } | null;
        }>;
      }
    | null;
  const content = body?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI section edit response did not include message content.");
  }

  return normalizeSectionEdit(parseJsonObject(content), request.sectionId);
}

export async function editSoaSection(request: SoaSectionEditRequest): Promise<SoaSectionEditResponse> {
  if (request.sectionId !== "scope-of-advice" && request.sectionId !== "objectives") {
    return {
      sectionId: request.sectionId,
      summary: "Finley can edit Scope of Advice and Objectives with the schema-aware editor. This section is not wired into the schema editor yet.",
      source: "fallback",
      model: null,
      warning: null,
      scope: null,
      objectives: null,
    };
  }

  const fallbackEdit = request.sectionId === "objectives" ? fallbackObjectivesEdit : fallbackScopeEdit;
  const missingConfigurationWarning = getMissingConfigurationWarning();
  if (missingConfigurationWarning) {
    return fallbackEdit(request, missingConfigurationWarning);
  }

  try {
    const edit = await requestOpenAiSectionEdit(request);
    if (!edit) {
      return fallbackEdit(request, "Finley could not parse the section edit response, so it used the local fallback editor.");
    }

    if (request.sectionId === "scope-of-advice" && !edit?.scope) {
      return fallbackScopeEdit(request, "Finley could not parse the section edit response, so it used the local fallback editor.");
    }

    if (request.sectionId === "objectives" && !edit?.objectives) {
      return fallbackObjectivesEdit(request, "Finley could not parse the section edit response, so it used the local fallback editor.");
    }

    return {
      sectionId: edit.sectionId,
      summary: edit.summary,
      scope: edit.scope,
      objectives: edit.objectives,
      source: "llm",
      model: OPENAI_SECTION_EDIT_MODEL,
      warning: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return fallbackEdit(request, `Finley could not reach the schema-aware section editor (${message}), so it used the local fallback editor.`);
  }
}
