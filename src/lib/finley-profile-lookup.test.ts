import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientProfile } from "./api/types";
import { answerClientProfileLookup, type ProfileLookupResult } from "./finley-profile-lookup";

function assertMatched(
  answer: ProfileLookupResult,
): asserts answer is Extract<ProfileLookupResult, { matched: true }> {
  if (!answer.matched) throw new Error("Expected lookup to match.");
}

const profile = {
  id: "profile-1",
  licensee: "iComply2",
  practice: "Example Practice",
  client: {
    id: "client-1",
    name: "Sophie Clarke",
    email: "sophie@example.com",
    dob: "1996-12-15",
    preferredPhone: "0412 345 678",
    maritalStatus: "Single",
    residentStatus: "Australian resident",
    address: {
      street: "1 King Street",
      suburb: "Sydney",
      state: "NSW",
      postCode: "2000",
    },
    riskProfileResponse: {
      resultDisplay: "Growth",
    },
  },
  partner: {
    id: "partner-1",
    name: "Alex Clarke",
    email: "alex@example.com",
    dob: "1994-02-03",
  },
  adviser: {
    name: "Example Adviser",
    email: "adviser@example.com",
  },
  assets: [
    {
      id: "asset-1",
      type: "Personal",
      assetType: "Cash",
      description: "Cash savings",
      currentValue: "68000",
      owner: { id: "client-1", name: "Sophie Clarke" },
    },
    {
      id: "asset-2",
      type: "Personal",
      assetType: "Vehicle",
      description: "Car",
      currentValue: "18000",
      owner: { id: "client-1", name: "Sophie Clarke" },
    },
  ],
  liabilities: [
    {
      id: "liability-1",
      loanType: "Home loan",
      bankName: "Example Bank",
      outstandingBalance: "350000",
      repaymentAmount: "2500",
    },
  ],
  income: [
    {
      id: "income-1",
      description: "Employment income",
      amount: "168000",
      frequency: { value: "Annually" },
      owner: { id: "client-1", name: "Sophie Clarke" },
    },
  ],
  expense: [
    {
      id: "expense-1",
      type: "Living expenses",
      description: "Rent and living expenses",
      amount: "74000",
      frequency: { value: "Annually" },
      owner: { id: "client-1", name: "Sophie Clarke" },
    },
  ],
  superannuation: [
    {
      id: "super-1",
      type: "Accumulation",
      superFund: "Example Super",
      balance: "125000",
    },
  ],
  pension: [
    {
      id: "pension-1",
      type: "Account based pension",
      superFund: "Retirement Fund",
      balance: "250000",
      payment: "12000",
    },
  ],
  insurance: [
    {
      id: "insurance-1",
      coverRequired: "Life",
      insurer: "Example Insurer",
      sumInsured: "500000",
      premiumAmount: "1200",
    },
  ],
  dependants: [
    {
      id: "dependant-1",
      name: "Jamie Clarke",
      type: "Child",
      birthday: "2018-05-01",
    },
  ],
  entities: [],
} satisfies ClientProfile;

describe("answerClientProfileLookup", () => {
  it("answers scalar client fields from the loaded profile", () => {
    const cases = [
      ["what is Sophie's date of birth", /15\/12\/1996/],
      ["what is Sophie's email", /sophie@example\.com/],
      ["what is Sophie's phone number", /0412 345 678/],
      ["what is Sophie's address", /1 King Street, Sydney, NSW 2000/],
      ["what is Sophie's risk profile", /Growth/],
    ] as const;

    for (const [message, expected] of cases) {
      const answer = answerClientProfileLookup({
        message,
        profile,
        resolvedClientName: "Sophie Clarke",
      });

      assertMatched(answer);
      assert.match(answer.assistantMessage, expected);
    }
  });

  it("targets partner details when the user asks for the partner", () => {
    const answer = answerClientProfileLookup({
      message: "what is the partner email",
      profile,
      resolvedClientName: "Sophie Clarke",
    });

    assertMatched(answer);
    assert.match(answer.assistantMessage, /alex@example\.com/);
  });

  it("returns display cards for collection lookups", () => {
    const cases = [
      ["show me Sophie's assets", "Sophie Clarke Assets", 2],
      ["show Sophie's liabilities", "Sophie Clarke Liabilities", 1],
      ["show Sophie's income", "Sophie Clarke Income", 2],
      ["show Sophie's expenses", "Sophie Clarke Expenses", 2],
      ["what insurance does Sophie have", "Sophie Clarke Insurance", 1],
      ["what super does Sophie have", "Sophie Clarke Superannuation", 1],
      ["show Sophie's pension", "Sophie Clarke Retirement Income", 1],
      ["show Sophie's dependants", "Sophie Clarke Dependants", 1],
    ] as const;

    for (const [message, title, rowCount] of cases) {
      const answer = answerClientProfileLookup({
        message,
        profile,
        resolvedClientName: "Sophie Clarke",
      });

      assertMatched(answer);
      assert.equal(answer.displayCard?.title, title);
      assert.equal(answer.displayCard?.rows.length, rowCount);
    }
  });

  it("answers adviser fields", () => {
    const answer = answerClientProfileLookup({
      message: "who is Sophie's adviser",
      profile,
      resolvedClientName: "Sophie Clarke",
    });

    assertMatched(answer);
    assert.match(answer.assistantMessage, /Example Adviser/);
  });

  it("reports missing values without guessing", () => {
    const answer = answerClientProfileLookup({
      message: "what is Sophie's gender",
      profile,
      resolvedClientName: "Sophie Clarke",
    });

    assertMatched(answer);
    assert.match(answer.assistantMessage, /couldn't find/i);
  });

  it("summarises the profile with collection counts", () => {
    const answer = answerClientProfileLookup({
      message: "summarise Sophie's profile",
      profile,
      resolvedClientName: "Sophie Clarke",
    });

    assertMatched(answer);
    assert.match(answer.assistantMessage, /2 assets/);
    assert.match(answer.assistantMessage, /1 insurance/);
  });

  it("does not expose internal identifiers", () => {
    const answer = answerClientProfileLookup({
      message: "what is the client id",
      profile,
      resolvedClientName: "Sophie Clarke",
    });

    assertMatched(answer);
    assert.match(answer.assistantMessage, /do not expose/i);
  });
});
