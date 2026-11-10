const Cart = require("../models/cartModel");
const Product = require("../models/productModel");
const User = require("../models/userModel");
const { canAccess } = require("../middleware/secureMiddleWare");
const { isId } = require("../utils/validation");
const { unitPrice, round2 } = require("../utils/pricing");

const fail = (res, message) => res.json({ success: false, message });

const createCart = async (req, res) => {
  const { proid, userid } = req.body;
  const qty = Math.max(1, parseInt(req.body.quantity, 10) || 1);

  if (!isId(proid) || !isId(userid)) return fail(res, "Invalid request");
  if (!canAccess(req, userid)) return res.status(403).json({ success: false, message: "Unauthorized" });
  if (!(await User.exists({ _id: userid }))) return fail(res, "User not found");

  const product = await Product.findById(proid);
  if (!product) return fail(res, "Product Not Found");
  if (product.status !== "active") return fail(res, "This product is not available");

  const existing = await Cart.findOne({ product: proid, user: userid });
  const wanted = (existing?.quantity || 0) + qty;
  if (wanted > Number(product.stock || 0)) {
    return fail(res, product.stock > 0 ? `Only ${product.stock} available` : "Out of Stock");
  }

  if (existing) {
    existing.quantity = wanted;
    await existing.save(); // awaited: the app refreshes right after this answers
  } else {
    await new Cart({ product: proid, quantity: qty, user: userid }).save();
  }
  res.json({ success: true, message: "Product added successfully" });
};

const increDecre = async (req, res) => {
  const { id } = req.params;
  const { type } = req.body;
  if (!isId(id)) return fail(res, "Cart item not found");

  const cart = await Cart.findById(id).populate("product");
  if (!cart) return fail(res, "Cart item not found");
  if (!canAccess(req, cart.user)) return res.status(403).json({ success: false, message: "Unauthorized" });
  if (!cart.product) {
    await cart.deleteOne();
    return fail(res, "This product is no longer available");
  }

  if (type === "plus") {
    if (cart.quantity + 1 > Number(cart.product.stock || 0)) return fail(res, "Out of Stock");
    cart.quantity += 1;
    await cart.save();
  } else if (cart.quantity <= 1) {
    await cart.deleteOne();
  } else {
    cart.quantity -= 1;
    await cart.save();
  }
  res.json({ success: true, message: "Cart Updated successfully" });
};

const proDelete = async (req, res) => {
  const { id } = req.params;
  if (isId(id)) {
    const cart = await Cart.findById(id);
    if (cart) {
      if (!canAccess(req, cart.user)) return res.status(403).json({ success: false, message: "Unauthorized" });
      await cart.deleteOne();
    }
  }
  res.json({ success: true, message: "Product Deleted" });
};

const getCart = async (req, res) => {
  const { userId } = req.params;
  if (!isId(userId)) return res.json({ cart: [], totalCartPrice: 0 });
  if (!canAccess(req, userId)) return res.status(403).json({ success: false, message: "Unauthorized" });

  const rows = await Cart.find({ user: userId }).populate("product").lean(); // user is NOT populated: no password hash
  const orphans = rows.filter((r) => !r.product).map((r) => r._id);
  if (orphans.length) await Cart.deleteMany({ _id: { $in: orphans } }); // product was deleted

  let totalCartPrice = 0;
  const cart = rows
    .filter((r) => r.product)
    .map((r) => {
      const unit = unitPrice(r.product);
      const totalPrice = round2(unit * r.quantity);
      totalCartPrice += totalPrice;
      return { ...r, unitPrice: unit, totalPrice };
    });

  res.json({ cart, totalCartPrice: round2(totalCartPrice) });
};

module.exports = { createCart, increDecre, proDelete, getCart };
