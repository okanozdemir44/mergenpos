"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useStaffSession } from "@/hooks/useStaffSession";
import { useBranding } from "@/context/BrandingContext";
import {
  type ReceiptSettings,
  type SafeFontFamily,
  SAFE_RECEIPT_FONTS,
  DEFAULT_RECEIPT_SETTINGS,
  DEFAULT_CASHIER_RECEIPT_SETTINGS,
  DEFAULT_KITCHEN_RECEIPT_SETTINGS,
  sanitizeReceiptSettings,
} from "@/lib/receipt-settings";
import {
  getOrFetchReceiptSettings,
  saveRestaurantReceiptSettings,
} from "@/lib/receipt-settings-client";
import {
  generateCashierReceiptHtml,
  generateKitchenReceiptHtml,
} from "@/lib/receipt-generators";
import { printReceiptHtml } from "@/lib/unified-printer";
import type { ThermalReceiptProps } from "@/components/receipt/ThermalReceipt";

type ActiveTab = "cashier" | "kitchen";
type SampleMode = "gel_al" | "paket";

export function ReceiptSettingsView() {
  const { staff, loading: staffLoading } = useStaffSession();
  const { branding } = useBranding();

  const [settings, setSettings] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS);
  const [initialSettings, setInitialSettings] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("cashier");
  const [sampleMode, setSampleMode] = useState<SampleMode>("gel_al");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Yazdırılabilir Alan Kılavuzu (Yalnızca önizlemede görünür, basılan HTML'e asla girmez)
  const [showGuide, setShowGuide] = useState(false);
  const [guideMarginMm, setGuideMarginMm] = useState(4); // Varsayılan 4 mm

  // Değişiklik kontrolü (kaydedilmemiş değişiklik var mı?)
  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(settings) !== JSON.stringify(initialSettings);
  }, [settings, initialSettings]);

  // Sayfadan çıkarken kaydedilmemiş değişiklik uyarısı
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "Kaydedilmemiş değişiklikleriniz var. Sayfadan ayrılmak istediğinize emin misiniz?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Ayarları Restoran Kimliğine göre yükle
  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (staffLoading) return;
      if (!staff?.restaurant_id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await getOrFetchReceiptSettings(staff.restaurant_id);
        if (isMounted) {
          setSettings(data);
          setInitialSettings(data);
        }
      } catch (err) {
        console.error("Fiş ayarları yüklenirken hata:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [staff?.restaurant_id, staffLoading]);

  // Mesajı otomatik temizleme
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Örnek Sipariş Verisi (Tek kaynak şablonuna iletilen 3 kalemli örnek veri)
  const sampleReceiptData: ThermalReceiptProps = useMemo(() => {
    const branchName =
      branding?.display_name ||
      (staff?.restaurant_id === "8c3d0702-06fd-43f1-809a-062153bf7486"
        ? "Öküz Burger"
        : "Mergen POS");
    const logoUrl = branding?.logo_url || null;

    return {
      branchName,
      logoUrl,
      receiptNo: "78491023",
      dateStr: new Date().toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      cashierName: staff?.name || "KASİYER",
      orderChannel: sampleMode === "paket" ? "PAKET" : "GEL AL",
      customerName: sampleMode === "paket" ? "Ahmet Yılmaz" : null,
      customerPhone: sampleMode === "paket" ? "0532 555 44 33" : null,
      deliveryAddress:
        sampleMode === "paket"
          ? "Atatürk Mah. Cumhuriyet Cad. No: 42 D: 5, İlkadım / Samsun"
          : null,
      items: [
        {
          quantity: 2,
          unit: "Tam",
          name: "Özel Soslu Burger Menü",
          note: "Soğansız, patates ekstra çıtır",
          unitPrice: 220,
          totalPrice: 440,
        },
        {
          quantity: 1,
          unit: "Porsiyon",
          name: "Baharatlı Patates Kızartması",
          note: null,
          unitPrice: 75,
          totalPrice: 75,
        },
        {
          quantity: 2,
          unit: "Kutu",
          name: "Kola (330 ml)",
          note: null,
          unitPrice: 40,
          totalPrice: 80,
        },
      ],
      total: 595,
      paymentMethod: "cash",
      paidAmount: 600,
      changeAmount: 5,
      orderNumber: 42,
      complimentText: settings.cashier.footer.complimentText || "Afiyet Olsun.",
    };
  }, [branding, staff, sampleMode, settings.cashier.footer.complimentText]);

  // Gerçek yazdırma şablonundan canlı HTML üretimi (tek kaynak)
  const previewHtml = useMemo(() => {
    if (activeTab === "cashier") {
      return generateCashierReceiptHtml(sampleReceiptData, settings);
    } else {
      return generateKitchenReceiptHtml(sampleReceiptData, settings);
    }
  }, [activeTab, sampleReceiptData, settings]);

  // Ayar Güncelleme Yardımcıları
  const updateCashier = useCallback(
    <K extends keyof ReceiptSettings["cashier"]>(
      key: K,
      val: ReceiptSettings["cashier"][K]
    ) => {
      setSettings((prev) => ({
        ...prev,
        cashier: {
          ...prev.cashier,
          [key]: val,
        },
      }));
    },
    []
  );

  const updateCashierSection = useCallback(
    <
      S extends "layout" | "header" | "info" | "items" | "total" | "footer",
      F extends keyof ReceiptSettings["cashier"][S]
    >(
      section: S,
      field: F,
      val: ReceiptSettings["cashier"][S][F]
    ) => {
      setSettings((prev) => ({
        ...prev,
        cashier: {
          ...prev.cashier,
          [section]: {
            ...prev.cashier[section],
            [field]: val,
          },
        },
      }));
    },
    []
  );

  const updateKitchen = useCallback(
    <K extends keyof ReceiptSettings["kitchen"]>(
      key: K,
      val: ReceiptSettings["kitchen"][K]
    ) => {
      setSettings((prev) => ({
        ...prev,
        kitchen: {
          ...prev.kitchen,
          [key]: val,
        },
      }));
    },
    []
  );

  const updateKitchenSection = useCallback(
    <
      S extends "layout" | "header" | "info" | "items",
      F extends keyof ReceiptSettings["kitchen"][S]
    >(
      section: S,
      field: F,
      val: ReceiptSettings["kitchen"][S][F]
    ) => {
      setSettings((prev) => ({
        ...prev,
        kitchen: {
          ...prev.kitchen,
          [section]: {
            ...prev.kitchen[section],
            [field]: val,
          },
        },
      }));
    },
    []
  );

  // Kaydetme Fonksiyonu
  const handleSave = async () => {
    if (!staff?.restaurant_id) {
      setMessage({
        type: "error",
        text: "Oturum bilgisi bulunamadı. Lütfen tekrar giriş yapın.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    const res = await saveRestaurantReceiptSettings(staff.restaurant_id, settings);
    setSaving(false);

    if (res.success) {
      setInitialSettings(settings);
      setMessage({
        type: "success",
        text: "Fiş ayarları restoranınız için başarıyla kaydedildi.",
      });
    } else {
      setMessage({
        type: "error",
        text: `Ayarlar kaydedilemedi: ${res.error || "Bilinmeyen hata"}`,
      });
    }
  };

  // Varsayılana Dönme
  const handleReset = () => {
    if (
      !window.confirm(
        "Tüm fiş ayarlarını fabrika varsayılanlarına döndürmek istediğinize emin misiniz?"
      )
    ) {
      return;
    }
    if (activeTab === "cashier") {
      setSettings((prev) => ({
        ...prev,
        cashier: { ...DEFAULT_CASHIER_RECEIPT_SETTINGS },
      }));
    } else {
      setSettings((prev) => ({
        ...prev,
        kitchen: { ...DEFAULT_KITCHEN_RECEIPT_SETTINGS },
      }));
    }
    setMessage({
      type: "success",
      text: "Ayarlar varsayılan değerlere döndürüldü. Kaydetmek için 'Kaydet' butonuna basın.",
    });
  };

  // Test Fişi Yazdır (Kayıtlı veya anlık ayarlarla seçili yazıcıya basar)
  const handleTestPrint = async () => {
    setTesting(true);
    setMessage(null);

    try {
      const printerKey =
        activeTab === "cashier" ? "PRINTER_KASA" : "PRINTER_MUTFAK";
      const printerName =
        typeof window !== "undefined" ? localStorage.getItem(printerKey) : null;

      if (!printerName) {
        setMessage({
          type: "error",
          text: `Seçili ${
            activeTab === "cashier" ? "Kasa" : "Mutfak"
          } yazıcısı bulunamadı. Lütfen sol menüden 'Yazıcılar' sekmesine gidip bir yazıcı seçin.`,
        });
        setTesting(false);
        return;
      }

      const paperWidth =
        activeTab === "cashier"
          ? settings.cashier.paperWidthMm
          : settings.kitchen.paperWidthMm;
      await printReceiptHtml(printerName, previewHtml, {
        paperWidthMm: paperWidth,
      });

      setMessage({
        type: "success",
        text: `Test fişi "${printerName}" yazıcısına gönderildi.`,
      });
    } catch (err: any) {
      console.error("Test fişi yazdırma hatası:", err);
      setMessage({
        type: "error",
        text: `Yazdırma başarısız: ${err?.message || "Yazıcıya ulaşılamadı"}`,
      });
    } finally {
      setTesting(false);
    }
  };

  if (staffLoading || loading) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
        <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⏳</div>
        <div>Fiş ayarları yükleniyor...</div>
      </div>
    );
  }

  const currentPaperWidth =
    activeTab === "cashier"
      ? settings.cashier.paperWidthMm
      : settings.kitchen.paperWidthMm;

  // 80mm kağıt için ~302px (80 * 96 / 25.4 = 302.36px), 58mm için ~219px (58 * 96 / 25.4 = 219.21px)
  const paperContainerWidth = currentPaperWidth === 58 ? 219 : 302;
  const guidePx = Math.round(guideMarginMm * (96 / 25.4));

  return (
    <div
      style={{
        padding: "1.5rem",
        maxWidth: "1400px",
        margin: "0 auto",
        color: "#1e293b",
      }}
    >
      {/* Üst Başlık & Eylemler */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h1
              style={{
                fontSize: "1.75rem",
                fontWeight: 800,
                margin: 0,
                color: "#0f172a",
              }}
            >
              🧾 Fiş Ayarları
            </h1>
            {hasUnsavedChanges && (
              <span
                style={{
                  fontSize: "0.75rem",
                  background: "#fef3c7",
                  color: "#92400e",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "9999px",
                  fontWeight: 700,
                  border: "1px solid #fde68a",
                }}
              >
                Kaydedilmemiş Değişiklikler Var
              </span>
            )}
          </div>
          <p
            style={{
              margin: "0.35rem 0 0 0",
              color: "#64748b",
              fontSize: "0.9rem",
            }}
          >
            Restoranınız için kasa ve mutfak fişi yazı boyutlarını,
            kalınlıklarını, kenar boşluklarını ve içeriklerini özelleştirin.
          </p>
        </div>

        {/* Aksiyon Butonları */}
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          <button
            type="button"
            onClick={handleReset}
            style={{
              padding: "0.55rem 0.9rem",
              background: "#fff",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "#475569",
            }}
          >
            ↺ Varsayılana Dön
          </button>

          <button
            type="button"
            onClick={handleTestPrint}
            disabled={testing}
            style={{
              padding: "0.55rem 0.9rem",
              background: "#f1f5f9",
              border: "1px solid #94a3b8",
              borderRadius: "8px",
              cursor: testing ? "not-allowed" : "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "#1e293b",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <span>🖨️</span>
            <span>{testing ? "Yazdırılıyor..." : "Test Fişi Yazdır"}</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "0.55rem 1.2rem",
              background: "#059669",
              border: "none",
              borderRadius: "8px",
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: "0.85rem",
              fontWeight: 700,
              color: "#fff",
              boxShadow: "0 2px 4px rgba(5, 150, 105, 0.3)",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <span>💾</span>
            <span>{saving ? "Kaydediliyor..." : "Kaydet"}</span>
          </button>
        </div>
      </div>

      {/* Bildirim Alanı */}
      {message && (
        <div
          style={{
            marginBottom: "1.25rem",
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            background: message.type === "success" ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${
              message.type === "success" ? "#a7f3d0" : "#fecaca"
            }`,
            color: message.type === "success" ? "#065f46" : "#991b1b",
            fontSize: "0.88rem",
            fontWeight: 600,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "inherit",
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Sekme Seçici (Kasa Fişi vs Mutfak Fişi) */}
      <div
        style={{
          display: "flex",
          borderBottom: "2px solid #e2e8f0",
          marginBottom: "1.5rem",
          gap: "1rem",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("cashier")}
          style={{
            padding: "0.75rem 1.5rem",
            background: "none",
            border: "none",
            borderBottom:
              activeTab === "cashier"
                ? "3px solid #059669"
                : "3px solid transparent",
            color: activeTab === "cashier" ? "#059669" : "#64748b",
            fontWeight: activeTab === "cashier" ? 800 : 600,
            fontSize: "1rem",
            cursor: "pointer",
            marginBottom: "-2px",
            transition: "all 0.15s ease",
          }}
        >
          💰 Kasa Fişi (Müşteri)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("kitchen")}
          style={{
            padding: "0.75rem 1.5rem",
            background: "none",
            border: "none",
            borderBottom:
              activeTab === "kitchen"
                ? "3px solid #059669"
                : "3px solid transparent",
            color: activeTab === "kitchen" ? "#059669" : "#64748b",
            fontWeight: activeTab === "kitchen" ? 800 : 600,
            fontSize: "1rem",
            cursor: "pointer",
            marginBottom: "-2px",
            transition: "all 0.15s ease",
          }}
        >
          🍳 Mutfak Fişi
        </button>
      </div>

      {/* Ana Çift Kolonlu Yapı: Solda Form, Sağda Canlı Önizleme */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 420px",
          gap: "2rem",
          alignItems: "start",
        }}
      >
        {/* SOL: Ayar Formu */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "1.5rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          {activeTab === "cashier" ? (
            /* KASA FİŞİ FORMU */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.75rem",
              }}
            >
              {/* 1. Kağıt ve Yazı Tipi */}
              <section>
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    margin: "0 0 0.85rem 0",
                    color: "#0f172a",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "0.4rem",
                  }}
                >
                  1. Kağıt ve Yazı Tipi
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "#475569",
                        marginBottom: "0.3rem",
                      }}
                    >
                      Kağıt Genişliği
                    </label>
                    <select
                      value={settings.cashier.paperWidthMm}
                      onChange={(e) =>
                        updateCashier(
                          "paperWidthMm",
                          Number(e.target.value) as 80 | 58
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                      }}
                    >
                      <option value={80}>80 mm (Standart Geniş Rulo)</option>
                      <option value={58}>58 mm (Dar Termal Rulo)</option>
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "#475569",
                        marginBottom: "0.3rem",
                      }}
                    >
                      Yazı Tipi (Güvenli Liste)
                    </label>
                    <select
                      value={settings.cashier.fontFamily}
                      onChange={(e) =>
                        updateCashier(
                          "fontFamily",
                          e.target.value as SafeFontFamily
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                      }}
                    >
                      {SAFE_RECEIPT_FONTS.map((f) => (
                        <option key={f.id} value={f.value}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* 2. Kenar Boşlukları & Hizalama */}
              <section>
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    margin: "0 0 0.85rem 0",
                    color: "#0f172a",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "0.4rem",
                  }}
                >
                  2. Kenar Boşlukları & Hizalama
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.85rem",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "1rem",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: "0.3rem",
                        }}
                      >
                        Sol Boşluk ({settings.cashier.layout.paddingLeftMm} mm)
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={0.5}
                        value={settings.cashier.layout.paddingLeftMm}
                        onChange={(e) =>
                          updateCashierSection(
                            "layout",
                            "paddingLeftMm",
                            Number(e.target.value)
                          )
                        }
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: "0.3rem",
                        }}
                      >
                        Sağ Boşluk ({settings.cashier.layout.paddingRightMm} mm)
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={0.5}
                        value={settings.cashier.layout.paddingRightMm}
                        onChange={(e) =>
                          updateCashierSection(
                            "layout",
                            "paddingRightMm",
                            Number(e.target.value)
                          )
                        }
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>

                  {/* İçeriği Ortala */}
                  <div
                    style={{
                      background: "#f8fafc",
                      padding: "0.75rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.6rem",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.cashier.layout.centerContent}
                        onChange={(e) =>
                          updateCashierSection(
                            "layout",
                            "centerContent",
                            e.target.checked
                          )
                        }
                      />
                      <span>İçeriği Kağıtta Ortala (Simetrik Gövde Ortalama)</span>
                    </label>

                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.cashier.layout.autoContentWidth}
                        onChange={(e) =>
                          updateCashierSection(
                            "layout",
                            "autoContentWidth",
                            e.target.checked
                          )
                        }
                      />
                      <span>
                        Kağıt Genişliğine Otomatik Uyarla (
                        {settings.cashier.paperWidthMm === 58
                          ? "54 mm"
                          : "76 mm"}
                        )
                      </span>
                    </label>

                    {!settings.cashier.layout.autoContentWidth && (
                      <div style={{ marginTop: "0.3rem" }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            color: "#475569",
                            marginBottom: "0.2rem",
                          }}
                        >
                          Özel İçerik Genişliği (
                          {settings.cashier.layout.contentWidthMm} mm)
                        </label>
                        <input
                          type="range"
                          min={40}
                          max={settings.cashier.paperWidthMm}
                          value={settings.cashier.layout.contentWidthMm}
                          onChange={(e) =>
                            updateCashierSection(
                              "layout",
                              "contentWidthMm",
                              Number(e.target.value)
                            )
                          }
                          style={{ width: "100%" }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* 3. Başlık Bölümü */}
              <section>
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    margin: "0 0 0.85rem 0",
                    color: "#0f172a",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "0.4rem",
                  }}
                >
                  3. Başlık ve İşletme Bilgisi
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "#475569",
                        marginBottom: "0.3rem",
                      }}
                    >
                      İşletme / Fiş Başlığı (Boşsa restoran adı kullanılır)
                    </label>
                    <input
                      type="text"
                      maxLength={80}
                      value={settings.cashier.header.customTitle}
                      placeholder={branding?.display_name || "Örn: MERGEN POS"}
                      onChange={(e) =>
                        updateCashierSection(
                          "header",
                          "customTitle",
                          e.target.value
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "0.75rem",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: "0.3rem",
                        }}
                      >
                        Yazı Boyutu ({settings.cashier.header.fontSizePx}px)
                      </label>
                      <input
                        type="range"
                        min={10}
                        max={28}
                        value={settings.cashier.header.fontSizePx}
                        onChange={(e) =>
                          updateCashierSection(
                            "header",
                            "fontSizePx",
                            Number(e.target.value)
                          )
                        }
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: "0.3rem",
                        }}
                      >
                        Kalınlık
                      </label>
                      <select
                        value={settings.cashier.header.fontWeight}
                        onChange={(e) =>
                          updateCashierSection(
                            "header",
                            "fontWeight",
                            e.target.value as "normal" | "bold"
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "0.45rem",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                        }}
                      >
                        <option value="bold">Kalın (Bold)</option>
                        <option value="normal">Normal</option>
                      </select>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: "0.3rem",
                        }}
                      >
                        Hizalama
                      </label>
                      <select
                        value={settings.cashier.header.textAlign}
                        onChange={(e) =>
                          updateCashierSection(
                            "header",
                            "textAlign",
                            e.target.value as "left" | "center" | "right"
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "0.45rem",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                        }}
                      >
                        <option value="center">Orta</option>
                        <option value="left">Sol</option>
                        <option value="right">Sağ</option>
                      </select>
                    </div>
                  </div>

                  {/* Ek Satır (Adres / Telefon) */}
                  <div
                    style={{
                      background: "#f8fafc",
                      padding: "0.75rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.cashier.header.showExtraLine}
                        onChange={(e) =>
                          updateCashierSection(
                            "header",
                            "showExtraLine",
                            e.target.checked
                          )
                        }
                      />
                      <span>
                        Başlık Altına Ek Bilgi Satırı Ekle (Adres, Tel veya Vergi
                        No)
                      </span>
                    </label>
                    {settings.cashier.header.showExtraLine && (
                      <input
                        type="text"
                        maxLength={120}
                        placeholder="Örn: Tel: 0362 555 00 00 · Şube Adresi"
                        value={settings.cashier.header.extraLine}
                        onChange={(e) =>
                          updateCashierSection(
                            "header",
                            "extraLine",
                            e.target.value
                          )
                        }
                        style={{
                          width: "100%",
                          marginTop: "0.5rem",
                          padding: "0.45rem",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                        }}
                      />
                    )}
                  </div>

                  {/* Logo Gösterimi */}
                  <div
                    style={{
                      background: "#f8fafc",
                      padding: "0.75rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.cashier.header.showLogo}
                        onChange={(e) =>
                          updateCashierSection(
                            "header",
                            "showLogo",
                            e.target.checked
                          )
                        }
                      />
                      <span>
                        Restoran Logosunu Göster (Varsa fişin en üstünde yer
                        alır)
                      </span>
                    </label>
                  </div>
                </div>
              </section>

              {/* 4. Bilgi Satırları */}
              <section>
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    margin: "0 0 0.85rem 0",
                    color: "#0f172a",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "0.4rem",
                  }}
                >
                  4. Bilgi Satırları (Tarih, Fiş No, Kasiyer, Müşteri)
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "#475569",
                        marginBottom: "0.3rem",
                      }}
                    >
                      Yazı Boyutu ({settings.cashier.info.fontSizePx}px)
                    </label>
                    <input
                      type="range"
                      min={8}
                      max={18}
                      value={settings.cashier.info.fontSizePx}
                      onChange={(e) =>
                        updateCashierSection(
                          "info",
                          "fontSizePx",
                          Number(e.target.value)
                        )
                      }
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "#475569",
                        marginBottom: "0.3rem",
                      }}
                    >
                      Satır Aralığı ({settings.cashier.info.lineHeight})
                    </label>
                    <input
                      type="range"
                      min={1.1}
                      max={2.0}
                      step={0.05}
                      value={settings.cashier.info.lineHeight}
                      onChange={(e) =>
                        updateCashierSection(
                          "info",
                          "lineHeight",
                          Number(e.target.value)
                        )
                      }
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>
              </section>

              {/* 5. Kalem Listesi */}
              <section>
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    margin: "0 0 0.85rem 0",
                    color: "#0f172a",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "0.4rem",
                  }}
                >
                  5. Ürün Listesi Tablosu
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "#475569",
                        marginBottom: "0.3rem",
                      }}
                    >
                      Yazı Boyutu ({settings.cashier.items.fontSizePx}px)
                    </label>
                    <input
                      type="range"
                      min={8}
                      max={20}
                      value={settings.cashier.items.fontSizePx}
                      onChange={(e) =>
                        updateCashierSection(
                          "items",
                          "fontSizePx",
                          Number(e.target.value)
                        )
                      }
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "#475569",
                        marginBottom: "0.3rem",
                      }}
                    >
                      Satır Aralığı ({settings.cashier.items.lineHeight})
                    </label>
                    <input
                      type="range"
                      min={1.1}
                      max={2.0}
                      step={0.05}
                      value={settings.cashier.items.lineHeight}
                      onChange={(e) =>
                        updateCashierSection(
                          "items",
                          "lineHeight",
                          Number(e.target.value)
                        )
                      }
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>
                <div style={{ marginTop: "0.75rem" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={settings.cashier.items.showNotes}
                      onChange={(e) =>
                        updateCashierSection(
                          "items",
                          "showNotes",
                          e.target.checked
                        )
                      }
                    />
                    <span>
                      Kalem Notlarını Göster (Varsa ürün altına eklenen notlar)
                    </span>
                  </label>
                </div>
              </section>

              {/* 6. Toplam & Ödeme */}
              <section>
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    margin: "0 0 0.85rem 0",
                    color: "#0f172a",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "0.4rem",
                  }}
                >
                  6. Toplam & Ödeme Bölümü
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "#475569",
                        marginBottom: "0.3rem",
                      }}
                    >
                      Toplam Yazı Boyutu ({settings.cashier.total.fontSizePx}px)
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={26}
                      value={settings.cashier.total.fontSizePx}
                      onChange={(e) =>
                        updateCashierSection(
                          "total",
                          "fontSizePx",
                          Number(e.target.value)
                        )
                      }
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "#475569",
                        marginBottom: "0.3rem",
                      }}
                    >
                      Kalınlık
                    </label>
                    <select
                      value={settings.cashier.total.fontWeight}
                      onChange={(e) =>
                        updateCashierSection(
                          "total",
                          "fontWeight",
                          e.target.value as "normal" | "bold"
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "0.45rem",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                      }}
                    >
                      <option value="bold">Kalın (Bold)</option>
                      <option value="normal">Normal</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* 7. Alt Bilgi */}
              <section>
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    margin: "0 0 0.85rem 0",
                    color: "#0f172a",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "0.4rem",
                  }}
                >
                  7. Alt Bilgi & Teşekkür
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "#475569",
                        marginBottom: "0.3rem",
                      }}
                    >
                      Teşekkür / Alt Mesaj
                    </label>
                    <input
                      type="text"
                      maxLength={100}
                      value={settings.cashier.footer.complimentText}
                      placeholder="Afiyet Olsun."
                      onChange={(e) =>
                        updateCashierSection(
                          "footer",
                          "complimentText",
                          e.target.value
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "0.75rem",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: "0.3rem",
                        }}
                      >
                        Yazı Boyutu ({settings.cashier.footer.fontSizePx}px)
                      </label>
                      <input
                        type="range"
                        min={9}
                        max={22}
                        value={settings.cashier.footer.fontSizePx}
                        onChange={(e) =>
                          updateCashierSection(
                            "footer",
                            "fontSizePx",
                            Number(e.target.value)
                          )
                        }
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: "0.3rem",
                        }}
                      >
                        Kalınlık
                      </label>
                      <select
                        value={settings.cashier.footer.fontWeight}
                        onChange={(e) =>
                          updateCashierSection(
                            "footer",
                            "fontWeight",
                            e.target.value as "normal" | "bold"
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "0.45rem",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                        }}
                      >
                        <option value="bold">Kalın (Bold)</option>
                        <option value="normal">Normal</option>
                      </select>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: "0.3rem",
                        }}
                      >
                        Hizalama
                      </label>
                      <select
                        value={settings.cashier.footer.textAlign}
                        onChange={(e) =>
                          updateCashierSection(
                            "footer",
                            "textAlign",
                            e.target.value as "left" | "center" | "right"
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "0.45rem",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                        }}
                      >
                        <option value="center">Orta</option>
                        <option value="left">Sol</option>
                        <option value="right">Sağ</option>
                      </select>
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "#64748b",
                      background: "#f8fafc",
                      padding: "0.6rem 0.75rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    ℹ️ <strong>MERGEN TEKNOLOJİ</strong> marka satırı sistem
                    standardı olarak fişin en altında sabit olarak gösterilir.
                  </div>
                </div>
              </section>
            </div>
          ) : (
            /* MUTFAK FİŞİ FORMU */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.75rem",
              }}
            >
              {/* 1. Kağıt ve Yazı Tipi */}
              <section>
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    margin: "0 0 0.85rem 0",
                    color: "#0f172a",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "0.4rem",
                  }}
                >
                  1. Kağıt ve Yazı Tipi
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "#475569",
                        marginBottom: "0.3rem",
                      }}
                    >
                      Kağıt Genişliği
                    </label>
                    <select
                      value={settings.kitchen.paperWidthMm}
                      onChange={(e) =>
                        updateKitchen(
                          "paperWidthMm",
                          Number(e.target.value) as 80 | 58
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                      }}
                    >
                      <option value={80}>80 mm (Standart Geniş Rulo)</option>
                      <option value={58}>58 mm (Dar Termal Rulo)</option>
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "#475569",
                        marginBottom: "0.3rem",
                      }}
                    >
                      Yazı Tipi (Güvenli Liste)
                    </label>
                    <select
                      value={settings.kitchen.fontFamily}
                      onChange={(e) =>
                        updateKitchen(
                          "fontFamily",
                          e.target.value as SafeFontFamily
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                      }}
                    >
                      {SAFE_RECEIPT_FONTS.map((f) => (
                        <option key={f.id} value={f.value}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* 2. Kenar Boşlukları & Hizalama */}
              <section>
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    margin: "0 0 0.85rem 0",
                    color: "#0f172a",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "0.4rem",
                  }}
                >
                  2. Kenar Boşlukları & Hizalama
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.85rem",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "1rem",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: "0.3rem",
                        }}
                      >
                        Sol Boşluk ({settings.kitchen.layout.paddingLeftMm} mm)
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={0.5}
                        value={settings.kitchen.layout.paddingLeftMm}
                        onChange={(e) =>
                          updateKitchenSection(
                            "layout",
                            "paddingLeftMm",
                            Number(e.target.value)
                          )
                        }
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: "0.3rem",
                        }}
                      >
                        Sağ Boşluk ({settings.kitchen.layout.paddingRightMm} mm)
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={0.5}
                        value={settings.kitchen.layout.paddingRightMm}
                        onChange={(e) =>
                          updateKitchenSection(
                            "layout",
                            "paddingRightMm",
                            Number(e.target.value)
                          )
                        }
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>

                  {/* İçeriği Ortala */}
                  <div
                    style={{
                      background: "#f8fafc",
                      padding: "0.75rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.6rem",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.kitchen.layout.centerContent}
                        onChange={(e) =>
                          updateKitchenSection(
                            "layout",
                            "centerContent",
                            e.target.checked
                          )
                        }
                      />
                      <span>İçeriği Kağıtta Ortala (Simetrik Gövde Ortalama)</span>
                    </label>

                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.kitchen.layout.autoContentWidth}
                        onChange={(e) =>
                          updateKitchenSection(
                            "layout",
                            "autoContentWidth",
                            e.target.checked
                          )
                        }
                      />
                      <span>
                        Kağıt Genişliğine Otomatik Uyarla (
                        {settings.kitchen.paperWidthMm === 58
                          ? "54 mm"
                          : "76 mm"}
                        )
                      </span>
                    </label>

                    {!settings.kitchen.layout.autoContentWidth && (
                      <div style={{ marginTop: "0.3rem" }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            color: "#475569",
                            marginBottom: "0.2rem",
                          }}
                        >
                          Özel İçerik Genişliği (
                          {settings.kitchen.layout.contentWidthMm} mm)
                        </label>
                        <input
                          type="range"
                          min={40}
                          max={settings.kitchen.paperWidthMm}
                          value={settings.kitchen.layout.contentWidthMm}
                          onChange={(e) =>
                            updateKitchenSection(
                              "layout",
                              "contentWidthMm",
                              Number(e.target.value)
                            )
                          }
                          style={{ width: "100%" }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* 3. Başlık & Sipariş Kanalı */}
              <section>
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    margin: "0 0 0.85rem 0",
                    color: "#0f172a",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "0.4rem",
                  }}
                >
                  3. Başlık & Sipariş Tipi (Kanal)
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "#475569",
                        marginBottom: "0.3rem",
                      }}
                    >
                      Özel Başlık (Boş bırakılırsa sipariş tipi örn: GEL AL,
                      PAKET kullanılır)
                    </label>
                    <input
                      type="text"
                      maxLength={60}
                      value={settings.kitchen.header.customTitle}
                      placeholder="Örn: MUTFAK SİPARİŞİ"
                      onChange={(e) =>
                        updateKitchenSection(
                          "header",
                          "customTitle",
                          e.target.value
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "0.75rem",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: "0.3rem",
                        }}
                      >
                        Başlık Boyutu ({settings.kitchen.header.fontSizePx}px)
                      </label>
                      <input
                        type="range"
                        min={14}
                        max={36}
                        value={settings.kitchen.header.fontSizePx}
                        onChange={(e) =>
                          updateKitchenSection(
                            "header",
                            "fontSizePx",
                            Number(e.target.value)
                          )
                        }
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: "0.3rem",
                        }}
                      >
                        Kalınlık
                      </label>
                      <select
                        value={settings.kitchen.header.fontWeight}
                        onChange={(e) =>
                          updateKitchenSection(
                            "header",
                            "fontWeight",
                            e.target.value as "normal" | "bold"
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "0.45rem",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                        }}
                      >
                        <option value="bold">Kalın (Bold)</option>
                        <option value="normal">Normal</option>
                      </select>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: "0.3rem",
                        }}
                      >
                        Hizalama
                      </label>
                      <select
                        value={settings.kitchen.header.textAlign}
                        onChange={(e) =>
                          updateKitchenSection(
                            "header",
                            "textAlign",
                            e.target.value as "left" | "center" | "right"
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "0.45rem",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                        }}
                      >
                        <option value="center">Orta</option>
                        <option value="left">Sol</option>
                        <option value="right">Sağ</option>
                      </select>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      background: "#f8fafc",
                      padding: "0.75rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.kitchen.header.showOrderChannel}
                        onChange={(e) =>
                          updateKitchenSection(
                            "header",
                            "showOrderChannel",
                            e.target.checked
                          )
                        }
                      />
                      <span>Sipariş Tipi Kutusunu Göster (GEL AL / PAKET vb.)</span>
                    </label>

                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.kitchen.header.showOrderNumber}
                        onChange={(e) =>
                          updateKitchenSection(
                            "header",
                            "showOrderNumber",
                            e.target.checked
                          )
                        }
                      />
                      <span>Büyük Sipariş Numarasını Göster</span>
                    </label>

                    {settings.kitchen.header.showOrderNumber && (
                      <div style={{ marginTop: "0.4rem" }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            color: "#475569",
                            marginBottom: "0.2rem",
                          }}
                        >
                          Sipariş No Boyutu (
                          {settings.kitchen.header.orderNumberFontSizePx}px)
                        </label>
                        <input
                          type="range"
                          min={16}
                          max={40}
                          value={settings.kitchen.header.orderNumberFontSizePx}
                          onChange={(e) =>
                            updateKitchenSection(
                              "header",
                              "orderNumberFontSizePx",
                              Number(e.target.value)
                            )
                          }
                          style={{ width: "100%" }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* 4. Bilgi Satırları */}
              <section>
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    margin: "0 0 0.85rem 0",
                    color: "#0f172a",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "0.4rem",
                  }}
                >
                  4. Bilgi Satırları
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "#475569",
                        marginBottom: "0.3rem",
                      }}
                    >
                      Tarih Yazı Boyutu ({settings.kitchen.info.fontSizePx}px)
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={22}
                      value={settings.kitchen.info.fontSizePx}
                      onChange={(e) =>
                        updateKitchenSection(
                          "info",
                          "fontSizePx",
                          Number(e.target.value)
                        )
                      }
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      paddingTop: "1.2rem",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.kitchen.info.showDate}
                        onChange={(e) =>
                          updateKitchenSection(
                            "info",
                            "showDate",
                            e.target.checked
                          )
                        }
                      />
                      <span>Tarih Satırını Göster</span>
                    </label>
                  </div>
                </div>
              </section>

              {/* 5. Kalemler Bölümü (Ayrı Büyütme) */}
              <section>
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    margin: "0 0 0.85rem 0",
                    color: "#0f172a",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "0.4rem",
                  }}
                >
                  5. Kalemler ve Notlar (Mutfak İçin Özel)
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.85rem",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "1rem",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: "0.3rem",
                        }}
                      >
                        Kalem Adı Boyutu (
                        {settings.kitchen.items.itemNameFontSizePx}px)
                      </label>
                      <input
                        type="range"
                        min={12}
                        max={32}
                        value={settings.kitchen.items.itemNameFontSizePx}
                        onChange={(e) =>
                          updateKitchenSection(
                            "items",
                            "itemNameFontSizePx",
                            Number(e.target.value)
                          )
                        }
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: "0.3rem",
                        }}
                      >
                        Kalem Adı Kalınlığı
                      </label>
                      <select
                        value={settings.kitchen.items.itemNameFontWeight}
                        onChange={(e) =>
                          updateKitchenSection(
                            "items",
                            "itemNameFontWeight",
                            e.target.value as "normal" | "bold"
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "0.45rem",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                        }}
                      >
                        <option value="bold">Kalın (Bold)</option>
                        <option value="normal">Normal</option>
                      </select>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#f8fafc",
                      padding: "0.75rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.kitchen.items.showNotes}
                        onChange={(e) =>
                          updateKitchenSection(
                            "items",
                            "showNotes",
                            e.target.checked
                          )
                        }
                      />
                      <span>Ürün Notlarını Çerçeveli Göster</span>
                    </label>

                    {settings.kitchen.items.showNotes && (
                      <div style={{ marginTop: "0.5rem" }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            color: "#475569",
                            marginBottom: "0.2rem",
                          }}
                        >
                          Not Yazı Boyutu (
                          {settings.kitchen.items.noteFontSizePx}px)
                        </label>
                        <input
                          type="range"
                          min={10}
                          max={26}
                          value={settings.kitchen.items.noteFontSizePx}
                          onChange={(e) =>
                            updateKitchenSection(
                              "items",
                              "noteFontSizePx",
                              Number(e.target.value)
                            )
                          }
                          style={{ width: "100%" }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        {/* SAĞ: Canlı Önizleme Alanı */}
        <div style={{ position: "sticky", top: "1.5rem" }}>
          {/* Önizleme Kontrolleri */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <span
              style={{
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "#475569",
              }}
            >
              👁️ Canlı Kağıt Önizlemesi ({currentPaperWidth}mm / {paperContainerWidth}px)
            </span>
            {activeTab === "cashier" && (
              <div
                style={{
                  display: "flex",
                  background: "#e2e8f0",
                  padding: "2px",
                  borderRadius: "6px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setSampleMode("gel_al")}
                  style={{
                    padding: "0.25rem 0.55rem",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    background:
                      sampleMode === "gel_al" ? "#fff" : "transparent",
                    color: sampleMode === "gel_al" ? "#0f172a" : "#64748b",
                    boxShadow:
                      sampleMode === "gel_al"
                        ? "0 1px 2px rgba(0,0,0,0.1)"
                        : "none",
                  }}
                >
                  Gel Al
                </button>
                <button
                  type="button"
                  onClick={() => setSampleMode("paket")}
                  style={{
                    padding: "0.25rem 0.55rem",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: sampleMode === "paket" ? "#fff" : "transparent",
                    color: sampleMode === "paket" ? "#0f172a" : "#64748b",
                    boxShadow:
                      sampleMode === "paket"
                        ? "0 1px 2px rgba(0,0,0,0.1)"
                        : "none",
                  }}
                >
                  Paket (Adresli)
                </button>
              </div>
            )}
          </div>

          {/* Kılavuz Kontrol Çubuğu */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#f8fafc",
              padding: "0.45rem 0.75rem",
              borderRadius: "6px",
              border: "1px solid #e2e8f0",
              marginBottom: "0.6rem",
              fontSize: "0.8rem",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                cursor: "pointer",
                fontWeight: 600,
                color: "#334155",
              }}
            >
              <input
                type="checkbox"
                checked={showGuide}
                onChange={(e) => setShowGuide(e.target.checked)}
              />
              <span>Yazdırılabilir Alan Kılavuzu</span>
            </label>
            {showGuide && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                  Kenardan:
                </span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={guideMarginMm}
                  onChange={(e) =>
                    setGuideMarginMm(
                      Math.max(1, Math.min(10, Number(e.target.value) || 4))
                    )
                  }
                  style={{
                    width: "45px",
                    padding: "0.15rem 0.3rem",
                    borderRadius: "4px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.75rem",
                    textAlign: "center",
                  }}
                />
                <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                  mm
                </span>
              </div>
            )}
          </div>

          {/* Rulo Kağıt Çerçevesi */}
          <div
            style={{
              background: "#64748b",
              padding: "1rem",
              borderRadius: "12px",
              boxShadow: "inset 0 2px 6px rgba(0,0,0,0.25)",
              display: "flex",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "relative",
                width: `${paperContainerWidth}px`,
                background: "#fff",
                boxShadow: "0 10px 25px -5px rgba(0,0,0,0.35)",
                borderRadius: "3px",
                overflow: "hidden",
                borderBottom: "4px dashed #cbd5e1",
                transition: "width 0.2s ease",
              }}
            >
              {/* Kılavuz Çizgileri (Yalnızca Önizlemede, HTML içine ASLA girmez) */}
              {showGuide && (
                <>
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: `${guidePx}px`,
                      width: "1px",
                      borderLeft: "1.5px dashed #3b82f6",
                      zIndex: 10,
                      pointerEvents: "none",
                    }}
                    title={`${guideMarginMm}mm Sol Yazdırılabilir Sınır`}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      right: `${guidePx}px`,
                      width: "1px",
                      borderRight: "1.5px dashed #3b82f6",
                      zIndex: 10,
                      pointerEvents: "none",
                    }}
                    title={`${guideMarginMm}mm Sağ Yazdırılabilir Sınır`}
                  />
                </>
              )}

              <iframe
                title="Fiş Önizleme"
                srcDoc={previewHtml}
                style={{
                  width: "100%",
                  height: "560px",
                  border: "none",
                  display: "block",
                  background: "#fff",
                }}
              />
            </div>
          </div>

          <div
            style={{
              textAlign: "center",
              fontSize: "0.75rem",
              color: "#64748b",
              marginTop: "0.5rem",
            }}
          >
            * Bu önizleme, gerçek yazıcı çıktısıyla birebir aynı HTML şablon
            motorunu kullanır.
          </div>
        </div>
      </div>
    </div>
  );
}
