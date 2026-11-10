const axios = require("axios");
const Cart = require("../models/cartModel");
const Order = require("../models/orderModel");
const Product = require("../models/productModel");
const User = require("../models/userModel");
const { canAccess } = require("../middleware/secureMiddleWare");
const { PUBLIC_API_URL, SHIPPING_FEES, AAMARPAY } = require("../config/settings");
const { isId } = require("../utils/validation");
const { unitPrice, round2 } = require("../utils/pricing");

const fail = (res, message, status = 400) => res.status(status).json({ success: false, message });
const clean = (v, fallback = "") => (v === undefined || v === null || String(v).trim() === "" ? fallback : String(v).trim());

// ---------------------------------------------------------------------------------------------
// POST /payment  — the app sends { userId, cus_*, shipping }. Prices come from the DATABASE
// (discounts applied), never from the client; only the delivery fee is chosen by the app.
// ---------------------------------------------------------------------------------------------
const paymentController = async (req, res) => {
  const { userId, cus_name, cus_email, cus_add1, cus_add2, cus_city, cus_state, cus_postcode, cus_phone } = req.body;
  try {
    if (!isId(userId)) return fail(res, "Invalid user");
    if (!canAccess(req, userId)) return fail(res, "Unauthorized", 403);
    const user = await User.findById(userId).select("isHold isDelete");
    if (!user || user.isDelete) return fail(res, "User not found");
    if (user.isHold) return fail(res, "This account is on hold. Please contact support.", 403);

    const shippingFee = Number(req.body.shipping);
    if (!SHIPPING_FEES.includes(shippingFee)) return fail(res, "Invalid delivery option");

    const cart = (await Cart.find({ user: userId }).populate("product")).filter((i) => i.product);
    if (!cart.length) return fail(res, "Your cart is empty");

    const lines = [];
    for (const item of cart) {
      const p = item.product;
      if (p.status !== "active") return fail(res, `${p.title} is no longer available`);
      if (item.quantity > Number(p.stock || 0)) {
        return fail(res, p.stock > 0 ? `Only ${p.stock} of ${p.title} left in stock` : `${p.title} is out of stock`);
      }
      const price = unitPrice(p);
      lines.push({
        product: p._id,
        title: p.title,
        price,
        originalPrice: p.price,
        sku: p.sku,
        quantity: item.quantity,
        totalPrice: round2(price * item.quantity),
      });
    }
    const subtotal = round2(lines.reduce((s, l) => s + l.totalPrice, 0));
    const totalPrice = round2(subtotal + shippingFee);
    const tranid = `${Date.now()}${Math.floor(100 + Math.random() * 900)}`;

    const payload = {
      store_id: AAMARPAY.storeId,
      tran_id: tranid,
      // the backend receives the gateway's redirect, records the result, then bounces the app's WebView to /order-success
      success_url: `${PUBLIC_API_URL}/payment/success`,
      fail_url: `${PUBLIC_API_URL}/payment/fail`,
      cancel_url: `${PUBLIC_API_URL}/payment/cancel`,
      amount: totalPrice.toFixed(2),
      currency: "BDT",
      signature_key: AAMARPAY.signatureKey,
      desc: "Pawvana order",
      cus_name: clean(cus_name, "Customer"),
      cus_email: clean(cus_email, "na@example.com"),
      cus_add1: clean(cus_add1, "N/A"),
      cus_add2: clean(cus_add2, "N/A"),
      cus_city: clean(cus_city, "Dhaka"),
      cus_state: clean(cus_state, "Dhaka"),
      cus_postcode: clean(cus_postcode, "1200"),
      cus_country: "Bangladesh",
      cus_phone: clean(cus_phone, "01700000000"),
      type: "json",
    };

    const response = await axios.post(`${AAMARPAY.baseUrl}/jsonpost.php`, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 20000,
    });
    if (!response.data?.payment_url) {
      console.error("aamarPay did not return a payment_url:", response.data);
      return fail(res, "The payment gateway did not return a payment link. Please try again.", 502);
    }

    await new Order({
      user: userId,
      products: lines,
      subtotal,
      shipping: shippingFee,
      totalPrice,
      tranid,
      customer: {
        name: payload.cus_name,
        email: payload.cus_email,
        phone: payload.cus_phone,
        address: [payload.cus_add1, payload.cus_add2 !== "N/A" ? payload.cus_add2 : ""].filter(Boolean).join(", "),
        city: payload.cus_city,
        state: payload.cus_state,
        postcode: payload.cus_postcode,
      },
    }).save();

    res.json(response.data); // { result, payment_url }
  } catch (error) {
    console.error("AamarPay Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, message: "Could not start the payment. Please try again.", error: error.response?.data || error.message });
  }
};

// ---------------------------------------------------------------------------------------------
// Confirming a payment with the gateway (never trust the browser redirect alone)
// ---------------------------------------------------------------------------------------------
const askGateway = async (tranid) => {
  const { data } = await axios.get(`${AAMARPAY.baseUrl}/api/v1/trxcheck/request.php`, {
    params: { request_id: tranid, store_id: AAMARPAY.storeId, signature_key: AAMARPAY.signatureKey, type: "json" },
    timeout: 15000,
  });
  return data || {};
};

/** Takes an order from pending to approved: records it, reduces stock and empties the cart — once only. */
const approve = async (order) => {
  const won = await Order.findOneAndUpdate({ _id: order._id, status: "pending" }, { status: "approved", paidAt: new Date() }, { new: true });
  if (!won) return; // another request already handled it
  await Promise.all(
    order.products
      .filter((l) => l.product)
      .map((l) => Product.updateOne({ _id: l.product }, [{ $set: { stock: { $max: [0, { $subtract: ["$stock", l.quantity] }] } } }])),
  );
  await Cart.deleteMany({ user: order.user });
};

/** Returns the order's status after asking aamarPay: "approved" | "reject" | "pending". */
const reconcile = async (order) => {
  if (order.status !== "pending") return order.status;
  try {
    const r = await askGateway(order.tranid);
    const state = String(r.pay_status || "").toLowerCase();
    if (state === "successful") {
      const paid = Number(r.amount_original ?? r.amount ?? order.totalPrice);
      if (Math.abs(paid - order.totalPrice) > 1) {
        console.error(`Order ${order.tranid}: paid ${paid} but expected ${order.totalPrice}`);
        return "pending"; // amount mismatch: needs a human look, never auto-approve
      }
      await approve(order);
      return "approved";
    }
    if (state === "failed" || state === "cancelled" || state === "canceled") {
      await Order.updateOne({ _id: order._id, status: "pending" }, { status: "reject" });
      return "reject";
    }
  } catch (err) {
    console.error(`Could not confirm order ${order.tranid} with the gateway:`, err.message);
  }
  return "pending";
};

// aamarPay sends the customer's browser here (POST, sometimes GET). We record the result and
// redirect to /order-success?pay_status=… which the app's WebView intercepts.
const paymentReturn = (kind) => async (req, res) => {
  const tranid = String(req.body?.mer_txnid || req.query?.mer_txnid || req.body?.tran_id || req.query?.tran_id || "");
  let result = "failed";
  try {
    const order = tranid ? await Order.findOne({ tranid }) : null;
    if (order) {
      if (kind === "cancel") {
        await Order.updateOne({ _id: order._id, status: "pending" }, { status: "reject" });
        result = "cancelled";
      } else {
        const status = await reconcile(order);
        result = status === "approved" ? "success" : status === "pending" ? "pending" : "failed";
      }
    }
  } catch (err) {
    console.error("Payment return error:", err.message);
  }
  res.redirect(303, `${PUBLIC_API_URL}/order-success?pay_status=${result}&tran_id=${encodeURIComponent(tranid)}`);
};

const getAllOrdersController = async (req, res) => {
  const { userid } = req.params;
  if (!isId(userid)) return res.send({ success: true, data: [] });
  if (!canAccess(req, userid)) return fail(res, "Unauthorized", 403);

  // If the payment redirect never reached the server (e.g. the app was closed), settle pending orders now.
  const recent = new Date(Date.now() - 3 * 24 * 3600 * 1000);
  const pending = await Order.find({ user: userid, status: "pending", createdAt: { $gte: recent } }).limit(5);
  await Promise.allSettled(pending.map(reconcile));

  const data = await Order.find({ user: userid }).sort({ createdAt: -1 }).lean();
  res.send({ success: true, data });
};

module.exports = { paymentController, getAllOrdersController, paymentReturn };
