/** What a customer pays per unit right now. Mirrors priceOf() in the app's src/lib/helpers.js. */
const unitPrice = (product, now = Date.now()) => {
  const price = Number(product?.price || 0);
  const type = product?.discountType;
  const d = Number(product?.discount || 0);
  const start = product?.discountStartDate ? new Date(product.discountStartDate).getTime() : null;
  const end = product?.discountEndDate ? new Date(product.discountEndDate).getTime() : null;
  const startOk = start === null || start <= now;
  const endOk = end === null || end + 86399000 >= now;
  let final = price;
  if ((type === "percent" || type === "flat") && d > 0 && startOk && endOk) {
    final = type === "percent" ? price * (1 - Math.min(d, 100) / 100) : price - d;
    final = Math.max(0, Math.round(final * 100) / 100);
  }
  return final;
};

const round2 = (n) => Math.round(Number(n) * 100) / 100;

module.exports = { unitPrice, round2 };
