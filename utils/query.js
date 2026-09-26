const { Op } = require("sequelize");

// Request values only ever become SQL *parameters* (Sequelize escapes them),
// but with express.urlencoded({ extended: true }) a crafted query string can
// still turn a field into an array or object. Filters only ever expect a
// plain string, so anything else is treated as "not provided".
function queryString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

// Case-insensitive "contains" across several columns — the SQL equivalent of
// the old `{ $or: [{ field: /q/i }, ...] }`. Case-insensitivity comes from
// the tables' utf8mb4_unicode_ci collation.
function containsAny(fields, q) {
  const pattern = `%${escapeLike(q)}%`;
  return { [Op.or]: fields.map((field) => ({ [field]: { [Op.like]: pattern } })) };
}

module.exports = { queryString, containsAny };
