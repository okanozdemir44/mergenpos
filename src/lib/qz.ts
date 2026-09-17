import * as qz from "qz-tray";

/**
 * QZ Tray Servisi
 * İstemci tarafında QZ Tray masaüstü uygulamasını yönetir.
 */

let isConnected = false;

export async function connectQZ(): Promise<void> {
  if (isConnected || qz.websocket.isActive()) {
    isConnected = true;
    return;
  }
  
  try {
    await qz.websocket.connect({ retries: 2, delay: 1 });
    isConnected = true;
  } catch (error) {
    console.error("QZ Tray bağlantı hatası:", error);
    throw new Error("QZ Tray uygulamasına bağlanılamadı. Uygulamanın bilgisayarınızda çalıştığından emin olun.");
  }
}

export async function disconnectQZ(): Promise<void> {
  if (qz.websocket.isActive()) {
    await qz.websocket.disconnect();
    isConnected = false;
  }
}

export async function getPrinters(): Promise<string[]> {
  await connectQZ();
  const printers = await qz.printers.find();
  return Array.isArray(printers) ? printers : [printers];
}

/**
 * Verilen yazıcı ismine HTML string göndererek yazdırır.
 */
export async function printHtml(printerName: string, htmlContent: string): Promise<void> {
  await connectQZ();

  const config = qz.configs.create(printerName, {
    margins: 0,
    copies: 1,
    scaleContent: false, // HTML formatındaki font boyutlarını koru
  });

  const data = [
    {
      type: "html",
      format: "plain",
      data: htmlContent,
    },
  ];

  await qz.print(config, data as any);
}
