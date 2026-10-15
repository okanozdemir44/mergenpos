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
}

export interface DesktopAPI {
  isElectron: true;
  version: string;
  platform: string;
  getConfig: () => Promise<any>;
  onIncomingCall: (callback: (phone: string) => void) => () => void;
  serial: {
    listPorts: () => Promise<DesktopSerialPortInfo[]>;
    open: (port: string, baudRate: number, enableModemMode?: boolean) => Promise<{ success: boolean; error?: string }>;
    close: () => Promise<{ success: boolean; error?: string }>;
    status: () => Promise<DesktopSerialStatus>;
    onData: (callback: (data: DesktopSerialDataEvent) => void) => () => void;
    onStatus: (callback: (status: DesktopSerialStatus) => void) => () => void;
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
