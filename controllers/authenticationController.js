const bcrypt = require("bcrypt");
const User = require("../models/userModel");
const { mailVerification, resetPasswordMail } = require("../utils/email");
const { emptyFieldValidation, isEmail, escapeRegex } = require("../utils/validation");
const { makeToken, readToken } = require("../utils/tokenGenerator");

const normEmail = (e) => String(e || "").trim().toLowerCase();
const byEmail = (email) => User.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, "i") });

// What the app stores after login. Never includes the password hash.
const publicUser = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  isVerified: u.isVerified,
  role: u.role,
  isHold: u.isHold,
  address: u.address,
  city: u.city,
  postalCode: u.postalCode,
  billingAddress: u.billingAddress,
});

const registrationController = async (req, res) => {
  const { name, password, confirmPassword, phone } = req.body;
  const email = normEmail(req.body.email);

  if (emptyFieldValidation(res, email, password, confirmPassword)) return;
  if (!isEmail(email)) return res.send({ success: false, message: "Enter a valid email address" });
  if (String(password).length < 8) return res.send({ success: false, message: "Password must be at least 8 characters" });
  if (password !== confirmPassword) return res.send({ success: false, message: "password no matched" });
  if (await byEmail(email)) return res.send({ success: false, message: "User exist" });

  const user = await new User({
    email,
    password: bcrypt.hashSync(password, 10),
    name: String(name || "").trim(),
    phone: phone ? String(phone).trim() : undefined,
  }).save();

  mailVerification(makeToken(user, "verify", "1d"), email);

  res.send({ success: true, message: "Registration Successfull, Please check your email for verification" });
};

const loginController = async (req, res) => {
  const email = normEmail(req.body.email);
  const { password } = req.body;
  if (emptyFieldValidation(res, email, password)) return;

  const user = await byEmail(email);
  if (!user || user.isDelete) return res.send({ success: false, message: "User not found" });
  if (!user.password || !bcrypt.compareSync(String(password), user.password)) {
    return res.send({ success: false, message: "Invalid Credential" });
  }

  // A held account still gets its details back (the app shows its own "on hold" message) but no token.
  const token = user.isHold ? undefined : makeToken(user, "access", "7d");
  res.send({
    success: true,
    message: "Login Successfull",
    token,
    data: { ...publicUser(user), token },
  });
};

const forgotPasswordController = async (req, res) => {
  const email = normEmail(req.body.email);
  if (emptyFieldValidation(res, email)) return;
  const user = await byEmail(email);
  if (!user || user.isDelete) return res.send({ success: false, message: "User not found" });

  resetPasswordMail(makeToken(user, "reset", "30m"), user.email);
  res.send({ success: true, message: "Please check your email" });
};

const resetPasswordController = async (req, res) => {
  const { password, confirmPassword } = req.body;
  if (emptyFieldValidation(res, password, confirmPassword)) return;
  if (password !== confirmPassword) return res.send({ success: false, message: "Confirm password not matched" });
  if (String(password).length < 8) return res.send({ success: false, message: "Password must be at least 8 characters" });

  const decoded = readToken(req.params.token, "reset");
  if (!decoded) return res.send({ success: false, message: "Unauthorized" });

  const user = await User.findByIdAndUpdate(decoded.id, { password: bcrypt.hashSync(password, 10) });
  if (!user) return res.send({ success: false, message: "User not found" });
  res.send({ success: true, message: "Password Updated" });
};

const resendVerificationEmailController = async (req, res) => {
  const email = normEmail(req.body.email);
  if (emptyFieldValidation(res, email)) return;
  const user = await byEmail(email);
  if (!user || user.isDelete) return res.send({ success: false, message: "User not found" });
  if (user.isVerified) return res.send({ success: true, message: "Your email is already verified" });

  mailVerification(makeToken(user, "verify", "1d"), user.email);
  res.send({ success: true, message: "Check your email for verification" });
};

const verifyEmailController = async (req, res) => {
  const decoded = readToken(req.params.token, "verify");
  if (!decoded) return res.send({ success: false, message: "Unauthorized" });

  const user = await User.findById(decoded.id);
  if (!user) return res.send({ success: false, message: "User not found" });
  if (user.isVerified) return res.send({ success: true, message: "User already verified" });

  user.isVerified = true;
  await user.save();
  res.send({ success: true, message: "Email verified successfully" });
};

module.exports = {
  registrationController,
  loginController,
  forgotPasswordController,
  resetPasswordController,
  resendVerificationEmailController,
  verifyEmailController,
};
