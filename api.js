/**
 * api.js — wrapper unique pour parler au backend Apps Script.
 *
 * Important : on envoie en Content-Type "text/plain" pour éviter le
 * preflight CORS (OPTIONS) qu'Apps Script Web App ne sait pas traiter.
 * Le backend lit simplement e.postData.contents et parse le JSON lui-même.
 */

async function appelerApi(action, donnees = {}) {
  const token = Session.getToken();
  const corps = Object.assign({ action, token }, donnees);

  try {
    const reponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(corps)
    });
    const json = await reponse.json();

    // Si la session est invalide/expirée côté serveur, on ne laisse pas
    // l'appelant échouer silencieusement : on nettoie la session locale et
    // on renvoie vers la connexion, sauf pour l'action "login" elle-même.
    if (!json.ok && action !== 'login' && typeof json.error === 'string' &&
        (json.error.includes('Session invalide') || json.error.includes('Session expirée'))) {
      Session.effacer();
      window.location.href = 'index.html';
    }

    return json;
  } catch (erreur) {
    return { ok: false, error: 'Connexion impossible. Vérifie ta connexion internet.', horsLigne: true };
  }
}

/**
 * File d'attente locale pour la saisie hors-ligne : si saveCollecte échoue
 * faute de réseau, on stocke la requête et on la rejoue dès que possible.
 */
const FileAttente = {
  CLE: 'suivi_finance_file_attente',

  lire() {
    try { return JSON.parse(localStorage.getItem(this.CLE)) || []; }
    catch (e) { return []; }
  },

  ajouter(action, donnees) {
    const file = this.lire();
    file.push({ action, donnees, ajoute_le: new Date().toISOString() });
    localStorage.setItem(this.CLE, JSON.stringify(file));
  },

  vider() {
    localStorage.removeItem(this.CLE);
  },

  taille() {
    return this.lire().length;
  },

  async synchroniser() {
    const file = this.lire();
    if (file.length === 0) return { ok: true, synchronisees: 0 };

    let synchronisees = 0;
    const restantes = [];

    for (const item of file) {
      const resultat = await appelerApi(item.action, item.donnees);
      if (resultat.ok) synchronisees++;
      else restantes.push(item);
    }

    localStorage.setItem(this.CLE, JSON.stringify(restantes));
    return { ok: true, synchronisees, restantes: restantes.length };
  }
};

// Tente une synchronisation automatique au retour de connexion.
window.addEventListener('online', () => { FileAttente.synchroniser(); });

/** Enregistre une action avec repli sur la file d'attente si hors-ligne (saveCollecte, saveDepense...). */
async function enregistrerAvecRepli(action, donnees) {
  if (!navigator.onLine) {
    FileAttente.ajouter(action, donnees);
    return { ok: true, horsLigne: true };
  }

  const resultat = await appelerApi(action, donnees);
  if (!resultat.ok && resultat.horsLigne) {
    FileAttente.ajouter(action, donnees);
    return { ok: true, horsLigne: true };
  }
  return resultat;
}
