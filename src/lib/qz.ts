import * as qz from "qz-tray";
import jsrsasign from "jsrsasign";

/**
 * QZ Tray Servisi
 * İstemci tarafında QZ Tray masaüstü uygulamasını yönetir.
 */

const QZ_CERT = `-----BEGIN CERTIFICATE-----
MIIEMDCCAxigAwIBAgIGAaCwx5UNMA0GCSqGSIb3DQEBCwUAMIGiMQswCQYDVQQG
EwJVUzELMAkGA1UECAwCTlkxEjAQBgNVBAcMCUNhbmFzdG90YTEbMBkGA1UECgwS
UVogSW5kdXN0cmllcywgTExDMRswGQYDVQQLDBJRWiBJbmR1c3RyaWVzLCBMTEMx
HDAaBgkqhkiG9w0BCQEWDXN1cHBvcnRAcXouaW8xGjAYBgNVBAMMEVFaIFRyYXkg
RGVtbyBDZXJ0MB4XDTI2MDkxNjE5MTEwNFoXDTQ2MDkxNjE5MTEwNFowgaIxCzAJ
BgNVBAYTAlVTMQswCQYDVQQIDAJOWTESMBAGA1UEBwwJQ2FuYXN0b3RhMRswGQYD
VQQKDBJRWiBJbmR1c3RyaWVzLCBMTEMxGzAZBgNVBAsMElFaIEluZHVzdHJpZXMs
IExMQzEcMBoGCSqGSIb3DQEJARYNc3VwcG9ydEBxei5pbzEaMBgGA1UEAwwRUVog
VHJheSBEZW1vIENlcnQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCR
VsAIPO/zTQDPH+OgLTjUIM73q4siiHmCGX0555YY7gjQEIeZ1eTPQDE3IksUWoRF
y6amtORkKWpTk3+FwC3U69q+KBtKvETjgnAw5/nBhF+wgHzM5XB+qqOkHw+xujPr
Qn67oWPjRx7a3ZISGuCieWeqKQwL7B681B6DL+NYKX+9tSUXKaguvQVT392pLK+q
eOTM/2wSMa0vJ8j1Rc/Ej5Y2aUdEjYzN19NVjVGBacKY2uF7nVqFBCfq/1CQ7+da
N/OJoGB7SRaBmj1XEZzfHPLnnbzUyVx/VaOIGuBh1VDwYkOSFpLTIg9xx34FaU+9
c/F6RZI1/vcmbEHa2ytjAgMBAAGjajBoMBIGA1UdEwEB/wQIMAYBAf8CAQEwDgYD
VR0PAQH/BAQDAgEGMB0GA1UdDgQWBBTTmwI1bvvJkZaIKiLWMlFcBPtOMTAjBgNV
HR4BAf8EGTAXoBUwE4IRUVogVHJheSBEZW1vIENlcnQwDQYJKoZIhvcNAQELBQAD
ggEBACd1jwAjG8GbcTknayiQ2XcvXOQOBCUT9E4rNdbmzwaYFb5KPWriMLRjC9mM
P8XDoYDuZFLkBpdkWKSdq7P+S2r1zB4Bx5EkoIselGVRUv3N9218VC/o8lzWAayl
H2g8DklNG7ysXbAmM2+ILSqdvnZsXFCba+QbJtSJtcJT+LGAQ+QSsteEaruwaTF7
HCARfq6MMs83mI1OziaiHTIVLx0CqAMoK62TqmAvcHXQxIr/NBWVCBdDNoSWh4ir
A4ywt9HGKWwsYa6hwf43bBGnIYw7IUxxG9dX/aJ5A6qqqYkhum+oQZs440CqDHyq
48WF1EyoL0Q8l3DJtOXsKmtsu5A=
-----END CERTIFICATE-----`;

const QZ_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCRVsAIPO/zTQDP
H+OgLTjUIM73q4siiHmCGX0555YY7gjQEIeZ1eTPQDE3IksUWoRFy6amtORkKWpT
k3+FwC3U69q+KBtKvETjgnAw5/nBhF+wgHzM5XB+qqOkHw+xujPrQn67oWPjRx7a
3ZISGuCieWeqKQwL7B681B6DL+NYKX+9tSUXKaguvQVT392pLK+qeOTM/2wSMa0v
J8j1Rc/Ej5Y2aUdEjYzN19NVjVGBacKY2uF7nVqFBCfq/1CQ7+daN/OJoGB7SRaB
mj1XEZzfHPLnnbzUyVx/VaOIGuBh1VDwYkOSFpLTIg9xx34FaU+9c/F6RZI1/vcm
bEHa2ytjAgMBAAECggEABJ8hlCF779yu/echseI+QGCatD18Oyjj1ENDPCglGb3Y
AeXEqhunHwAHkJ1Cje8i7aVAM2TlLloyy12RXItz6aVmW02jMIk0F5f6QVPfGUxA
TriHP2y8WwrKEVn7gcdOB1kh9o13Q67rSEJrdq/sHL6HkV2kyGxFvfNw1PMc45zB
7HOpxHT8r5lTz0HQA8gdNWWpWFja1O3bfBdAXwVvvQBPMIcx2lLz+NCsFh/j+Pv7
M2tQDCZbeAir17lB1/ENxoGcnPMbCEPsEVw1IoyRaCTjCZMWZU6//sPOShRPE/6l
Jc1+zqmmoX301lUCHjeM2Yw42wY0FMmCoZqiNNKyAQKBgQDNYZL0CAVsiHR53gHA
N0lj356caL45j/WsRNURpAsAe6N2D3QStZ4NqnHTaW53TRntIPo1Q0L/8sHtT/rl
7ciacuQuFasEbAdwP2pnZuvlMs9EIBziH71zr8t6jjUddsqSEGx9gpp/3QG6FVqU
NfTKxC0L4YQmtGKvf872eZcAQQKBgQC1KNY/yQeX9CmpXJve2JEd6PbvsxgGESLk
qxeyH98TxrSUAsuja3VbTBo4FeOhlxTY+0ELnEuo5Ugj9E9nDO6VMB/Lhqou7nas
+ufKTFB4sO9xDn1rHox8hlngg6a5i4GD2zaPAildwPyrUGfxxHC0AnstbaGXXJAR
N+cFrFWCowKBgHgkKPOpsYqQtBoJ/Vo0vTC4Qi9aslQ3202fokhEfs8UhEVuusar
CT8TQqyaEy2ko5LsZJE9vHa+yiSJUcqo810t8j7nG/hlPWCzKAo+0aVsuIQwiNTa
HlgLMOuLPpTyxYL2KpCtErXTUcxJ64ehnIX0hilaDZUallP1Xtsdu3BBAoGBAIRT
mwQmlJxjJhdm5RhHOuENLWrzd+XemI1NiFZ9P1ZTu82tqQ/qy2Nv2GsFWivLjtfb
16xic0WgjSxuJZ3RbWieKWtiJ2d2mktKTwuO6Ozv2UbM3cHkI5xGCtqbb6pyg51L
/7NAUfUApc+BQRvxcJ2cfls1jGZin31kRyT2t9NfAoGAXZxtlexIqyFZyQW7sCPH
7eo2XqYCSeb+0RD3ej9tMtT0mYfqy2scdfKJy5uCNzZpLlLYinl2YuXlNDysFOtU
DsubXoh2dvy1QaZoPFgzgbEq35k1wKcsGgtlYjDpweFGuEKRSgykxwz6ocFnHyAw
2f8T51K30zUuepZjjc7wOes=
-----END PRIVATE KEY-----`;

let isConnected = false;

function setupQZSecurity() {
  qz.security.setCertificatePromise((resolve) => {
    resolve(QZ_CERT);
  });

  qz.security.setSignatureAlgorithm("SHA512");

  qz.security.setSignaturePromise((toSign) => {
    return (resolve, reject) => {
      try {
        const pk = jsrsasign.KEYUTIL.getKey(QZ_PRIVATE_KEY);
        const sig = new jsrsasign.KJUR.crypto.Signature({ alg: "SHA512withRSA" });
        sig.init(pk);
        sig.updateString(toSign);
        const hex = sig.sign();
        resolve(jsrsasign.hextob64(hex));
      } catch (err) {
        console.error(err);
        reject(String(err));
      }
    };
  });
}

export async function connectQZ(): Promise<void> {
  if (isConnected || qz.websocket.isActive()) {
    isConnected = true;
    return;
  }
  
  try {
    setupQZSecurity();
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
