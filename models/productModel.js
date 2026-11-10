const mongoose = require("mongoose");
const { Schema } = mongoose;

const productSchema = new Schema(
  {
    title: {
      type: String,
      // unique: true,
      required: true
    },
    description: {
      type: String,
    },
    additionalInfo: {
      type: String,
    },
    price: {
      type: Number,
      required: true
    },
    discountType: {
      type: String,
      enum: ["percent", "flat", "none"],
      default: "none",
    },
    discount: {
      type: Number,
      min: 0,
      default: 0,
    },
    discountStartDate: {
      type: Date,
    },
    discountEndDate: {
      type: Date,
    },
    sku: {
      type: String,
      required: true,
      // unique: true,
    },
    stock: {
      type: Number,
      min: 0,
      default: 0,
    },
    brand: {
      type: String,
    },
    shortDescription: {
      type: String,
    },
    category: {
      type: String,
      required: true
    },
    tag: [
      {
        type: String,
      },
    ],
    status: {
      type: String,
      enum: ["pending", "active", "inactive"],
      default: "pending",
    },
    slug: {
      type: String,
      required: true,
      index: true,
    },
    section:{
       type: String,
      enum: ["none","deals", "feature", "new"],
      default: "none",
    },
    images: [
      {
        url: {
          type: String,
        },
        isMain: {
          type: Boolean,
          default: false,
        },
      },
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Product", productSchema);
