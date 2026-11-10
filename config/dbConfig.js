const mongoose = require("mongoose");

const dbConfig = async () => {
  if (!process.env.MONGODB_URL) {
    console.error("MONGODB_URL is missing in .env");
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log("Database connected");
  } catch (err) {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  }
};

module.exports = dbConfig;
