const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function baseDb() {
  return {
    settings: {
      companyName: 'Frutta e Verdura di Coratella Marco',
      internalName: 'Raffaele Coratella',
      phone: 'INSERIRE-NUMERO',
      whatsapp: 'INSERIRE-NUMERO-WHATSAPP',
      email: 'INSERIRE-EMAIL',
      address: 'Andria (BT)',
      logoText: 'Coratella Marco'
    },
    clients: [
      {
        id: 1,
        name: 'Ristorante Da Nicola',
        phone: '3400000001',
        city: 'Andria',
        address: 'Via Esempio 12',
        notes: 'Consegna mattina. Preferisce prodotto fresco giornaliero.',
        createdAt: new Date().toISOString()
      },
      {
        id: 2,
        name: 'Bar Centrale',
        phone: '3400000002',
        city: 'Barletta',
        address: 'Piazza Esempio 5',
        notes: 'Ordine ricorrente per frutta da spremuta.',
        createdAt: new Date().toISOString()
      }
    ],
    orders: [
      {
        id: 1,
        clientId: 1,
        date: new Date().toISOString().slice(0, 10),
        status: 'Da preparare',
        items: [
          { name: 'Pomodori', qty: 10, unit: 'kg', price: 2.2 },
          { name: 'Insalata', qty: 8, unit: 'kg', price: 1.8 },
          { name: 'Patate', qty: 20, unit: 'kg', price: 1.1 }
        ],
        notes: 'Consegnare entro le 11:00'
      },
      {
        id: 2,
        clientId: 2,
        date: new Date().toISOString().slice(0, 10),
        status: 'Consegnato',
        items: [
          { name: 'Arance', qty: 15, unit: 'kg', price: 1.4 },
          { name: 'Limoni', qty: 6, unit: 'kg', price: 1.9 }
        ],
        notes: 'Pagato alla consegna'
      }
    ],
    counters: {
      clients: 3,
      orders: 3
    }
  };
}

function ensureDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(baseDb(), null, 2));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function nextId(db, key) {
  const value = db.counters[key] || 1;
  db.counters[key] = value + 1;
  return value;
}

function searchEverywhere(db, term = '') {
  const q = term.trim().toLowerCase();
  if (!q) return { clients: db.clients, orders: db.orders };
  return {
    clients: db.clients.filter(c =>
      [c.name, c.phone, c.city, c.address, c.notes].join(' ').toLowerCase().includes(q)
    ),
    orders: db.orders.filter(o => {
      const client = db.clients.find(c => c.id === o.clientId);
      const items = (o.items || []).map(i => `${i.name} ${i.qty} ${i.unit}`).join(' ');
      return [o.status, o.notes, o.date, client?.name || '', items].join(' ').toLowerCase().includes(q);
    })
  };
}

module.exports = { readDb, writeDb, nextId, searchEverywhere };
