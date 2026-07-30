/**
 * ============================================================================
 *  SUIVI FINANCIER DES CENTRES DE SANTE - BACKEND GOOGLE SHEETS
 * ============================================================================
 *  Ce script transforme un Google Sheet en API JSON pour l'application
 *  "Suivi Financier ZS". Il gère :
 *   - Authentification (admin + équipes)
 *   - Gestion des équipes et des affectations de centres
 *   - Collecte des recettes et des dépenses
 *   - Calcul des écarts et agrégats pour les tableaux de bord
 *
 *  INSTALLATION : voir README.md à la racine du projet.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// CONFIGURATION
// ----------------------------------------------------------------------------
const SHEET_NAMES = {
  CENTRES: 'Centres',
  EQUIPES: 'Equipes',
  AFFECTATIONS: 'Affectations',
  ADMINS: 'Admins',
  RECETTES: 'Recettes',
  DEPENSES: 'Depenses',
  SESSIONS: 'Sessions'
};

const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12h

// ----------------------------------------------------------------------------
// ENTREES HTTP
// ----------------------------------------------------------------------------
function doGet(e) {
  return jsonResponse({ ok: true, message: 'API Suivi Financier ZS en ligne.' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action;
    const payload = body.payload || {};
    const token = body.token || '';

    if (action === 'setup') {
      // Action spéciale : initialise les feuilles + importe les centres. A lancer une seule fois.
      return jsonResponse(setupSpreadsheet(payload));
    }

    if (action === 'login') {
      return jsonResponse(login(payload));
    }

    // Toutes les autres actions nécessitent une session valide
    const session = getSession(token);
    if (!session) {
      return jsonResponse({ ok: false, error: 'Session invalide ou expirée. Merci de vous reconnecter.' }, 401);
    }

    const result = routeAction(action, payload, session);
    return jsonResponse(result);

  } catch (err) {
    return jsonResponse({ ok: false, error: 'Erreur serveur : ' + err.message }, 500);
  }
}

function routeAction(action, payload, session) {
  switch (action) {
    // --- ADMIN : équipes
    case 'adminListEquipes': requireAdmin(session); return { ok: true, data: listEquipes() };
    case 'adminCreateEquipe': requireAdmin(session); return { ok: true, data: createEquipe(payload) };
    case 'adminUpdateEquipe': requireAdmin(session); return { ok: true, data: updateEquipe(payload) };
    case 'adminDeleteEquipe': requireAdmin(session); return { ok: true, data: deleteEquipe(payload) };

    // --- ADMIN : centres & affectations
    case 'listCentres': return { ok: true, data: listCentres() };
    case 'adminGetAffectations': requireAdmin(session); return { ok: true, data: getAffectations(payload.equipe_id) };
    case 'adminSetAffectations': requireAdmin(session); return { ok: true, data: setAffectations(payload) };

    // --- Centres visibles pour la session courante (admin = tous, équipe = assignés)
    case 'monPerimetre': return { ok: true, data: getPerimetre(session) };

    // --- Tableaux de bord
    case 'dashboard': return { ok: true, data: getDashboard(session, payload) };

    // --- Recettes
    case 'addRecette': return { ok: true, data: addRecette(payload, session) };
    case 'updateRecette': return { ok: true, data: updateRecette(payload, session) };
    case 'deleteRecette': return { ok: true, data: deleteRecette(payload, session) };
    case 'listRecettes': return { ok: true, data: listRecettes(payload, session) };

    // --- Dépenses
    case 'addDepense': return { ok: true, data: addDepense(payload, session) };
    case 'updateDepense': return { ok: true, data: updateDepense(payload, session) };
    case 'deleteDepense': return { ok: true, data: deleteDepense(payload, session) };
    case 'listDepenses': return { ok: true, data: listDepenses(payload, session) };

    default:
      throw new Error('Action inconnue : ' + action);
  }
}

// ----------------------------------------------------------------------------
// UTILITAIRES REPONSE / FEUILLES
// ----------------------------------------------------------------------------
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ss() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet(name) {
  const s = ss().getSheetByName(name);
  if (!s) throw new Error('Feuille manquante : ' + name + ' (lancez l\'action "setup" depuis l\'app).');
  return s;
}

function sheetToObjects(name) {
  const s = sheet(name);
  const values = s.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(c => c === '' || c === null)) continue;
    const obj = {};
    headers.forEach((h, idx) => obj[h] = row[idx]);
    out.push(obj);
  }
  return out;
}

function appendRow(name, obj, headers) {
  const s = sheet(name);
  const row = headers.map(h => (obj[h] !== undefined ? obj[h] : ''));
  s.appendRow(row);
  return obj;
}

function findRowIndexById(name, id) {
  const s = sheet(name);
  const values = s.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('id');
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(id)) return { rowIndex: i + 1, headers: headers };
  }
  return null;
}

function genId(prefix) {
  return prefix + '_' + Utilities.getUuid().split('-')[0];
}

function nowIso() {
  return new Date().toISOString();
}

// ----------------------------------------------------------------------------
// SETUP INITIAL (à appeler une seule fois depuis l'app, écran "Initialisation")
// ----------------------------------------------------------------------------
function setupSpreadsheet(payload) {
  const book = ss();

  const structures = {
    [SHEET_NAMES.CENTRES]: ['id', 'commune', 'arrondissement', 'nom'],
    [SHEET_NAMES.EQUIPES]: ['id', 'nom', 'identifiant', 'motdepasse', 'actif', 'date_creation'],
    [SHEET_NAMES.AFFECTATIONS]: ['id', 'equipe_id', 'centre_id'],
    [SHEET_NAMES.ADMINS]: ['identifiant', 'motdepasse', 'nom'],
    [SHEET_NAMES.RECETTES]: ['id', 'centre_id', 'equipe_id', 'annee', 'mois', 'recette_totale', 'source_recette', 'versement_total', 'source_versement', 'observations', 'date_saisie'],
    [SHEET_NAMES.DEPENSES]: ['id', 'centre_id', 'equipe_id', 'annee', 'mois', 'type', 'periode_depense', 'montant_depense', 'periode_justif', 'montant_justif', 'observations', 'date_saisie'],
    [SHEET_NAMES.SESSIONS]: ['token', 'identifiant', 'role', 'equipe_id', 'nom', 'created_at', 'expires_at']
  };

  Object.keys(structures).forEach(name => {
    let s = book.getSheetByName(name);
    if (!s) s = book.insertSheet(name);
    if (s.getLastRow() === 0) {
      s.appendRow(structures[name]);
      s.setFrozenRows(1);
      s.getRange(1, 1, 1, structures[name].length).setFontWeight('bold').setBackground('#1F5C4C').setFontColor('#FFFFFF');
    }
  });

  // Supprime la feuille par défaut "Feuil1" / "Sheet1" si vide et inutilisée
  ['Feuille 1', 'Feuil1', 'Sheet1'].forEach(n => {
    const s = book.getSheetByName(n);
    if (s && s.getLastRow() <= 1 && book.getSheets().length > 1) {
      try { book.deleteSheet(s); } catch (e) {}
    }
  });

  // Import des centres (uniquement si la feuille Centres est vide de données)
  const centresSheet = sheet(SHEET_NAMES.CENTRES);
  if (centresSheet.getLastRow() <= 1 && payload.centres && payload.centres.length) {
    const rows = payload.centres.map(c => [c.id, c.commune, c.arrondissement, c.nom]);
    centresSheet.getRange(2, 1, rows.length, 4).setValues(rows);
  }

  // Création du compte admin par défaut si aucun admin
  const adminsSheet = sheet(SHEET_NAMES.ADMINS);
  if (adminsSheet.getLastRow() <= 1) {
    const login = (payload.admin && payload.admin.identifiant) || 'admin';
    const pass = (payload.admin && payload.admin.motdepasse) || 'admin123';
    adminsSheet.appendRow([login, pass, 'Administrateur']);
  }

  return { ok: true, message: 'Initialisation terminée.' };
}

// ----------------------------------------------------------------------------
// AUTHENTIFICATION / SESSIONS
// ----------------------------------------------------------------------------
function login(payload) {
  const identifiant = String(payload.identifiant || '').trim();
  const motdepasse = String(payload.motdepasse || '').trim();
  if (!identifiant || !motdepasse) return { ok: false, error: 'Identifiant et mot de passe requis.' };

  // Vérifie admin
  const admins = sheetToObjects(SHEET_NAMES.ADMINS);
  const admin = admins.find(a => String(a.identifiant) === identifiant && String(a.motdepasse) === motdepasse);
  if (admin) {
    const token = createSession(identifiant, 'admin', '', admin.nom || 'Administrateur');
    return { ok: true, token: token, role: 'admin', nom: admin.nom || 'Administrateur' };
  }

  // Vérifie équipe
  const equipes = sheetToObjects(SHEET_NAMES.EQUIPES);
  const equipe = equipes.find(eq => String(eq.identifiant) === identifiant && String(eq.motdepasse) === motdepasse);
  if (equipe) {
    if (String(equipe.actif) === 'false' || equipe.actif === false) {
      return { ok: false, error: 'Ce compte équipe a été désactivé par l\'administrateur.' };
    }
    const token = createSession(identifiant, 'equipe', equipe.id, equipe.nom);
    return { ok: true, token: token, role: 'equipe', nom: equipe.nom, equipe_id: equipe.id };
  }

  return { ok: false, error: 'Identifiant ou mot de passe incorrect.' };
}

function createSession(identifiant, role, equipe_id, nom) {
  const token = genId('tok');
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_DURATION_MS);
  appendRow(SHEET_NAMES.SESSIONS, {
    token: token, identifiant: identifiant, role: role, equipe_id: equipe_id,
    nom: nom, created_at: created.toISOString(), expires_at: expires.toISOString()
  }, ['token', 'identifiant', 'role', 'equipe_id', 'nom', 'created_at', 'expires_at']);
  return token;
}

function getSession(token) {
  if (!token) return null;
  const sessions = sheetToObjects(SHEET_NAMES.SESSIONS);
  const s = sessions.find(x => x.token === token);
  if (!s) return null;
  if (new Date(s.expires_at).getTime() < Date.now()) return null;
  return s;
}

function requireAdmin(session) {
  if (session.role !== 'admin') throw new Error('Accès réservé à l\'administrateur.');
}

// ----------------------------------------------------------------------------
// CENTRES
// ----------------------------------------------------------------------------
function listCentres() {
  return sheetToObjects(SHEET_NAMES.CENTRES);
}

// Renvoie les centres visibles pour la session (admin: tous / equipe: assignés)
function getPerimetre(session) {
  const centres = listCentres();
  if (session.role === 'admin') return centres;
  const affectations = sheetToObjects(SHEET_NAMES.AFFECTATIONS).filter(a => a.equipe_id === session.equipe_id);
  const ids = affectations.map(a => a.centre_id);
  return centres.filter(c => ids.indexOf(c.id) !== -1);
}

// ----------------------------------------------------------------------------
// EQUIPES (ADMIN)
// ----------------------------------------------------------------------------
function listEquipes() {
  const equipes = sheetToObjects(SHEET_NAMES.EQUIPES);
  const affectations = sheetToObjects(SHEET_NAMES.AFFECTATIONS);
  return equipes.map(eq => {
    const centreIds = affectations.filter(a => a.equipe_id === eq.id).map(a => a.centre_id);
    const copy = Object.assign({}, eq);
    delete copy.motdepasse; // ne pas exposer le mot de passe dans les listes
    copy.nb_centres = centreIds.length;
    copy.centre_ids = centreIds;
    return copy;
  });
}

function createEquipe(payload) {
  const identifiant = String(payload.identifiant || '').trim();
  if (!identifiant) throw new Error('Identifiant requis.');
  const existing = sheetToObjects(SHEET_NAMES.EQUIPES);
  if (existing.some(e => String(e.identifiant) === identifiant)) {
    throw new Error('Cet identifiant est déjà utilisé par une autre équipe.');
  }
  const obj = {
    id: genId('EQ'),
    nom: payload.nom || identifiant,
    identifiant: identifiant,
    motdepasse: payload.motdepasse || 'zs' + Math.floor(1000 + Math.random() * 9000),
    actif: true,
    date_creation: nowIso()
  };
  appendRow(SHEET_NAMES.EQUIPES, obj, ['id', 'nom', 'identifiant', 'motdepasse', 'actif', 'date_creation']);

  if (payload.centre_ids && payload.centre_ids.length) {
    setAffectations({ equipe_id: obj.id, centre_ids: payload.centre_ids });
  }
  const copy = Object.assign({}, obj);
  return copy; // on renvoie le mot de passe généré une seule fois, à la création
}

function updateEquipe(payload) {
  const found = findRowIndexById(SHEET_NAMES.EQUIPES, payload.id);
  if (!found) throw new Error('Équipe introuvable.');
  const s = sheet(SHEET_NAMES.EQUIPES);
  const headers = found.headers;
  const rowIndex = found.rowIndex;
  const current = {};
  headers.forEach((h, idx) => current[h] = s.getRange(rowIndex, idx + 1).getValue());

  if (payload.nom !== undefined) current.nom = payload.nom;
  if (payload.motdepasse) current.motdepasse = payload.motdepasse;
  if (payload.actif !== undefined) current.actif = payload.actif;

  headers.forEach((h, idx) => s.getRange(rowIndex, idx + 1).setValue(current[h]));

  if (payload.centre_ids !== undefined) {
    setAffectations({ equipe_id: payload.id, centre_ids: payload.centre_ids });
  }
  const copy = Object.assign({}, current);
  delete copy.motdepasse;
  return copy;
}

function deleteEquipe(payload) {
  const found = findRowIndexById(SHEET_NAMES.EQUIPES, payload.id);
  if (!found) throw new Error('Équipe introuvable.');
  sheet(SHEET_NAMES.EQUIPES).deleteRow(found.rowIndex);

  // Nettoie les affectations liées
  const affSheet = sheet(SHEET_NAMES.AFFECTATIONS);
  const values = affSheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][1] === payload.id) affSheet.deleteRow(i + 1);
  }
  return { deleted: true };
}

// ----------------------------------------------------------------------------
// AFFECTATIONS (ADMIN attribue des centres à une équipe)
// ----------------------------------------------------------------------------
function getAffectations(equipe_id) {
  return sheetToObjects(SHEET_NAMES.AFFECTATIONS).filter(a => a.equipe_id === equipe_id).map(a => a.centre_id);
}

function setAffectations(payload) {
  const equipe_id = payload.equipe_id;
  const centre_ids = payload.centre_ids || [];
  const affSheet = sheet(SHEET_NAMES.AFFECTATIONS);
  const values = affSheet.getDataRange().getValues();

  // Supprime les affectations existantes de cette équipe
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][1] === equipe_id) affSheet.deleteRow(i + 1);
  }
  // Ajoute les nouvelles
  centre_ids.forEach(cid => {
    affSheet.appendRow([genId('AF'), equipe_id, cid]);
  });
  return { equipe_id: equipe_id, centre_ids: centre_ids };
}

// ----------------------------------------------------------------------------
// CONTROLE D'ACCES A UN CENTRE
// ----------------------------------------------------------------------------
function assertCentreAccess(session, centre_id) {
  if (session.role === 'admin') return true;
  const affectations = sheetToObjects(SHEET_NAMES.AFFECTATIONS);
  const allowed = affectations.some(a => a.equipe_id === session.equipe_id && a.centre_id === centre_id);
  if (!allowed) throw new Error('Ce centre ne vous a pas été affecté.');
  return true;
}

// ----------------------------------------------------------------------------
// RECETTES
// ----------------------------------------------------------------------------
const RECETTES_HEADERS = ['id', 'centre_id', 'equipe_id', 'annee', 'mois', 'recette_totale', 'source_recette', 'versement_total', 'source_versement', 'observations', 'date_saisie'];

function addRecette(payload, session) {
  assertCentreAccess(session, payload.centre_id);
  const obj = {
    id: genId('R'),
    centre_id: payload.centre_id,
    equipe_id: session.role === 'admin' ? (payload.equipe_id || '') : session.equipe_id,
    annee: payload.annee,
    mois: payload.mois,
    recette_totale: Number(payload.recette_totale) || 0,
    source_recette: payload.source_recette || '',
    versement_total: Number(payload.versement_total) || 0,
    source_versement: payload.source_versement || '',
    observations: payload.observations || '',
    date_saisie: nowIso()
  };
  return appendRow(SHEET_NAMES.RECETTES, obj, RECETTES_HEADERS);
}

function updateRecette(payload, session) {
  const found = findRowIndexById(SHEET_NAMES.RECETTES, payload.id);
  if (!found) throw new Error('Enregistrement introuvable.');
  const s = sheet(SHEET_NAMES.RECETTES);
  const centre_id = s.getRange(found.rowIndex, found.headers.indexOf('centre_id') + 1).getValue();
  assertCentreAccess(session, centre_id);

  const fields = ['annee', 'mois', 'recette_totale', 'source_recette', 'versement_total', 'source_versement', 'observations'];
  fields.forEach(f => {
    if (payload[f] !== undefined) {
      const col = found.headers.indexOf(f) + 1;
      s.getRange(found.rowIndex, col).setValue(payload[f]);
    }
  });
  return { updated: true };
}

function deleteRecette(payload, session) {
  const found = findRowIndexById(SHEET_NAMES.RECETTES, payload.id);
  if (!found) throw new Error('Enregistrement introuvable.');
  const s = sheet(SHEET_NAMES.RECETTES);
  const centre_id = s.getRange(found.rowIndex, found.headers.indexOf('centre_id') + 1).getValue();
  assertCentreAccess(session, centre_id);
  s.deleteRow(found.rowIndex);
  return { deleted: true };
}

function listRecettes(payload, session) {
  let rows = sheetToObjects(SHEET_NAMES.RECETTES);
  const perimetre = getPerimetre(session).map(c => c.id);
  rows = rows.filter(r => perimetre.indexOf(r.centre_id) !== -1);
  if (payload.centre_id) rows = rows.filter(r => r.centre_id === payload.centre_id);
  return rows;
}

// ----------------------------------------------------------------------------
// DEPENSES
// ----------------------------------------------------------------------------
const DEPENSES_HEADERS = ['id', 'centre_id', 'equipe_id', 'annee', 'mois', 'type', 'periode_depense', 'montant_depense', 'periode_justif', 'montant_justif', 'observations', 'date_saisie'];

function addDepense(payload, session) {
  assertCentreAccess(session, payload.centre_id);
  const obj = {
    id: genId('D'),
    centre_id: payload.centre_id,
    equipe_id: session.role === 'admin' ? (payload.equipe_id || '') : session.equipe_id,
    annee: payload.annee,
    mois: payload.mois,
    type: payload.type || 'Fonctionnement', // "Médicament" ou "Fonctionnement"
    periode_depense: payload.periode_depense || '',
    montant_depense: Number(payload.montant_depense) || 0,
    periode_justif: payload.periode_justif || '',
    montant_justif: Number(payload.montant_justif) || 0,
    observations: payload.observations || '',
    date_saisie: nowIso()
  };
  return appendRow(SHEET_NAMES.DEPENSES, obj, DEPENSES_HEADERS);
}

function updateDepense(payload, session) {
  const found = findRowIndexById(SHEET_NAMES.DEPENSES, payload.id);
  if (!found) throw new Error('Enregistrement introuvable.');
  const s = sheet(SHEET_NAMES.DEPENSES);
  const centre_id = s.getRange(found.rowIndex, found.headers.indexOf('centre_id') + 1).getValue();
  assertCentreAccess(session, centre_id);

  const fields = ['annee', 'mois', 'type', 'periode_depense', 'montant_depense', 'periode_justif', 'montant_justif', 'observations'];
  fields.forEach(f => {
    if (payload[f] !== undefined) {
      const col = found.headers.indexOf(f) + 1;
      s.getRange(found.rowIndex, col).setValue(payload[f]);
    }
  });
  return { updated: true };
}

function deleteDepense(payload, session) {
  const found = findRowIndexById(SHEET_NAMES.DEPENSES, payload.id);
  if (!found) throw new Error('Enregistrement introuvable.');
  const s = sheet(SHEET_NAMES.DEPENSES);
  const centre_id = s.getRange(found.rowIndex, found.headers.indexOf('centre_id') + 1).getValue();
  assertCentreAccess(session, centre_id);
  s.deleteRow(found.rowIndex);
  return { deleted: true };
}

function listDepenses(payload, session) {
  let rows = sheetToObjects(SHEET_NAMES.DEPENSES);
  const perimetre = getPerimetre(session).map(c => c.id);
  rows = rows.filter(r => perimetre.indexOf(r.centre_id) !== -1);
  if (payload.centre_id) rows = rows.filter(r => r.centre_id === payload.centre_id);
  return rows;
}

// ----------------------------------------------------------------------------
// TABLEAU DE BORD (agrégats + écarts)
// ----------------------------------------------------------------------------
function getDashboard(session, payload) {
  const centres = getPerimetre(session);
  const centreIds = centres.map(c => c.id);
  const centreById = {};
  centres.forEach(c => centreById[c.id] = c);

  let recettes = sheetToObjects(SHEET_NAMES.RECETTES).filter(r => centreIds.indexOf(r.centre_id) !== -1);
  let depenses = sheetToObjects(SHEET_NAMES.DEPENSES).filter(d => centreIds.indexOf(d.centre_id) !== -1);

  if (payload && payload.centre_id) {
    recettes = recettes.filter(r => r.centre_id === payload.centre_id);
    depenses = depenses.filter(d => d.centre_id === payload.centre_id);
  }
  if (payload && payload.commune) {
    const idsCommune = centres.filter(c => c.commune === payload.commune).map(c => c.id);
    recettes = recettes.filter(r => idsCommune.indexOf(r.centre_id) !== -1);
    depenses = depenses.filter(d => idsCommune.indexOf(d.centre_id) !== -1);
  }
  if (payload && payload.annee) {
    recettes = recettes.filter(r => String(r.annee) === String(payload.annee));
    depenses = depenses.filter(d => String(d.annee) === String(payload.annee));
  }

  // Totaux globaux
  let totalRecette = 0, totalVersement = 0, totalDepense = 0, totalJustif = 0;
  recettes.forEach(r => { totalRecette += Number(r.recette_totale) || 0; totalVersement += Number(r.versement_total) || 0; });
  depenses.forEach(d => { totalDepense += Number(d.montant_depense) || 0; totalJustif += Number(d.montant_justif) || 0; });

  const ecartVersement = totalRecette - totalVersement; // solde non versé
  const ecartJustification = totalJustif - totalDepense;  // négatif = dépenses non justifiées

  // Agrégation par centre
  const parCentre = {};
  centres.forEach(c => {
    parCentre[c.id] = {
      centre_id: c.id, nom: c.nom, commune: c.commune, arrondissement: c.arrondissement,
      recette_totale: 0, versement_total: 0, depense_totale: 0, justif_totale: 0,
      nb_saisies_recette: 0, nb_saisies_depense: 0
    };
  });
  recettes.forEach(r => {
    const p = parCentre[r.centre_id]; if (!p) return;
    p.recette_totale += Number(r.recette_totale) || 0;
    p.versement_total += Number(r.versement_total) || 0;
    p.nb_saisies_recette++;
  });
  depenses.forEach(d => {
    const p = parCentre[d.centre_id]; if (!p) return;
    p.depense_totale += Number(d.montant_depense) || 0;
    p.justif_totale += Number(d.montant_justif) || 0;
    p.nb_saisies_depense++;
  });
  const centresArr = Object.values(parCentre).map(p => {
    p.ecart_versement = p.recette_totale - p.versement_total;
    p.ecart_justification = p.justif_totale - p.depense_totale;
    return p;
  });

  // Agrégation par commune
  const parCommune = {};
  centresArr.forEach(p => {
    if (!parCommune[p.commune]) parCommune[p.commune] = {
      commune: p.commune, recette_totale: 0, versement_total: 0, depense_totale: 0, justif_totale: 0, nb_centres: 0
    };
    const pc = parCommune[p.commune];
    pc.recette_totale += p.recette_totale;
    pc.versement_total += p.versement_total;
    pc.depense_totale += p.depense_totale;
    pc.justif_totale += p.justif_totale;
    pc.nb_centres++;
  });
  const communesArr = Object.values(parCommune).map(pc => {
    pc.ecart_versement = pc.recette_totale - pc.versement_total;
    pc.ecart_justification = pc.justif_totale - pc.depense_totale;
    return pc;
  });

  // Evolution mensuelle (recette vs dépense) pour graphique
  const parMois = {};
  const moisKey = (o) => `${o.annee || '—'}-${String(o.mois || '—')}`;
  recettes.forEach(r => {
    const k = moisKey(r);
    if (!parMois[k]) parMois[k] = { periode: k, recette: 0, depense: 0 };
    parMois[k].recette += Number(r.recette_totale) || 0;
  });
  depenses.forEach(d => {
    const k = moisKey(d);
    if (!parMois[k]) parMois[k] = { periode: k, recette: 0, depense: 0 };
    parMois[k].depense += Number(d.montant_depense) || 0;
  });
  const evolution = Object.values(parMois).sort((a, b) => a.periode.localeCompare(b.periode));

  return {
    totaux: { totalRecette, totalVersement, totalDepense, totalJustif, ecartVersement, ecartJustification },
    parCentre: centresArr.sort((a, b) => b.recette_totale - a.recette_totale),
    parCommune: communesArr.sort((a, b) => b.recette_totale - a.recette_totale),
    evolution: evolution,
    nbCentres: centres.length,
    nbSaisiesRecette: recettes.length,
    nbSaisiesDepense: depenses.length
  };
}
