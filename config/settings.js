require("dotenv").config();

const port = Number(process.env.PORT) || 5000;

module.exports = {
  PORT: port,
  // How the phone reaches this server (used for payment return + email links).
  PUBLIC_API_URL: (process.env.PUBLIC_API_URL || `http://localhost:${port}`).replace(/\/$/, ""),
  APP_SCHEME: process.env.APP_SCHEME || "pawvana",
  BRAND: "Pawvana",
  // Delivery fees the app can send. Keep in sync with shippingOptions in the app's src/config/brand.js.
  SHIPPING_FEES: [60, 120],
  ENFORCE_AUTH: String(process.env.ENFORCE_AUTH).toLowerCase() === "true",
  STAFF_ROLES: ["admin", "editor", "vendor"],
  AAMARPAY: {
    storeId: process.env.AAMARPAY_STORE_ID || "aamarpaytest",
    signatureKey: process.env.AAMARPAY_SIGNATURE_KEY || "dbb74894e82415a2f7ff0ec3a97e4183",
    baseUrl: (process.env.AAMARPAY_BASE_URL || "https://sandbox.aamarpay.com").replace(/\/$/, ""),
  },
};
