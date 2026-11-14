import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// findBy*/waitFor wait up to 5 s instead of 1 s: under a loaded machine (the deploy runs the suite next to the DB tests)
// a first render with mocked server actions can take longer than a second, and the tests failed on time, not on behaviour.
configure({ asyncUtilTimeout: 5000 });
afterEach(cleanup);
vi.mock("server-only", () => ({}));
