import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyQualitySettings, requestLosslessRefresh, useAdaptiveQualityController } from "./adaptive-quality-controller";

describe("adaptive quality controller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("applies quality settings to the active noVNC client", async () => {
    const rfb = { qualityLevel: 2, compressionLevel: 8 };
    vi.stubGlobal("__aqc_rfb", rfb);
    await applyQualitySettings(2, 8, 2);
    expect(rfb).toEqual({ qualityLevel: 8, compressionLevel: 2 });
  });

  it("requests a lossless frame then restores the prior JPEG quality", async () => {
    const send = vi.fn();
    const rfb = { qualityLevel: 5, _websocket: { _websocket: { readyState: WebSocket.OPEN, send } } };
    vi.stubGlobal("__aqc_rfb", rfb);
    await requestLosslessRefresh();
    expect(rfb.qualityLevel).toBe(9);
    expect(send).toHaveBeenCalledWith(new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    act(() => vi.advanceTimersByTime(500));
    expect(rfb.qualityLevel).toBe(5);
  });

  it("classifies measured traffic and removes sampling timers on unmount", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("__aqc_total_bytes", 0);
    const { result, unmount } = renderHook(() => useAdaptiveQualityController());
    expect(result.current.motionState).toBe("Idle");
    const sample = (totalBytes: number) => {
      vi.stubGlobal("__aqc_total_bytes", totalBytes);
      now += 500;
      act(() => vi.advanceTimersByTime(500));
    };
    sample(5000);
    expect(result.current.motionState).toBe("Active-Low");
    expect(result.current.metrics.throughputBps).toBe(10000);
    sample(55000);
    expect(result.current.motionState).toBe("Active-High");
    sample(55000);
    expect(result.current.motionState).toBe("Idle");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
