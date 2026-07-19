/* ============================================================
   YLM — Your Loyal Messenger  |  app.js
   ============================================================ */
'use strict';

/* ── State ── */
var allProviders = [];
var allPlans     = {};
var bookingData  = {};
var selectedPlan = 'basic';

/* ── Helpers ── */
function qs(sel, ctx)  { return (ctx || document).querySelector(sel); }
function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

function toast(msg, type) {
  var c   = qs('#toast-container');
  var div = document.createElement('div');
  div.className = 'toast toast--' + (type || 'success');
  div.textContent = msg;
  c.appendChild(div);
  requestAnimationFrame(function () { div.classList.add('toast--visible'); });
  setTimeout(function () {
    div.classList.remove('toast--visible');
    setTimeout(function () { div.remove(); }, 400);
  }, 3500);
}

function timeAgo(ts) {
  var diff = Date.now() - ts, m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return m + 'm ago';
  var h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function vehicleEmoji(v) {
  var map = { motorcycle: '🏍️', bicycle: '🚲', car: '🚗', van: '🚐', truck: '🚛' };
  return map[v] || '📦';
}

function statusBadge(status) {
  var map = {
    'requested':   ['Requested',  'badge--yellow'],
    'confirmed':   ['Confirmed',  'badge--blue'],
    'in-transit':  ['In Transit', 'badge--purple'],
    'delivered':   ['Delivered',  'badge--green'],
    'cancelled':   ['Cancelled',  'badge--red']
  };
  var s = map[status] || [status, 'badge--grey'];
  return '<span class="badge ' + s[1] + '">' + s[0] + '</span>';
}

function apiCall(path, opts) {
  opts = opts || {};
  var init = { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' } };
  if (opts.body) init.body = JSON.stringify(opts.body);
  return fetch(path, init).then(function (res) {
    if (!res.ok) {
      return res.json().catch(function () { throw new Error('HTTP ' + res.status); })
        .then(function (e) { throw new Error(e.error || 'Request failed'); });
    }
    return res.json();
  });
}

/* ══════════════════════════════════════════════
   PAGE ROUTER
══════════════════════════════════════════════ */
function showPage(id) {
  qsa('.page').forEach(function (p) {
    p.classList.toggle('page--active', p.id === 'page-' + id);
  });
  qsa('.nav-link').forEach(function (a) {
    a.classList.toggle('active', a.dataset.page === id);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (id === 'find')  loadFindPage();
  if (id === 'track') loadAllBookings('');
  if (id === 'plans') loadPlansPage();
  if (id === 'join')  loadJoinPlanSelector();
  if (id === 'admin') loadAdminDashboard();
}

/* Global delegated navigation — handles ALL [data-page] links/buttons */
document.addEventListener('click', function (e) {
  /* Skip: Book-Now buttons and plan-choose buttons handled separately */
  if (e.target.closest('.courier-book-btn')) return;
  if (e.target.closest('.plan-choose-btn'))  return;

  var el = e.target.closest('[data-page]');
  if (!el) return;
  e.preventDefault();
  var page   = el.dataset.page;
  var filter = el.dataset.filter;
  showPage(page);
  if (filter && page === 'find') {
    var vSel = qs('#filter-vehicle');
    if (vSel) { vSel.value = filter; applyFilters(); }
  }
});

/* Hamburger */
(function () {
  var hbg = qs('#nav-hamburger');
  if (!hbg) return;
  hbg.addEventListener('click', function () {
    var links = qs('#nav-links');
    var open  = links.classList.toggle('nav-links--open');
    hbg.setAttribute('aria-expanded', String(open));
  });
}());

/* ══════════════════════════════════════════════
   STAT COUNTERS
══════════════════════════════════════════════ */
function animateCounter(el) {
  var target = parseInt(el.dataset.target, 10);
  var cur    = 0;
  var step   = Math.ceil(target / 60);
  var t = setInterval(function () {
    cur = Math.min(cur + step, target);
    el.textContent = cur + '+';
    if (cur >= target) { el.textContent = target + '+'; clearInterval(t); }
  }, 24);
}
var cObserver = new IntersectionObserver(function (entries) {
  entries.forEach(function (e) {
    if (e.isIntersecting && !e.target.dataset.done) {
      e.target.dataset.done = '1';
      animateCounter(e.target);
    }
  });
}, { threshold: 0.5 });
qsa('.stat-number').forEach(function (el) { cObserver.observe(el); });

/* ══════════════════════════════════════════════
   COURIER CARD RENDERER
══════════════════════════════════════════════ */
function renderCourierCard(p) {
  var ver = p.verified ? '<span class="verified-badge">✅ Verified</span>' : '';
  var sub = p.subscription === 'premium' ? '<span class="premium-badge">⭐ Premium</span>' : '';
  var cov = (p.coverages || []).map(function (c) {
    return '<span class="coverage-tag">' + c + '</span>';
  }).join('');
  return [
    '<div class="courier-card" data-id="' + p.id + '" tabindex="0" role="button" id="courier-card-' + p.id + '">',
      '<div class="courier-card__header">',
        '<div class="courier-avatar">' + (p.avatar || p.name[0]) + '</div>',
        '<div class="courier-info">',
          '<div class="courier-name">' + p.name + ' ' + ver + '</div>',
          '<div class="courier-meta">' + vehicleEmoji(p.vehicleType) + ' ' + p.vehicleType + ' · ' + p.city + '</div>',
        '</div>',
        sub,
      '</div>',
      '<div class="courier-stats">',
        '<div class="courier-stat"><span class="courier-stat__value">' + (p.rating || 'New') + '</span><span class="courier-stat__label">Rating</span></div>',
        '<div class="courier-stat"><span class="courier-stat__value">' + p.deliveries + '</span><span class="courier-stat__label">Deliveries</span></div>',
        '<div class="courier-stat"><span class="courier-stat__value">$' + p.pricePerKm + '/km</span><span class="courier-stat__label">Rate</span></div>',
      '</div>',
      '<div class="courier-coverages">' + cov + '</div>',
      '<button class="btn btn--primary btn--sm courier-book-btn" data-id="' + p.id + '" id="book-btn-' + p.id + '">Book Now</button>',
    '</div>'
  ].join('');
}

/* ══════════════════════════════════════════════
   HOME — FEATURED COURIERS
══════════════════════════════════════════════ */
function loadFeaturedCouriers() {
  apiCall('/api/providers?sort=rating').then(function (providers) {
    var el = qs('#featured-couriers');
    if (el) el.innerHTML = providers.slice(0, 3).map(renderCourierCard).join('');
  }).catch(function () {});
}

/* ══════════════════════════════════════════════
   FIND COURIERS PAGE
══════════════════════════════════════════════ */
function loadFindPage() {
  apiCall('/api/providers').then(function (providers) {
    allProviders = providers;
    renderCourierGrid(providers);
  }).catch(function (err) { toast('Could not load couriers: ' + err.message, 'error'); });
}

function renderCourierGrid(list) {
  var grid  = qs('#couriers-results');
  var empty = qs('#couriers-empty');
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  grid.innerHTML = list.map(renderCourierCard).join('');
}

function applyFilters() {
  var search  = (qs('#search-input')  ? qs('#search-input').value  : '').toLowerCase().trim();
  var city    =  qs('#filter-city')   ? qs('#filter-city').value   : '';
  var vehicle =  qs('#filter-vehicle')? qs('#filter-vehicle').value : '';
  var sort    =  qs('#filter-sort')   ? qs('#filter-sort').value   : '';

  var list = allProviders.slice();
  if (city)                         list = list.filter(function (p) { return p.city === city; });
  if (vehicle && vehicle !== 'all') list = list.filter(function (p) { return p.vehicleType === vehicle; });
  if (search)                       list = list.filter(function (p) {
    return (p.name + ' ' + p.city + ' ' + (p.bio || '')).toLowerCase().indexOf(search) >= 0;
  });
  if (sort === 'rating')          list.sort(function (a, b) { return b.rating - a.rating; });
  else if (sort === 'price')      list.sort(function (a, b) { return a.pricePerKm - b.pricePerKm; });
  else if (sort === 'deliveries') list.sort(function (a, b) { return b.deliveries - a.deliveries; });

  renderCourierGrid(list);
}

document.addEventListener('input',  function (e) {
  if (e.target.id === 'search-input') applyFilters();
});
document.addEventListener('change', function (e) {
  var id = e.target.id;
  if (id === 'filter-city' || id === 'filter-vehicle' || id === 'filter-sort') applyFilters();
});

/* ══════════════════════════════════════════════
   COURIER DETAIL MODAL
══════════════════════════════════════════════ */
function openCourierModal(provider) {
  var modal = qs('#courier-modal');
  var body  = qs('#modal-body');
  if (!modal || !body) return;

  var revHtml = (provider.reviews && provider.reviews.length)
    ? provider.reviews.map(function (r) {
        return [
          '<div class="review-item">',
            '<div class="review-header">',
              '<strong>' + r.customerName + '</strong>',
              '<span class="review-stars">' + '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) + '</span>',
              '<span class="review-time">' + timeAgo(r.createdAt) + '</span>',
            '</div>',
            '<p class="review-comment">' + (r.comment || '') + '</p>',
          '</div>'
        ].join('');
      }).join('')
    : '<p class="no-reviews">No reviews yet — be the first!</p>';

  var covHtml = (provider.coverages || []).map(function (c) {
    return '<span class="coverage-tag">' + c + '</span>';
  }).join(' ');

  var starBtnsHtml = [1,2,3,4,5].map(function (n) {
    return '<button type="button" class="star-btn" data-val="' + n + '">★</button>';
  }).join('');

  body.innerHTML = [
    '<div class="modal-courier-header">',
      '<div class="modal-avatar">' + (provider.avatar || provider.name[0]) + '</div>',
      '<div>',
        '<h2 id="modal-courier-name">' + provider.name +
          (provider.verified ? ' <span class="verified-badge">✅ Verified</span>' : '') + '</h2>',
        '<p>' + vehicleEmoji(provider.vehicleType) + ' ' + provider.vehicleType + ' · ' + provider.city + '</p>',
        '<p class="modal-stars">⭐ <strong>' + (provider.rating || 'New') + '</strong>',
          ' <span class="modal-review-count">(' + (provider.reviewCount || 0) + ' reviews)</span></p>',
      '</div>',
    '</div>',
    '<div class="modal-stats-row">',
      '<div class="modal-stat"><span>' + provider.deliveries + '</span><small>Deliveries</small></div>',
      '<div class="modal-stat"><span>$' + provider.pricePerKm + '/km</span><small>Rate</small></div>',
      '<div class="modal-stat"><span>$' + provider.minFee + '</span><small>Min Fee</small></div>',
      '<div class="modal-stat"><span class="pill pill--' + provider.subscription + '">' + provider.subscription + '</span><small>Plan</small></div>',
    '</div>',
    (provider.bio ? '<p class="modal-bio">' + provider.bio + '</p>' : ''),
    '<div class="modal-coverages"><strong>Coverage:</strong> ' + covHtml + '</div>',
    '<div class="modal-contact"><strong>📞</strong> ' + provider.phone + '</div>',
    '<div class="modal-actions">',
      '<button class="btn btn--primary btn--lg" id="modal-book-this-btn" data-id="' + provider.id + '">',
        '📅 Book ' + provider.name.split(' ')[0],
      '</button>',
    '</div>',
    '<div class="modal-reviews"><h3>Customer Reviews</h3>' + revHtml + '</div>',
    '<div class="modal-leave-review"><h3>Leave a Review</h3>',
      '<form id="review-form">',
        '<div class="form-group"><input type="text" id="review-name" placeholder="Your name" required /></div>',
        '<div class="star-rating-input">' + starBtnsHtml + '</div>',
        '<input type="hidden" id="review-rating" value="0" />',
        '<div class="form-group"><textarea id="review-comment" placeholder="Share your experience…" rows="3"></textarea></div>',
        '<button type="submit" class="btn btn--secondary" id="review-submit-btn">Submit Review</button>',
      '</form>',
    '</div>'
  ].join('');

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  /* Star rating */
  var sBtns  = qsa('.star-btn', body);
  var rInput = qs('#review-rating', body);
  sBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var val = parseInt(btn.dataset.val);
      rInput.value = val;
      sBtns.forEach(function (b) { b.classList.toggle('star-btn--active', parseInt(b.dataset.val) <= val); });
    });
    btn.addEventListener('mouseenter', function () {
      var val = parseInt(btn.dataset.val);
      sBtns.forEach(function (b) { b.classList.toggle('star-btn--hover', parseInt(b.dataset.val) <= val); });
    });
    btn.addEventListener('mouseleave', function () {
      sBtns.forEach(function (b) { b.classList.remove('star-btn--hover'); });
    });
  });

  /* Book-this button */
  var bookThisBtn = qs('#modal-book-this-btn', body);
  if (bookThisBtn) {
    bookThisBtn.addEventListener('click', function () {
      bookingData.providerId   = provider.id;
      bookingData.providerName = provider.name;
      closeModal();
      showPage('book');
      setTimeout(function () { preselectProvider(provider.id); }, 250);
    });
  }

  /* Review form */
  var rForm = qs('#review-form', body);
  if (rForm) {
    rForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name    = qs('#review-name', body).value.trim();
      var rating  = parseInt(qs('#review-rating', body).value);
      var comment = (qs('#review-comment', body) || {}).value || '';
      if (!name)   return toast('Please enter your name', 'error');
      if (!rating) return toast('Please select a star rating', 'error');
      var btn = qs('#review-submit-btn', body);
      btn.disabled = true; btn.textContent = 'Submitting…';
      apiCall('/api/reviews', {
        method: 'POST',
        body: { providerId: provider.id, customerName: name, rating: rating, comment: comment }
      }).then(function () {
        toast('Review submitted! Thank you 🎉');
        closeModal();
        return apiCall('/api/providers');
      }).then(function (p) { allProviders = p; })
      .catch(function (err) {
        toast(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Submit Review';
      });
    });
  }
}

function closeModal() {
  var m = qs('#courier-modal');
  if (m) m.style.display = 'none';
  document.body.style.overflow = '';
}

(function () {
  var mc = qs('#modal-close-btn'), mo = qs('#modal-overlay');
  if (mc) mc.addEventListener('click', closeModal);
  if (mo) mo.addEventListener('click', closeModal);
}());
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

/* Card click / Book-Now (delegated) */
document.addEventListener('click', function (e) {
  var bookBtn = e.target.closest('.courier-book-btn');
  if (bookBtn) {
    e.stopPropagation();
    bookingData.providerId = bookBtn.dataset.id;
    showPage('book');
    setTimeout(function () { preselectProvider(bookBtn.dataset.id); }, 250);
    return;
  }
  var card = e.target.closest('.courier-card');
  if (card && !e.target.closest('button')) {
    apiCall('/api/providers/' + card.dataset.id)
      .then(function (p) { openCourierModal(p); })
      .catch(function () { toast('Could not load courier details', 'error'); });
  }
});

function preselectProvider(id) {
  var sel = qs('#book-provider');
  if (!sel) return;
  for (var i = 0; i < sel.options.length; i++) {
    if (String(sel.options[i].value) === String(id)) { sel.selectedIndex = i; break; }
  }
}

/* ══════════════════════════════════════════════
   BOOK DELIVERY — MULTI-STEP FORM
══════════════════════════════════════════════ */
function goToBookStep(n) {
  for (var i = 1; i <= 3; i++) {
    var sEl = qs('#book-step-' + i);
    var dEl = qs('#bstep-' + i);
    if (sEl) sEl.style.display = (i === n) ? 'block' : 'none';
    if (dEl) {
      dEl.classList.toggle('active',    i === n);
      dEl.classList.toggle('completed', i < n);
    }
  }
}

function loadCourierDropdown() {
  var sel = qs('#book-provider');
  if (!sel) return;
  apiCall('/api/providers').then(function (providers) {
    sel.innerHTML = '<option value="">🎲 Assign me the next available courier</option>';
    providers.forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = vehicleEmoji(p.vehicleType) + ' ' + p.name + ' — ' + p.city + ' ($' + p.pricePerKm + '/km)';
      sel.appendChild(opt);
    });
    if (bookingData.providerId) preselectProvider(bookingData.providerId);
  }).catch(function () {});
}

function buildBookingSummary() {
  var pe = qs('#price-estimate');
  if (pe) pe.textContent = '~$8.00 – $20.00';
  var sel = qs('#book-provider');
  var provLabel = 'Any available courier';
  if (sel && sel.selectedIndex > 0) provLabel = sel.options[sel.selectedIndex].text;
  var sum = qs('#booking-summary');
  if (!sum) return;
  var rows = [
    ['Name',    bookingData.customerName],
    ['Phone',   bookingData.customerPhone],
    ['Package', bookingData.packageType],
    ['Pickup',  bookingData.pickup],
    ['Dropoff', bookingData.dropoff],
    ['Courier', provLabel]
  ];
  if (bookingData.notes) rows.push(['Notes', bookingData.notes]);
  sum.innerHTML = rows.map(function (r) {
    return '<div class="summary-row"><span>' + r[0] + '</span><strong>' + r[1] + '</strong></div>';
  }).join('');
}

/* Delegated click for all booking-form buttons */
document.addEventListener('click', function (e) {
  switch (e.target.id) {
    case 'book-next-1': {
      var name  = qs('#book-name')  ? qs('#book-name').value.trim()  : '';
      var phone = qs('#book-phone') ? qs('#book-phone').value.trim() : '';
      if (!name)  return toast('Please enter your full name', 'error');
      if (!phone) return toast('Please enter your phone number', 'error');
      bookingData.customerName  = name;
      bookingData.customerPhone = phone;
      bookingData.packageType   = qs('#book-package') ? qs('#book-package').value : 'general';
      goToBookStep(2);
      loadCourierDropdown();
      break;
    }
    case 'book-back-2': goToBookStep(1); break;
    case 'book-next-2': {
      var pickup  = qs('#book-pickup')  ? qs('#book-pickup').value.trim()  : '';
      var dropoff = qs('#book-dropoff') ? qs('#book-dropoff').value.trim() : '';
      if (!pickup)  return toast('Please enter a pickup address', 'error');
      if (!dropoff) return toast('Please enter a dropoff address', 'error');
      bookingData.pickup     = pickup;
      bookingData.dropoff    = dropoff;
      bookingData.notes      = qs('#book-notes') ? qs('#book-notes').value.trim() : '';
      var ps = qs('#book-provider');
      bookingData.providerId = ps ? ps.value : '';
      buildBookingSummary();
      goToBookStep(3);
      break;
    }
    case 'book-back-3': goToBookStep(2); break;
    case 'track-search-btn': {
      var inp = qs('#track-name-input');
      loadAllBookings(inp ? inp.value.trim() : '');
      break;
    }
    case 'admin-refresh-btn':
      toast('Refreshing dashboard…');
      loadAdminDashboard();
      break;
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && e.target.id === 'track-name-input') {
    loadAllBookings(e.target.value.trim());
  }
});

/* Booking form submit */
document.addEventListener('submit', function (e) {
  if (e.target.id === 'booking-form') {
    e.preventDefault();
    var btn  = qs('#book-submit-btn');
    var text = qs('#book-submit-text');
    if (btn)  btn.disabled = true;
    if (text) text.textContent = '⏳ Submitting…';
    apiCall('/api/bookings', {
      method: 'POST',
      body: {
        customerName:   bookingData.customerName  || '',
        customerPhone:  bookingData.customerPhone || '',
        pickup:         bookingData.pickup        || '',
        dropoff:        bookingData.dropoff       || '',
        packageType:    bookingData.packageType   || 'general',
        notes:          bookingData.notes         || '',
        providerId:     bookingData.providerId    || null,
        estimatedPrice: 8
      }
    }).then(function (booking) {
      toast('🎉 Booking #' + booking.id + ' confirmed! We\'ll contact you shortly.');
      var form = qs('#booking-form');
      if (form) form.reset();
      bookingData = {};
      goToBookStep(1);
      showPage('track');
    }).catch(function (err) {
      toast('Booking failed: ' + err.message, 'error');
      if (btn)  btn.disabled = false;
      if (text) text.textContent = '✅ Confirm Booking';
    });
    return;
  }

  /* Join form submit */
  if (e.target.id === 'join-form') {
    e.preventDefault();
    var btn   = qs('#join-submit-btn');
    var name  = qs('#join-name')  ? qs('#join-name').value.trim()  : '';
    var phone = qs('#join-phone') ? qs('#join-phone').value.trim() : '';
    var city  = qs('#join-city')  ? qs('#join-city').value         : '';
    if (!name)  return toast('Please enter your name', 'error');
    if (!phone) return toast('Please enter your phone number', 'error');
    if (!city)  return toast('Please select your operating city', 'error');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Registering…'; }
    apiCall('/api/providers', {
      method: 'POST',
      body: {
        name: name, phone: phone, city: city,
        vehicleType:  qs('#join-vehicle') ? qs('#join-vehicle').value : 'motorcycle',
        bio:          qs('#join-bio')     ? qs('#join-bio').value.trim() : '',
        pricePerKm:   parseFloat(qs('#join-price')  ? qs('#join-price').value  : '') || 2.0,
        minFee:       parseFloat(qs('#join-minfee') ? qs('#join-minfee').value : '') || 5.0,
        subscription: selectedPlan
      }
    }).then(function (provider) {
      toast('🎉 Welcome to YLM, ' + provider.name + '! Your profile is live.');
      var form = qs('#join-form');
      if (form) form.reset();
      selectedPlan = 'basic';
      loadJoinPlanSelector();
      return apiCall('/api/providers');
    }).then(function (providers) {
      allProviders = providers;
      showPage('find');
    }).catch(function (err) {
      toast('Registration failed: ' + err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '🚀 Register as a Messenger'; }
    });
  }
});

/* ══════════════════════════════════════════════
   MY BOOKINGS
══════════════════════════════════════════════ */
function loadAllBookings(nameFilter) {
  var list  = qs('#all-bookings-list');
  var empty = qs('#bookings-empty');
  if (!list) return;
  var url = nameFilter
    ? '/api/bookings?customerName=' + encodeURIComponent(nameFilter)
    : '/api/bookings';
  apiCall(url).then(function (bookings) {
    if (!bookings.length) {
      list.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = bookings.map(function (b) {
      return [
        '<div class="booking-card" id="booking-card-' + b.id + '">',
          '<div class="booking-card__header">',
            '<div><span class="booking-id">#' + b.id + '</span>' + statusBadge(b.status) + '</div>',
            '<span class="booking-time">' + timeAgo(b.createdAt) + '</span>',
          '</div>',
          '<div class="booking-route">',
            '<div class="route-point route-point--pickup"><span class="route-dot"></span><span>' + b.pickup + '</span></div>',
            '<div class="route-point route-point--dropoff"><span class="route-dot route-dot--end"></span><span>' + b.dropoff + '</span></div>',
          '</div>',
          '<div class="booking-meta">',
            '<span>👤 ' + b.customerName + '</span>',
            '<span>📦 ' + b.packageType + '</span>',
            '<span>🚀 ' + b.providerName + '</span>',
            (b.estimatedPrice ? '<span>💰 ~$' + b.estimatedPrice.toFixed(2) + '</span>' : ''),
          '</div>',
          '<div class="booking-timeline">' + renderTimeline(b.statusHistory || []) + '</div>',
        '</div>'
      ].join('');
    }).join('');
  }).catch(function (err) { toast('Could not load bookings: ' + err.message, 'error'); });
}

function renderTimeline(history) {
  var steps = ['requested', 'confirmed', 'in-transit', 'delivered'];
  return '<div class="timeline">' + steps.map(function (step) {
    var hit = null;
    for (var i = 0; i < history.length; i++) { if (history[i].status === step) { hit = history[i]; break; } }
    return [
      '<div class="timeline-step ' + (hit ? 'timeline-step--done' : '') + '">',
        '<div class="timeline-dot"></div>',
        '<div class="timeline-label">' + step + '</div>',
        (hit ? '<div class="timeline-time">' + timeAgo(hit.time) + '</div>' : ''),
      '</div>'
    ].join('');
  }).join('') + '</div>';
}

/* ══════════════════════════════════════════════
   PRICING PAGE
══════════════════════════════════════════════ */
function loadPlansPage() {
  apiCall('/api/subscriptions').then(function (plans) {
    allPlans = plans;
    var grid = qs('#plans-grid');
    if (!grid) return;
    grid.innerHTML = Object.keys(plans).map(function (key) {
      var plan = plans[key];
      return [
        '<div class="plan-card ' + (plan.highlighted ? 'plan-card--featured' : '') + '" id="plan-card-' + key + '">',
          (plan.highlighted ? '<div class="plan-badge">⭐ Most Popular</div>' : ''),
          '<div class="plan-name">' + plan.name + '</div>',
          '<div class="plan-price"><span class="plan-price__amount">$' + plan.price + '</span><span class="plan-price__period">/month</span></div>',
          '<ul class="plan-features">' + plan.features.map(function (f) { return '<li>✓ ' + f + '</li>'; }).join('') + '</ul>',
          '<button class="btn ' + (plan.highlighted ? 'btn--primary' : 'btn--outline') + ' btn--full plan-choose-btn" data-plan="' + key + '" id="choose-plan-' + key + '">Get ' + plan.name + '</button>',
        '</div>'
      ].join('');
    }).join('');
  }).catch(function () { toast('Could not load plans', 'error'); });
}

document.addEventListener('click', function (e) {
  var btn = e.target.closest('.plan-choose-btn');
  if (btn) { selectedPlan = btn.dataset.plan; showPage('join'); }
});

/* ══════════════════════════════════════════════
   JOIN AS MESSENGER
══════════════════════════════════════════════ */
function loadJoinPlanSelector() {
  var sel = qs('#join-plan-selector');
  if (!sel) return;
  function render(plans) {
    sel.innerHTML = Object.keys(plans).map(function (key) {
      var plan = plans[key];
      return [
        '<label class="plan-option ' + (selectedPlan === key ? 'plan-option--selected' : '') + '" id="plan-option-' + key + '">',
          '<input type="radio" name="subscription" value="' + key + '" ' + (selectedPlan === key ? 'checked' : '') + ' hidden />',
          '<div class="plan-option__name">' + plan.name + '</div>',
          '<div class="plan-option__price">$' + plan.price + '/mo</div>',
        '</label>'
      ].join('');
    }).join('');
    qsa('.plan-option', sel).forEach(function (label) {
      label.addEventListener('click', function () {
        qsa('.plan-option', sel).forEach(function (l) { l.classList.remove('plan-option--selected'); });
        label.classList.add('plan-option--selected');
        selectedPlan = label.querySelector('input').value;
      });
    });
  }
  if (Object.keys(allPlans).length) {
    render(allPlans);
  } else {
    apiCall('/api/subscriptions').then(function (p) { allPlans = p; render(p); }).catch(function () {});
  }
}

/* ══════════════════════════════════════════════
   ADMIN DASHBOARD
══════════════════════════════════════════════ */
function loadAdminDashboard() {
  Promise.all([
    apiCall('/api/admin/stats'),
    apiCall('/api/bookings'),
    apiCall('/api/providers')
  ]).then(function (r) {
    renderKPIs(r[0]);
    renderBreakdowns(r[0]);
    renderAdminBookings(r[1]);
    renderAdminProviders(r[2]);
  }).catch(function (err) { toast('Dashboard error: ' + err.message, 'error'); });
}

function renderKPIs(s) {
  var g = qs('#kpi-grid');
  if (!g) return;
  g.innerHTML = [
    kpiCard('kpi-providers', '🚀', s.providers.total, 'Total Messengers', s.providers.active + ' active · ' + s.providers.verified + ' verified'),
    kpiCard('kpi-bookings',  '📦', s.bookings.total,  'Total Bookings',   s.bookings.completed + ' delivered · ' + s.bookings.pending + ' pending'),
    kpiCard('kpi-revenue',   '💰', '$' + s.revenue.subscriptions, 'Monthly Sub Revenue', '+$' + s.revenue.commissions + ' commissions', true),
    kpiCard('kpi-reviews',   '⭐', s.totalReviews, 'Total Reviews', 'Across all couriers')
  ].join('');
}
function kpiCard(id, icon, val, label, sub, highlight) {
  return '<div class="kpi-card' + (highlight ? ' kpi-card--highlight' : '') + '" id="' + id + '">' +
    '<div class="kpi-icon">' + icon + '</div>' +
    '<div class="kpi-value">' + val + '</div>' +
    '<div class="kpi-label">' + label + '</div>' +
    '<div class="kpi-sub">' + sub + '</div>' +
  '</div>';
}

function renderBar(label, count, total, cls) {
  var pct = total ? Math.round(count / total * 100) : 0;
  return '<div class="breakdown-row">' +
    '<span class="breakdown-label">' + label + '</span>' +
    '<div class="breakdown-bar-wrap"><div class="breakdown-bar ' + cls + '" style="width:' + pct + '%"></div></div>' +
    '<span class="breakdown-count">' + count + '</span>' +
  '</div>';
}

function renderBreakdowns(s) {
  var subT  = (s.subscriptions.basic||0) + (s.subscriptions.standard||0) + (s.subscriptions.premium||0);
  var vehT  = Object.values(s.vehicles).reduce(function(a,b){return a+b;},0);
  var citT  = Object.values(s.cities).reduce(function(a,b){return a+b;},0);
  var em    = { motorcycle:'🏍️', bicycle:'🚲', car:'🚗', van:'🚐', truck:'🚛' };

  var sb = qs('#subscription-breakdown');
  if (sb) sb.innerHTML = [
    renderBar('🏆 Premium',  s.subscriptions.premium  || 0, subT, 'bar--gold'),
    renderBar('🥈 Standard', s.subscriptions.standard || 0, subT, 'bar--blue'),
    renderBar('🥉 Basic',    s.subscriptions.basic    || 0, subT, 'bar--grey')
  ].join('');

  var vb = qs('#vehicle-breakdown');
  if (vb) vb.innerHTML = Object.keys(s.vehicles).sort(function(a,b){return s.vehicles[b]-s.vehicles[a];})
    .map(function(v){return renderBar((em[v]||'📦')+' '+v, s.vehicles[v], vehT, 'bar--purple');}).join('');

  var cb = qs('#city-breakdown');
  if (cb) cb.innerHTML = Object.keys(s.cities).sort(function(a,b){return s.cities[b]-s.cities[a];})
    .map(function(c){return renderBar('🏙️ '+c, s.cities[c], citT, 'bar--teal');}).join('');

  var nb = qs('#admin-notifications');
  if (nb) nb.innerHTML = (s.recentNotifications||[]).map(function(n){
    return '<div class="notif-row">' +
      '<span class="notif-dot notif-dot--' + n.type + '"></span>' +
      '<span class="notif-msg">' + n.message + '</span>' +
      '<span class="notif-time">' + timeAgo(n.time) + '</span>' +
    '</div>';
  }).join('') || '<p class="muted">No recent activity.</p>';
}

function renderAdminBookings(bookings) {
  var el = qs('#admin-bookings-table');
  if (!el) return;
  if (!bookings.length) { el.innerHTML = '<p class="muted">No bookings yet.</p>'; return; }
  el.innerHTML = '<table class="admin-table"><thead><tr>' +
    '<th>#</th><th>Customer</th><th>Route</th><th>Courier</th><th>Status</th><th>Price</th><th>Time</th>' +
    '</tr></thead><tbody>' +
    bookings.map(function(b){
      return '<tr>' +
        '<td>#' + b.id + '</td>' +
        '<td>' + b.customerName + '<br/><small>' + (b.customerPhone||'') + '</small></td>' +
        '<td class="route-cell">' + b.pickup + '<br/>→ ' + b.dropoff + '</td>' +
        '<td>' + b.providerName + '</td>' +
        '<td>' + statusBadge(b.status) + '</td>' +
        '<td>' + (b.estimatedPrice ? '$' + b.estimatedPrice.toFixed(2) : '—') + '</td>' +
        '<td>' + timeAgo(b.createdAt) + '</td>' +
      '</tr>';
    }).join('') + '</tbody></table>';
}

function renderAdminProviders(providers) {
  var el = qs('#admin-providers-table');
  if (!el) return;
  if (!providers.length) { el.innerHTML = '<p class="muted">No providers yet.</p>'; return; }
  el.innerHTML = '<table class="admin-table"><thead><tr>' +
    '<th>Messenger</th><th>City</th><th>Vehicle</th><th>Plan</th><th>Rating</th><th>Deliveries</th><th>Verified</th>' +
    '</tr></thead><tbody>' +
    providers.map(function(p){
      return '<tr>' +
        '<td><strong>' + p.name + '</strong><br/><small>' + p.phone + '</small></td>' +
        '<td>' + p.city + '</td>' +
        '<td>' + vehicleEmoji(p.vehicleType) + ' ' + p.vehicleType + '</td>' +
        '<td><span class="pill pill--' + p.subscription + '">' + p.subscription + '</span></td>' +
        '<td>⭐ ' + (p.rating || 'New') + ' (' + p.reviewCount + ')</td>' +
        '<td>' + p.deliveries + '</td>' +
        '<td>' + (p.verified ? '✅' : '—') + '</td>' +
      '</tr>';
    }).join('') + '</tbody></table>';
}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
loadFeaturedCouriers();
var initHash = window.location.hash.replace('#', '');
var validPages = ['home','find','book','track','plans','join','admin'];
if (initHash && validPages.indexOf(initHash) >= 0) showPage(initHash);
