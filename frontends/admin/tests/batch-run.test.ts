import { expect, test } from "vitest";
import { BATCH_NAME, batchFileNames, batchSteps } from "@/lib/batch-run";

test("the batch page offers export only for a planned batch and acquisition only after export", () => {
  expect(batchSteps("planned")).toMatchObject({ canExport: true, canAcquire: false });
  expect(batchSteps("sequence_exported")).toMatchObject({ canExport: false, canAcquire: true });
  for (const status of ["acquired", "processed", "qc_checked"] as const) expect(batchSteps(status)).toMatchObject({ canExport: false, canAcquire: false });
  expect(batchSteps("acquired").summary).toMatch(/Ingest results/);
});

test("file names carry the batch name; only a database-shaped batch name is accepted", () => {
  expect(batchFileNames.sequence("B2026-033")).toBe("B2026-033-sequence.csv");
  expect(batchFileNames["bench-sheet"]("B2026-033")).toBe("B2026-033-bench-sheet.csv");
  expect(["B2026-033", "B2026-1000"].every(name => BATCH_NAME.test(name))).toBe(true);
  expect(["b2026-033", "B26-033", "B2026-33", "B2026-033/../x", "B2026-033\n"].some(name => BATCH_NAME.test(name))).toBe(false);
});
