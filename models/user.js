const crypto = require("crypto");
const { promisify } = require("util");
const { DataTypes, Model, UniqueConstraintError } = require("sequelize");
const { sequelize } = require("../config/db");

const pbkdf2 = promisify(crypto.pbkdf2);

// Replaces passport-local-mongoose's hashing. Stored as one self-describing
// string ("pbkdf2_sha256$<iterations>$<salt>$<hash>") so the work factor can
// be raised later without a schema change — existing hashes keep verifying
// with the iteration count they were created with.
const HASH_ALGORITHM = "pbkdf2_sha256";
const HASH_ITERATIONS = 600000; // OWASP 2023 recommendation for PBKDF2-SHA256
const HASH_KEYLEN = 32;

// Same messages the old passport-local-mongoose errorMessages option used.
const AUTH_ERRORS = {
  incorrect: "Incorrect email or password.",
  userExists: "An account with that email already exists.",
};

async function hashPassword(password, iterations = HASH_ITERATIONS, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = await pbkdf2(String(password), salt, iterations, HASH_KEYLEN, "sha256");
  return `${HASH_ALGORITHM}$${iterations}$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [algorithm, iterations, salt, hash] = String(stored || "").split("$");
  if (algorithm !== HASH_ALGORITHM || !salt || !hash) {
    return false;
  }
  const candidate = (await hashPassword(password, Number(iterations), salt)).split("$")[3];
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

class User extends Model {
  // Creates the account with a hashed password. Throws an Error whose
  // message is user-presentable when the email is already registered.
  static async register(fields, password) {
    const user = this.build(fields);
    await user.setPassword(password);
    try {
      await user.save();
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new Error(AUTH_ERRORS.userExists);
      }
      throw error;
    }
    return user;
  }

  // Looks up by email with the password hash included and verifies it.
  // Resolves to the user, or null for an unknown email / wrong password —
  // deliberately indistinguishable to the caller.
  static async authenticate(email, password) {
    const user = await this.scope("withSecrets").findOne({
      where: { email: String(email || "").trim().toLowerCase() },
    });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return null;
    }
    return user;
  }

  async setPassword(password) {
    this.passwordHash = await hashPassword(password);
  }

  // Needs the hash, which the default scope leaves out — reload it here
  // rather than making every caller remember to use the secrets scope.
  async changePassword(currentPassword, newPassword) {
    const withHash = await User.scope("withSecrets").findByPk(this.id, {
      attributes: ["id", "passwordHash"],
    });
    if (!withHash || !(await verifyPassword(currentPassword, withHash.passwordHash))) {
      throw new Error(AUTH_ERRORS.incorrect);
    }
    await this.setPassword(newPassword);
    await this.save({ fields: ["passwordHash"] });
  }
}

User.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    firstName: { type: DataTypes.STRING(100), allowNull: false },
    lastName: { type: DataTypes.STRING(100), allowNull: false },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      // Without normalizing, "User@Example.com" and "user@example.com" would
      // register (and log in) as two distinct accounts.
      set(value) {
        this.setDataValue("email", String(value ?? "").trim().toLowerCase());
      },
    },
    role: {
      type: DataTypes.ENUM("Staff", "Admin", "IT Admin"),
      allowNull: false,
      defaultValue: "Staff",
    },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },

    emailVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    emailVerificationTokenHash: { type: DataTypes.CHAR(64) },
    emailVerificationExpiresAt: { type: DataTypes.DATE },
    passwordResetTokenHash: { type: DataTypes.CHAR(64) },
    passwordResetExpiresAt: { type: DataTypes.DATE },
  },
  {
    sequelize,
    modelName: "User",
    tableName: "users",
    underscored: true,
    // Same spirit as the old `select: false` fields: the password hash and
    // token hashes stay out of normal queries (and anything rendered from
    // them); callers that need to check one use User.scope("withSecrets").
    defaultScope: {
      attributes: {
        exclude: [
          "passwordHash",
          "emailVerificationTokenHash",
          "emailVerificationExpiresAt",
          "passwordResetTokenHash",
          "passwordResetExpiresAt",
        ],
      },
    },
    scopes: {
      withSecrets: { attributes: { include: [] } },
    },
  },
);

User.AUTH_ERRORS = AUTH_ERRORS;

module.exports = User;
