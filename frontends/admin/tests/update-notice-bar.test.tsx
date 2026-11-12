import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UpdateNotice from "@/components/update-notice";

// Synthetic commits and path only.
const BUILT = "a".repeat(40);
const NEWER = "b".repeat(40);
const LATER = "c".repeat(40);
const PATH = "/nexo-example/deploy-status.json";
const TEXT = "A new version of Admin is available. Reload to update.";

let deployed: { state: string; commit: string };
const fetcher = vi.fn(async () => new Response(JSON.stringify(deployed), { status: 200 }));

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

async function becomeVisible() {
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(0); });
}

beforeEach(() => {
  vi.useFakeTimers();
  deployed = { state: "deployed", commit: BUILT };
  fetcher.mockClear();
  vi.stubGlobal("fetch", fetcher);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("update notice bar", () => {
  it("checks about 10 s after load, then every 2 minutes, with no-store", async () => {
    render(<UpdateNotice buildCommit={BUILT} statusPath={PATH} />);
    await advance(9_000);
    expect(fetcher).not.toHaveBeenCalled();
    await advance(1_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(PATH, { cache: "no-store" });
    await advance(120_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });

  it("shows the bar for a newer deployed commit and reloads only on request", async () => {
    deployed = { state: "deployed", commit: NEWER };
    const reload = vi.fn();
    render(<UpdateNotice buildCommit={BUILT} statusPath={PATH} reload={reload} />);
    await advance(10_000);
    expect(screen.getByRole("status")).toHaveTextContent(TEXT);
    await advance(10 * 120_000);
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not show a deploy that is not finished", async () => {
    deployed = { state: "deploying", commit: NEWER };
    render(<UpdateNotice buildCommit={BUILT} statusPath={PATH} />);
    await advance(10_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });

  it("keeps the bar while a later deploy is in progress or the status cannot be read", async () => {
    deployed = { state: "deployed", commit: NEWER };
    render(<UpdateNotice buildCommit={BUILT} statusPath={PATH} />);
    await advance(10_000);
    deployed = { state: "deploying", commit: LATER };
    await advance(120_000);
    expect(screen.getByRole("status")).toHaveTextContent(TEXT);
    fetcher.mockImplementationOnce(async () => new Response("{}", { status: 503 }));
    await advance(120_000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("status")).toHaveTextContent(TEXT);
  });

  it("hides the bar when the deployed commit goes back to this build", async () => {
    deployed = { state: "deployed", commit: NEWER };
    render(<UpdateNotice buildCommit={BUILT} statusPath={PATH} />);
    await advance(10_000);
    expect(screen.getByRole("status")).toHaveTextContent(TEXT);
    deployed = { state: "deployed", commit: BUILT };
    await advance(120_000);
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });

  it("closes for that commit and comes back for a later one", async () => {
    deployed = { state: "deployed", commit: NEWER };
    render(<UpdateNotice buildCommit={BUILT} statusPath={PATH} />);
    await advance(10_000);
    fireEvent.click(screen.getByRole("button", { name: "Close the update notice" }));
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
    await advance(120_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
    deployed = { state: "deployed", commit: LATER };
    await advance(120_000);
    expect(screen.getByRole("status")).toHaveTextContent(TEXT);
  });

  it("checks again when the tab becomes visible", async () => {
    render(<UpdateNotice buildCommit={BUILT} statusPath={PATH} />);
    await advance(10_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    deployed = { state: "deployed", commit: NEWER };
    await becomeVisible();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent(TEXT);
  });

  it("is off when the build commit or the status path is empty", async () => {
    deployed = { state: "deployed", commit: NEWER };
    const { unmount } = render(<UpdateNotice buildCommit="" statusPath={PATH} />);
    render(<UpdateNotice buildCommit={BUILT} statusPath="" />);
    await advance(10 * 120_000);
    await becomeVisible();
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    unmount();
  });

  it("is off by default when the deploy did not set the variables", async () => {
    render(<UpdateNotice />);
    await advance(10 * 120_000);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("stops checking once unmounted", async () => {
    const { unmount } = render(<UpdateNotice buildCommit={BUILT} statusPath={PATH} />);
    unmount();
    await advance(10 * 120_000);
    await becomeVisible();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
