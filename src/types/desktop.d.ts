export interface DesktopSerialPortInfo {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  productId?: string;
}

export interface DesktopSerialStatus {
  isOpen: boolean;
  port: string | null;
  baudRate: number | null;
  error: string | null;
  reconnecting?: boolean;
}

export type DesktopSignalOption = "default" | "on" | "off";

export interface DesktopSignalSettings {
  dtr?: DesktopSignalOption;
  rts?: DesktopSignalOption;
}

export interface DesktopSerialSignals {
  cts: boolean;
  dsr: boolean;
  cd: boolean;
  ri?: boolean | null;
}

export interface DesktopSerialRawEvent {
  timestamp: string;
  hex: string;
  ascii: string;
  len: number;
}

export interface DesktopBaudScanItem {
  baudRate: number;
  status: "pending" | "scanning" | "completed" | "failed";
  byteCount: number;
  printableCount: number;
  printableRatio: number;
  secondsLeft: number;
}

export interface DesktopSerialDataEvent {
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

export interface DesktopAPI {
  isElectron: true;
  version: string;
  platform: string;
  getConfig: () => Promise<any>;
  onIncomingCall: (callback: (phone: string) => void) => () => void;
  serial: {
    listPorts: () => Promise<DesktopSerialPortInfo[]>;
    open: (
      port: string,
      baudRate: number,
      enableModemMode?: boolean,
      signals?: DesktopSignalSettings
    ) => Promise<{ success: boolean; error?: string }>;
    close: () => Promise<{ success: boolean; error?: string }>;
    status: () => Promise<DesktopSerialStatus>;
    setSignals: (signals: DesktopSignalSettings) => Promise<{ success: boolean; error?: string }>;
    onSignals: (callback: (signals: DesktopSerialSignals | null) => void) => () => void;
    onData: (callback: (data: DesktopSerialDataEvent) => void) => () => void;
    onRaw: (callback: (raw: DesktopSerialRawEvent) => void) => () => void;
    onStatus: (callback: (status: DesktopSerialStatus) => void) => () => void;
    startBaudScan: (port: string, signals?: DesktopSignalSettings) => Promise<{ success: boolean; error?: string }>;
    stopBaudScan: () => Promise<{ success: boolean }>;
    onBaudScanProgress: (callback: (item: DesktopBaudScanItem) => void) => () => void;
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
