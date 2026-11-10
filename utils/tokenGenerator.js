const jwt = require("jsonwebtoken");

// purpose keeps the three kinds of token apart: "access" (login), "verify" (email), "reset" (password)
const tokenGenerator = (data, secret, expire) => jwt.sign(data, secret, { expiresIn: expire });

const makeToken = (user, purpose, expire) =>
  tokenGenerator({ id: user._id, email: user.email, purpose }, process.env.ACCESS_TOKEN_SECRET, expire);

const readToken = (token, purpose) => {
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    return decoded.purpose === purpose ? decoded : null;
  } catch {
    return null;
  }
};

module.exports = tokenGenerator;
module.exports.makeToken = makeToken;
module.exports.readToken = readToken;
