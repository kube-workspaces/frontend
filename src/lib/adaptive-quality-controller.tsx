"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Adaptive Quality Controller (AQC) - Phase 2 Implementation
 * 
 * Dynamically adjusts VNC display quality based on network conditions and motion intensity.
 * Provides fluid, responsive graphical experience by balancing visual fidelity vs responsiveness.
 */

// ============================================================================
// PHASE A: Baseline Configuration & Motion Thresholds
// ============================================================================

export interface MotionThresholds {
  minActiveIntensity: number; // bytes/sec
  highMotionThreshold: number; // bytes/sec
  frameBurstThreshold: number; // updates per second
}

export interface NetworkTier {
  name: string;
  minRtt: number;
  maxRtt: number | null;
  minThroughputMbps: number;
  jpegQuality: number; // 0-9 (noVNC mapping)
  compressionLevel: number; // 0-9
}

const BASELINE_MOTION_THRESHOLDS: MotionThresholds = {
  minActiveIntensity: 2000, // 2KB/s
  highMotionThreshold: 50000, // 50KB/s
  frameBurstThreshold: 15,
};

const NETWORK_TIERS: NetworkTier[] = [
  {
    name: "Tier 1 - Poor",
    minRtt: 200,
    maxRtt: null,
    minThroughputMbps: 0,
    jpegQuality: 2,
    compressionLevel: 8,
  },
  {
    name: "Tier 2 - Fair",
    minRtt: 80,
    maxRtt: 200,
    minThroughputMbps: 1.5,
    jpegQuality: 5,
    compressionLevel: 4,
  },
  {
    name: "Tier 3 - Good",
    minRtt: 0,
    maxRtt: 80,
    minThroughputMbps: 4.0,
    jpegQuality: 8,
    compressionLevel: 2,
  },
];

// ============================================================================
// PHASE B: Metric Engine - RTT, Throughput, Motion Detection
// ============================================================================

export interface NetworkMetrics {
  rttMs: number;
  throughputBps: number;
  smoothedRttMs: number;
  smoothedThroughputBps: number;
  motionIntensityBps: number;
}

const SMOOTHING_ALPHA = 0.2;
const RTT_WINDOW_SIZE = 10;
const THROUGHPUT_WINDOW_SIZE = 20;

type MotionState = "Idle" | "Active-Low" | "Active-High";

export function useAdaptiveQualityController(): {
  metrics: NetworkMetrics;
  motionState: MotionState;
  networkTierIndex: number;
  isApplyingQuality: boolean;
} {
  const rttSamples = useRef<number[]>([]);
  const throughputSamples = useRef<number[]>([]);
  const lastTotalBytes = useRef<number>(0);
  const lastMeasureTime = useRef<number>(0);
  
  const [metrics, setMetrics] = useState<NetworkMetrics>({
    rttMs: 50,
    throughputBps: 0,
    smoothedRttMs: 50,
    smoothedThroughputBps: 0,
    motionIntensityBps: 0,
  });
  
  const [motionState, setMotionState] = useState<MotionState>("Idle");
  const [networkTierIndex, setNetworkTierIndex] = useState<number>(2);
  const lastUpgradeAt = useRef<number>(0);

  useEffect(() => {
    lastMeasureTime.current = performance.now();
  }, []);

  useEffect(() => {
    // RTT Measurement: Send a 1x1 incremental FramebufferUpdateRequest
    const measureRtt = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ws = (window as any).__aqc_vnc_ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const sentAt = performance.now();
      
      // VNC FramebufferUpdateRequest: [3, 1, x, y, w, h]
      const msg = new Uint8Array(10);
      msg[0] = 3; // message-type
      msg[1] = 1; // incremental
      // rest are 0 (pos 0,0, size 0,0 - which is valid but we'll use 1x1)
      msg[8] = 0; msg[9] = 1; // width 1
      msg[6] = 0; msg[7] = 1; // height 1

      ws.send(msg);

      // We wait for the next data message. Since we just requested an update,
      // the next message is likely the response (or already in flight).
      // This is a coarse but real measurement of the round trip.
      const checkResponse = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lastMsgAt = (window as any).__aqc_last_msg_at || 0;
        if (lastMsgAt > sentAt) {
          const rtt = lastMsgAt - sentAt;
          rttSamples.current.push(rtt);
          if (rttSamples.current.length > RTT_WINDOW_SIZE) rttSamples.current.shift();
        } else if (performance.now() - sentAt < 2000) {
          setTimeout(checkResponse, 10);
        }
      };
      checkResponse();
    };

    const measureThroughput = () => {
      const now = performance.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totalBytes = (window as any).__aqc_total_bytes || 0;
      const deltaBytes = totalBytes - lastTotalBytes.current;
      const deltaTime = (now - lastMeasureTime.current) / 1000;

      if (deltaTime <= 0) return;

      const bps = deltaBytes / deltaTime;
      throughputSamples.current.push(bps);
      if (throughputSamples.current.length > THROUGHPUT_WINDOW_SIZE) throughputSamples.current.shift();

      lastTotalBytes.current = totalBytes;
      lastMeasureTime.current = now;

      // Motion State logic
      if (bps > BASELINE_MOTION_THRESHOLDS.highMotionThreshold) {
        setMotionState("Active-High");
      } else if (bps > BASELINE_MOTION_THRESHOLDS.minActiveIntensity) {
        setMotionState("Active-Low");
      } else {
        setMotionState("Idle");
      }

      updateSmoothedMetrics(bps);
    };

    const updateSmoothedMetrics = (currentBps: number) => {
      const avgRtt = rttSamples.current.length > 0 
        ? rttSamples.current.reduce((a, b) => a + b, 0) / rttSamples.current.length 
        : metrics.smoothedRttMs;

      setMetrics(prev => {
        const nextSmoothedRtt = prev.smoothedRttMs * (1 - SMOOTHING_ALPHA) + avgRtt * SMOOTHING_ALPHA;
        const nextSmoothedBps = prev.smoothedThroughputBps * (1 - SMOOTHING_ALPHA) + currentBps * SMOOTHING_ALPHA;
        
        return {
          rttMs: Math.floor(avgRtt),
          throughputBps: Math.floor(currentBps),
          smoothedRttMs: nextSmoothedRtt,
          smoothedThroughputBps: nextSmoothedBps,
          motionIntensityBps: Math.floor(currentBps), // simplify for now
        };
      });
    };

    const interval = setInterval(() => {
      measureThroughput();
      if (Math.random() < 0.2) measureRtt(); // Sample RTT occasionally
    }, 500);

    return () => clearInterval(interval);
  }, [metrics.smoothedRttMs, metrics.smoothedThroughputBps]);

  // Tier Assessment logic
  useEffect(() => {
    const assess = () => {
      const rtt = metrics.smoothedRttMs;
      const mbps = (metrics.smoothedThroughputBps * 8) / 1000000;

      let bestTier = 0;
      for (let i = NETWORK_TIERS.length - 1; i >= 0; i--) {
        const tier = NETWORK_TIERS[i];
        const rttOk = tier.maxRtt === null || rtt <= tier.maxRtt;
        const speedOk = mbps >= tier.minThroughputMbps;
        if (rttOk && speedOk) {
          bestTier = i;
          break;
        }
      }

      if (bestTier !== networkTierIndex) {
        // Hysteresis: only upgrade quality if we've been stable for 3 seconds
        if (bestTier > networkTierIndex) {
          if (performance.now() - lastUpgradeAt.current > 3000) {
            setNetworkTierIndex(bestTier);
            lastUpgradeAt.current = performance.now();
            applyQualitySettingsFromTier(bestTier);
          }
        } else {
          // Downgrade immediately
          setNetworkTierIndex(bestTier);
          applyQualitySettingsFromTier(bestTier);
        }
      }
    };

    assess();
  }, [metrics.smoothedRttMs, metrics.smoothedThroughputBps, networkTierIndex]);

  // Phase D: Lossless Refresh
  useEffect(() => {
    if (motionState === "Idle") {
      const timer = setTimeout(() => {
        requestLosslessRefresh();
      }, 1000); // 1 second of idle
      return () => clearTimeout(timer);
    }
  }, [motionState]);

  return {
    metrics,
    motionState,
    networkTierIndex,
    isApplyingQuality: true,
  };
}

function applyQualitySettingsFromTier(tierIndex: number) {
  const tier = NETWORK_TIERS[tierIndex];
  applyQualitySettings(tierIndex, tier.jpegQuality, tier.compressionLevel);
}

export async function applyQualitySettings(
  tierIndex: number,
  jpegQuality: number,
  compressionLevel: number
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rfb = (window as any).__aqc_rfb;
  if (!rfb) return;

  console.log(`[AQC] Applying quality settings - Tier ${tierIndex}, JPEG ${jpegQuality}, Compression ${compressionLevel}`);
  
  // noVNC properties
  rfb.qualityLevel = jpegQuality;
  rfb.compressionLevel = compressionLevel;
}

export async function requestLosslessRefresh(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rfb = (window as any).__aqc_rfb;
  if (!rfb) return;

  console.log("[AQC] Requesting lossless frame refresh");
  
  const oldQuality = rfb.qualityLevel;
  rfb.qualityLevel = 9; // Max quality in noVNC (0-9)
  
  // Request full update
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ws = (rfb as any)._websocket;
  if (ws && ws._websocket && ws._websocket.readyState === WebSocket.OPEN) {
    const msg = new Uint8Array(10);
    msg[0] = 3; // FramebufferUpdateRequest
    msg[1] = 0; // non-incremental (full)
    // rest 0 means full screen
    ws._websocket.send(msg);
  }

  // Revert quality after a short delay (enough to receive the frame)
  setTimeout(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentRfb = (window as any).__aqc_rfb;
    if (currentRfb) currentRfb.qualityLevel = oldQuality;
  }, 500);
}
