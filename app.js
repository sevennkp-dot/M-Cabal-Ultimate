// app.js — Admin Dashboard Logic
// Supabase connection

const SUPABASE_URL = 'https://bzmewevfhlcidpgxplhv.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bWV3ZXZmaGxjaWRwZ3hwbGh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTU1MzkzNywiZXhwIjoyMDk1MTI5OTM3fQ.FQ9BwB_pQuyPJkj8TFvAX9xHjGy434t7x877qq7NM_8'

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
}

// ─── Security ───────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = 'admin' // คุณสามารถเปลี่ยนรหัสผ่านตรงนี้ได้ครับ

if (localStorage.getItem('admin_logged_in') !== 'true') {
  const p = prompt('🔐 กรุณากรอกรหัสผ่านแอดมิน:')
  if (p === ADMIN_PASSWORD) {
    localStorage.setItem('admin_logged_in', 'true')
  } else {
    alert('❌ รหัสผ่านไม่ถูกต้อง!')
    document.body.innerHTML = '<h1 style="color:white; text-align:center; padding:5rem;">Unauthorized</h1>';
    throw new Error('Unauthorized')
  }
}

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── API Helpers (Migrated to SDK) ──────────────────────────────────────────

async function sbGet(table, params = '') {
  // Parsing params for backward compatibility if needed, 
  // but better to direct use sb.from()
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers })
  return res.json()
}

async function sbPatch(table, id, body) {
  await sb.from(table).update(body).eq('id', id)
}

// ─── Navigation ─────────────────────────────────────────────────────────────

const tabs = ['buy', 'sell', 'price', 'reviews', 'report']
const tabTitles = { buy: 'ออเดอร์ขาย M', sell: 'ออเดอร์รับซื้อ M', price: 'ราคา / สต็อก', reviews: 'ประวัติการซื้อขาย', report: 'รายงานสรุปบัญชีรายเดือน' }

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault()
    const tab = el.dataset.tab
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
    el.classList.add('active')
    document.getElementById('page-title').textContent = tabTitles[tab]
    tabs.forEach(t => document.getElementById(`tab-${t}`).classList.remove('active'))
    document.getElementById(`tab-${tab}`).classList.add('active')
    if (tab === 'buy') loadBuyOrders()
    else if (tab === 'sell') loadSellOrders()
    else if (tab === 'price') loadPrice()
    else if (tab === 'reviews') loadReviews()
    else if (tab === 'report') loadReport()
  })
})

function showLoading(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = '<tr><td colspan="15" style="text-align:center; padding:3rem; color:var(--text-muted); opacity:0.6;">⌛ กำลังโหลดข้อมูล...</td></tr>';
}

// ─── Stats ───────────────────────────────────────────────────────────────────

async function loadStats() {
  const [buy, sell, price] = await Promise.all([
    sbGet('buy_orders', 'status=eq.pending&select=id'),
    sbGet('sell_orders', 'status=eq.pending&select=id'),
    sbGet('price_config', 'select=total_m_stock&order=updated_at.desc&limit=1')
  ])
  document.querySelector('#stat-buy strong').textContent = Array.isArray(buy) ? buy.length : '-'
  document.querySelector('#stat-sell strong').textContent = Array.isArray(sell) ? sell.length : '-'
  document.querySelector('#stat-stock strong').textContent = Array.isArray(price) && price[0] ? Number(price[0].total_m_stock).toLocaleString() : '-'
}

// ─── Buy Orders ──────────────────────────────────────────────────────────────

async function loadBuyOrders() {
  showLoading('buy-tbody');
  const status = document.getElementById('buy-filter').value
  const params = status ? `status=eq.${status}&order=created_at.desc` : 'order=created_at.desc'
  const [data, price] = await Promise.all([
    sbGet('buy_orders', params),
    sbGet('price_config', 'order=updated_at.desc&limit=1')
  ])
  const spread = (price?.[0]?.buy_price || 0) - (price?.[0]?.sell_price || 0)
  const tbody = document.getElementById('buy-tbody')
  if (!Array.isArray(data) || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11"><div class="empty-state">ไม่มีรายการในหมวดนี้</div></td></tr>'
    return
  }
  tbody.innerHTML = data.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${fmtDate(r.created_at)}</td>
      <td>${r.line_name || '-'}</td>
      <td>
        ${r.phone || '-'}
        ${r.phone ? `<button class="btn-copy" onclick="copyToC('${r.phone}', this)">📋</button>` : ''}
      </td>
      <td>
        <strong>${r.character_name || '-'}</strong>
        ${r.character_name ? `<button class="btn-copy" onclick="copyToC('${r.character_name}', this)">📋</button>` : ''}
      </td>
      <td><strong>${Number(r.m_amount).toLocaleString()} M</strong></td>
      <td>${Number(r.total_price).toFixed(2)} ฿</td>
      <td>${r.slip_url ? `<button class="btn-sm btn-img" onclick="openModal('${r.slip_url}')">🖼 ดูสลิป</button>` : '-'}</td>
      <td style="color:var(--green); font-weight:600;">+${(Number(r.m_amount) * spread).toFixed(2)} ฿</td>
      <td><span class="badge badge-${r.status}">${statusThai(r.status)}</span></td>
      <td>
        ${r.status === 'pending' ? `
          <button class="btn-sm btn-complete" onclick="updateBuy('${r.id}','completed')">✅</button>
          <button class="btn-sm btn-cancel" onclick="updateBuy('${r.id}','cancelled')">❌</button>
        ` : ''}
      </td>
    </tr>
  `).join('')
}

async function updateBuy(id, status) {
  if (status === 'completed') {
    const [orderRes, priceData] = await Promise.all([
      sbGet('buy_orders', `id=eq.${id}`),
      sbGet('price_config', 'order=updated_at.desc&limit=1')
    ])
    const order = orderRes?.[0];
    const latest = priceData?.[0];

    if (order && latest) {
      if (Number(order.m_amount) > Number(latest.total_m_stock)) {
        if (!confirm(`⚠️ สต็อกไม่เพียงพอ! (ต้องการ: ${order.m_amount} M, มีอยู่: ${latest.total_m_stock} M)\nคุณแน่ใจหรือไม่ว่าต้องการดำเนินการต่อ? (สต็อกจะกลายเป็น 0)`)) {
          return
        }
      }
      await updateStock(-Number(order.m_amount)) // แอดมินขาย -> สต็อกลด
    }
  }
  await sbPatch('buy_orders', id, { status, updated_at: new Date().toISOString() })
  loadBuyOrders()
  loadStats()
}

// ─── Sell Orders ─────────────────────────────────────────────────────────────

async function loadSellOrders() {
  showLoading('sell-tbody');
  const status = document.getElementById('sell-filter').value
  const params = status ? `status=eq.${status}&order=created_at.desc` : 'order=created_at.desc'
  const [data, price] = await Promise.all([
    sbGet('sell_orders', params),
    sbGet('price_config', 'order=updated_at.desc&limit=1')
  ])
  const spread = (price?.[0]?.buy_price || 0) - (price?.[0]?.sell_price || 0)
  const tbody = document.getElementById('sell-tbody')
  if (!Array.isArray(data) || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12"><div class="empty-state">ไม่มีรายการในหมวดนี้</div></td></tr>'
    return
  }
  tbody.innerHTML = data.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${fmtDate(r.created_at)}</td>
      <td>${r.line_name || '-'}</td>
      <td><strong>${Number(r.m_amount).toLocaleString()} M</strong></td>
      <td>${Number(r.total_price).toFixed(2)} ฿</td>
      <td>${r.screenshot_url ? `<button class="btn-sm btn-img" onclick="openModal('${r.screenshot_url}')">🖼 ดูรูป</button>` : '-'}</td>
      <td>${r.bank_name || '-'}</td>
      <td>
        ${r.account_number || '-'}
        ${r.account_number ? `<button class="btn-copy" onclick="copyToC('${r.account_number}', this)">📋</button>` : ''}
      </td>
      <td>${r.account_name || '-'}</td>
      <td style="color:var(--green); font-weight:600;">+${(Number(r.m_amount) * spread).toFixed(2)} ฿</td>
      <td><span class="badge badge-${r.status}">${statusThai(r.status)}</span></td>
      <td>
        ${r.status === 'pending' ? `
          <button class="btn-sm btn-complete" onclick="updateSell('${r.id}','completed')">✅</button>
          <button class="btn-sm btn-cancel" onclick="updateSell('${r.id}','cancelled')">❌</button>
        ` : ''}
      </td>
    </tr>
  `).join('')
}

async function updateSell(id, status) {
  if (status === 'completed') {
    const order = await sbGet('sell_orders', `id=eq.${id}`)
    if (order?.[0]) {
      await updateStock(Number(order[0].m_amount)) // แอดมินซื้อเข้า -> สต็อกเพิ่ม
    }
  }
  await sbPatch('sell_orders', id, { status, updated_at: new Date().toISOString() })
  loadSellOrders()
  loadStats()
}

// ─── Copy To Clipboard ───────────────────────────────────────────────────────

function copyToC(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent
    btn.textContent = '✅'
    btn.style.borderColor = 'var(--green)'
    setTimeout(() => {
      btn.textContent = original
      btn.style.borderColor = ''
    }, 1500)
  })
}

// ─── Price / Stock ────────────────────────────────────────────────────────────

async function loadPrice() {
  const data = await sbGet('price_config', 'order=updated_at.desc&limit=20')
  if (Array.isArray(data) && data[0]) {
    // Fill current inputs with latest values
    document.getElementById('inp-buy-price').value = data[0].buy_price
    document.getElementById('inp-sell-price').value = data[0].sell_price
    document.getElementById('inp-stock').value = data[0].total_m_stock
    
    // Render History Table
    const tbody = document.getElementById('price-history-tbody')
    tbody.innerHTML = data.map(h => `
      <tr>
       <td>${fmtDate(h.updated_at)}</td>
       <td>${Number(h.buy_price).toFixed(2)} ฿</td>
       <td>${Number(h.sell_price).toFixed(2)} ฿</td>
       <td style="color:var(--accent); font-weight:600;">${(h.buy_price - h.sell_price).toFixed(2)} ฿</td>
       <td>${Number(h.total_m_stock).toLocaleString()} M</td>
      </tr>
    `).join('')
  }
}

async function savePrice() {
  const buy_price = parseFloat(document.getElementById('inp-buy-price').value)
  const sell_price = parseFloat(document.getElementById('inp-sell-price').value)
  const total_m_stock = parseFloat(document.getElementById('inp-stock').value)
  const msgEl = document.getElementById('price-msg')

  if (isNaN(buy_price) || isNaN(sell_price) || isNaN(total_m_stock)) {
    showMsg(msgEl, '❌ กรุณากรอกค่าให้ครบถ้วน', 'error')
    return
  }

  // Insert NEW row to keep history
  const body = { buy_price, sell_price, total_m_stock, updated_at: new Date().toISOString() }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/price_config`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify(body)
  })
  
  if (res.ok) {
    showMsg(msgEl, '✅ บันทึกราคาสำเร็จ (เพิ่มประวัติใหม่)!', 'success')
    loadPrice()
    loadStats()
  } else {
    showMsg(msgEl, '❌ เกิดข้อผิดพลาดในการบันทึก', 'error')
  }
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

async function loadReviews() {
  const [buys, sells] = await Promise.all([
    sbGet('buy_orders', 'status=eq.completed&order=created_at.desc&limit=10'),
    sbGet('sell_orders', 'status=eq.completed&order=created_at.desc&limit=10')
  ])
  
  const all = [...(buys || []).map(o => ({ ...o, type: '🛒 ซื้อ' })), ...(sells || []).map(o => ({ ...o, type: '💰 ขาย' }))]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10)

  const list = document.getElementById('reviews-list')
  if (all.length === 0) {
    list.innerHTML = '<div class="empty-state">ยังไม่มีประวัติการซื้อขายที่เสร็จสิ้น</div>'
    return
  }
  
  list.innerHTML = all.map(r => `
    <div class="review-card">
      <div class="review-header">
        <span class="review-name">${r.type} | ${r.line_name || 'ไม่ระบุชื่อ'}</span>
        <span class="review-date">${fmtDate(r.created_at)}</span>
      </div>
      <div class="review-text">📦 จำนวน <strong>${Number(r.m_amount).toLocaleString()} M</strong> — ยอด ${Number(r.total_price).toFixed(2)} ฿</div>
    </div>
  `).join('')
}

// ─── Report ───────────────────────────────────────────────────────────────────

async function loadReport() {
  const monthInput = document.getElementById('report-month');
  if (!monthInput.value) {
    const now = new Date();
    monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  const monthStr = monthInput.value;
  const start = `${monthStr}-01T00:00:00Z`;
  const dateObj = new Date(start);
  dateObj.setMonth(dateObj.getMonth() + 1);
  const end = dateObj.toISOString();

  showLoading('report-tbody');
  const [buys, sells, price] = await Promise.all([
    sbGet('buy_orders', `status=eq.completed&created_at=gte.${start}&created_at=lt.${end}`),
    sbGet('sell_orders', `status=eq.completed&created_at=gte.${start}&created_at=lt.${end}`),
    sbGet('price_config', 'order=updated_at.desc&limit=1')
  ]);

  const spread = (price?.[0]?.buy_price || 0) - (price?.[0]?.sell_price || 0)
  let totalRev = 0;
  let totalCost = 0;
  let totalProfit = 0;
  let totalM_Sold = 0;
  let totalM_Bought = 0;

  if (Array.isArray(buys)) buys.forEach(b => {
    totalRev += Number(b.total_price || 0);
    totalM_Sold += Number(b.m_amount || 0);
    totalProfit += (Number(b.m_amount) * spread);
  });
  if (Array.isArray(sells)) sells.forEach(s => {
    totalCost += Number(s.total_price || 0);
    totalM_Bought += Number(s.m_amount || 0);
    totalProfit += (Number(s.m_amount) * spread);
  });

  document.getElementById('rep-revenue').textContent = totalRev.toLocaleString('th-TH') + ' ฿';
  document.getElementById('rep-m-sold').textContent = `รวมขาย: ${totalM_Sold.toLocaleString()} M`;
  document.getElementById('rep-cost').textContent = totalCost.toLocaleString('th-TH') + ' ฿';
  document.getElementById('rep-m-bought').textContent = `รวมรับซื้อ: ${totalM_Bought.toLocaleString()} M`;
  document.getElementById('rep-profit').textContent = totalProfit.toLocaleString('th-TH') + ' ฿';

  const all = [
    ...(Array.isArray(buys) ? buys.map(b => ({ ...b, type: '🛒 ซื้อ' })) : []),
    ...(Array.isArray(sells) ? sells.map(s => ({ ...s, type: '💰 ขาย', isSell: true })) : [])
  ].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

  const tbody = document.getElementById('report-tbody');
  if (all.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem;">ไม่พบข้อมูลธุรกรรมในเดือนนี้</td></tr>';
    return;
  }

  tbody.innerHTML = all.map(r => `
    <tr>
      <td>${fmtDate(r.created_at)}</td>
      <td>${r.type}</td>
      <td>${r.line_name || '-'}</td>
      <td>${Number(r.m_amount).toLocaleString()} M</td>
      <td>${Number(r.total_price).toLocaleString()} ฿</td>
      <td style="color: var(--green); font-weight: 600;">+${(Number(r.m_amount) * spread).toFixed(2)} ฿</td>
      <td><span class="badge badge-completed">สำเร็จ</span></td>
    </tr>
  `).join('');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
}

function statusThai(s) {
  return { pending: 'รอดำเนินการ', completed: 'เสร็จสิ้น', cancelled: 'ยกเลิก' }[s] || s
}

function showMsg(el, text, type) {
  el.textContent = text
  el.className = `msg-box msg-${type}`
  el.style.display = 'block'
  setTimeout(() => { el.style.display = 'none' }, 3000)
}

function openModal(url) {
  const modal = document.getElementById('img-modal')
  const img = document.getElementById('modal-img')
  if (modal && img) {
    img.src = url
    modal.classList.add('open')
  }
}

function closeModal() {
  const modal = document.getElementById('img-modal')
  if (modal) modal.classList.remove('open')
}

async function updateStock(delta) {
  const priceData = await sbGet('price_config', 'order=updated_at.desc&limit=1')
  if (priceData?.[0]) {
    const latest = priceData[0]
    const newStock = Math.max(0, Number(latest.total_m_stock) + delta)
    const body = { 
      buy_price: latest.buy_price, 
      sell_price: latest.sell_price, 
      total_m_stock: newStock, 
      updated_at: new Date().toISOString() 
    }
    await fetch(`${SUPABASE_URL}/rest/v1/price_config`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify(body)
    })
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

loadStats()
loadBuyOrders()

// ─── Realtime Subscriptions ──────────────────────────────────────────────────
console.log('⚡ Initializing Realtime...')
sb.channel('db-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'buy_orders' }, () => {
    console.log('🔄 Buy Orders changed')
    loadStats()
    if (document.querySelector('.nav-item.active')?.dataset?.tab === 'buy') loadBuyOrders()
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'sell_orders' }, () => {
    console.log('🔄 Sell Orders changed')
    loadStats()
    if (document.querySelector('.nav-item.active')?.dataset?.tab === 'sell') loadSellOrders()
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'price_config' }, () => {
    console.log('🔄 Price/Stock changed')
    loadStats()
    const activeTab = document.querySelector('.nav-item.active')?.dataset?.tab
    if (activeTab === 'price') loadPrice()
  })
  .subscribe()

// Fallback legacy interval (lower frequency)
setInterval(loadStats, 60000)
