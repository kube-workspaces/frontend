"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

interface AgentDisplayProps {
  workspaceName: string;
  namespace: string;
  onConnectionChange?: (connected: boolean) => void;
}

export default function AgentDisplay({
  workspaceName,
  namespace,
  onConnectionChange,
}: AgentDisplayProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoDecoder = useRef<VideoDecoder | null>(null);
  const audioDecoder = useRef<AudioDecoder | null>(null);
  const audioContext = useRef<AudioContext | null>(null);

  const notify = useCallback(
    (connected: boolean) => {
      setIsConnected(connected);
      if (onConnectionChange) onConnectionChange(connected);
    },
    [onConnectionChange]
  );

  useEffect(() => {
    return () => {
      videoDecoder.current?.close();
      audioDecoder.current?.close();
      audioContext.current?.close();
    };
  }, []);

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
      } else if (tag === 0x01) { // Video (H.264)
        if (!videoDecoder.current) {
          videoDecoder.current = new VideoDecoder({
            output: (frame) => {
              if (canvasRef.current) {
                const ctx = canvasRef.current.getContext("2d");
                ctx?.drawImage(frame, 0, 0, canvasRef.current.width, canvasRef.current.height);
              }
              frame.close();
            },
            error: (e) => console.error("VideoDecoder error:", e),
          });
          await videoDecoder.current.configure({ codec: "avc1.42E01E", hardwareAcceleration: "prefer-software" });
        }
        videoDecoder.current.decode(new EncodedVideoChunk({
          type: "key",
          timestamp: performance.now() * 1000,
          data: body,
        }));
      } else if (tag === 0x02) { // Audio (Opus)
        if (!audioDecoder.current) {
          audioContext.current = new AudioContext();
          audioDecoder.current = new AudioDecoder({
            output: (audioData) => {
               // Simplified: should use audioContext.decodeAudioData or AudioWorklet
               audioData.close();
            },
            error: (e) => console.error("AudioDecoder error:", e),
          });
          await audioDecoder.current.configure({ codec: "opus", numberOfChannels: 2, sampleRate: 48000 });
        }
        audioDecoder.current.decode(new EncodedAudioChunk({
          type: "key",
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
      <canvas ref={canvasRef} className="w-full h-full" />
      <div
        ref={mountRef}
        className="w-full h-full hidden"
      />

      <div className="absolute top-2 right-3 flex items-center gap-2 z-10">
        <span className={`text-xs ${isConnected ? "text-gray-400" : "text-gray-600"}`}>
          {isConnected ? "Agent connected" : "Connecting…"}
        </span>
      </div>
    </div>
  );
}
