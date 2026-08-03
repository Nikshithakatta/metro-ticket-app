import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { db } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "metrocity-jwt-demo-secret";
const TOKEN_TTL = "7d";

export function registerUser({ email, password, name }) {
  const normalized = email.toLowerCase().trim();
  if (!normalized || !password || password.length < 6) {
    const err = new Error("Email and password (min 6 chars) required");
    err.status = 400;
    throw err;
  }
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalized);
  if (existing) {
    const err = new Error("Email already registered");
    err.status = 409;
    throw err;
  }
  const id = `usr_${nanoid(10)}`;
  const password_hash = bcrypt.hashSync(password, 10);
  const created_at = new Date().toISOString();
  const displayName = (name || normalized.split("@")[0]).toString().slice(0, 80);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, normalized, password_hash, displayName, created_at);
  return publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
}

export function loginUser({ email, password }) {
  const normalized = (email || "").toLowerCase().trim();
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(normalized);
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
    const err = new Error("Invalid email or password");
    err.status = 401;
    throw err;
  }
  return publicUser(user);
}

export function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

export function publicUser(row) {
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };
}

export function authOptional(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub);
    req.user = user ? publicUser(user) : null;
  } catch {
    req.user = null;
  }
  next();
}

export function authRequired(req, res, next) {
  authOptional(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: "Login required" });
    }
    next();
  });
}
