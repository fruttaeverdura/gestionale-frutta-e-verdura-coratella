const express = require('express');
const path = require('path');
const methodOverride = require('method-override');
const { readDb, writeDb, nextId, searchEverywhere } = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  const db = readDb();
  res.locals.settings = db.settings;
  res.locals.currentPath = req.path;
  next();
});

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function orderTotal(order) {
  return (order.items || []).reduce((sum, item) => sum + num(item.qty) * num(item.price), 0);
}

function enrichOrder(order, db) {
  const client = db.clients.find(c => c.id === order.clientId);
  return {
    ...order,
    client,
    total: orderTotal(order),
    totalItems: (order.items || []).reduce((acc, item) => acc + num(item.qty), 0)
  };
}

function enrichClient(client, db) {
  const orders = db.orders.filter(o => o.clientId === client.id).map(o => enrichOrder(o, db));
  return {
    ...client,
    orders,
    totalSpent: orders.reduce((sum, o) => sum + o.total, 0),
    lastOrderDate: orders.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]?.date || null
  };
}

app.get('/', (req, res) => {
  const db = readDb();
  const clients = db.clients.map(c => enrichClient(c, db));
  const orders = db.orders.map(o => enrichOrder(o, db));

  const dashboard = {
    clients: clients.length,
    openOrders: orders.filter(o => o.status !== 'Consegnato' && o.status !== 'Annullato').length,
    deliveredOrders: orders.filter(o => o.status === 'Consegnato').length,
    totalRevenue: orders.filter(o => o.status === 'Consegnato').reduce((sum, o) => sum + o.total, 0)
  };

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = orders
    .filter(o => o.status !== 'Consegnato' && o.status !== 'Annullato')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  res.render('dashboard', { dashboard, clients, orders, upcoming, today });
});

app.get('/clients', (req, res) => {
  const db = readDb();
  const q = req.query.q || '';
  const results = searchEverywhere(db, q);
  const clients = results.clients.map(c => enrichClient(c, db)).sort((a,b) => a.name.localeCompare(b.name));
  res.render('clients', { clients, q });
});

app.post('/clients', (req, res) => {
  const db = readDb();
  const client = {
    id: nextId(db, 'clients'),
    name: req.body.name?.trim() || 'Cliente senza nome',
    phone: req.body.phone?.trim() || '',
    city: req.body.city?.trim() || '',
    address: req.body.address?.trim() || '',
    notes: req.body.notes?.trim() || '',
    createdAt: new Date().toISOString()
  };
  db.clients.push(client);
  writeDb(db);
  res.redirect('/clients');
});

app.get('/clients/:id', (req, res) => {
  const db = readDb();
  const client = db.clients.find(c => c.id === Number(req.params.id));
  if (!client) return res.status(404).send('Cliente non trovato');
  res.render('client-detail', { client: enrichClient(client, db) });
});

app.post('/clients/:id/update', (req, res) => {
  const db = readDb();
  const client = db.clients.find(c => c.id === Number(req.params.id));
  if (!client) return res.status(404).send('Cliente non trovato');
  client.name = req.body.name?.trim() || client.name;
  client.phone = req.body.phone?.trim() || '';
  client.city = req.body.city?.trim() || '';
  client.address = req.body.address?.trim() || '';
  client.notes = req.body.notes?.trim() || '';
  writeDb(db);
  res.redirect(`/clients/${client.id}`);
});

app.post('/clients/:id/delete', (req, res) => {
  const db = readDb();
  const clientId = Number(req.params.id);
  db.clients = db.clients.filter(c => c.id !== clientId);
  db.orders = db.orders.filter(o => o.clientId !== clientId);
  writeDb(db);
  res.redirect('/clients');
});

app.get('/orders', (req, res) => {
  const db = readDb();
  const status = req.query.status || '';
  let orders = db.orders.map(o => enrichOrder(o, db)).sort((a,b) => (b.date || '').localeCompare(a.date || ''));
  if (status) orders = orders.filter(o => o.status === status);
  res.render('orders', { orders, clients: db.clients.sort((a,b) => a.name.localeCompare(b.name)), status });
});

app.post('/orders', (req, res) => {
  const db = readDb();
  const items = [];
  const names = Array.isArray(req.body.itemName) ? req.body.itemName : [req.body.itemName];
  const qtys = Array.isArray(req.body.itemQty) ? req.body.itemQty : [req.body.itemQty];
  const units = Array.isArray(req.body.itemUnit) ? req.body.itemUnit : [req.body.itemUnit];
  const prices = Array.isArray(req.body.itemPrice) ? req.body.itemPrice : [req.body.itemPrice];

  for (let i = 0; i < names.length; i += 1) {
    const name = (names[i] || '').trim();
    if (!name) continue;
    items.push({
      name,
      qty: num(qtys[i]),
      unit: (units[i] || 'kg').trim(),
      price: num(prices[i])
    });
  }

  const order = {
    id: nextId(db, 'orders'),
    clientId: Number(req.body.clientId),
    date: req.body.date || new Date().toISOString().slice(0, 10),
    status: req.body.status || 'Da preparare',
    items,
    notes: req.body.notes?.trim() || ''
  };

  db.orders.push(order);
  writeDb(db);
  res.redirect('/orders');
});

app.post('/orders/:id/status', (req, res) => {
  const db = readDb();
  const order = db.orders.find(o => o.id === Number(req.params.id));
  if (!order) return res.status(404).send('Ordine non trovato');
  order.status = req.body.status || order.status;
  writeDb(db);
  res.redirect('/orders');
});

app.post('/orders/:id/delete', (req, res) => {
  const db = readDb();
  db.orders = db.orders.filter(o => o.id !== Number(req.params.id));
  writeDb(db);
  res.redirect('/orders');
});

app.get('/agenda', (req, res) => {
  const db = readDb();
  const orders = db.orders.map(o => enrichOrder(o, db)).sort((a,b) => (a.date || '').localeCompare(b.date || ''));
  const grouped = {};
  for (const order of orders) {
    grouped[order.date] = grouped[order.date] || [];
    grouped[order.date].push(order);
  }
  res.render('agenda', { grouped });
});

app.get('/settings', (req, res) => {
  const db = readDb();
  res.render('settings', { config: db.settings });
});

app.post('/settings', (req, res) => {
  const db = readDb();
  db.settings.companyName = req.body.companyName?.trim() || db.settings.companyName;
  db.settings.internalName = req.body.internalName?.trim() || db.settings.internalName;
  db.settings.phone = req.body.phone?.trim() || db.settings.phone;
  db.settings.whatsapp = req.body.whatsapp?.trim() || db.settings.whatsapp;
  db.settings.email = req.body.email?.trim() || db.settings.email;
  db.settings.address = req.body.address?.trim() || db.settings.address;
  db.settings.logoText = req.body.logoText?.trim() || db.settings.logoText;
  writeDb(db);
  res.redirect('/settings');
});

app.get('/backup/export', (req, res) => {
  const db = readDb();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="backup-coratella.json"');
  res.send(JSON.stringify(db, null, 2));
});

app.post('/backup/import', (req, res) => {
  try {
    const parsed = JSON.parse(req.body.payload || '{}');
    if (!parsed.clients || !parsed.orders || !parsed.settings || !parsed.counters) {
      return res.status(400).send('Backup non valido');
    }
    writeDb(parsed);
    res.redirect('/settings');
  } catch (error) {
    res.status(400).send('JSON non valido');
  }
});

app.listen(PORT, () => {
  console.log(`Gestionale Coratella avviato su http://localhost:${PORT}`);
});
