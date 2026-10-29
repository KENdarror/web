/* VolexStudio public-preview prototype.
   No backend: authentication, messages and records are browser-local demonstrations only. */
const STORAGE_KEY = 'volexstudio_local_prototype_v2';
const nowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const uid = () => 'vs_' + Math.random().toString(36).slice(2, 10);
const DEMO_PASSWORD = 'demo-only';

const defaultProducts = [
  { id: 'p1', name: 'Midnight Daydream', category: 'Anime-inspired', description: 'A character concept exploring mood, movement and expressive colour.', art: 'anime', tag: 'Portfolio concept', active: true, imageData: '' },
  { id: 'p2', name: 'Quiet Horizons', category: 'Nature', description: 'A landscape study inspired by quiet places and open skies.', art: 'landscape', tag: 'Visual study', active: true, imageData: '' },
  { id: 'p3', name: 'Colour in Motion', category: 'Abstract', description: 'An exploration of layered forms, contrast and rhythm.', art: 'abstract', tag: 'Colour experiment', active: true, imageData: '' },
  { id: 'p4', name: 'Portrait Study', category: 'Portrait', description: 'A portrait concept focused on expression and personality.', art: 'portrait', tag: 'Portrait concept', active: true, imageData: '' },
  { id: 'p5', name: 'Petal & Paper', category: 'Nature', description: 'Botanical shapes and soft colours inspired by the natural world.', art: 'botanical', tag: 'Nature study', active: true, imageData: '' },
  { id: 'p6', name: 'Your Idea, Drawn', category: 'Custom', description: 'A concept space for future ideas, references and creative discussion.', art: 'custom', tag: 'Future concept', active: true, imageData: '' }
];
const defaultStaff = []; // Staff profiles appear only after the owner imports a roster CSV.
const defaultState = () => ({
  products: structuredClone(defaultProducts),
  staff: structuredClone(defaultStaff),
  enquiries: [],
  collectionCover: '',
  messages: {
    studio: [{ id: uid(), user: 'VolexStudio', role: 'owner', text: 'Welcome to the VolexStudio local demo. Messages stay in this browser only.', time: nowTime() }],
    artist: [], owner: []
  },
  users: [],
  ownerPasswordHash: '',
  about: {
    headline: 'A creative corner near Tezpur AFS.',
    description: 'VolexStudio is an emerging art and design studio based around Air Force Station Tezpur. We are bringing artists and creative thinkers together to build a thoughtful portfolio of original illustrations, character concepts, portraits, colour studies and visual design.'
  }
});

let state;
try { state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState(); } catch { state = defaultState(); }
// Migrate older browser data and discard legacy staff rows without password hashes, so the public roster stays empty until a password-bearing CSV is imported.
const fresh = defaultState();
state.products = Array.isArray(state.products) ? state.products.map(p => ({ ...p, imageData: p.imageData || '' })) : fresh.products;
state.staff = Array.isArray(state.staff) ? state.staff.filter(s => Boolean(s.passwordHash) && !(['Artist_Aman','Artist_Mira','Marketer_Riya'].includes(s.username) && ['s1','s2','s3'].includes(s.id))).map(s => ({ ...s, department: s.department || (String(s.role || 'Artist').toLowerCase().includes('market') ? 'Marketer' : 'Artist'), rank: s.rank || s.title || 'Rank not set', bio: s.bio || '', photo: s.photo || '', active: s.active !== false })) : fresh.staff;
state.enquiries = Array.isArray(state.enquiries) ? state.enquiries : [];
state.messages = state.messages || fresh.messages;
state.users = Array.isArray(state.users) ? state.users : [];
state.ownerPasswordHash = typeof state.ownerPasswordHash === 'string' ? state.ownerPasswordHash : '';
state.collectionCover = state.collectionCover || '';
state.about = { ...fresh.about, ...(state.about || {}) };

let currentUser = null, authMode = 'login', activeChat = 'studio', selectedWorkspaceTab = 'overview', editingStaffId = '', toastTimer = null;
let pendingStaffPhoto = '', pendingProductPhoto = '';
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { showToast('Browser storage is full. Try a smaller image or remove older demo data.'); } }
// Hashes reduce casual plaintext exposure, but browser-only auth is NOT secure server authentication.
async function hashPassword(password) {
  const bytes = new TextEncoder().encode(String(password));
  if (window.crypto && window.crypto.subtle) {
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return 'sha256:' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }
  // Compatibility fallback for local demo browsers that do not expose Web Crypto.
  let h = 2166136261;
  for (const b of bytes) { h ^= b; h = Math.imul(h, 16777619); }
  return 'demo-hash:' + (h >>> 0).toString(16);
}
async function verifyOwnerPassword(password) {
  return state.ownerPasswordHash ? (await hashPassword(password)) === state.ownerPasswordHash : password === DEMO_PASSWORD;
}
async function changePasswordFor(record, currentPassword, newPassword) {
  const valid = record.passwordHash
    ? (await hashPassword(currentPassword)) === record.passwordHash
    : currentPassword === DEMO_PASSWORD;
  if (!valid) throw new Error('Your current password is incorrect.');
  record.passwordHash = await hashPassword(newPassword);
}
function escapeHTML(value = '') { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function showToast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200); }
function openModal(id) { document.getElementById(id).classList.remove('hidden'); document.body.classList.add('modal-open'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); if (!document.querySelector('.modal-backdrop:not(.hidden)')) document.body.classList.remove('modal-open'); }
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
document.querySelectorAll('.modal-backdrop').forEach(b => b.addEventListener('click', e => { if (e.target === b) closeModal(b.id); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach(m => closeModal(m.id)); });

function artSVG(kind) {
  const svgs = {
    anime: `<svg viewBox="0 0 400 300" aria-hidden="true"><defs><linearGradient id="animeG" x2="1" y2="1"><stop stop-color="#f4a7ca"/><stop offset=".55" stop-color="#9d87eb"/><stop offset="1" stop-color="#30385d"/></linearGradient></defs><rect width="400" height="300" fill="#28243c"/><circle cx="289" cy="61" r="61" fill="#f7c9dd"/><path d="M24 300Q61 156 145 128Q204 88 266 160Q334 190 380 300Z" fill="url(#animeG)"/><path d="M111 139Q82 41 157 25Q226 9 252 80L280 150Q231 118 205 141Q170 162 127 157Z" fill="#29213b"/><ellipse cx="186" cy="145" rx="44" ry="55" fill="#f4c9b8"/><path d="M143 128Q139 76 192 78Q230 84 225 136Q201 104 179 116Q161 127 143 128" fill="#2c2039"/><path d="M151 147q12-12 26 0m18 0q14-12 25 0" stroke="#36243a" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M170 175q17 12 34-1" stroke="#ba6387" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M105 300q22-84 81-86q64 4 91 86" fill="#37294f"/></svg>`,
    landscape: `<svg viewBox="0 0 400 300" aria-hidden="true"><defs><linearGradient id="landG" x2="0" y2="1"><stop stop-color="#e8b0d0"/><stop offset="1" stop-color="#f2d9b7"/></linearGradient></defs><rect width="400" height="300" fill="url(#landG)"/><circle cx="282" cy="83" r="43" fill="#fff0c7"/><path d="M0 216 80 122 145 203 228 93 400 220V300H0Z" fill="#8376b4"/><path d="M0 242 103 172 184 238 282 153 400 237V300H0Z" fill="#4d5279"/><path d="M0 272q75-54 144-12t156-2t100-16V300H0Z" fill="#253e5d"/><path d="M80 300q61-50 105-29t109 29" stroke="#91c7c2" stroke-width="7" fill="none"/></svg>`,
    abstract: `<svg viewBox="0 0 400 300" aria-hidden="true"><rect width="400" height="300" fill="#d8bfef"/><path d="M-20 92Q43-19 141 64t129 7Q339 38 420 96L400 0H0Z" fill="#ef9fc6"/><path d="M-10 165Q85 80 142 162t128-4t140-20L400 260q-84 40-166-18T50 270Z" fill="#8175d2"/><path d="M40 300q70-135 160-100t160-100l50 200Z" fill="#4ba9ad"/><circle cx="115" cy="92" r="32" fill="#fce1ac"/><path d="M257-20c-77 75 47 110-29 171s7 97-48 169" stroke="#302b48" stroke-width="22" stroke-linecap="round" fill="none"/><circle cx="325" cy="221" r="28" fill="#f6d6ee"/></svg>`,
    portrait: `<svg viewBox="0 0 400 300" aria-hidden="true"><rect width="400" height="300" fill="#e8b9cb"/><rect x="33" y="23" width="334" height="254" rx="8" fill="#f1d9d0"/><path d="M92 300q14-89 102-101q93 2 120 101" fill="#55486c"/><path d="M135 100q-5-50 56-52q64 4 62 65l-11 66q-29 42-68 17q-35-28-39-96" fill="#b87570"/><ellipse cx="194" cy="130" rx="46" ry="61" fill="#f5c4a9"/><path d="M147 122q-12-66 47-69q56 3 51 72l-14-23q-28-11-49 8l-33 27Z" fill="#463147"/><path d="m166 133 18-3m20 0 17 3" stroke="#503649" stroke-width="4" stroke-linecap="round"/><path d="M179 161q15 8 29-3" stroke="#b55f7c" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`,
    botanical: `<svg viewBox="0 0 400 300" aria-hidden="true"><rect width="400" height="300" fill="#e5d7bd"/><path d="M198 300q0-93 12-191" stroke="#436a5d" stroke-width="8" fill="none"/><path d="M205 195Q101 201 96 107q89-1 109 88Z" fill="#72a18c"/><path d="M211 158Q316 154 319 63q-90 6-108 95Z" fill="#477f72"/><path d="M202 237q-85 20-111-44 79-26 111 44Z" fill="#92b8a1"/><path d="M209 220q85 17 127-43-80-23-127 43Z" fill="#648e78"/><circle cx="202" cy="91" r="33" fill="#dd90b6"/><circle cx="174" cy="72" r="25" fill="#e8b0c5"/><circle cx="229" cy="68" r="25" fill="#f0c2ce"/><circle cx="227" cy="111" r="25" fill="#d884a9"/><circle cx="177" cy="113" r="24" fill="#f3c7d7"/><circle cx="203" cy="91" r="12" fill="#f4d9a7"/></svg>`,
    custom: `<svg viewBox="0 0 400 300" aria-hidden="true"><rect width="400" height="300" fill="#29253c"/><rect x="80" y="30" width="240" height="240" rx="14" fill="#d7c3eb" transform="rotate(-5 200 150)"/><path d="M112 214q33-84 78-64t92-57" stroke="#bb72bf" stroke-width="20" fill="none" stroke-linecap="round"/><path d="M121 80q49 37 90 0t73 47" stroke="#6f8fd1" stroke-width="14" fill="none" stroke-linecap="round"/><circle cx="181" cy="175" r="27" fill="#efc4a8"/><path d="m179 193-2 36m2-22-31 18m29-14 31 15" stroke="#403451" stroke-width="10" stroke-linecap="round"/></svg>`
  };
  return svgs[kind] || svgs.abstract;
}
function renderProducts() {
  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const category = document.getElementById('categoryFilter').value;
  const list = state.products.filter(p => p.active !== false && (category === 'all' || p.category === category) && (`${p.name} ${p.category} ${p.description} ${p.tag || ''}`.toLowerCase().includes(search)));
  document.getElementById('productGrid').innerHTML = list.map((p, index) => `
    <article class="product-card reveal-card" style="--card-index:${index}">
      <div class="product-image">${p.imageData ? `<img class="product-real-image" src="${p.imageData}" alt="${escapeHTML(p.name)} artwork" loading="lazy">` : artSVG(p.art)}<span class="product-tag">${escapeHTML(p.tag || 'Portfolio concept')}</span><span class="portfolio-stamp">PORTFOLIO</span></div>
      <div class="product-body"><div class="product-meta"><span>${escapeHTML(p.category)}</span><span>VOLEX · ${String(p.id).slice(-3).toUpperCase()}</span></div><h3>${escapeHTML(p.name)}</h3><p>${escapeHTML(p.description)}</p><div class="product-footer"><span class="ask-label">ASK NOW</span><button class="btn-ask" data-enquire="${escapeHTML(p.id)}">Ask about this ↗</button></div><div class="not-for-sale-note">Showcase only · Not listed for direct sale</div></div>
    </article>`).join('');
  document.getElementById('emptyProducts').classList.toggle('hidden', list.length > 0);
  document.getElementById('artworkCount').textContent = String(state.products.filter(p => p.active !== false).length).padStart(2, '0');
  document.querySelectorAll('[data-enquire]').forEach(b => b.addEventListener('click', () => startEnquiry(b.dataset.enquire)));
}
function profileImage(s, className = '') {
  return s.photo ? `<img class="profile-photo ${className}" src="${s.photo}" alt="${escapeHTML(s.name)} profile photo">` : `<div class="avatar-placeholder ${className}" aria-label="No profile photo chosen"><span>${escapeHTML((s.name || '?').trim().charAt(0).toUpperCase())}</span><small>PHOTO</small></div>`;
}
function renderTeam() {
  const active = state.staff.filter(s => s.active !== false);
  const artists = active.filter(s => (s.department || 'Artist') === 'Artist');
  const marketers = active.filter(s => (s.department || 'Artist') === 'Marketer');
  const card = (s, i) => `<article class="team-card reveal-card" style="--card-index:${i}"><div class="team-card-photo">${profileImage(s)}<span class="team-photo-corner">VS / ${String(i + 1).padStart(2, '0')}</span></div><div class="team-card-info"><div class="team-role-line"><span class="department-pill ${s.department === 'Marketer' ? 'is-marketer' : ''}">${escapeHTML(s.department || 'Artist')}</span><span class="team-rank">${escapeHTML(s.rank || 'Rank not set')}</span></div><h3>${escapeHTML(s.name)}</h3>${s.bio ? `<p class="team-bio">${escapeHTML(s.bio)}</p>` : '<div class="team-bio-empty" aria-hidden="true"></div>'}</div></article>`;
  document.getElementById('artistGrid').innerHTML = artists.map(card).join('') || '<div class="team-empty roster-empty"><span>✳</span><strong>Roster not uploaded yet</strong><small>The owner can add artists by importing a CSV roster.</small></div>';
  document.getElementById('marketerGrid').innerHTML = marketers.map(card).join('') || '<div class="team-empty roster-empty"><span>✳</span><strong>Roster not uploaded yet</strong><small>The owner can add marketers by importing a CSV roster.</small></div>';
  document.getElementById('artistCount').textContent = `${String(artists.length).padStart(2, '0')} MEMBERS`;
  document.getElementById('marketerCount').textContent = `${String(marketers.length).padStart(2, '0')} MEMBERS`;
}
function renderCollectionCover() {
  const el = document.getElementById('collectionCoverVisual');
  if (state.collectionCover) {
    el.style.backgroundImage = `linear-gradient(180deg, rgba(15,12,22,.06), rgba(15,12,22,.56)), url("${state.collectionCover}")`;
    el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center'; el.style.backgroundRepeat = 'no-repeat';
    el.classList.add('has-custom-cover');
  } else {
    el.style.backgroundImage = ''; el.style.backgroundSize = ''; el.style.backgroundPosition = ''; el.style.backgroundRepeat = '';
    el.classList.remove('has-custom-cover');
  }
}
function renderAll() {
  renderProducts(); renderTeam(); renderCollectionCover();
  document.getElementById('yearNow').textContent = new Date().getFullYear();
  reflectAbout();
  applyAccountPill();
}
document.getElementById('searchInput').addEventListener('input', renderProducts);
document.getElementById('categoryFilter').addEventListener('change', renderProducts);
document.getElementById('menuToggle').addEventListener('click', () => document.getElementById('mainNav').classList.toggle('open'));
document.querySelectorAll('#mainNav a').forEach(a => a.addEventListener('click', () => document.getElementById('mainNav').classList.remove('open')));

function openAuth(mode) {
  authMode = mode;
  const isRegister = mode === 'register';
  document.getElementById('authTitle').textContent = isRegister ? 'Create your account' : 'Sign in';
  document.getElementById('authSubtitle').textContent = isRegister ? 'Create a local customer demo account to save your enquiries.' : 'Sign in to open the right VolexStudio workspace.';
  document.getElementById('authSubmit').textContent = isRegister ? 'Create customer account' : 'Sign in';
  document.getElementById('authSwitch').textContent = 'Customer registration is disabled in this public preview. Use WhatsApp or Call for real enquiries.';
  document.getElementById('demoRoleWrap').classList.toggle('hidden', isRegister);
  document.getElementById('authError').textContent = '';
  document.getElementById('authPassword').value = '';
  document.getElementById('authUsername').value = '';
  const switchBtn = document.getElementById(isRegister ? 'switchToLogin' : 'switchToRegister');
  if (switchBtn) switchBtn.addEventListener('click', () => openAuth(isRegister ? 'login' : 'register'), { once: true });
  openModal('authModal');
}
document.getElementById('openLogin').addEventListener('click', () => openAuth('login'));
document.getElementById('openRegister').addEventListener('click', () => showToast('Customer accounts are not enabled in this public preview yet.'));
document.getElementById('currentUserPill').addEventListener('click', () => openWorkspace());
function loginDemo(username, role) {
  if (role === 'owner') currentUser = { username, role, name: 'Studio Owner', id: 'owner' };
  else if (role === 'staff') {
    const s = state.staff.find(x => x.username.toLowerCase() === username.toLowerCase() && x.active !== false);
    if (!s) return false;
    currentUser = { username: s.username, role: 'staff', name: s.name, id: s.id };
  } else {
    const u = state.users.find(x => x.username.toLowerCase() === username.toLowerCase());
    if (!u) return false;
    currentUser = { username: u.username, role: 'customer', name: u.name || u.username, id: u.id };
  }
  closeModal('authModal'); afterLogin(); return true;
}
document.getElementById('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value;
  const role = document.getElementById('demoRole').value;
  const err = document.getElementById('authError'); err.textContent = '';
  if (authMode === 'register') {
    err.textContent = 'Customer registration is disabled in this public preview. No account data was saved.';
    return;
  }
  if (role === 'owner') {
    if (username.toLowerCase() !== 'owner_demo') { err.textContent = 'Use the owner username Owner_Demo.'; return; }
    if (!(await verifyOwnerPassword(password))) { err.textContent = 'That owner password is incorrect.'; return; }
  }
  if (role === 'staff') {
    const s = state.staff.find(x => x.username.toLowerCase() === username.toLowerCase() && x.active !== false);
    if (!s) { err.textContent = 'Staff username not found. The owner must import it from a CSV roster first.'; return; }
    if (!s.passwordHash || (await hashPassword(password)) !== s.passwordHash) { err.textContent = 'That staff password is incorrect. Use the password assigned in the CSV.'; return; }
  }
  if (role === 'customer') {
    const u = state.users.find(x => x.username.toLowerCase() === username.toLowerCase() && x.password === password);
    if (!u) { err.textContent = 'Customer account not found, or the password is incorrect.'; return; }
  }
  if (!loginDemo(username, role)) { err.textContent = 'Could not sign in to that demo account.'; }
});
function applyAccountPill() {
  const pill = document.getElementById('currentUserPill');
  if (currentUser) {
    pill.classList.remove('hidden'); pill.textContent = `${currentUser.name} · ${currentUser.role}`;
    document.getElementById('openLogin').classList.add('hidden'); document.getElementById('openRegister').classList.add('hidden');
  } else {
    pill.classList.add('hidden'); document.getElementById('openLogin').classList.remove('hidden'); document.getElementById('openRegister').classList.remove('hidden');
  }
}
function afterLogin() {
  applyAccountPill();
  showToast(`Signed in to the local ${currentUser.role} demo.`);
  if (currentUser.role === 'owner' || currentUser.role === 'staff') openWorkspace();
  else openWorkspace();
}
function logout() {
  currentUser = null; applyAccountPill(); closeModal('workspaceModal'); closeModal('chatModal'); showToast('Signed out of this browser demo.');
}

function startEnquiry(productId) {
  const product = state.products.find(p => p.id === productId);
  document.getElementById('enquiryProductId').value = productId || 'custom';
  document.getElementById('enquiryTitle').textContent = product ? `Ask about ${product.name}` : 'Ask about a future idea';
  document.getElementById('enquiryMessage').value = product ? `I would like to ask about “${product.name}”.` : '';
  document.getElementById('enquiryName').value = currentUser?.name || '';
  document.getElementById('enquiryError').textContent = '';
  openModal('enquiryModal');
}
document.getElementById('customEnquiry').addEventListener('click', () => startEnquiry('custom'));
document.getElementById('enquiryForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('enquiryName').value.trim();
  const contact = document.getElementById('enquiryContact').value.trim();
  const pid = document.getElementById('enquiryProductId').value;
  const product = state.products.find(p => p.id === pid);
  if (!name || !contact) { document.getElementById('enquiryError').textContent = 'Please add your name and contact details.'; return; }
  state.enquiries.unshift({ id: uid(), name, contact, productId: pid, productName: product?.name || 'General creative enquiry', delivery: document.getElementById('enquiryDelivery').value, message: document.getElementById('enquiryMessage').value.trim(), status: 'Pending', created: new Date().toLocaleString(), customerId: currentUser?.id || 'guest', customerUsername: currentUser?.username || 'Guest' });
  save(); closeModal('enquiryModal'); showToast('Enquiry saved locally. Nothing was sent or ordered.');
  if (currentUser?.role === 'owner') openWorkspace('enquiries');
});

function canOpenChat(tab) {
  if (!currentUser) return false;
  if (currentUser.role === 'owner') return true;
  if (currentUser.role === 'staff') return tab === 'artist' || tab === 'owner' || tab === 'studio';
  return tab === 'studio' || tab === 'artist' || tab === 'owner';
}
function chatTitle(tab) { return tab === 'studio' ? 'Studio chat' : tab === 'artist' ? 'Artist & team chat' : 'Owner chat'; }
function openChat(tab = 'studio') {
  if (!currentUser) { openAuth('login'); showToast('Sign in to use the local chat demonstration.'); return; }
  activeChat = canOpenChat(tab) ? tab : 'studio';
  document.getElementById('chatTitle').textContent = chatTitle(activeChat);
  document.getElementById('chatRoleHint').textContent = `Signed in as ${currentUser.name} (${currentUser.role}).`;
  document.querySelectorAll('#chatTabs button').forEach(b => { b.classList.toggle('active', b.dataset.chat === activeChat); b.classList.toggle('hidden', !canOpenChat(b.dataset.chat)); });
  renderChat(); openModal('chatModal');
}
document.getElementById('floatingChat').addEventListener('click', () => openChat(currentUser?.role === 'staff' ? 'owner' : 'studio'));
document.getElementById('chatTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-chat]'); if (!b || !canOpenChat(b.dataset.chat)) return;
  activeChat = b.dataset.chat; document.getElementById('chatTitle').textContent = chatTitle(activeChat);
  document.querySelectorAll('#chatTabs button').forEach(x => x.classList.toggle('active', x === b)); renderChat();
});
function renderChat() {
  const list = state.messages[activeChat] || [];
  document.getElementById('chatMessages').innerHTML = list.map(m => `<div class="chat-message ${m.user === currentUser?.name ? 'own' : ''}"><b>${escapeHTML(m.user)} · ${escapeHTML(m.role)}</b><p>${escapeHTML(m.text)}</p><small>${escapeHTML(m.time || '')}</small></div>`).join('') || '<p class="small-note">No messages yet. Start a local demo conversation.</p>';
  const box = document.getElementById('chatMessages'); box.scrollTop = box.scrollHeight;
}
document.getElementById('chatForm').addEventListener('submit', e => {
  e.preventDefault(); if (!currentUser || !canOpenChat(activeChat)) { showToast('This demo account cannot access that conversation.'); return; }
  const text = document.getElementById('chatInput').value.trim(); if (!text) return;
  state.messages[activeChat] = state.messages[activeChat] || [];
  state.messages[activeChat].push({ id: uid(), user: currentUser.name, role: currentUser.role, text, time: nowTime() }); save();
  document.getElementById('chatInput').value = ''; renderChat();
});

function openWorkspace(tab = 'overview') {
  if (!currentUser) { openAuth('login'); return; }
  selectedWorkspaceTab = tab; renderWorkspace(); openModal('workspaceModal');
}
function workspaceHeader(title, subtitle) {
  return `<div class="workspace-header"><div><p class="eyebrow">${currentUser.role === 'owner' ? 'OWNER CONTROL ROOM' : currentUser.role === 'staff' ? 'PERSONAL STAFF SPACE' : 'CUSTOMER SPACE'}</p><h2>${escapeHTML(title)}</h2><p>${escapeHTML(subtitle)}</p></div><div class="workspace-actions"><button class="btn btn-outline" id="logoutBtn">Sign out</button></div></div>`;
}
function renderWorkspace() {
  const root = document.getElementById('workspaceContent');
  if (currentUser.role === 'staff') {
    const staff = state.staff.find(s => s.id === currentUser.id) || state.staff.find(s => s.username.toLowerCase() === currentUser.username.toLowerCase());
    if (!staff || staff.active === false) { root.innerHTML = workspaceHeader('Account inactive', 'This profile is no longer active.'); bindLogout(); return; }
    root.innerHTML = workspaceHeader('Your profile', 'Your account is restricted to your profile and permitted chat. You can choose your own photo and write your own bio.') + `
      <div class="staff-profile-card staff-profile-edit-card">${profileImage(staff, 'workspace-avatar')}<div class="staff-profile-copy"><span class="department-pill ${staff.department === 'Marketer' ? 'is-marketer' : ''}">${escapeHTML(staff.department)}</span><h3>${escapeHTML(staff.name)}</h3><p class="staff-rank-line">RANK · ${escapeHTML(staff.rank || 'Rank not set')}</p><p>${escapeHTML(staff.username)}</p><span class="role-chip">Personal profile access</span></div></div>
      <div class="workspace-panel" style="margin-top:14px"><h3>Personalise your profile</h3><p>Your bio is blank until you write one. Your photo and bio will appear in the public ${escapeHTML(staff.department.toLowerCase())} section.</p><form id="staffProfileForm"><label>Choose profile photo <input type="file" id="staffPhotoInput" accept="image/png,image/jpeg,image/webp,image/gif"></label><div id="staffPhotoPreview" class="upload-preview">${staff.photo ? `<img src="${staff.photo}" alt="Current profile preview">` : '<span>Your photo preview will appear here.</span>'}</div><label>Biography<textarea name="bio" id="staffBioInput" maxlength="300" rows="4" placeholder="Write a short bio when you are ready…">${escapeHTML(staff.bio || '')}</textarea></label><div class="workspace-actions"><button class="btn btn-primary" type="submit">Save my profile</button><button class="btn btn-outline" type="button" id="clearStaffPhoto">Remove my photo</button></div></form></div>
      <div class="workspace-panel security-panel"><h3>Change my password</h3><p>Use the temporary password from your roster CSV as the current password for your first change.</p><form id="staffPasswordForm"><label>Current password<input name="currentPassword" type="password" required autocomplete="current-password"></label><label>New password<input name="newPassword" type="password" required minlength="8" autocomplete="new-password"></label><label>Confirm new password<input name="confirmPassword" type="password" required minlength="8" autocomplete="new-password"></label><p class="form-error" id="staffPasswordError"></p><button class="btn btn-primary" type="submit">Update my password</button></form></div>
      <div class="workspace-panel"><h3>Chat with the studio</h3><p>Chat is a local prototype simulation and does not deliver messages to other devices.</p><div class="workspace-actions"><button class="btn btn-primary" id="staffOwnerChat">Open owner chat</button><button class="btn btn-outline" id="staffTeamChat">Open team chat</button></div></div>`;
    bindLogout();
    let selectedPhoto = staff.photo || '';
    const fileInput = document.getElementById('staffPhotoInput');
    fileInput.addEventListener('change', async () => { try { const f = fileInput.files[0]; if (!f) return; selectedPhoto = await compressImage(f); document.getElementById('staffPhotoPreview').innerHTML = `<img src="${selectedPhoto}" alt="New profile preview">`; } catch (err) { showToast(err.message || 'Could not read that photo.'); } });
    document.getElementById('clearStaffPhoto').onclick = () => { selectedPhoto = ''; document.getElementById('staffPhotoPreview').innerHTML = '<span>No profile photo selected.</span>'; fileInput.value = ''; };
    document.getElementById('staffProfileForm').addEventListener('submit', e => { e.preventDefault(); const freshStaff = state.staff.find(s => s.id === currentUser.id); if (!freshStaff) return; freshStaff.bio = document.getElementById('staffBioInput').value.trim(); freshStaff.photo = selectedPhoto; save(); renderTeam(); renderWorkspace(); showToast('Your profile was updated in this browser.'); });
    const staffPasswordForm = document.getElementById('staffPasswordForm');
    if (staffPasswordForm) staffPasswordForm.addEventListener('submit', async e => {
      e.preventDefault(); const f = new FormData(staffPasswordForm); const current = String(f.get('currentPassword') || ''), next = String(f.get('newPassword') || ''), confirmNext = String(f.get('confirmPassword') || '');
      const err = document.getElementById('staffPasswordError'); err.textContent = '';
      if (next.length < 8) { err.textContent = 'Use at least 8 characters for the new password.'; return; }
      if (next !== confirmNext) { err.textContent = 'The new passwords do not match.'; return; }
      try { await changePasswordFor(staff, current, next); save(); staffPasswordForm.reset(); showToast('Your password was updated in this browser.'); }
      catch (ex) { err.textContent = ex.message || 'Could not update password.'; }
    });
    document.getElementById('staffOwnerChat').onclick = () => { closeModal('workspaceModal'); openChat('owner'); };
    document.getElementById('staffTeamChat').onclick = () => { closeModal('workspaceModal'); openChat('artist'); };
    return;
  }
  if (currentUser.role === 'customer') {
    const mine = state.enquiries.filter(x => x.customerId === currentUser.id);
    root.innerHTML = workspaceHeader('Your account', 'View your local demo account and enquiry records.') + `<div class="workspace-grid"><div class="workspace-panel"><h3>Profile</h3><p>Customer account stored in this browser.</p><div class="list-row"><div><strong>${escapeHTML(currentUser.name)}</strong><small>${escapeHTML(currentUser.username)}</small></div><span class="role-chip">Customer</span></div><button class="btn btn-primary" id="customerChat">Chat with studio</button></div><div class="workspace-panel"><h3>Your enquiries</h3><p>${mine.length} enquiry record(s) in this browser.</p><button class="btn btn-outline" id="customerGallery">Browse portfolio</button></div></div><div class="workspace-panel"><h3>Enquiry history</h3>${mine.map(x => `<div class="list-row"><div><strong>${escapeHTML(x.productName)}</strong><small>${escapeHTML(x.created)} · ${escapeHTML(x.delivery)}</small></div><span class="role-chip">${escapeHTML(x.status)}</span></div>`).join('') || '<p class="small-note">No enquiries from this account yet.</p>'}</div>`;
    bindLogout(); document.getElementById('customerGallery').onclick = () => { closeModal('workspaceModal'); document.getElementById('gallery').scrollIntoView({ behavior: 'smooth' }); };
    document.getElementById('customerChat').onclick = () => { closeModal('workspaceModal'); openChat('studio'); };
    return;
  }
  const tabs = [['overview', 'Overview'], ['products', 'Portfolio'], ['staff', 'Team roster'], ['enquiries', 'Enquiries'], ['content', 'Website & cover'], ['security', 'Account & security']];
  root.innerHTML = workspaceHeader('Owner dashboard', 'Manage the local portfolio, staff profiles, cover image, and enquiries.') + `<div class="chat-tabs workspace-tabs">${tabs.map(([id, label]) => `<button data-wstab="${id}" class="${selectedWorkspaceTab === id ? 'active' : ''}">${label}</button>`).join('')}</div><div id="workspaceTabBody">${workspaceTabContent()}</div>`;
  bindLogout(); root.querySelectorAll('[data-wstab]').forEach(b => b.addEventListener('click', () => { selectedWorkspaceTab = b.dataset.wstab; renderWorkspace(); })); bindWorkspaceControls();
}
function workspaceTabContent() {
  if (selectedWorkspaceTab === 'overview') return `<div class="workspace-grid"><div class="workspace-panel"><h3>${state.products.filter(p => p.active !== false).length} portfolio pieces</h3><p>These are showcase concepts, not items listed for direct sale.</p><button class="btn btn-primary" data-goto-tab="products">Manage portfolio</button></div><div class="workspace-panel"><h3>${state.enquiries.length} enquiries</h3><p>Review interest and mark the status for follow-up.</p><button class="btn btn-primary" data-goto-tab="enquiries">Review enquiries</button></div><div class="workspace-panel"><h3>${state.staff.filter(s => s.active !== false).length} active team profiles</h3><p>Separate Artist and Marketer sections, with ranks and staff-managed bios/photos.</p><button class="btn btn-outline" data-goto-tab="staff">Manage team</button></div><div class="workspace-panel"><h3>Browser-only preview</h3><p>Roster, passwords, images and messages live in this browser only. Do not use real passwords or private records.</p><button class="btn btn-outline" id="resetDemo">Reset demo content</button></div></div><div class="workspace-panel"><h3>Owner shortcuts</h3><div class="workspace-actions"><button class="btn btn-outline" data-open-owner-chat>Open studio chat</button><button class="btn btn-outline" data-goto-tab="content">Change collection cover</button><button class="btn btn-primary" data-goto-tab="security">Change owner password</button></div></div>`;
  if (selectedWorkspaceTab === 'products') return `<div class="workspace-panel"><h3>Add a portfolio piece</h3><p>Upload your own artwork image. The public gallery will show “ASK NOW”, with no price or checkout.</p><form id="productForm"><label>Artwork title<input name="name" required maxlength="80" placeholder="e.g. Paper Moons No. 01"></label><label>Category<select name="category"><option>Anime-inspired</option><option>Portrait</option><option>Nature</option><option>Abstract</option><option>Custom</option><option>Graphic design</option></select></label><label>Description<textarea name="description" required rows="2" maxlength="300" placeholder="Describe the idea or creative direction"></textarea></label><label>Fallback illustration style<select name="art"><option value="anime">Anime-inspired</option><option value="portrait">Portrait</option><option value="landscape">Landscape / nature</option><option value="abstract">Abstract</option><option value="botanical">Botanical</option><option value="custom">Custom</option></select></label><label>Small collection label<input name="tag" maxlength="35" placeholder="Portfolio concept"></label><label>Choose artwork photo <input type="file" id="productImageInput" accept="image/png,image/jpeg,image/webp,image/gif"></label><div id="productPhotoPreview" class="upload-preview"><span>Upload a photo to replace the generated sample artwork.</span></div><div class="workspace-actions"><button class="btn btn-primary" type="submit">Add to portfolio</button><button class="btn btn-outline" type="button" id="clearProductImage">Clear photo</button></div></form></div><div class="workspace-panel"><h3>Current portfolio</h3><p>Hide pieces from the public page or remove them from local demo data.</p>${state.products.map(p => `<div class="list-row"><div class="admin-product-thumb">${p.imageData ? `<img src="${p.imageData}" alt="">` : artSVG(p.art)}<div><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.category)} · ${p.active === false ? 'Hidden' : 'Visible'} · Portfolio only</small></div></div><div class="workspace-actions"><button class="btn btn-outline" data-toggle-product="${escapeHTML(p.id)}">${p.active === false ? 'Show' : 'Hide'}</button><button class="btn danger-btn" data-delete-product="${escapeHTML(p.id)}">Delete</button></div></div>`).join('') || '<p class="small-note">No portfolio pieces yet.</p>'}</div>`;
  if (selectedWorkspaceTab === 'staff') {
    const edit = state.staff.find(s => s.id === editingStaffId);
    return `<div class="workspace-panel"><h3>${edit ? 'Edit team profile' : 'Add a team member'}</h3><p>Choose the team department and set a rank. Leave the bio blank; each staff member can add their own bio and photo after signing in.</p><form id="staffForm"><label>Full name<input name="name" required maxlength="60" value="${escapeHTML(edit?.name || '')}" placeholder="Staff name"></label><label>Username<input name="username" required minlength="3" maxlength="32" value="${escapeHTML(edit?.username || '')}" placeholder="Artist_Name or Marketer_Name"></label><label>Department<select name="department"><option ${!edit || edit.department === 'Artist' ? 'selected' : ''}>Artist</option><option ${edit?.department === 'Marketer' ? 'selected' : ''}>Marketer</option></select></label><label>Rank<input name="rank" required maxlength="60" value="${escapeHTML(edit?.rank || '')}" placeholder="e.g. Artist · Level 01"></label>${edit ? '' : '<label>Temporary password<input name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label>'}<div class="workspace-actions"><button class="btn btn-primary" type="submit">${edit ? 'Save profile changes' : 'Add staff account'}</button>${edit ? '<button class="btn btn-outline" type="button" id="cancelStaffEdit">Cancel editing</button>' : ''}</div></form></div>
      <div class="workspace-panel roster-import-panel"><p class="eyebrow">ROSTER IMPORT</p><h3>Upload your team CSV</h3><p>The public team starts empty. Required columns: <code>username,rank,password</code>. Optional: <code>name,department,bio</code>. Each row becomes one staff login. Importing synchronises the roster to the CSV; omitted users are removed from the list.</p><div class="csv-drop-zone"><span class="csv-file-icon">CSV</span><div><strong>Choose your roster file</strong><small>Comma-separated values · maximum 1 MB</small><label class="btn btn-outline csv-choose-label" for="staffCsv">Choose CSV file</label><input type="file" id="staffCsv" accept=".csv,text/csv" aria-label="Choose staff CSV"></div></div><div class="workspace-actions"><button class="btn btn-outline" id="downloadStaffTemplate">Download example CSV</button><button class="btn btn-primary" id="importStaffCsv">Import roster</button></div><p class="small-note" id="csvStatus" role="status">No roster imported yet. Staff will not appear until you import a CSV.</p><p class="security-note">Use temporary demo passwords only. The CSV contains passwords in plain text; delete it after importing. This preview is not secure enough for real employee credentials.</p></div>
      <div class="workspace-panel"><h3>Current staff</h3>${state.staff.map(s => `<div class="list-row"><div class="admin-staff-row">${profileImage(s, 'admin-staff-photo')}<div><strong>${escapeHTML(s.name)} <span class="role-chip">${escapeHTML(s.department || 'Artist')}</span></strong><small>${escapeHTML(s.username)} · Rank: ${escapeHTML(s.rank || 'Rank not set')}<br>${s.bio ? escapeHTML(s.bio) : 'Bio not added yet'} · ${s.active === false ? 'Inactive' : 'Active'}</small></div></div><div class="workspace-actions"><button class="btn btn-outline" data-edit-staff="${escapeHTML(s.id)}">Edit</button><button class="btn btn-outline" data-toggle-staff="${escapeHTML(s.id)}">${s.active === false ? 'Activate' : 'Deactivate'}</button><button class="btn danger-btn" data-delete-staff="${escapeHTML(s.id)}">Remove</button></div></div>`).join('') || '<p class="small-note">No staff profiles added yet.</p>'}</div>`;
  }
  if (selectedWorkspaceTab === 'enquiries') return `<div class="workspace-panel"><h3>Customer enquiries</h3><p>These are local demo records. No message or notification is sent to the customer automatically.</p>${state.enquiries.map(x => `<div class="list-row"><div style="min-width:0;flex:1"><strong>${escapeHTML(x.productName)} · ${escapeHTML(x.name)}</strong><small>${escapeHTML(x.contact)} · ${escapeHTML(x.created)}<br>${escapeHTML(x.delivery)}<br>${escapeHTML(x.message || 'No extra message')}</small></div><div><select data-enquiry-status="${escapeHTML(x.id)}" aria-label="Enquiry status"><option ${x.status === 'Pending' ? 'selected' : ''}>Pending</option><option ${x.status === 'Contacted' ? 'selected' : ''}>Contacted</option><option ${x.status === 'Accepted' ? 'selected' : ''}>Accepted</option><option ${x.status === 'Declined' ? 'selected' : ''}>Declined</option><option ${x.status === 'Completed' ? 'selected' : ''}>Completed</option></select></div></div>`).join('') || '<p class="small-note">No enquiries yet. Try the ASK NOW button on a portfolio card.</p>'}</div>`;
  if (selectedWorkspaceTab === 'content') return `<div class="workspace-panel"><h3>Collection cover image</h3><p>Choose the image that represents the collection. This is separate from the photo used for each portfolio piece.</p><label>Upload collection cover <input type="file" id="collectionCoverInput" accept="image/png,image/jpeg,image/webp,image/gif"></label><div class="upload-preview cover-preview">${state.collectionCover ? `<img src="${state.collectionCover}" alt="Current collection cover">` : '<span>Default VOLEXART typographic cover is active.</span>'}</div><div class="workspace-actions"><button class="btn btn-outline" id="clearCollectionCover">Use default VolexArt cover</button></div></div><div class="workspace-panel"><h3>About VolexStudio</h3><p>Edit the headline and overview shown in the public About section.</p><form id="aboutForm"><label>About headline<input name="headline" required value="${escapeHTML(state.about.headline || '')}" maxlength="100"></label><label>About description<textarea name="description" rows="5" required maxlength="700">${escapeHTML(state.about.description || '')}</textarea></label><button class="btn btn-primary" type="submit">Save studio information</button></form></div><div class="workspace-panel"><h3>Contact & location information</h3><p><b>Contact:</b> 9472325600<br><b>Area:</b> Air Force Station Tezpur area, near KV No. 2 AFS Tezpur or near Hanuman Mandir, Tezpur.</p><p class="small-note">The public text describes a general area, not an exact street address. Confirm final business details before publishing.</p></div>`;

  if (selectedWorkspaceTab === 'security') return `<div class="workspace-panel security-panel"><p class="eyebrow">OWNER ACCOUNT</p><h3>Change your password</h3><p>Set a new password for the Owner_Demo account. The new password is required the next time you sign in.</p><form id="ownerPasswordForm"><label>Current password<input name="currentPassword" type="password" required autocomplete="current-password" placeholder="Current owner password"></label><label>New password<input name="newPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label><label>Confirm new password<input name="confirmPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="Type it again"></label><p class="form-error" id="ownerPasswordError"></p><button class="btn btn-primary" type="submit">Save new password</button></form><p class="security-note">First-time demo login: username <code>Owner_Demo</code>, password <code>demo-only</code>. Change it now. Because this is a static site, this is only a local prototype password—not secure production authentication.</p></div><div class="workspace-panel"><h3>Before using this for real</h3><p>Passwords are hashed in this browser when Web Crypto is available, but all app logic and saved data still live in the visitor's browser. Anyone can inspect or change browser-side data. Real employee accounts, shared sign-in and cross-device updates require server-side authentication and a database.</p></div>`;
  return '';
}
function bindLogout() { const b = document.getElementById('logoutBtn'); if (b) b.onclick = logout; }
function bindWorkspaceControls() {
  document.querySelectorAll('[data-goto-tab]').forEach(b => b.addEventListener('click', () => { selectedWorkspaceTab = b.dataset.gotoTab; renderWorkspace(); }));
  document.querySelectorAll('[data-open-owner-chat]').forEach(b => b.addEventListener('click', () => { closeModal('workspaceModal'); openChat('studio'); }));
  const productForm = document.getElementById('productForm');
  if (productForm) {
    pendingProductPhoto = '';
    const imageInput = document.getElementById('productImageInput');
    imageInput.addEventListener('change', async () => { try { const f = imageInput.files[0]; if (!f) return; pendingProductPhoto = await compressImage(f); document.getElementById('productPhotoPreview').innerHTML = `<img src="${pendingProductPhoto}" alt="Artwork upload preview">`; } catch (err) { showToast(err.message || 'Could not read that image.'); } });
    document.getElementById('clearProductImage').onclick = () => { pendingProductPhoto = ''; imageInput.value = ''; document.getElementById('productPhotoPreview').innerHTML = '<span>Generated sample art will be used if no photo is selected.</span>'; };
    productForm.addEventListener('submit', e => {
      e.preventDefault(); const f = new FormData(productForm);
      state.products.unshift({ id: uid(), name: f.get('name').trim(), category: f.get('category'), description: f.get('description').trim(), art: f.get('art'), tag: f.get('tag').trim() || 'Portfolio concept', active: true, imageData: pendingProductPhoto });
      save(); pendingProductPhoto = ''; renderAll(); renderWorkspace(); showToast('Added to the local portfolio. It is not listed for direct sale.');
    });
  }
  document.querySelectorAll('[data-toggle-product]').forEach(b => b.onclick = () => { const p = state.products.find(x => x.id === b.dataset.toggleProduct); if (p) { p.active = p.active === false; save(); renderAll(); renderWorkspace(); showToast(p.active ? 'Portfolio piece is visible.' : 'Portfolio piece is hidden.'); } });
  document.querySelectorAll('[data-delete-product]').forEach(b => b.onclick = () => { if (confirm('Remove this portfolio piece from local demo data?')) { state.products = state.products.filter(x => x.id !== b.dataset.deleteProduct); save(); renderAll(); renderWorkspace(); showToast('Portfolio piece removed.'); } });

  const staffForm = document.getElementById('staffForm');
  if (staffForm) {
    staffForm.addEventListener('submit', async e => {
      e.preventDefault(); const f = new FormData(staffForm), username = f.get('username').trim();
      const duplicate = state.staff.find(s => s.username.toLowerCase() === username.toLowerCase() && s.id !== editingStaffId);
      if (duplicate) { showToast('That username already exists.'); return; }
      const department = f.get('department');
      if (editingStaffId) {
        const s = state.staff.find(x => x.id === editingStaffId); if (!s) return;
        s.name = f.get('name').trim(); s.username = username; s.department = department; s.rank = f.get('rank').trim();
        editingStaffId = ''; save(); renderAll(); renderWorkspace(); showToast('Team profile updated.');
      } else {
        state.staff.push({ id: uid(), name: f.get('name').trim(), username, department, rank: f.get('rank').trim(), bio: '', photo: '', active: true, passwordHash: await hashPassword(f.get('password')) });
        save(); renderTeam(); renderWorkspace(); showToast('Staff account added in this browser-only preview.');
      }
    });
  }
  const cancelEdit = document.getElementById('cancelStaffEdit'); if (cancelEdit) cancelEdit.onclick = () => { editingStaffId = ''; renderWorkspace(); };
  document.querySelectorAll('[data-edit-staff]').forEach(b => b.onclick = () => { editingStaffId = b.dataset.editStaff; renderWorkspace(); });
  document.querySelectorAll('[data-toggle-staff]').forEach(b => b.onclick = () => { const s = state.staff.find(x => x.id === b.dataset.toggleStaff); if (s) { s.active = s.active === false; save(); renderTeam(); renderWorkspace(); showToast(s.active ? 'Staff profile activated.' : 'Staff profile deactivated.'); } });
  document.querySelectorAll('[data-delete-staff]').forEach(b => b.onclick = () => { if (confirm('Remove this staff profile from the local demo?')) { state.staff = state.staff.filter(s => s.id !== b.dataset.deleteStaff); save(); renderTeam(); renderWorkspace(); showToast('Staff profile removed.'); } });
  document.querySelectorAll('[data-enquiry-status]').forEach(sel => sel.onchange = () => { const item = state.enquiries.find(x => x.id === sel.dataset.enquiryStatus); if (item) { item.status = sel.value; save(); showToast('Enquiry status updated locally.'); } });

  const aboutForm = document.getElementById('aboutForm');
  if (aboutForm) aboutForm.addEventListener('submit', e => { e.preventDefault(); const f = new FormData(aboutForm); state.about = { headline: f.get('headline').trim(), description: f.get('description').trim() }; save(); renderAll(); renderWorkspace(); showToast('Studio information updated.'); });
  const coverInput = document.getElementById('collectionCoverInput');
  if (coverInput) coverInput.addEventListener('change', async () => { try { const f = coverInput.files[0]; if (!f) return; state.collectionCover = await compressImage(f, 1300, 850, 0.78); save(); renderCollectionCover(); renderWorkspace(); showToast('Collection cover updated locally.'); } catch (err) { showToast(err.message || 'Could not read that image.'); } });
  const clearCover = document.getElementById('clearCollectionCover'); if (clearCover) clearCover.onclick = () => { state.collectionCover = ''; save(); renderCollectionCover(); renderWorkspace(); showToast('Default VolexArt cover restored.'); };
  const staffFilePicker = document.getElementById('staffCsv');
  if (staffFilePicker) staffFilePicker.addEventListener('change', () => {
    const status = document.getElementById('csvStatus');
    if (!status) return;
    status.textContent = staffFilePicker.files[0] ? `Selected: ${staffFilePicker.files[0].name}. Click Import roster to continue.` : 'No file selected. Staff will not appear until you import a CSV.';
  });
  const downloadTemplate = document.getElementById('downloadStaffTemplate');
  if (downloadTemplate) downloadTemplate.onclick = () => downloadText('volexstudio-staff-example.csv', 'username,rank,password,name,department,bio\nartist_demo,Junior Artist - Level 01,ChangeMe123!,Demo Artist,Artist,\nmarketer_demo,Community Marketer - Level 01,ChangeMe456!,Demo Marketer,Marketer,\n');
  const importBtn = document.getElementById('importStaffCsv');
  if (importBtn) importBtn.onclick = async () => {
    const file = document.getElementById('staffCsv').files[0], status = document.getElementById('csvStatus');
    if (!file) { status.textContent = 'Choose a CSV file first.'; return; }
    if (file.size > 1024 * 1024) { status.textContent = 'Keep CSV files under 1 MB.'; return; }
    try {
      const rows = parseCSV(await file.text()).filter(row => row.some(v => String(v || '').trim()));
      if (rows.length < 2) throw new Error('CSV needs a header and at least one staff row.');
      const headers = rows[0].map(x => x.trim().toLowerCase());
      if (!['username', 'rank', 'password'].every(h => headers.includes(h))) throw new Error('Missing required headers. Include username, rank, password. Optional: name, department, bio.');
      const oldStaff = state.staff.slice();
      const imported = [], seen = new Set();
      for (const [index, row] of rows.slice(1).entries()) {
        const obj = {}; headers.forEach((h, i) => obj[h] = String(row[i] ?? '').trim());
        const username = obj.username;
        if (!username) throw new Error(`Row ${index + 2}: username is required.`);
        if (!obj.rank) throw new Error(`Row ${index + 2}: rank is required.`);
        if (!obj.password || obj.password.length < 8) throw new Error(`Row ${index + 2}: password must be at least 8 characters.`);
        const normalized = username.toLowerCase();
        if (seen.has(normalized)) throw new Error(`Row ${index + 2}: duplicate username "${username}".`);
        seen.add(normalized);
        const previous = oldStaff.find(s => s.username.toLowerCase() === normalized);
        const name = obj.name || username.replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const rawDepartment = (obj.department || (/^marketer[_-]/i.test(username) ? 'Marketer' : 'Artist')).toLowerCase();
        const department = rawDepartment.includes('market') ? 'Marketer' : 'Artist';
        imported.push({ id: previous?.id || uid(), name, username, department, rank: obj.rank, bio: obj.bio || previous?.bio || '', photo: previous?.photo || '', active: true, passwordHash: await hashPassword(obj.password) });
      }
      if (oldStaff.length && !confirm('Importing this CSV will replace the current staff roster. Staff omitted from the file will be removed. Continue?')) { status.textContent = 'Import cancelled. Current roster unchanged.'; return; }
      state.staff = imported;
      save(); renderTeam(); selectedWorkspaceTab = 'staff'; renderWorkspace();
      const newStatus = document.getElementById('csvStatus');
      if (newStatus) newStatus.textContent = `Roster imported successfully: ${imported.length} staff account(s). Current roster now matches this CSV.`;
      showToast(`Imported ${imported.length} staff account(s).`);
      const fileInput = document.getElementById('staffCsv'); if (fileInput) fileInput.value = '';
    } catch (err) { status.textContent = err.message || 'Could not import this CSV.'; }
  };
  const ownerPasswordForm = document.getElementById('ownerPasswordForm');
  if (ownerPasswordForm) ownerPasswordForm.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(ownerPasswordForm);
    const current = String(f.get('currentPassword') || ''), next = String(f.get('newPassword') || ''), confirmNext = String(f.get('confirmPassword') || '');
    const err = document.getElementById('ownerPasswordError'); err.textContent = '';
    if (next.length < 8) { err.textContent = 'Use at least 8 characters for the new password.'; return; }
    if (next !== confirmNext) { err.textContent = 'The new passwords do not match.'; return; }
    try {
      const valid = await verifyOwnerPassword(current);
      if (!valid) { err.textContent = 'Your current password is incorrect.'; return; }
      state.ownerPasswordHash = await hashPassword(next);
      save(); ownerPasswordForm.reset(); showToast('Owner password changed. Use the new password next time you sign in.');
    } catch { err.textContent = 'Could not save the password in this browser. Try again.'; }
  });
  const reset = document.getElementById('resetDemo');
  if (reset) reset.onclick = () => { if (confirm('Reset all local prototype products, staff, enquiries, users, cover and messages?')) { state = defaultState(); currentUser = { username: 'Owner_Demo', name: 'Studio Owner', role: 'owner', id: 'owner' }; editingStaffId = ''; save(); renderAll(); selectedWorkspaceTab = 'overview'; renderWorkspace(); showToast('Demo data reset.'); } };
}
function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) { const c = text[i], next = text[i + 1]; if (c === '"' && quoted && next === '"') { cell += '"'; i++; } else if (c === '"') quoted = !quoted; else if (c === ',' && !quoted) { row.push(cell); cell = ''; } else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && next === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c; }
  if (cell.length || row.length) { row.push(cell); rows.push(row); } return rows;
}
function downloadText(filename, content) { const blob = new Blob([content], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function compressImage(file, maxWidth = 600, maxHeight = 600, quality = 0.76) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read the image file.')); reader.readAsDataURL(file); });
  const img = new Image(); img.src = dataUrl;
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('This image format could not be opened.')); });
  const scale = Math.min(1, maxWidth / img.naturalWidth, maxHeight / img.naturalHeight);
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}
function reflectAbout() {
  const h = document.querySelector('.about-copy h2');
  const p = document.querySelector('.about-copy>p:not(.eyebrow)');
  if (h && state.about.headline) {
    const chunks = state.about.headline.split(/\s+(?:near|for|with|and)\s+/i);
    const headline = state.about.headline;
    const words = headline.replace(/[.!?]+$/, '').split(' ');
    const split = Math.max(1, Math.ceil(words.length / 2));
    h.innerHTML = `${escapeHTML(words.slice(0, split).join(' '))}<br><span class="gradient-text">${escapeHTML(words.slice(split).join(' '))}</span>`;
  }
  if (p && state.about.description) p.textContent = state.about.description;
}

// Make static pages work without external fonts or services; reveal animations gracefully degrade on reduced motion.
const revealObserver = ('IntersectionObserver' in window) ? new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); } }), { threshold: 0.12 }) : null;
function observeRevealCards() { if (!revealObserver) return; document.querySelectorAll('.reveal-card:not(.is-visible)').forEach(el => revealObserver.observe(el)); }
const renderProductsOriginal = renderProducts;
renderProducts = function () { renderProductsOriginal(); observeRevealCards(); };
const renderTeamOriginal = renderTeam;
renderTeam = function () { renderTeamOriginal(); observeRevealCards(); };
renderAll();
