/* VolexStudio production frontend. Configure the public Supabase key below.
   NEVER put a service-role key in this file. */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://tysltsdeyojqfgfnowrh.supabase.co';
  // Replace with your Supabase project's publishable key (or legacy anon key).
  // Supabase Dashboard -> Project Settings -> API Keys. This key is public by design;
  // security comes from correctly configured Row Level Security (SQL setup file).
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_et461-euqwHz3pEfig-AQA_2Hl_6w_t';
  const ASSETS_BUCKET = 'volex-assets';
  const EDGE_CREATE_STAFF = 'create-staff';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = {
    client: null, user: null, profile: null, staffRecord: null,
    products: [], team: [], enquiries: [], staff: [],
    activeCategory: 'all', searchText: '', authMode: 'signin', workspaceTab: 'overview',
    toastTimer: null
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const initial = value => String(value || 'V').trim().slice(0, 1).toUpperCase();
  const asText = value => String(value ?? '').trim();
  const isConfigured = () => SUPABASE_PUBLISHABLE_KEY && !SUPABASE_PUBLISHABLE_KEY.includes('PASTE_YOUR_');

  function toast(message, isError = false) {
    const element = $('#toast');
    if (!element) return;
    element.textContent = message;
    element.style.background = isError ? '#ffd9d9' : '#f7f4f0';
    element.style.color = '#141419';
    element.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => element.classList.remove('show'), 4200);
  }

  function setBusy(button, busy, busyLabel = 'Working…') {
    if (!button) return;
    if (busy) {
      button.dataset.previousLabel = button.textContent;
      button.textContent = busyLabel;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.previousLabel || button.textContent;
      button.disabled = false;
    }
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('open');
  }
  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open');
  }
  function supabaseReady() {
    if (!state.client) {
      toast('The site owner must add the Supabase publishable key in app.js before using account features.', true);
      return false;
    }
    return true;
  }

  function showAuth(mode = 'signin') {
    state.authMode = mode;
    const isRegister = mode === 'signup';
    $('#authTitle').textContent = isRegister ? 'Create your account.' : 'Welcome back.';
    $('#authSubtitle').textContent = isRegister ? 'Create a customer account to keep track of your enquiries.' : 'Sign in to your VolexStudio account.';
    $('#authNameWrap').classList.toggle('hidden', !isRegister);
    $('#authName').required = isRegister;
    $('#authPassword').autocomplete = isRegister ? 'new-password' : 'current-password';
    $('#authSubmit').textContent = isRegister ? 'Create account' : 'Sign in';
    $('#authSwitch').textContent = isRegister ? 'Already have an account? Sign in' : 'Create an account';
    $('#authError').textContent = '';
    openModal('authModal');
  }

  function renderAccountControls() {
    const accountButton = $('#accountButton');
    const workspaceButton = $('#workspaceButton');
    if (!state.user) {
      accountButton.textContent = 'Sign in';
      workspaceButton.hidden = true;
    } else {
      const label = state.profile?.display_name || state.user.email?.split('@')[0] || 'Account';
      accountButton.textContent = label.length > 17 ? `${label.slice(0, 16)}…` : label;
      workspaceButton.hidden = false;
    }
  }

  async function ensureProfile(user) {
    // Database trigger in SUPABASE_SETUP.sql creates the customer profile on signup.
    // This fallback only creates a customer row; it never sets privileged roles.
    const { data, error } = await state.client.from('profiles')
      .select('id,display_name,role,avatar_url,bio,created_at').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (data) return data;
    const displayName = asText(user.user_metadata?.display_name) || user.email?.split('@')[0] || 'Customer';
    const result = await state.client.from('profiles').insert({ id: user.id, display_name: displayName, role: 'customer' })
      .select('id,display_name,role,avatar_url,bio,created_at').single();
    if (result.error) throw result.error;
    return result.data;
  }

  async function loadStaffRecord() {
    state.staffRecord = null;
    if (!state.user || state.profile?.role !== 'staff') return;
    const { data, error } = await state.client.from('staff')
      .select('user_id,username,rank,department,active,created_at').eq('user_id', state.user.id).maybeSingle();
    if (!error) state.staffRecord = data;
  }

  async function refreshSession() {
    if (!state.client) return;
    const { data, error } = await state.client.auth.getSession();
    if (error) console.error('Session lookup failed:', error.message);
    await applyUser(data?.session?.user || null);
  }

  async function applyUser(user) {
    state.user = user;
    state.profile = null;
    state.staffRecord = null;
    if (user && state.client) {
      try {
        state.profile = await ensureProfile(user);
        await loadStaffRecord();
      } catch (error) {
        console.error('Profile load error:', error.message);
        toast('Signed in, but the profile could not load. Check your database policies.', true);
      }
    }
    renderAccountControls();
  }

  async function loadProducts() {
    const grid = $('#productGrid');
    try {
      let query = state.client.from('products')
        .select('id,title,description,image_url,category,tag,published,created_at')
        .eq('published', true).order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      state.products = data || [];
      renderProducts();
      $('#productStatus').textContent = `${state.products.length} artwork${state.products.length === 1 ? '' : 's'} in the collection.`;
    } catch (error) {
      console.error('Product query failed:', error.message);
      if (grid) grid.innerHTML = '<div class="empty-state">Artwork could not load. Check that the database setup has been applied and published products exist.</div>';
      $('#productStatus').textContent = '';
    }
  }

  function renderProducts() {
    const grid = $('#productGrid');
    if (!grid) return;
    const search = state.searchText.toLowerCase();
    const visible = state.products.filter(product => {
      const category = product.category || 'Anime-inspired';
      const matchesCategory = state.activeCategory === 'all' || category.toLowerCase() === state.activeCategory.toLowerCase();
      const combined = `${product.title || ''} ${product.description || ''} ${category} ${product.tag || ''}`.toLowerCase();
      return matchesCategory && combined.includes(search);
    });
    $$('#productFilters .filter').forEach(button => button.classList.toggle('active', button.dataset.category === state.activeCategory));
    if (!visible.length) {
      grid.innerHTML = '<div class="empty-state">No artwork matches that search yet. Try another category or send us your own idea.</div>';
      return;
    }
    grid.innerHTML = visible.map((product, index) => {
      const image = product.image_url
        ? `<img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.title || 'Artwork')}" loading="lazy" referrerpolicy="no-referrer">`
        : `<div class="image-placeholder" aria-label="Artwork placeholder">${escapeHtml(initial(product.title))}</div>`;
      return `<article class="product-card"><div class="product-image">${image}</div><div class="product-info"><div class="product-top"><h3>${escapeHtml(product.title || 'Untitled')}</h3><span class="tag">${escapeHtml(product.tag || product.category || 'Artwork')}</span></div><p>${escapeHtml(product.description || 'Ask the studio about this piece.')}</p><div class="product-bottom"><span class="pill">Custom enquiry</span><button class="button small primary ask-button" data-product-id="${escapeHtml(product.id)}" type="button">Ask now ↗</button></div></div></article>`;
    }).join('');
    $$('.ask-button', grid).forEach(button => button.addEventListener('click', () => openEnquiry(button.dataset.productId)));
  }

  async function loadTeam() {
    const grid = $('#teamGrid');
    try {
      const { data: staffRows, error } = await state.client.from('staff')
        .select('user_id,username,rank,department,active').eq('active', true).order('username');
      if (error) throw error;
      if (!staffRows?.length) {
        state.team = [];
        grid.innerHTML = '<div class="empty-state">The creative team will be introduced here soon.</div>';
        return;
      }
      const ids = staffRows.map(row => row.user_id);
      const { data: profiles, error: profileError } = await state.client.from('profiles')
        .select('id,display_name,avatar_url,bio').in('id', ids);
      if (profileError) throw profileError;
      const byId = new Map((profiles || []).map(profile => [profile.id, profile]));
      state.team = staffRows.map(row => ({ ...row, profile: byId.get(row.user_id) || {} }));
      renderTeam();
    } catch (error) {
      console.error('Team query failed:', error.message);
      grid.innerHTML = '<div class="empty-state">Team profiles are not available right now.</div>';
    }
  }

  function renderTeam() {
    const grid = $('#teamGrid');
    if (!state.team.length) {
      grid.innerHTML = '<div class="empty-state">The creative team will be introduced here soon.</div>';
      return;
    }
    grid.innerHTML = state.team.map(member => {
      const profile = member.profile || {};
      const name = profile.display_name || member.username || 'VolexStudio team';
      const avatar = profile.avatar_url ? `<img src="${escapeHtml(profile.avatar_url)}" alt="">` : escapeHtml(initial(name));
      return `<article class="team-card"><div class="avatar">${avatar}</div><div><div class="team-role">${escapeHtml(member.rank || member.department || 'Creative team')}</div><h3>${escapeHtml(name)}</h3><p class="team-bio">${escapeHtml(profile.bio || 'Making thoughtful art, one idea at a time.')}</p></div></article>`;
    }).join('');
  }

  async function loadSiteContent() {
    try {
      const { data, error } = await state.client.from('site_settings').select('key,value').in('key', ['about_text']);
      if (error) throw error;
      const setting = (data || []).find(item => item.key === 'about_text');
      const value = setting?.value;
      if (typeof value === 'string' && value.trim()) $('#aboutText').textContent = value;
      else if (value && typeof value === 'object' && value.text) $('#aboutText').textContent = value.text;
    } catch (error) {
      // About text has a sensible HTML fallback so the public page still renders.
      console.info('Site content uses built-in fallback:', error.message);
    }
  }

  function openEnquiry(productId = '') {
    const product = state.products.find(item => item.id === productId);
    $('#enquiryProductId').value = productId || '';
    $('#enquiryTitle').textContent = product ? `Ask about ${product.title}.` : 'Tell us your idea.';
    $('#enquiryMessage').value = product ? `I’m interested in “${product.title}”. Please share the details.` : '';
    $('#enquiryName').value = state.profile?.display_name || '';
    $('#enquiryContact').value = state.user?.email || '';
    $('#enquiryError').textContent = '';
    openModal('enquiryModal');
  }

  async function submitEnquiry(event) {
    event.preventDefault();
    if (!supabaseReady()) return;
    const button = $('#enquirySubmit');
    const payload = {
      customer_id: state.user?.id || null,
      product_id: asText($('#enquiryProductId').value) || null,
      customer_name: asText($('#enquiryName').value),
      customer_contact: asText($('#enquiryContact').value),
      delivery: asText($('#enquiryDelivery').value) || null,
      message: asText($('#enquiryMessage').value),
      status: 'new'
    };
    if (payload.message.length < 5) { $('#enquiryError').textContent = 'Please add a little more detail about your idea.'; return; }
    setBusy(button, true, 'Sending…');
    $('#enquiryError').textContent = '';
    try {
      const { error } = await state.client.from('enquiries').insert(payload);
      if (error) throw error;
      closeModal('enquiryModal');
      $('#enquiryForm').reset();
      toast('Enquiry sent. The studio will follow up using the contact details you provided.');
      if (state.user && state.profile) await renderWorkspace('enquiries');
    } catch (error) {
      console.error('Enquiry submission failed:', error.message);
      $('#enquiryError').textContent = friendlyError(error, 'Your enquiry could not be sent. Please check the database setup and try again.');
    } finally {
      setBusy(button, false);
    }
  }

  function friendlyError(error, fallback) {
    const message = String(error?.message || '');
    if (/Failed to fetch|NetworkError/i.test(message)) return 'Network error. Check your connection and Supabase URL.';
    if (/row-level security|permission denied|not allowed/i.test(message)) return 'Permission denied by database security rules. Apply SUPABASE_SETUP.sql and check the table policies.';
    if (/bucket/i.test(message)) return 'File storage is not configured. Create the volex-assets bucket using the setup SQL.';
    if (/create-staff|function/i.test(message)) return 'The secure create-staff Edge Function must be deployed before you can create staff accounts.';
    return message || fallback;
  }

  async function handleAuth(event) {
    event.preventDefault();
    if (!supabaseReady()) return;
    const button = $('#authSubmit');
    const email = asText($('#authEmail').value).toLowerCase();
    const password = $('#authPassword').value;
    const displayName = asText($('#authName').value);
    $('#authError').textContent = '';
    if (state.authMode === 'signup' && password.length < 8) {
      $('#authError').textContent = 'Use a password with at least 8 characters.';
      return;
    }
    setBusy(button, true, state.authMode === 'signup' ? 'Creating…' : 'Signing in…');
    try {
      if (state.authMode === 'signup') {
        const { data, error } = await state.client.auth.signUp({
          email, password,
          options: { data: { display_name: displayName } }
        });
        if (error) throw error;
        if (data.session) {
          await applyUser(data.user);
          closeModal('authModal');
          toast('Account created. Welcome to VolexStudio.');
        } else {
          $('#authError').className = 'form-success';
          $('#authError').textContent = 'Account request received. Check your email to confirm it, then sign in.';
        }
      } else {
        const { data, error } = await state.client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await applyUser(data.user);
        closeModal('authModal');
        toast('Signed in successfully.');
      }
    } catch (error) {
      console.error('Authentication failed:', error.message);
      $('#authError').className = 'form-error';
      $('#authError').textContent = /Invalid login credentials/i.test(error.message)
        ? 'Email or password is incorrect.'
        : friendlyError(error, 'Account operation failed. Please try again.');
    } finally {
      setBusy(button, false);
    }
  }

  function openWorkspace(tab = 'overview') {
    if (!state.user) { showAuth('signin'); return; }
    state.workspaceTab = tab;
    $('#workspaceTitle').textContent = state.profile?.role === 'owner' ? 'Studio dashboard' : state.profile?.role === 'staff' ? 'Team workspace' : 'Your workspace';
    $('#workspaceSubtitle').textContent = `${state.profile?.display_name || state.user.email} · ${state.profile?.role || 'customer'}`;
    openModal('workspaceModal');
    renderWorkspace(tab);
  }

  function tabsForRole() {
    if (state.profile?.role === 'owner') return [
      ['overview', 'Overview'], ['products', 'Artwork'], ['enquiries', 'Enquiries'], ['staff', 'Staff'], ['content', 'Site content']
    ];
    if (state.profile?.role === 'staff') return [['profile', 'My profile'], ['enquiries', 'Enquiries']];
    return [['overview', 'Overview'], ['enquiries', 'My enquiries'], ['profile', 'My profile']];
  }

  async function renderWorkspace(tab = state.workspaceTab) {
    if (!state.user) return;
    state.workspaceTab = tab;
    const tabs = tabsForRole();
    if (!tabs.some(([key]) => key === tab)) state.workspaceTab = tab = tabs[0][0];
    $('#workspaceTabs').innerHTML = tabs.map(([key, label]) => `<button class="workspace-tab ${key === tab ? 'active' : ''}" data-workspace-tab="${key}" type="button">${label}</button>`).join('');
    $$('#workspaceTabs button').forEach(button => button.addEventListener('click', () => renderWorkspace(button.dataset.workspaceTab)));
    const content = $('#workspaceContent');
    content.innerHTML = '<div class="empty-state">Loading…</div>';
    try {
      if (tab === 'overview') await renderOverview(content);
      else if (tab === 'products') await renderProductsAdmin(content);
      else if (tab === 'enquiries') await renderEnquiries(content);
      else if (tab === 'staff') await renderStaffAdmin(content);
      else if (tab === 'content') await renderContentAdmin(content);
      else if (tab === 'profile') await renderProfile(content);
    } catch (error) {
      console.error('Workspace query failed:', error.message);
      content.innerHTML = `<div class="empty-state">${escapeHtml(friendlyError(error, 'Workspace could not load.'))}</div>`;
    }
  }

  async function renderOverview(target) {
    const [productsResult, enquiriesResult, staffResult] = await Promise.all([
      state.client.from('products').select('id', { count: 'exact', head: true }),
      state.client.from('enquiries').select('id', { count: 'exact', head: true }),
      state.client.from('staff').select('user_id', { count: 'exact', head: true }).eq('active', true)
    ]);
    target.innerHTML = `<p class="about-text">Welcome back, ${escapeHtml(state.profile?.display_name || 'studio owner')}. From here you can maintain the gallery and respond to customer enquiries.</p><div class="stat-grid"><div class="stat"><strong>${productsResult.count ?? '—'}</strong><span>Artwork records</span></div><div class="stat"><strong>${enquiriesResult.count ?? '—'}</strong><span>Enquiries</span></div><div class="stat"><strong>${staffResult.count ?? '—'}</strong><span>Active staff</span></div></div><div class="form-actions"><button class="button primary" data-go-tab="products" type="button">Manage artwork</button><button class="button" data-go-tab="enquiries" type="button">View enquiries</button></div>`;
    $$('[data-go-tab]', target).forEach(button => button.addEventListener('click', () => renderWorkspace(button.dataset.goTab)));
  }

  async function uploadImage(file, folder) {
    if (!file) return null;
    if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Images must be 8 MB or smaller.');
    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${folder}/${crypto.randomUUID()}.${extension}`;
    const { error } = await state.client.storage.from(ASSETS_BUCKET).upload(path, file, { upsert: false, cacheControl: '3600', contentType: file.type });
    if (error) throw error;
    const { data } = state.client.storage.from(ASSETS_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  async function renderProductsAdmin(target) {
    const { data, error } = await state.client.from('products').select('id,title,description,image_url,category,tag,published,created_at').order('created_at', { ascending: false });
    if (error) throw error;
    const products = data || [];
    target.innerHTML = `<div class="workspace-form"><h3>Add artwork</h3><form id="addProductForm"><div class="form-grid"><div class="field"><label for="newProductTitle">Title</label><input id="newProductTitle" required maxlength="140"></div><div class="field"><label for="newProductCategory">Category</label><select id="newProductCategory"><option>Anime-inspired</option><option>Portraits</option><option>Colour studies</option><option>Custom</option></select></div><div class="field"><label for="newProductTag">Short tag</label><input id="newProductTag" maxlength="50" placeholder="e.g. Colour study"></div><div class="field"><label for="newProductImage">Artwork image (max 8 MB)</label><input id="newProductImage" type="file" accept="image/*"></div><div class="field full"><label for="newProductDescription">Description</label><textarea id="newProductDescription" maxlength="1600" required></textarea></div></div><div class="form-actions"><button class="button primary" type="submit">Publish artwork</button></div><div class="form-error" id="addProductError" role="alert"></div></form></div><h3>Current artwork (${products.length})</h3><div class="admin-list">${products.length ? products.map(product => `<div class="admin-item"><div><h4>${escapeHtml(product.title)}</h4><p>${escapeHtml(product.category || 'Anime-inspired')} · ${escapeHtml(product.published ? 'Published' : 'Hidden')}</p></div><div class="admin-actions"><button class="button small" data-toggle-product="${escapeHtml(product.id)}" data-published="${product.published ? 'true' : 'false'}" type="button">${product.published ? 'Hide' : 'Publish'}</button><button class="button small" data-edit-product="${escapeHtml(product.id)}" type="button">Edit</button><button class="button small" data-delete-product="${escapeHtml(product.id)}" type="button">Delete</button></div></div>`).join('') : '<div class="empty-state">No products yet. Add the first artwork above.</div>'}</div><div id="editProductContainer"></div>`;
    $('#addProductForm', target).addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('button[type="submit"]', event.currentTarget);
      setBusy(button, true, 'Publishing…');
      $('#addProductError').textContent = '';
      try {
        const file = $('#newProductImage').files[0];
        const imageUrl = file ? await uploadImage(file, 'products') : null;
        const payload = {
          title: asText($('#newProductTitle').value),
          description: asText($('#newProductDescription').value),
          category: $('#newProductCategory').value,
          tag: asText($('#newProductTag').value) || $('#newProductCategory').value,
          image_url: imageUrl,
          published: true,
          created_by: state.user.id
        };
        const { error } = await state.client.from('products').insert(payload);
        if (error) throw error;
        toast('Artwork published.');
        await Promise.all([loadProducts(), renderWorkspace('products')]);
      } catch (error) {
        $('#addProductError').textContent = friendlyError(error, 'Could not publish artwork.');
      } finally { setBusy(button, false); }
    });
    $$('[data-toggle-product]', target).forEach(button => button.addEventListener('click', async () => {
      const published = button.dataset.published !== 'true';
      try {
        const { error } = await state.client.from('products').update({ published }).eq('id', button.dataset.toggleProduct);
        if (error) throw error;
        toast(published ? 'Artwork published.' : 'Artwork hidden from the public gallery.');
        await Promise.all([loadProducts(), renderWorkspace('products')]);
      } catch (error) { toast(friendlyError(error, 'Could not update artwork.'), true); }
    }));
    $$('[data-delete-product]', target).forEach(button => button.addEventListener('click', async () => {
      if (!confirm('Delete this artwork record? This cannot be undone.')) return;
      try {
        const { error } = await state.client.from('products').delete().eq('id', button.dataset.deleteProduct);
        if (error) throw error;
        toast('Artwork deleted.');
        await Promise.all([loadProducts(), renderWorkspace('products')]);
      } catch (error) { toast(friendlyError(error, 'Could not delete artwork.'), true); }
    }));
    $$('[data-edit-product]', target).forEach(button => button.addEventListener('click', () => {
      const product = products.find(item => item.id === button.dataset.editProduct);
      if (!product) return;
      $('#editProductContainer').innerHTML = `<div class="workspace-form"><h3>Edit artwork</h3><form id="editProductForm"><input id="editProductId" type="hidden" value="${escapeHtml(product.id)}"><div class="form-grid"><div class="field"><label for="editProductTitle">Title</label><input id="editProductTitle" required maxlength="140" value="${escapeHtml(product.title)}"></div><div class="field"><label for="editProductCategory">Category</label><select id="editProductCategory">${['Anime-inspired','Portraits','Colour studies','Custom'].map(cat => `<option ${cat === product.category ? 'selected' : ''}>${cat}</option>`).join('')}</select></div><div class="field"><label for="editProductTag">Short tag</label><input id="editProductTag" maxlength="50" value="${escapeHtml(product.tag || '')}"></div><div class="field"><label for="editProductImage">Replace image (optional, max 8 MB)</label><input id="editProductImage" type="file" accept="image/*"></div><div class="field full"><label for="editProductDescription">Description</label><textarea id="editProductDescription" required maxlength="1600">${escapeHtml(product.description)}</textarea></div></div><div class="form-actions"><button class="button primary" type="submit">Save changes</button><button class="button" id="cancelProductEdit" type="button">Cancel</button></div><div class="form-error" id="editProductError" role="alert"></div></form></div>`;
      $('#cancelProductEdit').addEventListener('click', () => $('#editProductContainer').replaceChildren());
      $('#editProductForm').addEventListener('submit', async event => {
        event.preventDefault();
        const submit = $('button[type="submit"]', event.currentTarget);
        setBusy(submit, true, 'Saving…');
        try {
          const file = $('#editProductImage').files[0];
          const payload = { title: asText($('#editProductTitle').value), category: $('#editProductCategory').value, tag: asText($('#editProductTag').value), description: asText($('#editProductDescription').value) };
          if (file) payload.image_url = await uploadImage(file, 'products');
          const { error } = await state.client.from('products').update(payload).eq('id', product.id);
          if (error) throw error;
          toast('Artwork updated.');
          await Promise.all([loadProducts(), renderWorkspace('products')]);
        } catch (error) { $('#editProductError').textContent = friendlyError(error, 'Could not update artwork.'); }
        finally { setBusy(submit, false); }
      });
    }));
  }

  async function renderEnquiries(target) {
    const ownerOrStaff = ['owner', 'staff'].includes(state.profile?.role);
    let query = state.client.from('enquiries').select('id,customer_id,product_id,customer_name,customer_contact,delivery,message,status,created_at,products(title)').order('created_at', { ascending: false }).limit(100);
    if (!ownerOrStaff) query = query.eq('customer_id', state.user.id);
    const { data, error } = await query;
    if (error) throw error;
    state.enquiries = data || [];
    target.innerHTML = `<p class="about-text">${ownerOrStaff ? 'Customer enquiries. Update the status after the team has reviewed the request.' : 'Your recent artwork enquiries and their current status.'}</p><div class="admin-list">${state.enquiries.length ? state.enquiries.map(item => {
      const date = item.created_at ? new Date(item.created_at).toLocaleDateString() : '';
      const productName = item.products?.title || (item.product_id ? 'Artwork enquiry' : 'Custom idea');
      return `<article class="admin-item"><div style="min-width:0;flex:1"><h4>${escapeHtml(productName)} <span class="pill ${item.status === 'completed' ? 'good' : ''}">${escapeHtml(item.status || 'new')}</span></h4><p>${escapeHtml(item.customer_name || 'Customer')} · ${escapeHtml(item.customer_contact || '')} · ${escapeHtml(date)}</p><p style="margin-top:7px;white-space:pre-wrap">${escapeHtml(item.message)}</p>${item.delivery ? `<p>Location: ${escapeHtml(item.delivery)}</p>` : ''}</div>${ownerOrStaff ? `<div class="admin-actions"><select class="control status-select" data-enquiry-status="${escapeHtml(item.id)}" aria-label="Update enquiry status"><option ${item.status === 'new' ? 'selected' : ''}>new</option><option ${item.status === 'in_progress' ? 'selected' : ''}>in_progress</option><option ${item.status === 'accepted' ? 'selected' : ''}>accepted</option><option ${item.status === 'completed' ? 'selected' : ''}>completed</option><option ${item.status === 'declined' ? 'selected' : ''}>declined</option></select><button class="button small primary" data-save-status="${escapeHtml(item.id)}" type="button">Save</button></div>` : ''}</article>`;
    }).join('') : '<div class="empty-state">No enquiries yet.</div>'}</div>`;
    $$('[data-save-status]', target).forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.saveStatus;
      const status = $(`[data-enquiry-status="${CSS.escape(id)}"]`, target).value;
      try {
        const { error } = await state.client.from('enquiries').update({ status }).eq('id', id);
        if (error) throw error;
        toast('Enquiry status updated.');
        await renderWorkspace('enquiries');
      } catch (error) { toast(friendlyError(error, 'Could not update enquiry status.'), true); }
    }));
  }

  async function renderStaffAdmin(target) {
    const { data, error } = await state.client.from('staff').select('user_id,username,rank,department,active,created_at').order('username');
    if (error) throw error;
    const rows = data || [];
    const profileResult = rows.length ? await state.client.from('profiles').select('id,display_name,bio').in('id', rows.map(row => row.user_id)) : { data: [], error: null };
    if (profileResult.error) throw profileResult.error;
    const profiles = new Map((profileResult.data || []).map(profile => [profile.id, profile]));
    target.innerHTML = `<div class="workspace-form"><h3>Create staff account</h3><p class="about-text">Staff accounts are created by a secure server-side Edge Function. This form never sends your service-role key to the browser.</p><form id="createStaffForm"><div class="form-grid"><div class="field"><label for="staffEmail">Staff email</label><input id="staffEmail" type="email" required maxlength="254"></div><div class="field"><label for="staffPassword">Temporary password (8+ chars)</label><input id="staffPassword" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></div><div class="field"><label for="staffDisplayName">Display name</label><input id="staffDisplayName" required maxlength="80"></div><div class="field"><label for="staffUsername">Username / public handle</label><input id="staffUsername" required maxlength="60"></div><div class="field"><label for="staffRank">Role title</label><select id="staffRank"><option>Artist</option><option>Marketer</option><option>Studio assistant</option></select></div><div class="field"><label for="staffDepartment">Department</label><select id="staffDepartment"><option>ARTIST</option><option>MARKETER</option><option>OPERATIONS</option></select></div></div><div class="form-actions"><button class="button primary" type="submit">Create staff account</button></div><div class="form-error" id="createStaffError" role="alert"></div></form></div><h3>Staff roster (${rows.length})</h3><div class="admin-list">${rows.length ? rows.map(row => { const profile = profiles.get(row.user_id) || {}; return `<article class="admin-item"><div><h4>${escapeHtml(profile.display_name || row.username)} <span class="pill">${escapeHtml(row.rank || row.department || 'Staff')}</span></h4><p>@${escapeHtml(row.username)} · ${escapeHtml(row.active ? 'Active' : 'Inactive')}</p><p>${escapeHtml(profile.bio || '')}</p></div><div class="admin-actions"><button class="button small" data-staff-active="${escapeHtml(row.user_id)}" data-active="${row.active ? 'true' : 'false'}" type="button">${row.active ? 'Deactivate' : 'Activate'}</button></div></article>`; }).join('') : '<div class="empty-state">No staff accounts yet.</div>'}</div>`;
    $('#createStaffForm', target).addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('button[type="submit"]', event.currentTarget);
      setBusy(button, true, 'Creating…');
      $('#createStaffError').textContent = '';
      try {
        const { data, error } = await state.client.functions.invoke(EDGE_CREATE_STAFF, { body: {
          email: asText($('#staffEmail').value).toLowerCase(), password: $('#staffPassword').value,
          display_name: asText($('#staffDisplayName').value), username: asText($('#staffUsername').value),
          rank: $('#staffRank').value, department: $('#staffDepartment').value
        } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast('Staff account created. Ask the staff member to sign in with the new credentials.');
        await renderWorkspace('staff');
        await loadTeam();
      } catch (error) {
        console.error('Staff creation failed:', error.message);
        $('#createStaffError').textContent = friendlyError(error, 'Could not create staff account. Deploy the create-staff Edge Function first.');
      } finally { setBusy(button, false); }
    });
    $$('[data-staff-active]', target).forEach(button => button.addEventListener('click', async () => {
      try {
        const active = button.dataset.active !== 'true';
        const { error } = await state.client.from('staff').update({ active }).eq('user_id', button.dataset.staffActive);
        if (error) throw error;
        toast(active ? 'Staff account activated in the public roster.' : 'Staff member hidden from the public roster.');
        await Promise.all([renderWorkspace('staff'), loadTeam()]);
      } catch (error) { toast(friendlyError(error, 'Could not update the staff record.'), true); }
    }));
  }

  async function renderContentAdmin(target) {
    let aboutText = $('#aboutText').textContent;
    try {
      const { data, error } = await state.client.from('site_settings').select('key,value').eq('key', 'about_text').maybeSingle();
      if (!error && data?.value) aboutText = typeof data.value === 'string' ? data.value : data.value.text || aboutText;
    } catch (_) { /* fallback */ }
    target.innerHTML = `<div class="workspace-form"><h3>About section</h3><form id="siteContentForm"><div class="field"><label for="siteAboutText">Public About text</label><textarea id="siteAboutText" required maxlength="2400">${escapeHtml(aboutText)}</textarea><small>Plain text only; line breaks are preserved.</small></div><div class="form-actions"><button class="button primary" type="submit">Save site content</button></div><div class="form-error" id="siteContentError" role="alert"></div></form></div><p class="about-text">To change the phone number, studio location or other fixed page copy, edit index.html and redeploy.</p>`;
    $('#siteContentForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('button[type="submit"]', event.currentTarget);
      setBusy(button, true, 'Saving…');
      try {
        const value = asText($('#siteAboutText').value);
        const { error } = await state.client.from('site_settings').upsert({ key: 'about_text', value }, { onConflict: 'key' });
        if (error) throw error;
        $('#aboutText').textContent = value;
        toast('About section saved.');
      } catch (error) { $('#siteContentError').textContent = friendlyError(error, 'Could not save site content.'); }
      finally { setBusy(button, false); }
    });
  }

  async function renderProfile(target) {
    const isStaff = state.profile?.role === 'staff';
    const staffName = state.staffRecord?.username || '';
    target.innerHTML = `<div class="workspace-form"><h3>Profile details</h3><form id="profileForm"><div class="form-grid"><div class="field"><label for="profileDisplayName">Display name</label><input id="profileDisplayName" maxlength="80" required value="${escapeHtml(state.profile?.display_name || '')}"></div>${isStaff ? `<div class="field"><label>Public username</label><input value="${escapeHtml(staffName)}" disabled><small>Ask the owner to change your username or role.</small></div>` : ''}<div class="field full"><label for="profileBio">Bio</label><textarea id="profileBio" maxlength="500" placeholder="A short introduction…">${escapeHtml(state.profile?.bio || '')}</textarea></div><div class="field full"><label for="profilePhoto">Profile photo (max 8 MB)</label><input id="profilePhoto" type="file" accept="image/*"></div></div><div class="form-actions"><button class="button primary" type="submit">Save profile</button></div><div class="form-error" id="profileError" role="alert"></div></form></div>`;
    $('#profileForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('button[type="submit"]', event.currentTarget);
      setBusy(button, true, 'Saving…');
      try {
        const payload = { display_name: asText($('#profileDisplayName').value), bio: asText($('#profileBio').value) };
        const file = $('#profilePhoto').files[0];
        if (file) payload.avatar_url = await uploadImage(file, `avatars/${state.user.id}`);
        const { data, error } = await state.client.from('profiles').update(payload).eq('id', state.user.id).select('id,display_name,role,avatar_url,bio,created_at').single();
        if (error) throw error;
        state.profile = data;
        renderAccountControls();
        await loadTeam();
        toast('Profile saved.');
      } catch (error) { $('#profileError').textContent = friendlyError(error, 'Could not save profile.'); }
      finally { setBusy(button, false); }
    });
  }

  async function signOut() {
    if (state.client) {
      const { error } = await state.client.auth.signOut();
      if (error) { toast(error.message, true); return; }
    }
    await applyUser(null);
    closeModal('workspaceModal');
    toast('Signed out.');
  }

  function setupEvents() {
    $('#accountButton').addEventListener('click', () => state.user ? openWorkspace('overview') : showAuth('signin'));
    $('#footerSignIn').addEventListener('click', () => state.user ? openWorkspace('overview') : showAuth('signin'));
    $('#workspaceButton').addEventListener('click', () => openWorkspace('overview'));
    $('#authForm').addEventListener('submit', handleAuth);
    $('#authSwitch').addEventListener('click', () => showAuth(state.authMode === 'signin' ? 'signup' : 'signin'));
    $('#enquiryForm').addEventListener('submit', submitEnquiry);
    $('#signOutButton').addEventListener('click', signOut);
    $('#productSearch').addEventListener('input', event => { state.searchText = event.target.value; renderProducts(); });
    $$('#productFilters .filter').forEach(button => button.addEventListener('click', () => { state.activeCategory = button.dataset.category; renderProducts(); }));
    $('#mobileMenu').addEventListener('click', () => {
      const open = $('#navLinks').classList.toggle('open');
      $('#mobileMenu').setAttribute('aria-expanded', String(open));
    });
    $$('#navLinks a').forEach(link => link.addEventListener('click', () => { $('#navLinks').classList.remove('open'); $('#mobileMenu').setAttribute('aria-expanded', 'false'); }));
    $$('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.close)));
    $$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) backdrop.classList.remove('open'); }));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') $$('.modal-backdrop.open').forEach(modal => modal.classList.remove('open')); });
  }

  async function init() {
    $('#yearNow').textContent = String(new Date().getFullYear());
    setupEvents();
    if (!window.supabase?.createClient) {
      $('#productGrid').innerHTML = '<div class="empty-state">The site library did not load. Check your connection and reload.</div>';
      return;
    }
    if (!isConfigured()) {
      $('#productGrid').innerHTML = '<div class="empty-state">Site configuration needed: add your Supabase publishable key at the top of app.js, then redeploy.</div>';
      $('#productStatus').textContent = 'Supabase connection is not configured yet.';
      return;
    }
    state.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    state.client.auth.onAuthStateChange((_event, session) => {
      // Defer network calls so auth event processing cannot deadlock the client.
      setTimeout(() => applyUser(session?.user || null), 0);
    });
    await refreshSession();
    await Promise.all([loadProducts(), loadTeam(), loadSiteContent()]);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
