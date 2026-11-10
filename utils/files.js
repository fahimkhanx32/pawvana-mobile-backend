const { unlink } = require("node:fs/promises");
const path = require("node:path");

/** multer stores "uploads\\x.jpg" on Windows; always keep forward slashes. */
const normalizePath = (p) => String(p || "").replace(/\\/g, "/");

const deleteFile = async (filePath) => {
  if (!filePath || /^https?:/i.test(filePath)) return;
  try {
    // only ever delete inside ./uploads
    const full = path.resolve(filePath);
    if (!full.startsWith(path.resolve("uploads") + path.sep)) return;
    await unlink(full);
  } catch (err) {
    if (err.code !== "ENOENT") console.error("Could not delete file:", err.message);
  }
};

const discardUploads = (files) => Promise.all((files || []).map((f) => deleteFile(f.path)));

module.exports = { normalizePath, deleteFile, discardUploads };
