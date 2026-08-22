const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

const DATA_FILE = path.join(__dirname, "products.json");

app.use(express.json());
app.use(express.static(__dirname));

function getProducts() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]");
  }

  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveProducts(products) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2));
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

  res.json({ success: true });
});
// ===============================
// BUYURTMALAR
// ===============================

const ORDERS_FILE = path.join(__dirname, "orders.json");

function getOrders() {
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, "[]");
  }

  return JSON.parse(
    fs.readFileSync(ORDERS_FILE, "utf8")
  );
}

function saveOrders(orders) {
  fs.writeFileSync(
    ORDERS_FILE,
    JSON.stringify(orders, null, 2)
  );
}

// Buyurtma qabul qilish
app.post("/api/orders", (req, res) => {

  const orders = getOrders();

  const order = {
    id: Date.now(),
    name: req.body.name,
    phone: req.body.phone,
    address: req.body.address,
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

// Barcha buyurtmalar
app.get("/api/orders", (req, res) => {
  res.json(getOrders());
});
// Bitta buyurtmani olish
app.get("/api/orders/:id", (req, res) => {

  const orders = getOrders();

  const id = Number(req.params.id);

  const order = orders.find(order => order.id === id);

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

// Buyurtma statusini o'zgartirish
app.put("/api/orders/:id", (req, res) => {

  let orders = getOrders();

  const id = Number(req.params.id);
  const status = req.body.status;

  const order = orders.find(order => order.id === id);

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


// Server
app.listen(PORT, () => {
  console.log(`TAVLIXO serveri ishga tushdi: http://localhost:${PORT}`);
});
