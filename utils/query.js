const { Op } = require("sequelize");

// Request values only ever become SQL *parameters* (Sequelize escapes them),
// but with express.urlencoded({ extended: true }) a crafted query string can
// still turn a field into an array or object. Filters only ever expect a
// plain string, so anything else is treated as "not provided".
function queryString(value) {
  return typeof value === "string" ? value.trim() : "";
}

// SQL Server LIKE has no default escape character; a literal %, _ or [ is
// matched by wrapping it in brackets.
function escapeLike(value) {
  return value.replace(/[[%_]/g, (char) => `[${char}]`);
}

// Case-insensitive "contains" across several columns — the SQL equivalent of
// the old `{ $or: [{ field: /q/i }, ...] }`. Case-insensitivity comes from
// SQL Server's default case-insensitive (CI) collation.
function containsAny(fields, q) {
  const pattern = `%${escapeLike(q)}%`;
  return { [Op.or]: fields.map((field) => ({ [field]: { [Op.like]: pattern } })) };
}

module.exports = { queryString, containsAny };
