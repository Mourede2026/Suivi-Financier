/**
 * session.js — stocke le token de connexion et les infos d'équipe
 * dans localStorage (site statique réel, pas un artefact claude.ai :
 * localStorage est donc approprié ici).
 */

const Session = {
  CLE: 'suivi_finance_session',

  enregistrer(donnees) {
    localStorage.setItem(this.CLE, JSON.stringify(donnees));
  },

  lire() {
    try { return JSON.parse(localStorage.getItem(this.CLE)); }
    catch (e) { return null; }
  },

  getToken() {
    const s = this.lire();
    return s ? s.token : null;
  },

  estConnecte() {
    return !!this.getToken();
  },

  effacer() {
    localStorage.removeItem(this.CLE);
  },

  /** Redirige vers la page de connexion si aucune session, ou vers la bonne
   *  page si le rôle ne correspond pas à la page courante. */
  exigerRole(roleAttendu) {
    const s = this.lire();
    if (!s) { window.location.href = 'index.html'; return null; }
    if (s.role !== roleAttendu) {
      window.location.href = s.role === 'admin' ? 'admin.html' : 'equipe.html';
      return null;
    }
    return s;
  }
};
