const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../config/db");

// Login sessions, stored by connect-session-sequelize (see app.js). The
// store reads/writes sid, expires and data; the table is created by the
// initial-schema migration like every other table.
class Session extends Model {}

Session.init(
  {
    sid: { type: DataTypes.STRING(255), primaryKey: true },
    expires: { type: DataTypes.DATE },
    data: { type: DataTypes.TEXT },
  },
  {
    sequelize,
    modelName: "Session",
    tableName: "sessions",
    underscored: true,
  },
);

module.exports = Session;
