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
  },
  partner: {
    id: "PAR-1001",
    title: "Mrs.",
    name: "Kimberly Weightman",
    gender: "Female",
    dob: "1982-06-04",
    email: "",
  },
  adviser: {
    id: "ADV-1001",
    name: "Jonathan Mannion",
    email: "jm@sandringhamwealth.com.au",
    entity: "Insight Investment Partners",
  },
};
