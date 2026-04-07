export type ApiResult<T> = {
  statusCode: number;
  status: boolean;
  data: T;
  message?: string | null;
  modelErrors?: { propertyName?: string | null; errorMessage?: string | null }[] | null;
};

export type LoginResponse = {
  jwtToken?: string | null;
  requiresTwoFactorAuthentication: boolean;
};

export type UserSummary = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  practice?: {
    id?: string | null;
    name?: string | null;
  } | null;
  licensee?: {
    id?: string | null;
    name?: string | null;
  } | null;
  userRole?: string | null;
  userStatus?: string | null;
  appAccess?: string | null;
  appAdmin?: string | null;
  entityId?: string | null;
};

export type ClientSummary = {
  id?: string | null;
  name?: string | null;
  clientAdviserName?: string | null;
  clientAdviserPracticeName?: string | null;
  clientAdviserLicenseeName?: string | null;
};

export type AdviserSummary = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  practiceName?: string | null;
  licenseeName?: string | null;
  licenseeId?: string | null;
};

export type PersonRecord = {
  id?: string | null;
  ic2AppId?: string | null;
  title?: string | null;
  name?: string | null;
  email?: string | null;
  dob?: string | null;
  gender?: string | null;
  status?: string | null;
  clientStatus?: string | null;
  clientCategory?: string | null;
  category?: string | null;
  maritalStatus?: string | null;
  residentStatus?: string | null;
  preferredPhone?: string | null;
  phone?: string | null;
  mobile?: string | null;
  mobilePhone?: string | null;
  street?: string | null;
  suburb?: string | null;
  state?: string | null;
  postCode?: string | null;
  postcode?: string | null;
  fdsAnnualAgreementRequired?: string | null;
  annualAgreementRequired?: string | null;
  fdsRequired?: string | null;
  agreementType?: string | null;
  nextAnniversaryDate?: string | null;
  annualAgreement?: {
    type?: string | null;
    agreementType?: string | null;
    nextDueDate?: string | null;
    nextAnniversaryDate?: string | null;
  } | null;
  address?: {
    street?: string | null;
    line1?: string | null;
    suburb?: string | null;
    city?: string | null;
    state?: string | null;
    region?: string | null;
    postCode?: string | null;
    postcode?: string | null;
    zipCode?: string | null;
  } | null;
  contact?: {
    preferredPhone?: string | null;
    phone?: string | null;
  } | null;
  nationalId?: {
    front?: string | null;
    back?: string | null;
  } | null;
  riskProfileResponse?: {
    agreeOutcome?: string | null;
    score?: string | null;
    resultDisplay?: string | null;
    resultGraph?: string | null;
  } | null;
};

export type ClientAdviserRecord = {
  id?: string | null;
  entity?: string | null;
  name?: string | null;
  email?: string | null;
};

export type ClientEntityRecord = {
  id?: string | null;
  entitiesId?: string | null;
  name?: string | null;
  type?: string | null;
  owner?: {
    id?: string | null;
    name?: string | null;
  } | null;
};

export type ClientDependantRecord = {
  id?: string | null;
  name?: string | null;
  birthday?: string | null;
  type?: string | null;
  owner?: {
    id?: string | null;
    name?: string | null;
  } | null;
};

export type ClientAssetRecord = {
  id?: string | null;
  type?: string | null;
  assetType?: string | null;
  currentValue?: string | null;
  cost?: string | null;
  coverRequired?: string | null;
  acquisitionDate?: string | null;
  joint?: boolean | null;
  ownerPercentage?: string | null;
  incomeAmount?: string | null;
  description?: string | null;
  owner?: {
    id?: string | null;
    name?: string | null;
  } | null;
  incomeFrequency?: {
    type?: string | null;
    value?: string | null;
  } | null;
};

export type ClientLiabilityRecord = {
  id?: string | null;
  loanType?: string | null;
  accountNumber?: string | null;
  bankName?: string | null;
  outstandingBalance?: string | null;
  interestRate?: string | null;
  repaymentAmount?: string | null;
  joint?: boolean | null;
  repaymentFrequency?: {
    type?: string | null;
    value?: string | null;
  } | null;
  owner?: {
    id?: string | null;
    name?: string | null;
  } | null;
  securityAssets?: {
    id?: string | null;
    type?: string | null;
    description?: string | null;
  } | null;
};

export type ClientIncomeRecord = {
  id?: string | null;
  type?: string | null;
  description?: string | null;
  joint?: boolean | null;
  amount?: string | null;
  taxType?: string | null;
  pension?: {
    id?: string | null;
    type?: string | null;
  } | null;
  owner?: {
    id?: string | null;
    name?: string | null;
  } | null;
  frequency?: {
    type?: string | null;
    value?: string | null;
  } | null;
};

export type ClientExpenseRecord = {
  id?: string | null;
  type?: string | null;
  description?: string | null;
  joint?: boolean | null;
  amount?: string | null;
  indexation?: string | null;
  liability?: {
    id?: string | null;
    type?: string | null;
  } | null;
  owner?: {
    id?: string | null;
    name?: string | null;
  } | null;
  frequency?: {
    type?: string | null;
    value?: string | null;
  } | null;
};

export type ClientSuperannuationRecord = {
  id?: string | null;
  joint?: boolean | null;
  type?: string | null;
  balance?: string | null;
  superFund?: string | null;
  accountNumber?: string | null;
  contributionAmount?: string | null;
  owner?: {
    id?: string | null;
    name?: string | null;
  } | null;
  frequency?: {
    type?: string | null;
    value?: string | null;
  } | null;
};

export type ClientPensionRecord = {
  id?: string | null;
  type?: string | null;
  balance?: string | null;
  superFund?: string | null;
  accountNumber?: string | null;
  annualReturn?: string | null;
  payment?: string | null;
  owner?: {
    id?: string | null;
    name?: string | null;
  } | null;
  frequency?: {
    type?: string | null;
    value?: string | null;
  } | null;
};

export type ClientInsuranceRecord = {
  id?: string | null;
  coverRequired?: string | null;
  sumInsured?: string | null;
  premiumAmount?: string | null;
  frequency?: {
    type?: string | null;
    value?: string | null;
  } | null;
  joint?: boolean | null;
  insurer?: string | null;
  status?: string | null;
  superFund?: {
    id?: string | null;
    type?: string | null;
  } | null;
  owner?: {
    id?: string | null;
    name?: string | null;
  } | null;
};

export type FileNoteRecord = {
  id?: string | null;
  clientId?: string | null;
  owner?: {
    id?: string | null;
    name?: string | null;
  } | null;
  joint?: boolean | null;
  licensee?: string | null;
  practice?: string | null;
  adviser?: {
    name?: string | null;
    email?: string | null;
  } | null;
  attachment?: {
    name?: string | null;
    url?: string | null;
  }[] | null;
  content?: string | null;
  serviceDate?: string | null;
  type?: string | null;
  subType?: string | null;
  subject?: string | null;
  creator?: {
    name?: string | null;
    email?: string | null;
  } | null;
  modifier?: {
    name?: string | null;
    email?: string | null;
  } | null;
  modifiedDate?: string | null;
  createdDate?: string | null;
};

export type ClientProfile = {
  id?: string | null;
  licensee?: string | null;
  practice?: string | null;
  modifiedDate?: string | null;
  createdDate?: string | null;
  client?: PersonRecord | null;
  partner?: PersonRecord | null;
  adviser?: ClientAdviserRecord | null;
  dependants?: ClientDependantRecord[] | null;
  entities?: ClientEntityRecord[] | null;
  assets?: ClientAssetRecord[] | null;
  liabilities?: ClientLiabilityRecord[] | null;
  income?: ClientIncomeRecord[] | null;
  expense?: ClientExpenseRecord[] | null;
  superannuation?: ClientSuperannuationRecord[] | null;
  pension?: ClientPensionRecord[] | null;
  insurance?: ClientInsuranceRecord[] | null;
};
