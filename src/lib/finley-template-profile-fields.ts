import type { ClientProfile, PersonRecord } from "@/lib/api/types";

function text(value?: string | null) {
  return value?.trim() ?? "";
}

function firstTextValue(...values: Array<string | null | undefined>) {
  return values.map(text).find(Boolean) ?? "";
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] ?? value;
}

function dateText(value?: string | null) {
  const trimmed = text(value);

  if (!trimmed) return "";

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime()) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) {
    return trimmed;
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function personAddressParts(person?: PersonRecord | null) {
  const street = firstTextValue(person?.address?.street, person?.address?.line1, person?.street, person?.addressStreet);
  const suburb = firstTextValue(person?.address?.suburb, person?.address?.city, person?.suburb, person?.addressSuburb);
  const state = firstTextValue(person?.address?.state, person?.address?.region, person?.state, person?.addressState);
  const postcode = firstTextValue(
    person?.address?.postCode,
    person?.address?.postcode,
    person?.address?.zipCode,
    person?.postCode,
    person?.postcode,
    person?.addressPostCode,
  );
  const locality = [suburb, state, postcode].filter(Boolean).join(" ");

  return { street, suburb, state, postcode, locality };
}

function personScalarFields(prefix: "client" | "partner", person?: PersonRecord | null) {
  const address = personAddressParts(person);
  const name = text(person?.name);

  return {
    [`${prefix}.title`]: text(person?.title),
    [`${prefix}.name`]: name,
    [`${prefix}.fullName`]: name,
    [`${prefix}.firstName`]: firstName(name),
    [`${prefix}.dateOfBirth`]: dateText(person?.dob),
    [`${prefix}.email`]: text(person?.email),
    [`${prefix}.phone`]: firstTextValue(person?.preferredPhone, person?.phone, person?.contact?.preferredPhone, person?.contact?.phone),
    [`${prefix}.mobile`]: firstTextValue(person?.mobile, person?.mobilePhone),
    [`${prefix}.gender`]: text(person?.gender),
    [`${prefix}.status`]: firstTextValue(person?.status, person?.clientStatus, person?.accountStatus),
    [`${prefix}.category`]: firstTextValue(person?.clientCategory, person?.category),
    [`${prefix}.maritalStatus`]: text(person?.maritalStatus),
    [`${prefix}.residencyStatus`]: text(person?.residentStatus),
    [`${prefix}.nationality`]: text(person?.nationality),
    [`${prefix}.riskProfile`]: text(person?.riskProfileResponse?.resultDisplay),
    [`${prefix}.healthStatus`]: firstTextValue(person?.healthStatus, person?.health_status),
    [`${prefix}.healthHistory`]: firstTextValue(person?.healthHistory, person?.health_history),
    [`${prefix}.smoker`]: text(person?.smoker),
    [`${prefix}.healthInsurance`]: firstTextValue(person?.healthInsurance, person?.health_insurance),
    [`${prefix}.street`]: address.street,
    [`${prefix}.suburb`]: address.suburb,
    [`${prefix}.state`]: address.state,
    [`${prefix}.postcode`]: address.postcode,
    [`${prefix}.addressLine1`]: address.street,
    [`${prefix}.addressLocality`]: address.locality,
    [`${prefix}.agreementRequired`]: firstTextValue(
      person?.fdsAnnualAgreementRequired,
      person?.annualAgreementRequired,
      person?.fdsRequired,
    ),
    [`${prefix}.agreementType`]: firstTextValue(
      person?.agreementType,
      person?.annualAgreementStatus,
      person?.annualAgreement?.agreementType,
      person?.annualAgreement?.type,
    ),
    [`${prefix}.nextAnniversaryDate`]: dateText(firstTextValue(person?.nextAnniversaryDate, person?.annualAgreement?.nextAnniversaryDate, person?.annualAgreement?.nextDueDate)),
  };
}

export function buildProfileScalarTemplateFields(profile: ClientProfile) {
  return {
    ...personScalarFields("client", profile.client),
    ...personScalarFields("partner", profile.partner),
    "adviser.email": text(profile.adviser?.email),
    "adviser.phone": firstTextValue(profile.adviser?.phoneNumber, profile.adviser?.officeNumber),
    "adviser.officeNumber": text(profile.adviser?.officeNumber),
    "adviser.abn": text(profile.adviser?.abn),
    "adviser.acn": text(profile.adviser?.acn),
    "adviser.asicNumber": text(profile.adviser?.asicNumber),
    "adviser.businessName": text(profile.adviser?.businessName),
    "licensee.name": firstTextValue(profile.adviser?.licensee?.name, profile.licensee),
    "practice.name": firstTextValue(profile.adviser?.practice?.name, profile.practice),
    "practice.licenseeName": firstTextValue(profile.adviser?.licensee?.name, profile.licensee),
  };
}
