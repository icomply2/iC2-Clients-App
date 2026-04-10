export type ClientDetailChanges = {
  title?: string;
  name?: string;
  status?: string;
  clientCategory?: string;
  riskProfile?: string;
  gender?: string;
  maritalStatus?: string;
  residentStatus?: string;
  dateOfBirth?: string;
  healthStatus?: string;
  healthHistory?: string;
  smoker?: string;
  healthInsurance?: string;
  employment?: {
    id?: string;
    jobTitle?: string;
    status?: string;
    employer?: string;
    salary?: string;
    frequency?: string;
  }[];
  street?: string;
  suburb?: string;
  state?: string;
  postCode?: string;
  preferredPhone?: string;
  email?: string;
  adviceAgreementRequired?: string;
  agreementType?: string;
  nextAnniversaryDate?: string;
};

export type UpdateClientDetailsInput = {
  profileId: string;
  personId: string;
  changes: ClientDetailChanges;
  target?: "client" | "partner";
};
