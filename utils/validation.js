const mongoose = require("mongoose");

const isEmpty = (v) => v === undefined || v === null || String(v).trim() === "";

/** Sends the error and returns true when any field is empty — callers do: if (emptyFieldValidation(...)) return; */
const emptyFieldValidation = (res, ...fields) => {
  if (fields.some(isEmpty)) {
    res.send({ success: false, message: "Please fill all the field" });
    return true;
  }
  return false;
};

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || "")) && String(v).length === 24;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = { emptyFieldValidation, isEmail, isId, isEmpty, escapeRegex };
