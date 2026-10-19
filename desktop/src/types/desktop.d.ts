export interface DesktopConfig {
  appName: string;
  appUrl: string;
  window: {
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
    kiosk: boolean;
    fullscreen: boolean;
    maximizeOnStart: boolean;
  };
  autoStartOnBoot: boolean;
  retryIntervalMs: number;
  mockSerial?: boolean;
  update?: {
    owner: string;
    repo: string;
  };
}

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  productId?: string;
}

export interface SerialStatus {
  isOpen: boolean;
  port: string | null;
  baudRate: number | null;
  error: string | null;
  reconnecting?: boolean;
}

export type SignalOption = "default" | "on" | "off";

export interface SignalSettings {
  dtr?: SignalOption;
  rts?: SignalOption;
}

export interface SerialSignals {
  cts: boolean;
  dsr: boolean;
  cd: boolean;
  ri?: boolean | null;
}

export interface SerialRawEvent {
  timestamp: string;
  hex: string;
  ascii: string;
  len: number;
}

export interface BaudScanItem {
  baudRate: number;
  status: "pending" | "scanning" | "completed" | "failed";
  byteCount: number;
  printableCount: number;
  printableRatio: number;
  secondsLeft: number;
}

export interface SerialDataEvent {
  raw: string;
  escaped: string;
}

export interface DesktopPrinterInfo {
  name: string;
  displayName: string;
  description: string;
  status: number;
  isDefault: boolean;
}

export interface DesktopPrintOptions {
  html: string;
  printerName: string;
  copies?: number;
  paperWidthMm?: number;
  savePdfForDebug?: boolean;
}

export interface CallerIdStatus {
  loaded: boolean;
  dllPath: string | null;
  isRunning: boolean;
  architecture: string;
  deviceConnected: boolean;
  lastCall: any;
  lastCallTime: number | null;
  error: string | null;
}

export interface DesktopAPI {
  isElectron: true;
  version: string;
  platform: NodeJS.Platform;
  getConfig: () => Promise<DesktopConfig>;
  onIncomingCall: (callback: (phone: string) => void) => () => void;
  callerId?: {
    getStatus: () => Promise<CallerIdStatus>;
    start: () => Promise<boolean>;
    stop: () => Promise<{ success: boolean }>;
  };
  serial: {
    listPorts: () => Promise<SerialPortInfo[]>;
    open: (
      port: string,
      baudRate: number,
      enableModemMode?: boolean,
      signals?: SignalSettings
    ) => Promise<{ success: boolean; error?: string }>;
    close: () => Promise<{ success: boolean; error?: string }>;
    status: () => Promise<SerialStatus>;
    setSignals: (signals: SignalSettings) => Promise<{ success: boolean; error?: string }>;
    onSignals: (callback: (signals: SerialSignals | null) => void) => () => void;
    onData: (callback: (data: SerialDataEvent) => void) => () => void;
    onRaw: (callback: (raw: SerialRawEvent) => void) => () => void;
    onStatus: (callback: (status: SerialStatus) => void) => () => void;
    onLog: (callback: (log: { text: string; type: "info" | "call" | "warn" | "error" | "raw" }) => void) => () => void;
    startBaudScan: (port: string, signals?: SignalSettings) => Promise<{ success: boolean; error?: string }>;
    stopBaudScan: () => Promise<{ success: boolean }>;
    onBaudScanProgress: (callback: (item: BaudScanItem) => void) => () => void;
    triggerMock: (sampleType?: "a" | "b" | "c" | "d" | "e") => Promise<void>;
  };
  print: {
    listPrinters: () => Promise<DesktopPrinterInfo[]>;
    printHtml: (options: DesktopPrintOptions) => Promise<{ success: boolean; error?: string }>;
  };
}

declare global {
  interface Window {
    desktopAPI?: DesktopAPI;
  }
}

