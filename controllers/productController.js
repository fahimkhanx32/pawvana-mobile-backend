const Product = require("../models/productModel");
const Cat = require("../models/categoryModel");
const Cart = require("../models/cartModel");
const { readSheet } = require("read-excel-file/node");
const { uniqueSlug } = require("../utils/slug");
const { isId, escapeRegex } = require("../utils/validation");
const { normalizePath, deleteFile, discardUploads } = require("../utils/files");

const STATUSES = ["pending", "active", "inactive"];
const SECTIONS = ["none", "deals", "feature", "new"];
const MAX_IMAGES = 5;

const num = (v) => (v === undefined || v === null || v === "" ? NaN : Number(v));
const str = (v) => (v === undefined || v === null ? undefined : String(v).trim());
const day = (d) => new Date(d).setHours(0, 0, 0, 0);
const asList = (v) =>
  (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v])
    .flatMap((x) => String(x).split(","))
    .map((x) => x.trim())
    .filter(Boolean);
const normType = (t) => (t === "percentage" ? "percent" : t); // the old web admin sent "percentage"
const newSku = () => `PAW-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

/** Validates discount fields; returns { error } or { discountType, discount, discountStartDate, discountEndDate }. */
const readDiscount = (b, price, { checkPast }) => {
  const discountType = normType(b.discountType) || "none";
  if (!["none", "percent", "flat"].includes(discountType)) return { error: "Invalid discount type" };
  if (discountType === "none") return { discountType, discount: 0, discountStartDate: undefined, discountEndDate: undefined };

  const discount = num(b.discount);
  if (!(discount > 0)) return { error: "Enter the discount amount" };
  if (discountType === "percent" && discount > 100) return { error: "A percentage can't exceed 100" };
  if (discountType === "flat" && discount >= price) return { error: "A flat discount must be lower than the price" };

  const start = b.discountStartDate ? new Date(b.discountStartDate) : undefined;
  const end = b.discountEndDate ? new Date(b.discountEndDate) : undefined;
  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) return { error: "Invalid discount date" };
  const today = day(new Date());
  if (checkPast && start && day(start) < today) return { error: "Discount can't start in the past" };
  if (checkPast && end && day(end) < today) return { error: "Discount can't end in the past" };
  if (start && end && day(end) < day(start)) return { error: "Discount end must be after start" };
  return { discountType, discount, discountStartDate: start, discountEndDate: end };
};

const createProductController = async (req, res) => {
  const b = req.body;
  const files = req.files || [];
  const bad = async (message) => {
    await discardUploads(files);
    return res.json({ success: false, message });
  };

  const title = str(b.title);
  const price = num(b.price);
  const stock = num(b.stock);
  const category = str(b.category);
  if (!title) return bad("Product name is required");
  if (!(price > 0)) return bad("Enter a price above 0");
  if (!category) return bad("Choose a category");
  if (!Number.isInteger(stock) || stock < 1) return bad("Stock must be greater then 0");

  const d = readDiscount(b, price, { checkPast: true });
  if (d.error) return bad(d.error);

  const mainIdx = Number.isInteger(num(b.isMain)) && num(b.isMain) >= 0 && num(b.isMain) < files.length ? num(b.isMain) : 0;
  const images = files.map((f, i) => ({ url: normalizePath(f.path), isMain: i === mainIdx }));

  const product = await new Product({
    title,
    price,
    stock,
    category,
    brand: str(b.brand),
    description: str(b.description),
    shortDescription: str(b.shortDescription),
    additionalInfo: str(b.additionalInfo),
    status: STATUSES.includes(b.status) ? b.status : "pending",
    section: SECTIONS.includes(b.section) ? b.section : "none",
    tag: asList(b.tag),
    discountType: d.discountType,
    discount: d.discount,
    discountStartDate: d.discountStartDate,
    discountEndDate: d.discountEndDate,
    sku: newSku(),
    slug: await uniqueSlug(Product, title),
    images,
  }).save();

  res.json({ success: true, message: "Product Created", product });
};

const bulkCreateProductController = async (req, res) => {
  const filePath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Excel file is required" });

    const schema = Object.fromEntries(
      [
        ["title", String], ["description", String], ["additionalInfo", String], ["price", Number],
        ["discountType", String], ["discount", Number], ["discountStartDate", Date], ["discountEndDate", Date],
        ["sku", String], ["stock", Number], ["brand", String], ["shortDescription", String],
        ["category", String], ["tag", String], ["status", String], ["section", String], ["images", String],
      ].map(([k, type]) => [k, { column: k, type }]),
    );
    const { objects, errors } = await readSheet(`./${filePath}`, { schema });
    if (errors?.length) {
      return res.status(400).json({ success: false, message: "Excel data validation failed", errors });
    }

    const taken = new Set();
    const products = [];
    for (const [i, item] of objects.entries()) {
      if (!item.title || !(Number(item.price) > 0) || !item.category) {
        return res.status(400).json({ success: false, message: `Row ${i + 2}: title, price and category are required` });
      }
      const type = normType(item.discountType);
      const slug = await uniqueSlug(Product, item.title, undefined, taken); // eslint-disable-line no-await-in-loop
      taken.add(slug);
      const hasDiscount = ["percent", "flat"].includes(type) && Number(item.discount) > 0;
      products.push({
        ...item,
        slug,
        sku: item.sku || newSku(),
        stock: Math.max(0, Math.floor(Number(item.stock) || 0)),
        status: STATUSES.includes(item.status) ? item.status : "pending",
        section: SECTIONS.includes(item.section) ? item.section : "none",
        discountType: hasDiscount ? type : "none",
        discount: hasDiscount ? Number(item.discount) : 0,
        tag: asList(item.tag),
        images: item.images
          ? item.images.split(",").map((image) => {
              const [url, isMain] = image.split("|");
              return { url: normalizePath(url.trim()), isMain: isMain?.trim().toLowerCase() === "true" };
            })
          : [],
      });
    }
    if (!products.length) return res.status(400).json({ success: false, message: "The sheet has no product rows" });

    const created = await Product.insertMany(products);
    return res.status(201).json({ success: true, message: `${created.length} products created successfully`, data: created });
  } catch (error) {
    console.error("Bulk product create error:", error);
    return res.status(500).json({ success: false, message: "Failed to create products", error: error.message });
  } finally {
    deleteFile(filePath);
  }
};

const getAllProductsController = async (req, res) => {
  try {
    const product = await Product.find({}).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, message: "All products...", product });
  } catch (error) {
    console.log(error, "Get All Products related error...");
    return res.status(500).json({ success: false, message: "Server error..." });
  }
};

const sendOne = (res, product) => {
  if (!product) return res.status(404).json({ success: false, message: "Product not found..." });
  const isMain = Math.max(0, product.images.findIndex((i) => i.isMain));
  return res.status(200).json({ success: true, message: `Product details: ${product.title}, ${product.sku}`, product, isMain });
};

const getSingleProductController = async (req, res) => {
  try {
    const { id } = req.params;
    return sendOne(res, isId(id) ? await Product.findById(id) : null);
  } catch (error) {
    console.log(error, "Get single Product related error...");
    return res.status(500).json({ success: false, message: "Server error..." });
  }
};

// The app links with product.slug, or the _id for products that have no slug.
const getSingleBySlugProductController = async (req, res) => {
  try {
    const { slug } = req.params;
    let product = await Product.findOne({ slug });
    if (!product && isId(slug)) product = await Product.findById(slug);
    return sendOne(res, product);
  } catch (error) {
    console.log(error, "Get single Product related error...");
    return res.status(500).json({ success: false, message: "Server error..." });
  }
};

const deleteProductController = async (req, res) => {
  try {
    const { id } = req.params;
    const product = isId(id) ? await Product.findByIdAndDelete(id) : null;
    if (!product) return res.status(404).json({ success: false, message: "Product not found..." });
    await Cart.deleteMany({ product: id });
    await Promise.all(product.images.map((i) => deleteFile(i.url)));
    return res.status(200).json({ success: true, message: "Product Deleted successfully..." });
  } catch (error) {
    console.log(error, "Delete Product related error...");
    return res.status(500).json({ success: false, message: "Server error..." });
  }
};

const updateProductController = async (req, res) => {
  const files = req.files || [];
  const bad = async (message, status = 200) => {
    await discardUploads(files);
    return res.status(status).json({ success: false, message });
  };
  try {
    const { id } = req.params;
    const product = isId(id) ? await Product.findById(id) : null;
    if (!product) return bad("Product not found...", 404);
    const b = req.body;

    // ---- plain fields ----
    ["description", "additionalInfo", "brand", "shortDescription"].forEach((k) => {
      if (b[k] !== undefined) product[k] = str(b[k]);
    });
    if (b.title !== undefined) {
      if (!str(b.title)) return bad("Product name is required");
      product.title = str(b.title);
    }
    if (b.category !== undefined) {
      if (!str(b.category)) return bad("Choose a category");
      product.category = str(b.category);
    }
    if (b.price !== undefined) {
      if (!(num(b.price) > 0)) return bad("Enter a price above 0");
      product.price = num(b.price);
    }
    if (b.stock !== undefined) {
      if (!Number.isInteger(num(b.stock)) || num(b.stock) < 0) return bad("Stock must be a whole number");
      product.stock = num(b.stock);
    }
    if (STATUSES.includes(b.status)) product.status = b.status;
    if (SECTIONS.includes(b.section)) product.section = b.section;

    // the app sends the whole form on edit, so a missing "tag" means the tags were cleared
    if (b.tag !== undefined) product.tag = asList(b.tag);
    else if (b.title !== undefined) product.tag = [];

    // ---- discount (existing discounts may already have started, so past dates are allowed here) ----
    if (b.discountType !== undefined || b.discount !== undefined) {
      const d = readDiscount({ ...b, discountType: b.discountType ?? product.discountType }, product.price, { checkPast: false });
      if (d.error) return bad(d.error);
      product.discountType = d.discountType;
      product.discount = d.discount;
      product.discountStartDate = d.discountStartDate;
      product.discountEndDate = d.discountEndDate;
    }

    // ---- images: indexes refer to [existing images…, new uploads…] ----
    const combined = [
      ...product.images.map((i) => ({ url: i.url, isMain: i.isMain })),
      ...files.map((f) => ({ url: normalizePath(f.path), isMain: false })),
    ];
    const del = new Set(asList(b.deleteImage).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < product.images.length));
    const wantedMain = Number.isInteger(num(b.isMain)) ? combined[num(b.isMain)] : combined.find((i) => i.isMain);
    const kept = combined.filter((_, i) => !del.has(i));
    if (kept.length > MAX_IMAGES) return bad(`A product can have at most ${MAX_IMAGES} photos`);

    kept.forEach((i) => { i.isMain = false; });
    const main = kept.includes(wantedMain) ? wantedMain : kept[0];
    if (main) main.isMain = true;

    await Promise.all([...del].map((i) => deleteFile(product.images[i].url)));
    product.images = kept;

    await product.save();
    return res.status(200).json({ success: true, message: "Product updated successfully...", product });
  } catch (error) {
    console.log(error, "Update Product related error...");
    await discardUploads(files);
    return res.status(500).json({ success: false, message: "Server error..." });
  }
};

const createCategory = async (req, res) => {
  const name = str(req.body.name);
  if (!name) return res.json({ success: false, message: "Name is required" });
  if (await Cat.exists({ name: new RegExp(`^${escapeRegex(name)}$`, "i") })) {
    return res.json({ success: false, message: "That category already exists" });
  }
  const category = await new Cat({ name }).save(); // awaited: the app reloads the list right after
  res.json({ success: true, message: "Category Created", category });
};

const getCategory = async (req, res) => {
  try {
    const categories = await Cat.find({}).sort({ _id: 1 });
    res.json({ success: true, message: "Categories retrieved", categories });
  } catch (error) {
    console.log(error, "Get Categories related error...");
    res.status(500).json({ success: false, message: "Server error..." });
  }
};

module.exports = {
  createProductController,
  getAllProductsController,
  getSingleProductController,
  updateProductController,
  deleteProductController,
  createCategory,
  getCategory,
  bulkCreateProductController,
  getSingleBySlugProductController,
};
