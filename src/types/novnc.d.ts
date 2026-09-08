declare module "@novnc/novnc" {
  export interface RFBDisconnectEvent extends Event {
    detail?: {
      clean: boolean;
      reason?: string;
    };
  }

  export interface RFBSecurityFailureEvent extends Event {
    detail?: {
      reason?: string;
    };
  }

  export interface RFBOptions {
    shared?: boolean;
    credentials?: { username?: string; password?: string; target?: string };
    repeaterID?: string;
    viewOnly?: boolean;
    serverClipboard?: boolean;
    wsProtocols?: string[];
    wsBinary?: boolean;
    onUpdateState?: (rfb: RFB, state: string, oldstate: string, msg: string) => void;
    onDisconnected?: (rfb: RFB, clean: boolean, reason?: string) => void;
    onCredentialsRequired?: () => void;
    onDesktopName?: (rfb: RFB, name: string) => void;
    onSecurityFailure?: (rfb: RFB, reason: string) => void;
    onClipboard?: (rfb: RFB, text: string) => void;
    onBell?: () => void;
    onFBUReceive?: () => void;
    onFBUComplete?: () => void;
    onFBResize?: () => void;
    scaleViewport?: boolean;
    resizeSession?: boolean;
    clipViewport?: boolean;
    dragViewport?: boolean;
    qualityLevel?: number;
    compressionLevel?: number;
    background?: string;
    showDotCursor?: boolean;
    removeFingerprint?: boolean;
  }

  export class RFB extends EventTarget {
    constructor(
      target: HTMLElement,
      url?: string,
      options?: RFBOptions
    );
    disconnect();
    connect(url: string, options?: { wsProtocols?: string[] });
    sendCredentials(credentials: { username?: string; password?: string; target?: string });
    sendCtrlAltDel();
    sendKey(keyCode: number);
    machineShutdown();
    machineReboot();
    machineReset();
    clipboardPasteFrom(text: string);
    blur();
    focus();
    scaleViewport: boolean;
    resizeSession: boolean;
    viewOnly: boolean;
    clipViewport: boolean;
    dragViewport: boolean;
    shared: boolean;
    background: string;
    desktopName: string;
    capabilities: {
      power: boolean;
      resize: boolean;
      clipboard: boolean;
      extendedDesktopName: boolean;
    };
    ondisconnect: ((detail: { clean: boolean; reason?: string }) => void) | null;
    toDataURL(type?: string, encoderOptions?: number): string;
  }

  export default RFB;
}