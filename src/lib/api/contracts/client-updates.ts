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
