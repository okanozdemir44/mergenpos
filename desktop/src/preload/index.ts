import { contextBridge, ipcRenderer } from "electron";
import {
  DesktopAPI,
  DesktopConfig,
  DesktopPrintOptions,
  DesktopPrinterInfo,
  SerialDataEvent,
  SerialPortInfo,
  SerialStatus,
} from "../types/desktop";

const appVersion = process.env.npm_package_version || "1.0.0";

const desktopAPI: DesktopAPI = {
  isElectron: true,
  version: appVersion,
  platform: process.platform,
  getConfig: (): Promise<DesktopConfig> => {
    return ipcRenderer.invoke("desktop:get-config");
  },
  onIncomingCall: (callback: (phone: string) => void) => {
    const handler = (_event: any, phone: string) => callback(phone);
    ipcRenderer.on("callerid:incoming", handler);
    return () => {
      ipcRenderer.removeListener("callerid:incoming", handler);
    };
  },
  serial: {
    listPorts: (): Promise<SerialPortInfo[]> => {
      return ipcRenderer.invoke("serial:list-ports");
    },
    open: (
      port: string,
      baudRate: number,
      enableModemMode?: boolean,
      signals?: any
    ): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke("serial:open", { port, baudRate, enableModemMode, signals });
    },
    close: (): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke("serial:close");
    },
    status: (): Promise<SerialStatus> => {
      return ipcRenderer.invoke("serial:status");
    },
    setSignals: (signals: any): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke("serial:set-signals", signals);
    },
    onSignals: (callback: (signals: any) => void) => {
      const handler = (_event: any, signals: any) => callback(signals);
      ipcRenderer.on("serial:signals", handler);
      return () => {
        ipcRenderer.removeListener("serial:signals", handler);
      };
    },
    onData: (callback: (data: SerialDataEvent) => void) => {
      const handler = (_event: any, data: SerialDataEvent) => callback(data);
      ipcRenderer.on("serial:data", handler);
      return () => {
        ipcRenderer.removeListener("serial:data", handler);
      };
    },
    onRaw: (callback: (raw: any) => void) => {
      const handler = (_event: any, raw: any) => callback(raw);
      ipcRenderer.on("serial:raw", handler);
      return () => {
        ipcRenderer.removeListener("serial:raw", handler);
      };
    },
    onStatus: (callback: (status: SerialStatus) => void) => {
      const handler = (_event: any, status: SerialStatus) => callback(status);
      ipcRenderer.on("serial:status", handler);
      return () => {
        ipcRenderer.removeListener("serial:status", handler);
      };
    },
    startBaudScan: (port: string, signals?: any): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke("serial:start-baud-scan", { port, signals });
    },
    stopBaudScan: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke("serial:stop-baud-scan");
    },
    onBaudScanProgress: (callback: (item: any) => void) => {
      const handler = (_event: any, item: any) => callback(item);
      ipcRenderer.on("serial:baud-scan-progress", handler);
      return () => {
        ipcRenderer.removeListener("serial:baud-scan-progress", handler);
      };
    },
    triggerMock: (sampleType?: "a" | "b" | "c" | "d" | "e"): Promise<void> => {
      return ipcRenderer.invoke("serial:trigger-mock", sampleType);
    },
  },
  print: {
    listPrinters: (): Promise<DesktopPrinterInfo[]> => {
      return ipcRenderer.invoke("print:list-printers");
    },
    printHtml: (options: DesktopPrintOptions): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke("print:print-html", options);
    },
  },
};

// Web sayfasına izole edilmiş dar ve güvenli arayüzü sun
contextBridge.exposeInMainWorld("desktopAPI", desktopAPI);
