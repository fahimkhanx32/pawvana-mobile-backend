const User = require("../models/userModel");
const { canAccess } = require("../middleware/secureMiddleWare");
const { ENFORCE_AUTH } = require("../config/settings");
const { isId, escapeRegex } = require("../utils/validation");

const SAFE = "-password"; // password hashes never leave the server

const getAllUsersController = async (req, res) => {
  const userData = await User.find({ isDelete: false }).select(SAFE);
  res.send({ success: true, message: "All user Data", userData });
};

const getAllDeleteUsersController = async (req, res) => {
  const userData = await User.find({ isDelete: true }).select(SAFE);
  res.send({ success: true, message: "All user Data", userData });
};

const getSearchData = async (req, res) => {
  const term = escapeRegex(String(req.body.name || "").trim());
  const userData = await User.find({
    $or: [{ name: { $regex: term, $options: "i" } }, { email: { $regex: term, $options: "i" } }],
  }).select(SAFE);
  res.send({ success: true, message: "All user Data", userData });
};

const singleUserDataController = async (req, res) => {
  const { id } = req.params;
  if (!isId(id) || !canAccess(req, id)) return res.send({ success: false, message: "User not found" });
  const userData = await User.findById(id).select(SAFE);
  if (!userData) return res.send({ success: false, message: "User not found" });
  res.send({ success: true, message: `${userData.email} data`, userData });
};

const deleteUserController = async (req, res) => {
  const { id } = req.params;
  if (!isId(id)) return res.send({ success: false, message: "User not found" });
  await User.findByIdAndUpdate(id, { isDelete: true });
  res.send({ success: true, message: "User deleted" });
};

const text = (v) => (v === undefined || v === null ? undefined : String(v).trim());

const updateUserController = async (req, res) => {
  const { id } = req.params;
  if (!isId(id) || !canAccess(req, id)) return res.send({ success: false, message: "User not found" });
  const b = req.body || {};
  const update = {};

  // profile fields the app edits (email & password are deliberately NOT editable here)
  ["name", "phone", "address", "city", "postalCode"].forEach((k) => {
    if (b[k] !== undefined) update[k] = text(b[k]);
  });
  if (b.billingAddress && typeof b.billingAddress === "object") {
    const ba = b.billingAddress;
    update.billingAddress = {
      fullName: text(ba.fullName),
      email: text(ba.email),
      street: text(ba.street),
      zipCode: text(ba.zipCode),
      phoneNumber: text(ba.phoneNumber),
    };
  }

  // admin-only fields (Customers screen)
  const wantsAdmin = b.role !== undefined || b.isHold !== undefined;
  if (wantsAdmin) {
    if (ENFORCE_AUTH && req.auth?.role !== "admin") return res.status(403).send({ success: false, message: "Unauthorized" });
    if (b.role !== undefined) {
      if (!["admin", "user", "editor", "vendor"].includes(b.role)) return res.send({ success: false, message: "Invalid role" });
      update.role = b.role;
    }
    if (b.isHold !== undefined) update.isHold = b.isHold === true || b.isHold === "true";
  }

  const userData = await User.findByIdAndUpdate(id, update, { new: true }).select(SAFE);
  if (!userData) return res.send({ success: false, message: "User not found" });
  res.send({ success: true, message: "User updated", userData });
};

module.exports = {
  getAllUsersController,
  singleUserDataController,
  deleteUserController,
  updateUserController,
  getAllDeleteUsersController,
  getSearchData,
};
