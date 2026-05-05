import type { ClientProfile, ClientSummary } from "./api/types";

export const mockClientSummaries: ClientSummary[] = [
  {
    id: "CLI-1001",
    name: "Michael Weightman & Kimberly Weightman",
    clientAdviserName: "Jonathan Mannion",
    clientAdviserPracticeName: "Sandringham Wealth",
    clientAdviserLicenseeName: "Insight Investment Partners",
  },
  {
    id: "CLI-1002",
    name: "Tim Madgwick & Anna Madgwick",
    clientAdviserName: "Jonathan Mannion",
    clientAdviserPracticeName: "Sandringham Wealth",
    clientAdviserLicenseeName: "Insight Investment Partners",
  },
  {
    id: "CLI-1003",
    name: "Michael Loizou & Jennifer Loizou",
    clientAdviserName: "Tony Joe Akkawi",
    clientAdviserPracticeName: "TJFST",
    clientAdviserLicenseeName: "Insight Investment Partners",
  },
  {
    id: "CLI-1004",
    name: "Adam Moore & Kate Moore",
    clientAdviserName: "Kerrod Holland",
    clientAdviserPracticeName: "Tenex Wealth",
    clientAdviserLicenseeName: "Insight Investment Partners",
  },
  {
    id: "CLI-1005",
    name: "Daniel Storey & Joanne Marie Ferguson",
    clientAdviserName: "Kerrod Holland",
    clientAdviserPracticeName: "Tenex Wealth",
    clientAdviserLicenseeName: "Insight Investment Partners",
  },
  {
    id: "CLI-1006",
    name: "Aaron Martin O'Driscoll & Brittany Jane Hunt",
    clientAdviserName: "Kerrod Holland",
    clientAdviserPracticeName: "Tenex Wealth",
    clientAdviserLicenseeName: "Insight Investment Partners",
  },
  {
    id: "CLI-1007",
    name: "Debra McQuinn & Peter Mcaulay",
    clientAdviserName: "Jonathan Mannion",
    clientAdviserPracticeName: "Sandringham Wealth",
    clientAdviserLicenseeName: "Insight Investment Partners",
  },
  {
    id: "CLI-1008",
    name: "Craig Christopher Hewat & Sally Lynette Hewat",
    clientAdviserName: "Kerrod Holland",
    clientAdviserPracticeName: "Tenex Wealth",
    clientAdviserLicenseeName: "Insight Investment Partners",
  },
  {
    id: "CLI-1009",
    name: "Simon Conley & Lori Conley",
    clientAdviserName: "Jonathan Mannion",
    clientAdviserPracticeName: "Sandringham Wealth",
    clientAdviserLicenseeName: "Insight Investment Partners",
  },
  {
    id: "CLI-1010",
    name: "David Windle & Danielle Windle",
    clientAdviserName: "Jonathan Mannion",
    clientAdviserPracticeName: "Sandringham Wealth",
    clientAdviserLicenseeName: "Insight Investment Partners",
  },
];

export const mockClientProfile: ClientProfile = {
  id: "profile-1001",
  licensee: "Insight Investment Partners",
  practice: "Sandringham Wealth",
  client: {
    id: "CLI-1001",
    title: "Mr.",
    name: "Michael Weightman",
    gender: "Male",
    dob: "1983-02-04",
    email: "mweightman@newcastlechambers.com.au",
    maritalStatus: "Married",
    residentStatus: "Australian resident",
    preferredPhone: "0412 345 678",
    street: "12 Newcastle Chambers Road",
    suburb: "Newcastle",
    state: "NSW",
    postCode: "2300",
    healthStatus: "Good",
    healthInsurance: "Yes",
    riskProfileResponse: {
      agreeOutcome: "Yes",
      score: "62",
      resultDisplay: "Balanced",
    },
    employment: [
      {
        id: "EMP-1001",
        jobTitle: "Senior Project Manager",
        status: "Employed full-time",
        employer: "Newcastle Chambers",
        salary: "150000",
        primaryEmployment: true,
        owner: {
          id: "CLI-1001",
          name: "Michael Weightman",
        },
        frequency: {
          type: "Annual",
        },
      },
    ],
  },
  partner: {
    id: "PAR-1001",
    title: "Mrs.",
    name: "Kimberly Weightman",
    gender: "Female",
    dob: "1982-06-04",
    email: "kweightman@example.com",
    maritalStatus: "Married",
    residentStatus: "Australian resident",
    preferredPhone: "0412 555 901",
    street: "12 Newcastle Chambers Road",
    suburb: "Newcastle",
    state: "NSW",
    postCode: "2300",
    healthStatus: "Good",
    healthInsurance: "Yes",
    riskProfileResponse: {
      agreeOutcome: "Yes",
      score: "58",
      resultDisplay: "Balanced",
    },
    employment: [
      {
        id: "EMP-1002",
        jobTitle: "Teacher",
        status: "Employed part-time",
        employer: "Newcastle Grammar",
        salary: "72000",
        primaryEmployment: true,
        owner: {
          id: "PAR-1001",
          name: "Kimberly Weightman",
        },
        frequency: {
          type: "Annual",
        },
      },
    ],
  },
  adviser: {
    id: "ADV-1001",
    name: "Jonathan Mannion",
    email: "jm@sandringhamwealth.com.au",
    entity: "Insight Investment Partners",
  },
  dependants: [
    {
      id: "DEP-1001",
      name: "Oliver Weightman",
      birthday: "2012-09-12",
      type: "Child",
      owner: {
        id: "CLI-1001",
        name: "Michael Weightman",
      },
    },
    {
      id: "DEP-1002",
      name: "Amelia Weightman",
      birthday: "2015-03-22",
      type: "Child",
      owner: {
        id: "PAR-1001",
        name: "Kimberly Weightman",
      },
    },
  ],
  income: [
    {
      id: "INC-1001",
      type: "Employment",
      description: "Michael salary",
      amount: "150000",
      owner: {
        id: "CLI-1001",
        name: "Michael Weightman",
      },
      frequency: {
        type: "Annual",
      },
    },
    {
      id: "INC-1002",
      type: "Employment",
      description: "Kimberly salary",
      amount: "72000",
      owner: {
        id: "PAR-1001",
        name: "Kimberly Weightman",
      },
      frequency: {
        type: "Annual",
      },
    },
  ],
  expense: [
    {
      id: "EXP-1001",
      type: "Living expenses",
      description: "Household living expenses",
      amount: "7800",
      joint: true,
      frequency: {
        type: "Monthly",
      },
    },
    {
      id: "EXP-1002",
      type: "Education",
      description: "School fees",
      amount: "18000",
      joint: true,
      frequency: {
        type: "Annual",
      },
    },
  ],
  assets: [
    {
      id: "AST-1001",
      type: "Property",
      assetType: "Principal residence",
      description: "Family home",
      currentValue: "1450000",
      joint: true,
    },
    {
      id: "AST-1002",
      type: "Cash",
      assetType: "Savings account",
      description: "Offset and savings",
      currentValue: "85000",
      joint: true,
    },
    {
      id: "AST-1003",
      type: "Investment",
      assetType: "Managed funds",
      description: "Joint investment portfolio",
      currentValue: "210000",
      joint: true,
    },
  ],
  liabilities: [
    {
      id: "LIA-1001",
      loanType: "Home loan",
      bankName: "Macquarie Bank",
      outstandingBalance: "620000",
      interestRate: "6.10",
      repaymentAmount: "4200",
      joint: true,
      repaymentFrequency: {
        type: "Monthly",
      },
    },
    {
      id: "LIA-1002",
      loanType: "Investment loan",
      bankName: "Commonwealth Bank",
      outstandingBalance: "180000",
      interestRate: "6.35",
      repaymentAmount: "1250",
      joint: true,
      repaymentFrequency: {
        type: "Monthly",
      },
    },
  ],
  superannuation: [
    {
      id: "SUP-1001",
      type: "Accumulation",
      superFund: "AustralianSuper",
      balance: "420000",
      contributionAmount: "1800",
      owner: {
        id: "CLI-1001",
        name: "Michael Weightman",
      },
      frequency: {
        type: "Monthly",
      },
    },
    {
      id: "SUP-1002",
      type: "Accumulation",
      superFund: "REST Super",
      balance: "285000",
      contributionAmount: "850",
      owner: {
        id: "PAR-1001",
        name: "Kimberly Weightman",
      },
      frequency: {
        type: "Monthly",
      },
    },
  ],
  pension: [
    {
      id: "PEN-1001",
      type: "Account-based pension",
      superFund: "Hub24 Pension",
      balance: "0",
      annualReturn: "0",
      payment: "0",
      owner: {
        id: "CLI-1001",
        name: "Michael Weightman",
      },
    },
  ],
  insurance: [
    {
      id: "INS-1001",
      insurer: "TAL",
      coverRequired: "Life",
      sumInsured: "1000000",
      premiumAmount: "145",
      owner: {
        id: "CLI-1001",
        name: "Michael Weightman",
      },
      frequency: {
        type: "Monthly",
      },
    },
    {
      id: "INS-1002",
      insurer: "AIA",
      coverRequired: "Income Protection",
      sumInsured: "9000",
      premiumAmount: "122",
      owner: {
        id: "PAR-1001",
        name: "Kimberly Weightman",
      },
      frequency: {
        type: "Monthly",
      },
    },
  ],
};

export function getMockClientProfile(clientId: string) {
  const summary = mockClientSummaries.find((client) => client.id === clientId);

  if (!summary || clientId === mockClientProfile.client?.id) {
    return mockClientProfile;
  }

  const [clientName, partnerName] = (summary.name ?? "Client").split(/\s*&\s*/);

  return {
    ...mockClientProfile,
    id: `profile-${clientId.toLowerCase()}`,
    client: {
      ...mockClientProfile.client,
      id: clientId,
      name: clientName || summary.name || "Client",
      email: null,
    },
    partner: partnerName
      ? {
          ...mockClientProfile.partner,
          id: `${clientId}-partner`,
          name: partnerName,
          email: null,
        }
      : null,
    adviser: {
      ...mockClientProfile.adviser,
      name: summary.clientAdviserName ?? mockClientProfile.adviser?.name ?? null,
      entity: summary.clientAdviserLicenseeName ?? mockClientProfile.adviser?.entity ?? null,
    },
    practice: summary.clientAdviserPracticeName ?? mockClientProfile.practice,
    licensee: summary.clientAdviserLicenseeName ?? mockClientProfile.licensee,
  } satisfies ClientProfile;
}
