const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const { ENFORCE_AUTH } = require("../config/settings");

const unauthorized = (res, status = 401) => res.status(status).json({ success: false, message: "Unauthorized" });

/**
 * protect()                -> any logged-in user
 * protect("admin","editor") -> only those roles
 * Does nothing while ENFORCE_AUTH=false so the current app keeps working (see README).
 */
const protect = (...roles) => async (req, res, next) => {
  if (!ENFORCE_AUTH) return next();
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  if (!token) return unauthorized(res);
  let payload;
  try {
    payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  } catch {
    return unauthorized(res);
  }
  if (payload.purpose !== "access") return unauthorized(res);
  const user = await User.findById(payload.id).select("role isHold isDelete");
  if (!user || user.isDelete || user.isHold) return unauthorized(res);
  req.auth = { id: String(user._id), role: user.role };
  if (roles.length && !roles.includes(user.role)) return unauthorized(res, 403);
  next();
};

/** A customer may only touch their own data; admins may touch anyone's. */
const canAccess = (req, userId) =>
  !ENFORCE_AUTH || req.auth?.role === "admin" || String(req.auth?.id) === String(userId);

module.exports = { protect, canAccess };
