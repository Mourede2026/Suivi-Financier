/* ============================================================================
   SUIVI FINANCIER ZS — Application front-end (vanilla JS)
============================================================================ */
'use strict';

const state = {
  session: null,        // { token, role, nom, equipe_id }
  perimetre: [],        // centres visibles (admin: tous / equipe: assignés)
  centresAll: [],        // tous les centres (admin uniquement, pour affectations)
  currentRoute: null,
  currentFilters: {},
};

const MOIS_LABELS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const fmt = new Intl.NumberFormat('fr-FR');
function money(n) { return fmt.format(Math.round(Number(n) || 0)) + ' F'; }
function num(n) { return fmt.format(Math.round(Number(n) || 0)); }

// ----------------------------------------------------------------------------
// BOOT
// ----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', boot);

function boot() {
  bindLoginForm();
  bindSetupForm();
  bindSidebarToggle();

  const apiUrl = API.getApiUrl();
  if (!apiUrl || !/^https:\/\/script\.google(usercontent)?\.com\//.test(apiUrl)) {
    showScreen('setup-screen');
    return;
  }

  const session = API.getSession();
  if (session && session.token) {
    state.session = session;
    enterApp();
  } else {
    showScreen('login-screen');
  }
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ----------------------------------------------------------------------------
// ECRAN INITIALISATION (première utilisation : coller l'URL Apps Script)
// ----------------------------------------------------------------------------
function bindSetupForm() {
  const form = document.getElementById('setup-form');
  const urlInput = document.getElementById('setup-url');
  const initBlock = document.getElementById('init-block');

  const existing = API.getApiUrl();
  if (existing) urlInput.value = existing;
  urlInput.addEventListener('input', () => {
    initBlock.style.display = /^https:\/\/script\.google(usercontent)?\.com\//.test(urlInput.value.trim()) ? 'block' : 'none';
  });
  if (existing) initBlock.style.display = 'block';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    const errBox = document.getElementById('setup-error');
    errBox.classList.remove('show');
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
      errBox.textContent = "L'URL doit être celle de votre déploiement Apps Script (commence par https://script.google.com/...).";
      errBox.classList.add('show');
      return;
    }
    API.setApiUrl(url);
    showScreen('login-screen');
  });

  document.getElementById('btn-init').addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const errBox = document.getElementById('init-error');
    errBox.classList.remove('show');
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
      errBox.textContent = "Renseignez d'abord une URL d'API valide ci-dessus.";
      errBox.classList.add('show');
      return;
    }
    API.setApiUrl(url);
    const btn = document.getElementById('btn-init');
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span> Initialisation…';
    try {
      await API.call('setup', {
        centres: CENTRES_SEED,
        admin: {
          identifiant: document.getElementById('init-admin-id').value.trim() || 'admin',
          motdepasse: document.getElementById('init-admin-pw').value.trim() || 'admin123'
        }
      });
      toast('Google Sheet initialisé avec succès. Vous pouvez maintenant vous connecter.');
      showScreen('login-screen');
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add('show');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Initialiser le Google Sheet';
    }
  });
}

// ----------------------------------------------------------------------------
// CONNEXION
// ----------------------------------------------------------------------------
function bindLoginForm() {
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-submit');
    const errBox = document.getElementById('login-error');
    errBox.classList.remove('show');
    const identifiant = document.getElementById('login-id').value.trim();
    const motdepasse = document.getElementById('login-pw').value;

    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span> Connexion…';
    try {
      const res = await API.call('login', { identifiant, motdepasse });
      API.setSession(res);
      state.session = res;
      enterApp();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add('show');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Se connecter';
    }
  });

  document.getElementById('change-api-url').addEventListener('click', () => {
    showScreen('setup-screen');
  });
}

function logout() {
  API.clearSession();
  state.session = null;
  showScreen('login-screen');
  document.getElementById('login-form').reset();
}

// ----------------------------------------------------------------------------
// ENTREE DANS L'APPLICATION
// ----------------------------------------------------------------------------
async function enterApp() {
  showScreen('app-screen');
  renderSidebar();
  bindLogoutButtons();

  try {
    const perim = await API.call('monPerimetre', {});
    state.perimetre = perim.data;
    if (state.session.role === 'admin') {
      const all = await API.call('listCentres', {});
      state.centresAll = all.data;
    }
  } catch (err) {
    toast(err.message, 'error');
  }

  const defaultRoute = state.session.role === 'admin' ? 'admin-dashboard' : 'equipe-dashboard';
  navigate(defaultRoute);
}

function bindLogoutButtons() {
  document.querySelectorAll('[data-action="logout"]').forEach(b => b.onclick = logout);
}

function bindSidebarToggle() {
  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-scrim').classList.add('show');
  });
  document.getElementById('sidebar-scrim').addEventListener('click', closeSidebar);
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-scrim').classList.remove('show');
}

// ----------------------------------------------------------------------------
// SIDEBAR / NAVIGATION
// ----------------------------------------------------------------------------
const ADMIN_NAV = [
  { route: 'admin-dashboard', label: 'Tableau de bord', icon: '◈' },
  { route: 'admin-comptes', label: 'Paramétrage des comptes', icon: '◎' },
  { route: 'admin-affectation', label: 'Affectation des sites', icon: '▤' },
];
const EQUIPE_NAV = [
  { route: 'equipe-dashboard', label: 'Tableau de bord', icon: '◈' },
  { route: 'equipe-saisie', label: 'Saisie', icon: '＋' },
];

function renderSidebar() {
  const nav = state.session.role === 'admin' ? ADMIN_NAV : EQUIPE_NAV;
  document.getElementById('sidebar-role').textContent = state.session.role === 'admin' ? 'Administrateur' : 'Équipe de collecte';
  document.getElementById('sidebar-nav').innerHTML = nav.map(item => `
    <button class="nav-link" data-route="${item.route}">
      <span>${item.icon}</span> ${item.label} <span class="dot"></span>
    </button>
  `).join('');
  document.getElementById('sidebar-user-name').textContent = state.session.nom || state.session.identifiant || '';

  document.querySelectorAll('#sidebar-nav .nav-link').forEach(btn => {
    btn.addEventListener('click', () => { navigate(btn.dataset.route); closeSidebar(); });
  });
}

function setActiveNav(route) {
  document.querySelectorAll('#sidebar-nav .nav-link').forEach(b => {
    b.classList.toggle('active', b.dataset.route === route);
  });
}

async function navigate(route) {
  state.currentRoute = route;
  setActiveNav(route);
  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="empty-state"><div class="glyph">…</div><p>Chargement…</p></div>';
  try {
    switch (route) {
      case 'admin-dashboard': await viewAdminDashboard(); break;
      case 'admin-comptes': await viewAdminComptes(); break;
      case 'admin-affectation': await viewAdminAffectation(); break;
      case 'equipe-dashboard': await viewEquipeDashboard(); break;
      case 'equipe-saisie': await viewEquipeSaisie(); break;
      default: main.innerHTML = '<p>Page introuvable.</p>';
    }
  } catch (err) {
    toast(err.message, 'error');
    main.innerHTML = `<div class="empty-state"><div class="glyph">⚠</div><h3>Une erreur est survenue</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

// ----------------------------------------------------------------------------
// TOASTS
// ----------------------------------------------------------------------------
function toast(msg, type = 'success') {
  const stack = document.getElementById('toast-stack');
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : 'success'}`;
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ============================================================================
// TABLEAU DE BORD — composant partagé (admin & équipe)
// ============================================================================
function statCardsHtml(totaux) {
  const versementClass = totaux.ecartVersement <= 0 ? 'accent-good' : 'accent-brick';
  const justifClass = totaux.ecartJustification >= 0 ? 'accent-good' : 'accent-brick';
  return `
    <div class="grid grid-stats">
      <div class="stat-card accent-teal">
        <p class="label">Recettes collectées</p>
        <p class="value">${money(totaux.totalRecette)}</p>
        <p class="sub">Total sur la période affichée</p>
      </div>
      <div class="stat-card accent-gold">
        <p class="label">Versements en banque</p>
        <p class="value">${money(totaux.totalVersement)}</p>
        <p class="sub">Total reversé</p>
      </div>
      <div class="stat-card ${versementClass}">
        <p class="label">Écart recette / versement</p>
        <p class="value">${money(totaux.ecartVersement)}</p>
        <p class="sub">${totaux.ecartVersement <= 0 ? 'Recettes intégralement versées' : 'Solde non encore versé — à surveiller'}</p>
      </div>
      <div class="stat-card ${justifClass}">
        <p class="label">Écart dépense / justification</p>
        <p class="value">${money(totaux.ecartJustification)}</p>
        <p class="sub">${totaux.ecartJustification >= 0 ? 'Dépenses justifiées' : 'Justificatifs manquants'}</p>
      </div>
    </div>
  `;
}

function ecartPill(value, goodWhen) {
  const isGood = goodWhen(value);
  return `<span class="pill ${isGood ? 'pill-good' : 'pill-bad'}">${isGood ? '✓' : '!'} ${money(value)}</span>`;
}

function centreTableHtml(rows) {
  if (!rows.length) return emptyState('▤', 'Aucune donnée', 'Aucune saisie enregistrée pour ce périmètre pour le moment.');
  return `
    <div class="table-wrap">
      <table class="ledger">
        <thead><tr>
          <th>Centre</th><th>Commune</th>
          <th class="num">Recette</th><th class="num">Versement</th><th>Écart versement</th>
          <th class="num">Dépense</th><th class="num">Justifié</th><th>Écart justif.</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${escapeHtml(r.nom)}</td>
              <td>${escapeHtml(r.commune)}</td>
              <td class="num">${num(r.recette_totale)}</td>
              <td class="num">${num(r.versement_total)}</td>
              <td>${ecartPill(r.ecart_versement, v => v <= 0)}</td>
              <td class="num">${num(r.depense_totale)}</td>
              <td class="num">${num(r.justif_totale)}</td>
              <td>${ecartPill(r.ecart_justification, v => v >= 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function communeTableHtml(rows) {
  if (!rows.length) return emptyState('▤', 'Aucune donnée', 'Aucune saisie enregistrée.');
  return `
    <div class="table-wrap">
      <table class="ledger">
        <thead><tr><th>Commune</th><th class="num">Centres</th><th class="num">Recette</th><th class="num">Versement</th><th>Écart versement</th><th>Écart justif.</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${escapeHtml(r.commune)}</td>
              <td class="num">${r.nb_centres}</td>
              <td class="num">${num(r.recette_totale)}</td>
              <td class="num">${num(r.versement_total)}</td>
              <td>${ecartPill(r.ecart_versement, v => v <= 0)}</td>
              <td>${ecartPill(r.ecart_justification, v => v >= 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function emptyState(glyph, title, text) {
  return `<div class="empty-state"><div class="glyph">${glyph}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`;
}

function drawEvolutionChart(canvasId, evolution) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !window.Chart) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: evolution.map(e => e.periode),
      datasets: [
        { label: 'Recettes', data: evolution.map(e => e.recette), backgroundColor: '#12335C' },
        { label: 'Dépenses', data: evolution.map(e => e.depense), backgroundColor: '#D31027' },
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { family: 'Arial Narrow' } } } },
      scales: {
        y: { ticks: { callback: v => num(v) } }
      }
    }
  });
}

// ============================================================================
// ADMIN — Vue d'ensemble
// ============================================================================
async function viewAdminDashboard() {
  const centres = state.centresAll;
  const communes = [...new Set(centres.map(c => c.commune))].sort();

  document.getElementById('main-content').innerHTML = `
    ${topbarHtml('Vue d\'ensemble', `${centres.length} centres suivis sur ${communes.length} communes`)}
    <div class="filters-row">
      <div class="field">
        <label>Commune</label>
        <select id="f-commune"><option value="">Toutes les communes</option>${communes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label>Centre de santé</label>
        <select id="f-centre"><option value="">Tous les centres</option>${centres.map(c => `<option value="${c.id}">${escapeHtml(c.nom)}</option>`).join('')}</select>
      </div>
      <button class="btn btn-ghost btn-sm" id="f-reset">Réinitialiser</button>
    </div>
    <div id="dash-stats"></div>
    <div class="grid grid-2">
      <div class="card">
        <p class="card-title">Recettes vs dépenses par période</p>
        <canvas id="evo-chart" height="220"></canvas>
      </div>
      <div class="card">
        <p class="card-title">Analyse par commune</p>
        <div id="commune-table"></div>
      </div>
    </div>
    <div class="card" style="margin-top:16px;">
      <p class="card-title">Analyse par centre de santé</p>
      <div id="centre-table"></div>
    </div>
  `;

  async function refresh() {
    const commune = document.getElementById('f-commune').value;
    const centre_id = document.getElementById('f-centre').value;
    const res = await API.call('dashboard', { commune, centre_id });
    const d = res.data;
    document.getElementById('dash-stats').innerHTML = statCardsHtml(d.totaux);
    document.getElementById('commune-table').innerHTML = communeTableHtml(d.parCommune);
    document.getElementById('centre-table').innerHTML = centreTableHtml(d.parCentre);
    drawEvolutionChart('evo-chart', d.evolution);
  }

  document.getElementById('f-commune').addEventListener('change', refresh);
  document.getElementById('f-centre').addEventListener('change', refresh);
  document.getElementById('f-reset').addEventListener('click', () => {
    document.getElementById('f-commune').value = '';
    document.getElementById('f-centre').value = '';
    refresh();
  });
  await refresh();
}

function topbarHtml(title, meta) {
  return `<div class="topbar"><h2>${escapeHtml(title)}</h2><span class="meta">${escapeHtml(meta || '')}</span></div>`;
}

// ============================================================================
// ADMIN — Paramétrage des comptes (créer/gérer les identifiants des équipes)
// ============================================================================
async function viewAdminComptes() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    ${topbarHtml('Paramétrage des comptes', 'Créez les identifiants de connexion de chaque équipe')}
    <div style="margin-bottom:16px;"><button class="btn btn-primary" id="btn-new-equipe" style="width:auto;">+ Nouveau compte équipe</button></div>
    <div class="card"><div id="equipes-table"></div></div>
    ${compteModalHtml()}
  `;
  document.getElementById('btn-new-equipe').addEventListener('click', () => openCompteModal(null));
  await refreshEquipesTable();
  bindCompteModal();
}

async function refreshEquipesTable() {
  const res = await API.call('adminListEquipes', {});
  const equipes = res.data;
  const box = document.getElementById('equipes-table');
  if (!equipes.length) {
    box.innerHTML = emptyState('◎', 'Aucun compte créé', 'Créez le premier compte équipe, puis attribuez-lui des centres depuis "Affectation des sites".');
    return;
  }
  box.innerHTML = `
    <div class="table-wrap">
      <table class="ledger">
        <thead><tr><th>Équipe</th><th>Identifiant</th><th class="num">Centres assignés</th><th>Statut</th><th></th></tr></thead>
        <tbody>
          ${equipes.map(eq => `
            <tr>
              <td>${escapeHtml(eq.nom)}</td>
              <td><span style="font-family:var(--font-mono)">${escapeHtml(eq.identifiant)}</span></td>
              <td class="num">${eq.nb_centres}</td>
              <td>${eq.actif === false || eq.actif === 'false' ? '<span class="pill pill-bad">Désactivée</span>' : '<span class="pill pill-good">Active</span>'}</td>
              <td class="row-actions">
                <button class="icon-btn" data-edit="${eq.id}">Modifier</button>
                <button class="icon-btn" data-delete="${eq.id}" data-name="${escapeHtml(eq.nom)}">Supprimer</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  box.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
    const eq = equipes.find(x => x.id === b.dataset.edit);
    openCompteModal(eq);
  }));
  box.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(`Supprimer l'équipe "${b.dataset.name}" ? Ses accès seront révoqués (les données déjà saisies restent conservées).`)) return;
    try {
      await API.call('adminDeleteEquipe', { id: b.dataset.delete });
      toast('Équipe supprimée.');
      refreshEquipesTable();
    } catch (err) { toast(err.message, 'error'); }
  }));
}

function compteModalHtml() {
  return `
    <div class="modal-overlay" id="equipe-modal">
      <div class="modal">
        <div class="modal-header">
          <h3 id="equipe-modal-title">Nouveau compte équipe</h3>
          <button class="modal-close" id="equipe-modal-close">×</button>
        </div>
        <form id="equipe-form">
          <input type="hidden" id="eq-id">
          <div class="form-grid">
            <div class="field full"><label>Nom de l'équipe</label><input id="eq-nom" required placeholder="Ex : Équipe Abomey Nord"></div>
            <div class="field full"><label>Identifiant de connexion</label><input id="eq-identifiant" required placeholder="Ex : abomey.nord"></div>
            <div class="field full" id="eq-pw-field"><label>Mot de passe (laisser vide pour générer automatiquement)</label><input id="eq-pw" placeholder="Généré automatiquement si vide"></div>
            <div class="field full" id="eq-actif-field" style="display:none;">
              <label><input type="checkbox" id="eq-actif" style="width:auto;display:inline-block;margin-right:8px;"> Compte actif</label>
            </div>
          </div>
          <p style="font-size:12.5px;color:var(--ink-soft);margin-top:14px;">L'attribution des centres de santé à cette équipe se fait ensuite depuis <b>Affectation des sites</b>.</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" id="equipe-cancel">Annuler</button>
            <button type="submit" class="btn btn-primary" style="width:auto;" id="equipe-save">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function bindCompteModal() {
  document.getElementById('equipe-modal-close').addEventListener('click', closeEquipeModal);
  document.getElementById('equipe-cancel').addEventListener('click', closeEquipeModal);
  document.getElementById('equipe-form').addEventListener('submit', saveCompte);
}

function openCompteModal(eq) {
  document.getElementById('equipe-form').reset();
  document.getElementById('eq-actif-field').style.display = 'none';

  if (eq) {
    document.getElementById('equipe-modal-title').textContent = 'Modifier le compte';
    document.getElementById('eq-id').value = eq.id;
    document.getElementById('eq-nom').value = eq.nom;
    document.getElementById('eq-identifiant').value = eq.identifiant;
    document.getElementById('eq-identifiant').disabled = true;
    document.getElementById('eq-pw').placeholder = 'Laisser vide pour ne pas changer';
    document.getElementById('eq-actif-field').style.display = 'block';
    document.getElementById('eq-actif').checked = !(eq.actif === false || eq.actif === 'false');
  } else {
    document.getElementById('equipe-modal-title').textContent = 'Nouveau compte équipe';
    document.getElementById('eq-id').value = '';
    document.getElementById('eq-identifiant').disabled = false;
  }
  document.getElementById('equipe-modal').classList.add('show');
}
function closeEquipeModal() { document.getElementById('equipe-modal').classList.remove('show'); }

async function saveCompte(e) {
  e.preventDefault();
  const id = document.getElementById('eq-id').value;
  const btn = document.getElementById('equipe-save');
  btn.disabled = true;
  try {
    if (id) {
      const payload = { id, nom: document.getElementById('eq-nom').value, actif: document.getElementById('eq-actif').checked };
      const pw = document.getElementById('eq-pw').value.trim();
      if (pw) payload.motdepasse = pw;
      await API.call('adminUpdateEquipe', payload);
      toast('Compte mis à jour.');
    } else {
      const res = await API.call('adminCreateEquipe', {
        nom: document.getElementById('eq-nom').value,
        identifiant: document.getElementById('eq-identifiant').value.trim(),
        motdepasse: document.getElementById('eq-pw').value.trim()
      });
      toast(`Compte créé. Mot de passe : ${res.data.motdepasse} (notez-le, il ne sera plus affiché)`, 'success');
    }
    closeEquipeModal();
    refreshEquipesTable();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ============================================================================
// ADMIN — Affectation des sites (choisir une équipe, cocher ses centres)
// ============================================================================
async function viewAdminAffectation() {
  const res = await API.call('adminListEquipes', {});
  const equipes = res.data;
  const main = document.getElementById('main-content');

  if (!equipes.length) {
    main.innerHTML = `${topbarHtml('Affectation des sites', '')}` +
      emptyState('▤', 'Aucune équipe', 'Créez d\'abord un compte équipe depuis "Paramétrage des comptes".');
    return;
  }

  main.innerHTML = `
    ${topbarHtml('Affectation des sites', 'Choisissez une équipe puis cochez les centres qu\'elle doit collecter')}
    <div class="card" style="margin-bottom:16px;">
      <div class="field" style="max-width:360px;">
        <label>Équipe</label>
        <select id="aff-equipe">${equipes.map(eq => `<option value="${eq.id}">${escapeHtml(eq.nom)} (${eq.nb_centres} centre${eq.nb_centres > 1 ? 's' : ''})</option>`).join('')}</select>
      </div>
    </div>
    <div class="card">
      <p class="card-title">Centres à affecter <span id="aff-count" class="pill pill-neutral">0 sélectionné(s)</span></p>
      <div class="checkbox-grid" id="aff-centres-grid" style="max-height:420px;">${affectationChecklistHtml()}</div>
      <div class="modal-actions" style="justify-content:flex-start;margin-top:16px;">
        <button class="btn btn-primary" id="aff-save" style="width:auto;">Enregistrer l'affectation</button>
      </div>
    </div>
  `;

  const select = document.getElementById('aff-equipe');
  async function loadAffectation() {
    const equipe_id = select.value;
    const res2 = await API.call('adminGetAffectations', { equipe_id });
    const ids = res2.data;
    document.querySelectorAll('#aff-centres-grid input').forEach(cb => cb.checked = ids.indexOf(cb.value) !== -1);
    updateAffCount();
  }
  function updateAffCount() {
    const n = document.querySelectorAll('#aff-centres-grid input:checked').length;
    document.getElementById('aff-count').textContent = `${n} sélectionné(s)`;
  }
  document.querySelectorAll('#aff-centres-grid input').forEach(cb => cb.addEventListener('change', updateAffCount));
  select.addEventListener('change', loadAffectation);

  document.getElementById('aff-save').addEventListener('click', async () => {
    const btn = document.getElementById('aff-save');
    btn.disabled = true;
    try {
      const centre_ids = [...document.querySelectorAll('#aff-centres-grid input:checked')].map(cb => cb.value);
      await API.call('adminSetAffectations', { equipe_id: select.value, centre_ids });
      toast('Affectation enregistrée.');
      const r = await API.call('adminListEquipes', {});
      const updated = r.data.find(e => e.id === select.value);
      const opt = select.querySelector(`option[value="${select.value}"]`);
      if (opt && updated) opt.textContent = `${updated.nom} (${updated.nb_centres} centre${updated.nb_centres > 1 ? 's' : ''})`;
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  await loadAffectation();
}

function affectationChecklistHtml() {
  const communes = [...new Set(state.centresAll.map(c => c.commune))].sort();
  return communes.map(commune => `
    <div class="commune-group-label">${escapeHtml(commune)}</div>
    ${state.centresAll.filter(c => c.commune === commune).map(c => `
      <label class="checkbox-item">
        <input type="checkbox" value="${c.id}" name="aff_centre_ids">
        <span>${escapeHtml(c.nom)}<span class="commune-tag">${escapeHtml(c.arrondissement)}</span></span>
      </label>
    `).join('')}
  `).join('');
}
// ============================================================================
// EQUIPE — Tableau de bord
// ============================================================================
async function viewEquipeDashboard() {
  const centres = state.perimetre;
  document.getElementById('main-content').innerHTML = `
    ${topbarHtml('Tableau de bord', `${centres.length} centre(s) qui vous ${centres.length > 1 ? 'sont assignés' : 'est assigné'}`)}
    <div class="filters-row">
      <div class="field">
        <label>Centre de santé</label>
        <select id="f-centre"><option value="">Tous mes centres</option>${centres.map(c => `<option value="${c.id}">${escapeHtml(c.nom)}</option>`).join('')}</select>
      </div>
    </div>
    <div id="dash-stats"></div>
    <div class="grid grid-2">
      <div class="card">
        <p class="card-title">Recettes vs dépenses par période</p>
        <canvas id="evo-chart" height="220"></canvas>
      </div>
      <div class="card">
        <p class="card-title">Détail par centre</p>
        <div id="centre-table"></div>
      </div>
    </div>
  `;
  if (!centres.length) {
    document.getElementById('main-content').innerHTML += emptyState('▤', 'Aucun centre assigné', 'L\'administrateur ne vous a pas encore affecté de centre de santé à collecter. Contactez-le pour obtenir vos accès.');
    return;
  }
  async function refresh() {
    const centre_id = document.getElementById('f-centre').value;
    const res = await API.call('dashboard', { centre_id });
    const d = res.data;
    document.getElementById('dash-stats').innerHTML = statCardsHtml(d.totaux);
    document.getElementById('centre-table').innerHTML = centreTableHtml(d.parCentre);
    drawEvolutionChart('evo-chart', d.evolution);
  }
  document.getElementById('f-centre').addEventListener('change', refresh);
  await refresh();
}

// ============================================================================
// EQUIPE — Saisie (sélection Commune → Arrondissement → Centre, puis les
// deux formulaires Recette + Dépense pour le centre choisi)
// ============================================================================
async function viewEquipeSaisie() {
  const centres = state.perimetre;
  const main = document.getElementById('main-content');
  if (!centres.length) {
    main.innerHTML = topbarHtml('Saisie', '') +
      emptyState('▤', 'Aucun centre assigné', 'L\'administrateur ne vous a pas encore affecté de centre de santé.');
    return;
  }

  const sel = { commune: '', arrondissement: '', centreId: '' };
  const communesOf = () => [...new Set(centres.map(c => c.commune))].sort();
  const arrondissementsOf = (commune) => [...new Set(centres.filter(c => c.commune === commune).map(c => c.arrondissement))].sort();
  const centresOf = (commune, arrondissement) => centres.filter(c => c.commune === commune && c.arrondissement === arrondissement);

  function renderSelector() {
    const communes = communesOf();
    main.innerHTML = `
      ${topbarHtml('Saisie', 'Sélectionnez le centre à renseigner')}
      <div class="card">
        <p class="card-title">Choisir un centre</p>
        <div class="form-grid">
          <div class="field">
            <label>Commune</label>
            <select id="sel-commune">
              <option value="">— Choisir —</option>
              ${communes.map(c => `<option value="${escapeHtml(c)}" ${sel.commune === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Arrondissement</label>
            <select id="sel-arrondissement" ${!sel.commune ? 'disabled' : ''}>
              <option value="">— Choisir —</option>
              ${sel.commune ? arrondissementsOf(sel.commune).map(a => `<option value="${escapeHtml(a)}" ${sel.arrondissement === a ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('') : ''}
            </select>
          </div>
          <div class="field full">
            <label>Centre de santé</label>
            <select id="sel-centre" ${!sel.arrondissement ? 'disabled' : ''}>
              <option value="">— Choisir —</option>
              ${(sel.commune && sel.arrondissement) ? centresOf(sel.commune, sel.arrondissement).map(c => `<option value="${c.id}" ${sel.centreId === c.id ? 'selected' : ''}>${escapeHtml(c.nom)}</option>`).join('') : ''}
            </select>
          </div>
        </div>
      </div>
      <div id="saisie-forms-zone"></div>
    `;

    document.getElementById('sel-commune').addEventListener('change', (e) => {
      sel.commune = e.target.value; sel.arrondissement = ''; sel.centreId = '';
      renderSelector();
    });
    document.getElementById('sel-arrondissement').addEventListener('change', (e) => {
      sel.arrondissement = e.target.value; sel.centreId = '';
      renderSelector();
    });
    document.getElementById('sel-centre').addEventListener('change', (e) => {
      sel.centreId = e.target.value;
      if (sel.centreId) renderFormsFor(sel.centreId);
      else document.getElementById('saisie-forms-zone').innerHTML = '';
    });

    if (sel.centreId) renderFormsFor(sel.centreId);
  }

  function renderFormsFor(centreId) {
    const centre = centres.find(c => c.id === centreId);
    const zone = document.getElementById('saisie-forms-zone');
    const yearNow = new Date().getFullYear();
    const years = [yearNow, yearNow - 1, yearNow - 2];

    zone.innerHTML = `
      <div class="card" style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div>
          <p style="font-weight:700;margin:0 0 4px;">Centre actif : ${escapeHtml(centre.nom)}</p>
          <p style="font-size:12.5px;color:var(--ink-soft);margin:0;">${escapeHtml(centre.commune)} — ${escapeHtml(centre.arrondissement)}</p>
        </div>
        <button class="btn btn-ghost btn-sm" id="btn-change-centre">Changer de centre</button>
      </div>
      <div class="grid grid-2" style="margin-top:16px;">
        <div class="card">
          <p class="card-title">Recette du mois</p>
          <form id="form-recette">
            <div class="form-grid">
              <div class="field"><label>Mois</label><select id="r-mois">${MOIS_LABELS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select></div>
              <div class="field"><label>Année</label><select id="r-annee">${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select></div>
              ${recetteFieldsHtml('r-')}
              <div class="field full"><label>Observations</label><textarea id="r-observations" rows="2" placeholder="Optionnel"></textarea></div>
            </div>
            <div class="modal-actions" style="justify-content:flex-start;margin-top:16px;">
              <button type="submit" class="btn btn-primary" style="width:auto;">Enregistrer la recette</button>
            </div>
          </form>
          <div style="margin-top:22px;">
            <p class="card-title">Historique recettes</p>
            <div id="table-recette"></div>
          </div>
        </div>
        <div class="card">
          <p class="card-title">Dépense du mois</p>
          <form id="form-depense">
            <div class="form-grid">
              <div class="field"><label>Mois</label><select id="d-mois">${MOIS_LABELS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select></div>
              <div class="field"><label>Année</label><select id="d-annee">${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select></div>
              ${depenseFieldsHtml('d-')}
              <div class="field full"><label>Observations</label><textarea id="d-observations" rows="2" placeholder="Optionnel"></textarea></div>
            </div>
            <div class="modal-actions" style="justify-content:flex-start;margin-top:16px;">
              <button type="submit" class="btn btn-primary" style="width:auto;">Enregistrer la dépense</button>
            </div>
          </form>
          <div style="margin-top:22px;">
            <p class="card-title">Historique dépenses</p>
            <div id="table-depense"></div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-change-centre').addEventListener('click', () => {
      sel.centreId = '';
      renderSelector();
    });
    document.getElementById('form-recette').addEventListener('submit', (e) => submitRecette(e, centreId));
    document.getElementById('form-depense').addEventListener('submit', (e) => submitDepense(e, centreId));
    refreshHistoryTable('recette', centreId);
    refreshHistoryTable('depense', centreId);
  }

  renderSelector();
}

function recetteFieldsHtml(prefix) {
  return `
    <div class="field"><label>Recette totale du mois (F CFA)</label><input type="number" id="${prefix}recette" min="0" step="1" required></div>
    <div class="field"><label>Versement total (F CFA)</label><input type="number" id="${prefix}versement" min="0" step="1" required></div>
    <div class="field full"><label>Repère / source des recettes</label><input id="${prefix}source-recette" placeholder="Ex : carnet de reçus n°..."></div>
    <div class="field full"><label>Repère / source des versements</label><input id="${prefix}source-versement" placeholder="Ex : bordereau de versement n°..."></div>
  `;
}
function depenseFieldsHtml(prefix) {
  return `
    <div class="field full"><label>Type de dépense</label>
      <select id="${prefix}type"><option value="Médicament">Compte médicament</option><option value="Fonctionnement">Compte fonctionnement</option></select>
    </div>
    <div class="field"><label>Date de la dépense</label><input type="date" id="${prefix}periode-depense"></div>
    <div class="field"><label>Montant dépensé (F CFA)</label><input type="number" id="${prefix}montant-depense" min="0" step="1" required></div>
    <div class="field"><label>Date de la justification</label><input type="date" id="${prefix}periode-justif"></div>
    <div class="field"><label>Montant justifié (F CFA)</label><input type="number" id="${prefix}montant-justif" min="0" step="1" required></div>
  `;
}

async function submitRecette(e, centreId) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    await API.call('addRecette', {
      centre_id: centreId,
      mois: document.getElementById('r-mois').value,
      annee: document.getElementById('r-annee').value,
      recette_totale: document.getElementById('r-recette').value,
      versement_total: document.getElementById('r-versement').value,
      source_recette: document.getElementById('r-source-recette').value,
      source_versement: document.getElementById('r-source-versement').value,
      observations: document.getElementById('r-observations').value
    });
    toast('Recette enregistrée.');
    e.target.reset();
    await refreshHistoryTable('recette', centreId);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function submitDepense(e, centreId) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    await API.call('addDepense', {
      centre_id: centreId,
      mois: document.getElementById('d-mois').value,
      annee: document.getElementById('d-annee').value,
      type: document.getElementById('d-type').value,
      periode_depense: document.getElementById('d-periode-depense').value,
      montant_depense: document.getElementById('d-montant-depense').value,
      periode_justif: document.getElementById('d-periode-justif').value,
      montant_justif: document.getElementById('d-montant-justif').value,
      observations: document.getElementById('d-observations').value
    });
    toast('Dépense enregistrée.');
    e.target.reset();
    await refreshHistoryTable('depense', centreId);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function refreshHistoryTable(kind, centreId) {
  const action = kind === 'recette' ? 'listRecettes' : 'listDepenses';
  const res = await API.call(action, { centre_id: centreId });
  const rows = res.data.sort((a, b) => (b.date_saisie || '').localeCompare(a.date_saisie || ''));
  const box = document.getElementById(kind === 'recette' ? 'table-recette' : 'table-depense');
  if (!box) return;

  if (!rows.length) {
    box.innerHTML = emptyState('▤', 'Aucune saisie', 'Utilisez le formulaire ci-dessus pour ajouter la première saisie de ce centre.');
    return;
  }

  if (kind === 'recette') {
    box.innerHTML = `
      <div class="table-wrap"><table class="ledger">
        <thead><tr><th>Période</th><th class="num">Recette</th><th class="num">Versement</th><th>Écart</th><th></th></tr></thead>
        <tbody>${rows.map(r => {
          const ecart = (Number(r.recette_totale) || 0) - (Number(r.versement_total) || 0);
          return `<tr>
            <td>${MOIS_LABELS[(Number(r.mois) || 1) - 1] || r.mois} ${r.annee}</td>
            <td class="num">${num(r.recette_totale)}</td>
            <td class="num">${num(r.versement_total)}</td>
            <td>${ecartPill(ecart, v => v <= 0)}</td>
            <td class="row-actions"><button class="icon-btn" data-del="${r.id}">Supprimer</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    `;
  } else {
    box.innerHTML = `
      <div class="table-wrap"><table class="ledger">
        <thead><tr><th>Période</th><th>Type</th><th class="num">Dépense</th><th class="num">Justifié</th><th>Écart</th><th></th></tr></thead>
        <tbody>${rows.map(r => {
          const ecart = (Number(r.montant_justif) || 0) - (Number(r.montant_depense) || 0);
          return `<tr>
            <td>${MOIS_LABELS[(Number(r.mois) || 1) - 1] || r.mois} ${r.annee}</td>
            <td>${escapeHtml(r.type)}</td>
            <td class="num">${num(r.montant_depense)}</td>
            <td class="num">${num(r.montant_justif)}</td>
            <td>${ecartPill(ecart, v => v >= 0)}</td>
            <td class="row-actions"><button class="icon-btn" data-del="${r.id}">Supprimer</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    `;
  }

  box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Supprimer cette saisie ?')) return;
    try {
      await API.call(kind === 'recette' ? 'deleteRecette' : 'deleteDepense', { id: b.dataset.del });
      toast('Saisie supprimée.');
      refreshHistoryTable(kind, centreId);
    } catch (err) { toast(err.message, 'error'); }
  }));
}
