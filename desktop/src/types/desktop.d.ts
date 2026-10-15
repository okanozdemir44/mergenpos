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
}

export interface DesktopAPI {
  isElectron: true;
  version: string;
  platform: NodeJS.Platform;
  getConfig: () => Promise<DesktopConfig>;
  onIncomingCall: (callback: (phone: string) => void) => () => void;
  serial: {
    listPorts: () => Promise<SerialPortInfo[]>;
    open: (port: string, baudRate: number, enableModemMode?: boolean) => Promise<{ success: boolean; error?: string }>;
    close: () => Promise<{ success: boolean; error?: string }>;
    status: () => Promise<SerialStatus>;
    onData: (callback: (data: SerialDataEvent) => void) => () => void;
    onStatus: (callback: (status: SerialStatus) => void) => () => void;
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
