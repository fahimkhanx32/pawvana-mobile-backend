require("node:dns").setServers(["1.1.1.1", "8.8.8.8"]); // helps mongodb+srv:// lookups on some networks
const settings = require("./config/settings"); // loads .env
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("node:path");
const fs = require("node:fs");
const rateLimit = require("express-rate-limit");

const dbConfig = require("./config/dbConfig");
const { protect } = require("./middleware/secureMiddleWare");
const {
  registrationController,
  loginController,
  forgotPasswordController,
  resetPasswordController,
  resendVerificationEmailController,
  verifyEmailController,
} = require("./controllers/authenticationController");
const {
  getAllUsersController,
  singleUserDataController,
  deleteUserController,
  updateUserController,
  getAllDeleteUsersController,
  getSearchData,
} = require("./controllers/userController");
const {
  createProductController,
  getAllProductsController,
  getSingleProductController,
  deleteProductController,
  updateProductController,
  createCategory,
  getCategory,
  bulkCreateProductController,
  getSingleBySlugProductController,
} = require("./controllers/productController");
const { createCart, increDecre, getCart, proDelete } = require("./controllers/cartController");
const { paymentController, getAllOrdersController, paymentReturn } = require("./controllers/paymentController");

const app = express();
const { STAFF_ROLES, APP_SCHEME, BRAND } = settings;
const staff = protect(...STAFF_ROLES);
const adminOnly = protect("admin");
const loggedIn = protect();

// ---------- uploads ----------
const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "./uploads"),
  filename: (req, file, cb) => {
    const safe = path.basename(file.originalname).replace(/[^\w.-]+/g, "_");
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safe}`);
  },
});
const limits = { fileSize: 10 * 1024 * 1024 };
const imageUpload = multer({
  storage,
  limits,
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype) || /\.(jpe?g|png|gif|webp|heic|jfif)$/i.test(file.originalname)),
});
const sheetUpload = multer({ storage, limits });

// ---------- middleware ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // aamarPay posts form data back to /payment/*
app.use(cors());
app.use("/uploads", express.static(uploadsDir));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false });

dbConfig();

app.get("/", (req, res) => res.json({ ok: true, name: `${BRAND} API` })); // open on the phone's browser to test connectivity

// ---------- auth ----------
app.post("/registration", authLimiter, registrationController);
app.post("/login", authLimiter, loginController);
app.post("/forgotpassword", authLimiter, forgotPasswordController);
app.post("/resetpassword/:token", authLimiter, resetPasswordController);
app.post("/resendverificationemail", authLimiter, resendVerificationEmailController);
app.post("/verifyemail/:token", authLimiter, verifyEmailController);

// Email buttons open https links; this page then hands the token to the app via pawvana://…
const openInApp = (kind) => (req, res) => {
  const link = `${APP_SCHEME}://${kind}/${encodeURIComponent(req.params.token)}`;
  res.type("html").send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=${link}"><title>${BRAND}</title>
<body style="font-family:Arial,sans-serif;text-align:center;padding:48px 20px;color:#222">
<h2>Opening ${BRAND}…</h2><p>If nothing happens, tap the button.</p>
<p><a href="${link}" style="background:#0E7C6B;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block">Open the app</a></p></body>`);
};
app.get("/open/verifyemail/:token", openInApp("verifyemail"));
app.get("/open/resetpassword/:token", openInApp("resetpassword"));

// ---------- catalog ----------
app.post("/createproduct", staff, imageUpload.array("images", 5), createProductController);
app.post("/bulk/createproduct", staff, sheetUpload.single("file"), bulkCreateProductController);
app.get("/get-all-products", getAllProductsController);
app.get("/get-single-product/:id", getSingleProductController);
app.get("/get-single-slug-product/:slug", getSingleBySlugProductController);
app.delete("/delete-product/:id", staff, deleteProductController);
app.put("/update-product/:id", staff, imageUpload.array("images", 5), updateProductController);
app.post("/category", staff, createCategory);
app.get("/getcategory", getCategory);

// ---------- cart ----------
app.post("/cart/create", loggedIn, createCart);
app.post("/cart/update/:id", loggedIn, increDecre);
app.get("/cart/:userId", loggedIn, getCart);
app.delete("/cart/:id", loggedIn, proDelete);

// ---------- orders & payment ----------
app.post("/payment", loggedIn, paymentController);
app.get("/getorders/:userid", loggedIn, getAllOrdersController);
// aamarPay return URLs (the customer's browser is sent here by the gateway)
app.all("/payment/success", paymentReturn("success"));
app.all("/payment/fail", paymentReturn("fail"));
app.all("/payment/cancel", paymentReturn("cancel"));
// the app's WebView intercepts this URL; the page is only a fallback for a normal browser
app.get("/order-success", (req, res) =>
  res.type("html").send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${BRAND}</title><body style="font-family:Arial,sans-serif;text-align:center;padding:48px 20px"><h2>Payment ${String(req.query.pay_status || "processed").replace(/[^\w-]/g, "")}</h2><p>You can return to the ${BRAND} app.</p></body>`),
);

// ---------- users ----------
app.get("/allusers", adminOnly, getAllUsersController);
app.get("/alldeleteusers", adminOnly, getAllDeleteUsersController);
app.post("/search", adminOnly, getSearchData);
app.get("/singleuser/:id", loggedIn, singleUserDataController);
app.delete("/deleteuser/:id", adminOnly, deleteUserController);
app.post("/update/:id", loggedIn, updateUserController);

// ---------- errors ----------
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError) return res.status(400).json({ success: false, message: err.message });
  console.error(err);
  res.status(500).json({ success: false, message: "Something went wrong on the server" });
});

app.listen(settings.PORT, "0.0.0.0", () => {
  console.log(`${BRAND} API running on port ${settings.PORT}`);
  if (!settings.ENFORCE_AUTH) console.log("ENFORCE_AUTH=false: routes are open (needed by the current app). See README.");
});
