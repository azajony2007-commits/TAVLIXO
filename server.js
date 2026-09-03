const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});
app.use(express.json());
app.use(express.static(__dirname));

// =====================================================
// FILES
// =====================================================

const DATA_FILE = path.join(__dirname, "products.json");
const ORDERS_FILE = path.join(__dirname, "orders.json");
const USERS_FILE = path.join(__dirname, "users.json");
const SESSIONS_FILE = path.join(__dirname, "sessions.json");

// =====================================================
// GENERIC JSON HELPERS
// =====================================================

function readJSON(file) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "[]");
  }

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2)
  );
}

// =====================================================
// PRODUCTS
// =====================================================

function getProducts() {
  return readJSON(DATA_FILE);
}

function saveProducts(products) {
  writeJSON(DATA_FILE, products);
}

// Barcha mahsulotlar
app.get("/api/products", (req, res) => {
  res.json(getProducts());
});

// Mahsulot qo‘shish
app.post("/api/products", (req, res) => {
  const products = getProducts();

  const product = {
    id: Date.now(),
    name: req.body.name,
    price: Number(req.body.price),
    country: req.body.country,
    category: req.body.category,
    image: req.body.image
  };

  products.push(product);
  saveProducts(products);

  res.json({
    success: true,
    product
  });
});

// Mahsulot o‘chirish
app.delete("/api/products/:id", (req, res) => {
  let products = getProducts();

  products = products.filter(
    product => product.id !== Number(req.params.id)
  );

  saveProducts(products);

  res.json({
    success: true
  });
});

// =====================================================
// USERS / ACCOUNT
// =====================================================

function getUsers() {
  return readJSON(USERS_FILE);
}

function saveUsers(users) {
  writeJSON(USERS_FILE, users);
}

function getSessions() {
  return readJSON(SESSIONS_FILE);
}

function saveSessions(sessions) {
  writeJSON(SESSIONS_FILE, sessions);
}

// Parolni hash qilish
function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(password)
    .digest("hex");
}

// Token yaratish
function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Authorization orqali foydalanuvchini topish
function getUserFromRequest(req) {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith("Bearer ")) {
    return null;
  }

  const token = auth.replace("Bearer ", "").trim();

  const sessions = getSessions();
  const session = sessions.find(
    item => item.token === token
  );

  if (!session) {
    return null;
  }

  const users = getUsers();

  return users.find(
    user => user.id === session.userId
  ) || null;
}

// =====================================================
// REGISTER
// =====================================================

app.post("/api/register", (req, res) => {

  const {
    name,
    surname,
    phone,
    address,
    email,
    age,
    password
  } = req.body;

  if (
    !name ||
    !surname ||
    !phone ||
    !address ||
    !email ||
    !age ||
    !password
  ) {
    return res.status(400).json({
      success: false,
      message: "Barcha ma'lumotlarni kiriting"
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Parol kamida 6 ta belgidan iborat bo‘lsin"
    });
  }

  const users = getUsers();

  const exists = users.find(
    user =>
      user.email.toLowerCase() ===
      email.toLowerCase()
  );

  if (exists) {
    return res.status(400).json({
      success: false,
      message: "Bu email bilan akkaunt mavjud"
    });
  }

  const user = {
    id: Date.now(),
    name,
    surname,
    phone,
    address,
    email,
    age: Number(age),
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };

  users.push(user);
  saveUsers(users);

  const token = createToken();

  const sessions = getSessions();

  sessions.push({
    token,
    userId: user.id
  });

  saveSessions(sessions);

  const safeUser = {
    id: user.id,
    name: user.name,
    surname: user.surname,
    phone: user.phone,
    address: user.address,
    email: user.email,
    age: user.age
  };

  res.json({
    success: true,
    token,
    user: safeUser
  });
});

// =====================================================
// LOGIN
// =====================================================

app.post("/api/login", (req, res) => {

  const {
    email,
    password
  } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email va parolni kiriting"
    });
  }

  const users = getUsers();

  const user = users.find(
    item =>
      item.email.toLowerCase() ===
      email.toLowerCase()
  );

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Email yoki parol noto‘g‘ri"
    });
  }

  if (
    user.passwordHash !==
    hashPassword(password)
  ) {
    return res.status(401).json({
      success: false,
      message: "Email yoki parol noto‘g‘ri"
    });
  }

  const token = createToken();

  const sessions = getSessions();

  sessions.push({
    token,
    userId: user.id
  });

  saveSessions(sessions);

  const safeUser = {
    id: user.id,
    name: user.name,
    surname: user.surname,
    phone: user.phone,
    address: user.address,
    email: user.email,
    age: user.age
  };

  res.json({
    success: true,
    token,
    user: safeUser
  });
});

// =====================================================
// CURRENT USER
// =====================================================

app.get("/api/me", (req, res) => {

  const user = getUserFromRequest(req);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Akkauntga kirilmagan"
    });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      surname: user.surname,
      phone: user.phone,
      address: user.address,
      email: user.email,
      age: user.age
    }
  });
});

// =====================================================
// LOGOUT
// =====================================================

app.post("/api/logout", (req, res) => {

  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith("Bearer ")) {
    return res.json({
      success: true
    });
  }

  const token = auth.replace("Bearer ", "").trim();

  let sessions = getSessions();

  sessions = sessions.filter(
    item => item.token !== token
  );

  saveSessions(sessions);

  res.json({
    success: true
  });
});

// =====================================================
// ORDERS
// =====================================================

function getOrders() {
  return readJSON(ORDERS_FILE);
}

function saveOrders(orders) {
  writeJSON(ORDERS_FILE, orders);
}

// Buyurtma qabul qilish
app.post("/api/orders", (req, res) => {

  const orders = getOrders();

  const user = getUserFromRequest(req);

  const order = {
    id: Date.now(),

    userId: user ? user.id : null,

    name: user
      ? `${user.name} ${user.surname}`
      : req.body.name,

    phone: user
      ? user.phone
      : req.body.phone,

    address: user
      ? user.address
      : req.body.address,

    products: req.body.products,

    total: Number(req.body.total),

    status: "Yangi",

    createdAt: new Date().toLocaleString("uz-UZ")
  };

  orders.push(order);

  saveOrders(orders);

  res.json({
    success: true,
    order
  });
});

// Foydalanuvchining buyurtmalari
app.get("/api/my-orders", (req, res) => {

  const user = getUserFromRequest(req);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Avval akkauntga kiring"
    });
  }

  const orders = getOrders();

  const myOrders = orders.filter(
    order => order.userId === user.id
  );

  res.json({
    success: true,
    orders: myOrders
  });
});

// Barcha buyurtmalar
app.get("/api/orders", (req, res) => {
  res.json(getOrders());
});

// Bitta buyurtmani olish
app.get("/api/orders/:id", (req, res) => {

  const orders = getOrders();

  const id = Number(req.params.id);

  const order = orders.find(
    order => order.id === id
  );

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "Buyurtma topilmadi"
    });
  }

  res.json({
    success: true,
    order
  });
});

// Buyurtma statusini o‘zgartirish
app.put("/api/orders/:id", (req, res) => {

  let orders = getOrders();

  const id = Number(req.params.id);
  const status = req.body.status;

  const order = orders.find(
    order => order.id === id
  );

  if (!order) {
    return res.json({
      success: false,
      message: "Buyurtma topilmadi"
    });
  }

  order.status = status;

  saveOrders(orders);

  res.json({
    success: true,
    order
  });
});

// =====================================================
// SERVER
// =====================================================

async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY,
        name TEXT NOT NULL,
        surname TEXT NOT NULL,
        phone TEXT NOT NULL,
        address TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        age INTEGER NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS products (
        id BIGINT PRIMARY KEY,
        name TEXT NOT NULL,
        price NUMERIC NOT NULL,
        country TEXT,
        category TEXT,
        image TEXT
      );

      CREATE TABLE IF NOT EXISTS orders (
        id BIGINT PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        name TEXT,
        phone TEXT,
        address TEXT,
        products JSONB,
        total NUMERIC NOT NULL,
        status TEXT DEFAULT 'Yangi',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ PostgreSQL jadvallari tayyor");
  } catch (error) {
    console.error("❌ PostgreSQL xatosi:", error);
  }
}

initDatabase().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `🚀 TAVLIXO serveri ishga tushdi: http://localhost:${PORT}`
    );
  });
});
