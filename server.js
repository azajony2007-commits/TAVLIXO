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

async function getUserByEmail(email) {
  const result = await pool.query(
    "SELECT * FROM users WHERE LOWER(email) = LOWER($1)",
    [email]
  );

  return result.rows[0] || null;
}

async function getUserById(id) {
  const result = await pool.query(
    "SELECT * FROM users WHERE id = $1",
    [id]
  );

  return result.rows[0] || null;
}

async function createUser(user) {
  await pool.query(
    `INSERT INTO users
      (id, name, surname, phone, address, email, age, password_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      user.id,
      user.name,
      user.surname,
      user.phone,
      user.address,
      user.email,
      user.age,
      user.passwordHash
    ]
  );
}

async function createSession(token, userId) {
  await pool.query(
    `INSERT INTO sessions (token, user_id)
     VALUES ($1, $2)`,
    [token, userId]
  );
}

async function getSession(token) {
  const result = await pool.query(
    "SELECT * FROM sessions WHERE token = $1",
    [token]
  );

  return result.rows[0] || null;
}

async function deleteSession(token) {
  await pool.query(
    "DELETE FROM sessions WHERE token = $1",
    [token]
  );
}

async function getUserFromRequest(req) {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith("Bearer ")) {
    return null;
  }

  const token = auth.replace("Bearer ", "").trim();

  const session = await getSession(token);

  if (!session) {
    return null;
  }

  return await getUserById(session.user_id);
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


// =====================================================
// REGISTER
// =====================================================

app.post("/api/register", async (req, res) => {
  try {
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

    const exists = await getUserByEmail(email);

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
      passwordHash: hashPassword(password)
    };

    await createUser(user);

    const token = createToken();

    await createSession(token, user.id);

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

  } catch (error) {
    console.error("❌ Register xatosi:", error);

    res.status(500).json({
      success: false,
      message: "Server xatosi"
    });
  }
});

// =====================================================
// LOGIN
// =====================================================

app.post("/api/login", async (req, res) => {
  try {
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

    const user = await getUserByEmail(email);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Email yoki parol noto‘g‘ri"
      });
    }

    if (user.password_hash !== hashPassword(password)) {
      return res.status(401).json({
        success: false,
        message: "Email yoki parol noto‘g‘ri"
      });
    }

    const token = createToken();

    await createSession(token, user.id);

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

  } catch (error) {
    console.error("❌ Login xatosi:", error);

    res.status(500).json({
      success: false,
      message: "Server xatosi"
    });
  }
});
// =====================================================
// CURRENT USER
// =====================================================

app.get("/api/me", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);

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

  } catch (error) {
    console.error("❌ /api/me xatosi:", error);

    res.status(500).json({
      success: false,
      message: "Server xatosi"
    });
  }
});

// =====================================================
// LOGOUT
// =====================================================

app.post("/api/logout", async (req, res) => {
  try {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
      return res.json({
        success: true
      });
    }

    const token = auth.replace("Bearer ", "").trim();

    await deleteSession(token);

    res.json({
      success: true
    });

  } catch (error) {
    console.error("❌ Logout xatosi:", error);

    res.status(500).json({
      success: false,
      message: "Server xatosi"
    });
  }
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

app.post("/api/orders", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);

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

      status: "Yangi"
    };

    await pool.query(
      `INSERT INTO orders
        (id, user_id, name, phone, address, products, total, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        order.id,
        order.userId,
        order.name,
        order.phone,
        order.address,
        JSON.stringify(order.products),
        order.total,
        order.status
      ]
    );

    res.json({
      success: true,
      order
    });

  } catch (error) {
    console.error("❌ Buyurtma xatosi:", error);

    res.status(500).json({
      success: false,
      message: "Server xatosi"
    });
  }
});

// Foydalanuvchining buyurtmalari
app.get("/api/my-orders", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Avval akkauntga kiring"
      });
    }

    const result = await pool.query(
      `SELECT *
       FROM orders
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [user.id]
    );

    res.json({
      success: true,
      orders: result.rows
    });

  } catch (error) {
    console.error("❌ My orders xatosi:", error);

    res.status(500).json({
      success: false,
      message: "Server xatosi"
    });
  }
});

// Barcha buyurtmalar
app.get("/api/orders", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM orders
       ORDER BY created_at DESC`
    );

    res.json(result.rows);

  } catch (error) {
    console.error("❌ Orders xatosi:", error);

    res.status(500).json({
      success: false,
      message: "Server xatosi"
    });
  }
});

// Bitta buyurtmani olish
app.get("/api/orders/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const result = await pool.query(
      `SELECT *
       FROM orders
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Buyurtma topilmadi"
      });
    }

    res.json({
      success: true,
      order: result.rows[0]
    });

  } catch (error) {
    console.error("❌ Buyurtma xatosi:", error);

    res.status(500).json({
      success: false,
      message: "Server xatosi"
    });
  }
});

// Buyurtma statusini o‘zgartirish
app.put("/api/orders/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = req.body.status;

    const result = await pool.query(
      `UPDATE orders
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: false,
        message: "Buyurtma topilmadi"
      });
    }

    res.json({
      success: true,
      order: result.rows[0]
    });

  } catch (error) {
    console.error("❌ Status o‘zgartirish xatosi:", error);

    res.status(500).json({
      success: false,
      message: "Server xatosi"
    });
  }
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
