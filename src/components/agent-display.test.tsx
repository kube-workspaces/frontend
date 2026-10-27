import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgentDisplay from "./agent-display";
import { controlEnvelope, decodeFrame, encodeControlFrame, parseControlBody, RESIZE_CONFIRMATION_TIMEOUT_MS } from "@/lib/agent-protocol";

vi.mock("@/lib/api", () => ({
  checkTier1InUse: vi.fn().mockResolvedValue(false),
  getDisplayStatus: vi.fn().mockResolvedValue({ enabled: false }),
  takeOverTier1: vi.fn(),
}));

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  binaryType = "";
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(public url: string) { Socket.instances.push(this); }
  control(type: string, payload: Record<string, unknown>) {
    const data = encodeControlFrame(controlEnvelope("guest-session", 1, 1, type, payload));
    this.onmessage?.({ data: data.buffer as ArrayBuffer });
  }
  requests() {
    return this.send.mock.calls.flatMap(([data]) => {
      const frame = decodeFrame(new Uint8Array(data));
      const message = frame && parseControlBody(frame.body);
      return message?.type === "resizeRequest" ? [message.payload!] : [];
    });
  }
}

let output: (frame: { displayWidth: number; displayHeight: number; close: () => void }) => void;
const drawImage = vi.fn();

async function mount(observer = false) {
  const onVideoSize = vi.fn();
  const view = render(<AgentDisplay workspaceName="windows-test" namespace="example" observer={observer} onVideoSize={onVideoSize} />);
  await act(async () => {});
  const socket = Socket.instances.at(-1)!;
  act(() => {
    socket.control("hello", { capture: { width: 1280, height: 800 }, resizeAvailable: true, displayModes: [{ width: 1280, height: 800 }] });
    socket.control("attachResult", { admitted: true });
    // One synthetic Annex-B IDR starts the real viewer's decoder path.
    const frame = new Uint8Array([1, 0, 0, 0, 5, 0, 0, 0, 1, 0x65]);
    socket.onmessage?.({ data: frame.buffer });
  });
  const canvas = view.container.querySelector("canvas")!;
  const deliver = (width: number, height: number) => act(() => output({ displayWidth: width, displayHeight: height, close: vi.fn() }));
  const select = (value: string) => {
    fireEvent.change(screen.getByLabelText("Guest display resolution"), { target: { value } });
    act(() => vi.advanceTimersByTime(500));
    return socket.requests().at(-1)!.requestId;
  };
  return { socket, canvas, deliver, select, onVideoSize };
}

describe("premium resize acknowledgement fencing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Socket.instances = [];
    drawImage.mockClear();
    vi.stubGlobal("WebSocket", Socket);
    vi.stubGlobal("VideoDecoder", class {
      decodeQueueSize = 0;
      constructor(callbacks: { output: typeof output }) { output = callbacks.output; }
      configure() {}
      decode() {}
      close() {}
    });
    vi.stubGlobal("EncodedVideoChunk", class {});
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1280);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("ignores a superseded ACK before canvas cropping or future-frame readback", async () => {
    const { socket, canvas, deliver, select, onVideoSize } = await mount();
    deliver(1920, 1088);
    const oldId = select("1920x1080");
    const currentId = select("2560x1440");
    onVideoSize.mockClear();
    act(() => socket.control("resizeAck", { requestId: oldId, actual: { width: 1920, height: 1080 } }));
    expect(canvas.height).toBe(1088);
    expect(onVideoSize).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Requesting 2560×1440");
    deliver(1920, 1088);
    expect(canvas.height).toBe(1088);
    act(() => socket.control("resizeAck", { requestId: currentId, actual: { width: 2560, height: 1440 } }));
    deliver(2560, 1440);
    expect(canvas.width).toBe(2560);
    expect(screen.getByText(/Guest mode 2560×1440/)).toBeInTheDocument();
  });

  it("retains matching ACK/frame cropping when the padded IDR arrives first", async () => {
    const { socket, canvas, deliver, select } = await mount();
    deliver(1280, 800);
    const id = select("1920x1080");
    deliver(1920, 1088);
    act(() => socket.control("resizeAck", { requestId: id, actual: { width: 1920, height: 1080 } }));
    expect(canvas.height).toBe(1080);
    expect(screen.getByText(/Guest mode 1920×1080/)).toBeInTheDocument();
  });

  it("ignores ACKs after confirmation timeout", async () => {
    const { socket, canvas, deliver, select } = await mount();
    deliver(1920, 1088);
    const id = select("1920x1080");
    act(() => vi.advanceTimersByTime(RESIZE_CONFIRMATION_TIMEOUT_MS));
    act(() => socket.control("resizeAck", { requestId: id, actual: { width: 1920, height: 1080 } }));
    expect(canvas.height).toBe(1088);
    expect(screen.getByRole("status")).toHaveTextContent("timed out");
    deliver(1920, 1088);
    expect(canvas.height).toBe(1088);
  });

  it("keeps observers view-only and ignores unsolicited controller ACKs", async () => {
    const { socket, canvas, deliver } = await mount(true);
    deliver(1920, 1088);
    act(() => {
      socket.control("resizeAck", { requestId: "controller-request", actual: { width: 1920, height: 1080 } });
      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(500);
    });
    expect(canvas.height).toBe(1088);
    expect(socket.requests()).toHaveLength(0);
    expect(screen.getByRole("button", { name: /Guest mode.*View-only/ })).toBeDisabled();
  });
});
