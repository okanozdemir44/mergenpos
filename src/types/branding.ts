export type RestaurantBranding = {
  restaurant_id: string;
  display_name: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  receipt_header: string;
  receipt_footer: string;
};

export const DEFAULT_BRANDING: RestaurantBranding = {
  restaurant_id: "",
  display_name: "Mergen POS",
  logo_url: "/logo.png",
  primary_color: "#059669",
  secondary_color: "#047857",
  receipt_header: "MERGEN POS",
  receipt_footer: "Afiyet Olsun.",
};

export const OKUZ_BURGER_BRANDING: RestaurantBranding = {
  restaurant_id: "8c3d0702-06fd-43f1-809a-062153bf7486",
  display_name: "Öküz Burger",
  logo_url: "/brands/okuz-burger.png",
  primary_color: "#f59e0b",
  secondary_color: "#d97706",
  receipt_header: "SAMSUN / ÖKÜZ BURGER",
  receipt_footer: "Afiyet Olsun.",
};

export const IKRAM_DONER_BRANDING: RestaurantBranding = {
  restaurant_id: "1162c5da-b712-404b-85af-c47642ad2f55",
  display_name: "İkram Döner",
  logo_url: "/brands/ikram-doner.png",
  primary_color: "#dc2626",
  secondary_color: "#991b1b",
  receipt_header: "İkram Döner",
  receipt_footer: "Bizi Tercih Ettiğiniz İçin Teşekkür Ederiz.",
};
