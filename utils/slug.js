const slugify = (text) =>
  String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "product";

/** Returns a slug no other product uses (adds -2, -3 … when needed). */
const uniqueSlug = async (Product, title, ignoreId, taken = new Set()) => {
  const base = slugify(title);
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (taken.has(slug) || (await Product.exists({ slug, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) }))) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
};

module.exports = { slugify, uniqueSlug };
