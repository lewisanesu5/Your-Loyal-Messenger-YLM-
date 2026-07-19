require('dotenv').config();
const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
const path       = require('path');
const { Pool }   = require('pg');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ─── Neon PostgreSQL Setup ────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 10000,       // release idle clients before Neon drops them
  connectionTimeoutMillis: 10000,
});

// Prevent unhandled 'error' crash when Neon's serverless compute idles out
pool.on('error', (err) => {
  console.warn('⚠️  Neon idle-client disconnected (will reconnect on next request):', err.message);
});

async function query(sql, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(sql, params);
    return res;
  } finally {
    client.release();
  }
}

// ─── Create Tables ────────────────────────────────────────────────────────────
async function createTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS providers (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      phone         TEXT NOT NULL,
      "vehicleType" TEXT NOT NULL DEFAULT 'motorcycle',
      city          TEXT NOT NULL,
      bio           TEXT DEFAULT '',
      subscription  TEXT NOT NULL DEFAULT 'basic',
      rating        NUMERIC DEFAULT 0,
      "reviewCount" INTEGER DEFAULT 0,
      verified      BOOLEAN DEFAULT false,
      active        BOOLEAN DEFAULT true,
      "joinedAt"    BIGINT NOT NULL,
      deliveries    INTEGER DEFAULT 0,
      avatar        TEXT DEFAULT '',
      coverages     JSONB DEFAULT '[]',
      "pricePerKm"  NUMERIC DEFAULT 2.0,
      "minFee"      NUMERIC DEFAULT 5.0
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id               SERIAL PRIMARY KEY,
      "customerName"   TEXT NOT NULL,
      "customerPhone"  TEXT DEFAULT '',
      pickup           TEXT NOT NULL,
      dropoff          TEXT NOT NULL,
      "providerId"     INTEGER,
      "providerName"   TEXT DEFAULT 'Any available',
      status           TEXT NOT NULL DEFAULT 'requested',
      "createdAt"      BIGINT NOT NULL,
      "packageType"    TEXT DEFAULT 'general',
      notes            TEXT DEFAULT '',
      "estimatedPrice" NUMERIC DEFAULT 0,
      "statusHistory"  JSONB DEFAULT '[]',
      "paymentMethod"  TEXT DEFAULT '',
      "paymentRef"     TEXT DEFAULT '',
      "paymentStatus"  TEXT DEFAULT 'pending',
      "pickupLat"      NUMERIC,
      "pickupLng"      NUMERIC,
      "dropoffLat"     NUMERIC,
      "dropoffLng"     NUMERIC
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id             SERIAL PRIMARY KEY,
      "providerId"   INTEGER NOT NULL REFERENCES providers(id),
      "customerName" TEXT NOT NULL,
      rating         INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment        TEXT DEFAULT '',
      "createdAt"    BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id      SERIAL PRIMARY KEY,
      type    TEXT NOT NULL,
      message TEXT NOT NULL,
      time    BIGINT NOT NULL
    );
  `);
}

// ─── Seed Data ────────────────────────────────────────────────────────────────
const seedProviders = [
  { name:'Blessing Moyo',      phone:'+263 77 123 4567', vehicleType:'motorcycle', city:'Harare',
    bio:'Fast & reliable same-day courier across Harare CBD.', subscription:'premium',
    rating:4.8, reviewCount:24, verified:true, deliveries:143,
    avatar:'BM', coverages:['CBD','Avondale','Borrowdale'], pricePerKm:2.5, minFee:5 },
  { name:'Chido Logistics',    phone:'+263 71 987 6543', vehicleType:'van',        city:'Harare',
    bio:'Professional van courier for bulk and business deliveries.', subscription:'standard',
    rating:4.5, reviewCount:18, verified:true, deliveries:89,
    avatar:'CL', coverages:['Harare','Chitungwiza'], pricePerKm:4.0, minFee:12 },
  { name:'Tinashe Swift Rides',phone:'+263 73 555 1234', vehicleType:'bicycle',    city:'Bulawayo',
    bio:'Eco-friendly bicycle courier in Bulawayo city centre.', subscription:'basic',
    rating:4.2, reviewCount:9,  verified:false,deliveries:34,
    avatar:'TS', coverages:['Bulawayo CBD','Suburbs'], pricePerKm:1.5, minFee:3 },
  { name:'Makomborero Freight', phone:'+263 78 222 9999', vehicleType:'truck',     city:'Harare',
    bio:'Heavy freight & logistics solutions across Zimbabwe.', subscription:'premium',
    rating:4.9, reviewCount:41, verified:true, deliveries:267,
    avatar:'MF', coverages:['Nationwide'], pricePerKm:8.0, minFee:30 },
  { name:'Rudo Express',       phone:'+263 71 444 7777', vehicleType:'motorcycle', city:'Mutare',
    bio:'Quick parcels in Mutare and surrounds.', subscription:'standard',
    rating:4.6, reviewCount:15, verified:true, deliveries:78,
    avatar:'RE', coverages:['Mutare','Sakubva'], pricePerKm:2.0, minFee:4 },
];

const seedReviews = [
  { providerId:1, customerName:'Alice Dube',        rating:5, comment:'Incredibly fast! Package arrived in perfect condition.' },
  { providerId:1, customerName:'Tendai M.',         rating:5, comment:'Very professional and communicative throughout.' },
  { providerId:4, customerName:'Business Corp Ltd.',rating:5, comment:'Best freight service in Zimbabwe. Highly recommended!' },
  { providerId:2, customerName:'Grace N.',          rating:4, comment:'Reliable service, good communication.' },
];

async function seedIfEmpty() {
  const { rows } = await query('SELECT COUNT(*) AS c FROM providers');
  if (parseInt(rows[0].c) > 0) return;

  console.log('🌱 Seeding Neon database…');
  const now = Date.now();

  for (const p of seedProviders) {
    await query(`
      INSERT INTO providers (name,phone,"vehicleType",city,bio,subscription,rating,"reviewCount",verified,active,"joinedAt",deliveries,avatar,coverages,"pricePerKm","minFee")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11,$12,$13,$14,$15)
    `, [p.name, p.phone, p.vehicleType, p.city, p.bio, p.subscription,
        p.rating, p.reviewCount, p.verified, now - 86400000 * 30,
        p.deliveries, p.avatar, JSON.stringify(p.coverages), p.pricePerKm, p.minFee]);
  }

  for (const r of seedReviews) {
    await query(`
      INSERT INTO reviews ("providerId","customerName",rating,comment,"createdAt")
      VALUES ($1,$2,$3,$4,$5)
    `, [r.providerId, r.customerName, r.rating, r.comment, now - 86400000 * 3]);
  }

  await query(`
    INSERT INTO bookings ("customerName","customerPhone",pickup,dropoff,"providerId","providerName",status,"createdAt","packageType",notes,"estimatedPrice","paymentMethod","paymentRef","paymentStatus","statusHistory")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
  `, ['Alice Dube','+263 77 111 2222',
      '123 Samora Machel Ave, Harare','45 Borrowdale Rd, Harare',
      1,'Blessing Moyo','delivered', now - 86400000 * 2,
      'documents','Handle with care', 8.50,
      'ecocash','ECO-20260714-001','paid',
      JSON.stringify([
        { status:'requested',  time: now - 86400000*2 },
        { status:'confirmed',  time: now - 86400000*2 + 600000 },
        { status:'in-transit', time: now - 86400000*2 + 1800000 },
        { status:'delivered',  time: now - 86400000*2 + 3600000 },
      ])]);

  console.log('✅ Seed data inserted into Neon');
}

// ─── Subscription Plans ───────────────────────────────────────────────────────
const subscriptionPlans = {
  basic:    { name:'Basic',    price:15, currency:'USD', highlighted:false,
    features:['Business profile','Up to 10 delivery requests/month','Standard listing','Customer enquiries','Basic support'] },
  standard: { name:'Standard', price:35, currency:'USD', highlighted:false,
    features:['Priority listing','Unlimited delivery requests','Business analytics','Priority customer support','Promotional opportunities','Verification badge (6 months)'] },
  premium:  { name:'Premium',  price:65, currency:'USD', highlighted:true,
    features:['Featured placement (top of search)','Unlimited delivery requests','Verification badge','Advanced analytics & reporting','Marketing tools','Dedicated account manager','SMS notifications','Fleet management tools'] },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normaliseProvider(p) {
  return {
    ...p,
    coverages:   Array.isArray(p.coverages) ? p.coverages : JSON.parse(p.coverages || '[]'),
    verified:    Boolean(p.verified),
    active:      Boolean(p.active),
    rating:      parseFloat(p.rating) || 0,
    pricePerKm:  parseFloat(p.pricePerKm) || 0,
    minFee:      parseFloat(p.minFee) || 0,
  };
}

function normaliseBooking(b) {
  return {
    ...b,
    statusHistory: Array.isArray(b.statusHistory) ? b.statusHistory : JSON.parse(b.statusHistory || '[]'),
    estimatedPrice: parseFloat(b.estimatedPrice) || 0,
  };
}

async function recalcRating(providerId) {
  const { rows } = await query(
    'SELECT AVG(rating) AS avg, COUNT(*) AS cnt FROM reviews WHERE "providerId"=$1',
    [providerId]
  );
  if (rows[0] && parseInt(rows[0].cnt) > 0) {
    await query(
      'UPDATE providers SET rating=$1,"reviewCount"=$2 WHERE id=$3',
      [Math.round(parseFloat(rows[0].avg) * 10) / 10, parseInt(rows[0].cnt), providerId]
    );
  }
}

async function addNotification(type, message) {
  await query('INSERT INTO notifications (type,message,time) VALUES ($1,$2,$3)', [type, message, Date.now()]);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => res.json({ status:'ok', db:'neon-postgresql', timestamp:Date.now() }));
app.get('/api/subscriptions', (req, res) => res.json(subscriptionPlans));

// ── Providers ─────────────────────────────────────────────────────────────────
app.get('/api/providers', async (req, res) => {
  try {
    const { city, vehicleType, search, sort } = req.query;
    let sql    = 'SELECT * FROM providers WHERE active=true';
    const vals = [];
    let i = 1;

    if (city)        { sql += ` AND city ILIKE $${i++}`;         vals.push(`%${city}%`); }
    if (vehicleType && vehicleType !== 'all') { sql += ` AND "vehicleType"=$${i++}`; vals.push(vehicleType); }

    const subOrder = `CASE subscription WHEN 'premium' THEN 0 WHEN 'standard' THEN 1 ELSE 2 END`;
    if (sort === 'rating')          sql += ' ORDER BY rating DESC';
    else if (sort === 'price')      sql += ' ORDER BY "pricePerKm" ASC';
    else if (sort === 'deliveries') sql += ' ORDER BY deliveries DESC';
    else                            sql += ` ORDER BY ${subOrder}, rating DESC`;

    let { rows } = await query(sql, vals);

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        (p.bio || '').toLowerCase().includes(q)
      );
    }

    res.json(rows.map(normaliseProvider));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/providers/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM providers WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error:'Provider not found' });
    const rev = await query('SELECT * FROM reviews WHERE "providerId"=$1 ORDER BY "createdAt" DESC', [req.params.id]);
    res.json({ ...normaliseProvider(rows[0]), reviews: rev.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/providers', async (req, res) => {
  try {
    const { name, phone, vehicleType, city, bio, subscription, coverages, pricePerKm, minFee } = req.body;
    if (!name || !phone || !city) return res.status(400).json({ error:'name, phone, and city are required' });

    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const { rows } = await query(`
      INSERT INTO providers (name,phone,"vehicleType",city,bio,subscription,rating,"reviewCount",verified,active,"joinedAt",deliveries,avatar,coverages,"pricePerKm","minFee")
      VALUES ($1,$2,$3,$4,$5,$6,0,0,false,true,$7,0,$8,$9,$10,$11)
      RETURNING *
    `, [name, phone, vehicleType||'motorcycle', city, bio||'', subscription||'basic',
        Date.now(), initials, JSON.stringify(coverages||[]),
        parseFloat(pricePerKm)||2.0, parseFloat(minFee)||5.0]);

    await addNotification('new_provider', `New messenger registered: ${name}`);
    res.status(201).json(normaliseProvider(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Bookings ──────────────────────────────────────────────────────────────────
app.get('/api/bookings', async (req, res) => {
  try {
    const { status, customerName } = req.query;
    let sql    = 'SELECT * FROM bookings WHERE 1=1';
    const vals = [];
    let i = 1;
    if (status)       { sql += ` AND status=$${i++}`;                   vals.push(status); }
    if (customerName) { sql += ` AND "customerName" ILIKE $${i++}`;     vals.push(`%${customerName}%`); }
    sql += ' ORDER BY "createdAt" DESC';
    const { rows } = await query(sql, vals);
    res.json(rows.map(normaliseBooking));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bookings/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM bookings WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error:'Booking not found' });
    res.json(normaliseBooking(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    const { customerName, customerPhone, pickup, dropoff, providerId,
            packageType, notes, estimatedPrice,
            paymentMethod, paymentRef } = req.body;
    if (!customerName || !pickup || !dropoff)
      return res.status(400).json({ error:'customerName, pickup, dropoff are required' });

    let providerName = 'Any available';
    if (providerId) {
      const { rows } = await query('SELECT name FROM providers WHERE id=$1', [providerId]);
      if (rows.length) {
        providerName = rows[0].name;
        await query('UPDATE providers SET deliveries=deliveries+1 WHERE id=$1', [providerId]);
      }
    }

    const statusHistory = JSON.stringify([{ status:'requested', time:Date.now() }]);
    const { rows } = await query(`
      INSERT INTO bookings ("customerName","customerPhone",pickup,dropoff,"providerId","providerName",status,"createdAt","packageType",notes,"estimatedPrice","paymentMethod","paymentRef","paymentStatus","statusHistory")
      VALUES ($1,$2,$3,$4,$5,$6,'requested',$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [customerName, customerPhone||'', pickup, dropoff,
        providerId||null, providerName, Date.now(),
        packageType||'general', notes||'',
        parseFloat(estimatedPrice)||0,
        paymentMethod||'', paymentRef||'',
        paymentMethod ? 'initiated' : 'pending',
        statusHistory]);

    await addNotification('new_booking', `New booking #${rows[0].id} from ${customerName}`);
    res.status(201).json(normaliseBooking(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/bookings/:id/status', async (req, res) => {
  try {
    const { rows: bRows } = await query('SELECT * FROM bookings WHERE id=$1', [req.params.id]);
    if (!bRows.length) return res.status(404).json({ error:'Booking not found' });
    const valid = ['requested','confirmed','in-transit','delivered','cancelled'];
    const { status } = req.body;
    if (!valid.includes(status)) return res.status(400).json({ error:'Invalid status' });

    const history = normaliseBooking(bRows[0]).statusHistory;
    history.push({ status, time: Date.now() });
    const { rows } = await query(
      'UPDATE bookings SET status=$1,"statusHistory"=$2 WHERE id=$3 RETURNING *',
      [status, JSON.stringify(history), req.params.id]
    );
    res.json(normaliseBooking(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/bookings/:id/payment', async (req, res) => {
  try {
    const { rows: bRows } = await query('SELECT * FROM bookings WHERE id=$1', [req.params.id]);
    if (!bRows.length) return res.status(404).json({ error:'Booking not found' });
    const b = bRows[0];
    const { paymentMethod, paymentRef, paymentStatus } = req.body;
    const { rows } = await query(
      'UPDATE bookings SET "paymentMethod"=$1,"paymentRef"=$2,"paymentStatus"=$3 WHERE id=$4 RETURNING *',
      [paymentMethod||b.paymentMethod, paymentRef||b.paymentRef, paymentStatus||b.paymentStatus, b.id]
    );
    res.json(normaliseBooking(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Reviews ───────────────────────────────────────────────────────────────────
app.get('/api/reviews', async (req, res) => {
  try {
    const { providerId } = req.query;
    let sql = 'SELECT * FROM reviews';
    const vals = [];
    if (providerId) { sql += ' WHERE "providerId"=$1'; vals.push(providerId); }
    sql += ' ORDER BY "createdAt" DESC';
    const { rows } = await query(sql, vals);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { providerId, customerName, rating, comment } = req.body;
    if (!providerId || !customerName || !rating)
      return res.status(400).json({ error:'providerId, customerName, rating required' });
    if (+rating < 1 || +rating > 5) return res.status(400).json({ error:'Rating must be 1–5' });

    const { rows: pRows } = await query('SELECT id FROM providers WHERE id=$1', [providerId]);
    if (!pRows.length) return res.status(404).json({ error:'Provider not found' });

    const { rows } = await query(
      'INSERT INTO reviews ("providerId","customerName",rating,comment,"createdAt") VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [+providerId, customerName, +rating, comment||'', Date.now()]
    );
    await recalcRating(+providerId);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin Stats ───────────────────────────────────────────────────────────────
app.get('/api/admin/stats', async (req, res) => {
  try {
    const [provRes, bookRes, revRes, notifRes] = await Promise.all([
      query('SELECT * FROM providers'),
      query('SELECT * FROM bookings'),
      query('SELECT COUNT(*) AS c FROM reviews'),
      query('SELECT * FROM notifications ORDER BY time DESC LIMIT 10'),
    ]);

    const providers = provRes.rows.map(normaliseProvider);
    const bookings  = bookRes.rows.map(normaliseBooking);

    const active    = providers.filter(p => p.active).length;
    const verified  = providers.filter(p => p.verified).length;
    const completed = bookings.filter(b => b.status === 'delivered').length;
    const pending   = bookings.filter(b => b.status === 'requested').length;
    const commissions = bookings.filter(b => b.status === 'delivered').reduce((s, b) => s + b.estimatedPrice * 0.1, 0);

    const subCount = { basic:0, standard:0, premium:0 };
    providers.forEach(p => { if (subCount[p.subscription] !== undefined) subCount[p.subscription]++; });
    const monthlyRevenue = subCount.basic*15 + subCount.standard*35 + subCount.premium*65;

    const vehicles = providers.reduce((a, p) => { a[p.vehicleType]=(a[p.vehicleType]||0)+1; return a; }, {});
    const cities   = providers.reduce((a, p) => { a[p.city]=(a[p.city]||0)+1; return a; }, {});

    res.json({
      providers: { total:providers.length, active, verified },
      bookings:  { total:bookings.length, completed, pending },
      revenue:   { commissions:Math.round(commissions*100)/100, subscriptions:monthlyRevenue },
      subscriptions: subCount,
      vehicles, cities,
      totalReviews: parseInt(revRes.rows[0].c),
      recentNotifications: notifRes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM notifications ORDER BY time DESC LIMIT 20');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Static ───────────────────────────────────────────────────────────────────
app.use('/', express.static(path.join(__dirname, 'frontend')));

// ─── Boot ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
(async () => {
  try {
    await pool.connect();
    console.log('✅ Connected to Neon PostgreSQL');
    await createTables();
    await seedIfEmpty();
    app.listen(PORT, () => console.log(`✅ YLM server running on http://localhost:${PORT} (Neon PostgreSQL)`));
  } catch (err) {
    console.error('❌ Failed to connect to Neon:', err.message);
    process.exit(1);
  }
})();
