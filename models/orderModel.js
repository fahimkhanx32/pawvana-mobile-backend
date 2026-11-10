const mongoose = require("mongoose");
const { Schema } = mongoose;

const orderModel = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    products: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        title: String,
        price: Number, // unit price actually charged (after any discount)
        originalPrice: Number,
        sku: String,
        quantity: Number,
        totalPrice: Number,
      },
    ],
    subtotal: { type: Number },
    shipping: { type: Number, default: 0 },
    totalPrice: { type: Number, required: true }, // subtotal + shipping
    tranid: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "reject", "approved"], default: "pending" },
    paidAt: { type: Date },
    customer: {
      name: String,
      email: String,
      phone: String,
      address: String,
      city: String,
      state: String,
      postcode: String,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Order", orderModel);
