import type { ClientDetailChanges, UpdateClientDetailsInput } from "@/lib/api/contracts/client-updates";
import { updatePersonDetails } from "@/lib/api/adapters/client-updates";

type RequestContext = {
  origin?: string | null;
  cookieHeader?: string | null;
};

export function buildClientPatchPayload(changes: ClientDetailChanges) {
  const payload: Record<string, unknown> = { ...changes };

  if (typeof changes.dateOfBirth === "string" && changes.dateOfBirth.trim()) {
    payload.dob = changes.dateOfBirth;
  }

  if (typeof changes.preferredPhone === "string" && changes.preferredPhone.trim()) {
    payload.phone = changes.preferredPhone;
    payload.mobile = changes.preferredPhone;
    payload.mobilePhone = changes.preferredPhone;
    payload.contact = {
      preferredPhone: changes.preferredPhone,
      phone: changes.preferredPhone,
    };
  }

  if (
    typeof changes.street === "string" ||
    typeof changes.suburb === "string" ||
    typeof changes.state === "string" ||
    typeof changes.postCode === "string"
  ) {
    payload.address = [
      typeof changes.street === "string" ? changes.street.trim() : "",
      typeof changes.suburb === "string" ? changes.suburb.trim() : "",
      [
        typeof changes.state === "string" ? changes.state.trim() : "",
        typeof changes.postCode === "string" ? changes.postCode.trim() : "",
      ]
        .filter(Boolean)
        .join(" "),
    ]
      .filter(Boolean)
      .join(", ");
  }

  if (typeof changes.riskProfile === "string" && changes.riskProfile.trim()) {
    payload.riskProfileResponse = {
      resultDisplay: changes.riskProfile,
    };
  }

  if (typeof changes.adviceAgreementRequired === "string" || typeof changes.agreementType === "string" || typeof changes.nextAnniversaryDate === "string") {
    payload.annualAgreement = {
      ...(typeof changes.agreementType === "string" && changes.agreementType.trim()
        ? { type: changes.agreementType, agreementType: changes.agreementType }
        : {}),
      ...(typeof changes.nextAnniversaryDate === "string" && changes.nextAnniversaryDate.trim()
        ? { nextDueDate: changes.nextAnniversaryDate, nextAnniversaryDate: changes.nextAnniversaryDate }
        : {}),
    };
  }

  return {
    requestBody: payload,
  };
}

export async function updateClientDetails(input: UpdateClientDetailsInput, context?: RequestContext) {
  return updatePersonDetails({ ...input, target: "client" }, buildClientPatchPayload(input.changes), context);
}

export async function updatePartnerDetails(input: UpdateClientDetailsInput, context?: RequestContext) {
  return updatePersonDetails({ ...input, target: "partner" }, buildClientPatchPayload(input.changes), context);
}
