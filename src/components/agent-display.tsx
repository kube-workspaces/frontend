"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

interface AgentDisplayProps {
  workspaceName: string;
  namespace: string;
  onConnectionChange?: (connected: boolean) => void;
}

// An Agent premium display viewer over the API's /proxy/{ns}/{name}/agent/ WebSocket bridge.
// The bridge speaks the raw framed wire protocol (v1).
export default function AgentDisplay({
  workspaceName,
  namespace,
  onConnectionChange,
}: AgentDisplayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoDecoder = useRef<VideoDecoder | null>(null);

  useEffect(() => {
    return () => {
      videoDecoder.current?.close();
    };
  }, []);


  const notify = useCallback(
    (connected: boolean) => {
      setIsConnected(connected);
      if (onConnectionChange) onConnectionChange(connected);
    },
    [onConnectionChange]
  );

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}${API_BASE}/proxy/${namespace}/${workspaceName}/agent/?purpose=v1.display`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    ws.onmessage = async (event) => {
      const data = new Uint8Array(event.data);
      if (data.length < 5) return;
      const tag = data[0];
      const view = new DataView(data.buffer);
      const length = view.getUint32(1, false);
      const body = data.slice(5, 5 + length);

      if (tag === 0x00) {
        const decoder = new TextDecoder();
        const json = JSON.parse(decoder.decode(body));
        console.log("Control message:", json);
      } else if (tag === 0x01 || tag === 0x02) {
        // Media (H.264/Opus) - Requires WebCodecs VideoDecoder
        if (!videoDecoder.current) {
          videoDecoder.current = new VideoDecoder({
            output: (frame) => {
              // Create a MediaStreamTrack from VideoFrame for the video element
              // (Note: VideoFrame to MediaStreamTrack requires a canvas approach or setSinkId/VideoFrame stream adaptation)
              frame.close();
            },
            error: (e) => console.error("VideoDecoder error:", e),
          });
          await videoDecoder.current.configure({ codec: "avc1.42E01E", hardwareAcceleration: "prefer-software" });
        }
        
        // Feed chunk to decoder
        // Note: Actual protocol requires framing/GOP management
        videoDecoder.current.decode(new EncodedVideoChunk({
          type: tag === 0x01 ? "key" : "delta",
          timestamp: performance.now() * 1000,
          data: body,
        }));

      }
    };


    ws.onclose = () => {
      setIsConnected(false);
      setError("Agent display disconnected");
    };

    ws.onerror = (e) => {
      console.error("Agent display error:", e);
      setError("Agent display error");
    };

    return () => {
      ws.close();
    };
  }, [workspaceName, namespace, notify]);

  if (error) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#1a1b26]">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-black relative flex items-center justify-center overflow-hidden">
      <video ref={videoRef} className="w-full h-full" autoPlay playsInline muted />
      <div
        ref={mountRef}
        className="w-full h-full"
        style={{ position: "relative", width: "100%", height: "100%", touchAction: "none" }}
      />

      <div className="absolute top-2 right-3 flex items-center gap-2 z-10">
        <span className={`text-xs ${isConnected ? "text-gray-400" : "text-gray-600"}`}>
          {isConnected ? "Agent connected" : "Connecting…"}
        </span>
      </div>
    </div>
  );
}
