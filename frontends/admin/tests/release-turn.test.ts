import { describe, expect, it } from "vitest";
import { defaultPolicy, personTurn, type LabPerson } from "@/lib/release";

// What the dataset page offers the person looking at it: one action (sign or release) or nothing, with the reason.
const ana: LabPerson = { userId: "u-ana", name: "Example Ana", role: "admin" };
const ben: LabPerson = { userId: "u-ben", name: "Example Ben", role: "owner" };
const op: LabPerson = { userId: "u-op", name: "Example Operator", role: "operator" };
const people = [ana, ben, op];
const policy = { ...defaultPolicy, requiredSignatures: 2 };
const signed = (...who: LabPerson[]) => who.map(person => ({ userId: person.userId }));
const turn = (person: LabPerson | null, signatures = signed(), status: "built" | "released" | "superseded" | "withdrawn" = "built") =>
  personTurn({ status, policy, signatures, people, person });

describe("whose turn it is on a dataset version", () => {
  it("an eligible person who has not signed signs", () => {
    expect(turn(ana).action).toBe("sign");
    expect(turn(ben, signed(ana)).action).toBe("sign");
  });
  it("someone who already signed waits for a different signer", () => {
    expect(turn(ana, signed(ana))).toEqual({ action: "none", reason: "You already signed. Waiting for a second signer." });
    expect(personTurn({ status: "built", policy: { ...policy, requiredSignatures: 3 }, signatures: signed(ana), people, person: ana }))
      .toEqual({ action: "none", reason: "You already signed. Waiting for 2 more signers." });
  });
  it("once the policy count is met, an eligible person releases, whether or not they signed", () => {
    expect(turn(ben, signed(ana, ben)).action).toBe("release");
    expect(turn(ana, signed(ana, ben)).action).toBe("release");
  });
  it("a person outside the policy neither signs nor releases", () => {
    expect(turn(op)).toEqual({ action: "none", reason: "You are not an eligible signer under the current policy." });
    expect(turn(op, signed(ana, ben))).toEqual({ action: "none", reason: "Only an eligible signer may release." });
    expect(turn(null).action).toBe("none");
  });
  it("a signature by someone no longer eligible does not count towards release", () => {
    expect(turn(ben, signed(ana, { userId: "u-left" } as LabPerson)).action).toBe("sign");
  });
  it("a released, superseded or withdrawn version has nothing left to do", () => {
    expect(turn(ana, signed(ana, ben), "released")).toEqual({ action: "none", reason: "Released. Nothing left to sign; use Withdraw only if this version must be pulled." });
    expect(turn(ana, signed(ana, ben), "superseded")).toEqual({ action: "none", reason: "Superseded by a newer version. Nothing left to sign or release." });
    expect(turn(ana, signed(ana, ben), "withdrawn")).toEqual({ action: "none", reason: "Withdrawn. Nothing left to sign or release." });
  });
});
