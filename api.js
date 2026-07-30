/* ============================================================================
   API — communication avec le Google Apps Script (backend Google Sheet)
   Astuce CORS : on poste en Content-Type "text/plain" pour rester une requête
   "simple" et éviter le préflight OPTIONS, qu'Apps Script ne gère pas bien.
============================================================================ */
const API = (() => {
  const STORAGE_KEY = 'zs_session_v1';

  function getApiUrl() {
    return localStorage.getItem('zs_api_url') || (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
  }
  function setApiUrl(url) {
    localStorage.setItem('zs_api_url', url.trim());
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function setSession(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  function clearSession() { localStorage.removeItem(STORAGE_KEY); }

  async function call(action, payload) {
    const url = getApiUrl();
    if (!url) throw new Error('MISSING_API_URL');
    const session = getSession();
    const body = { action, payload: payload || {}, token: session ? session.token : '' };

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      });
    } catch (networkErr) {
      throw new Error('Impossible de joindre le serveur. Vérifiez votre connexion et l\'URL de l\'API.');
    }

    let data;
    try { data = await res.json(); }
    catch (e) { throw new Error('Réponse du serveur invalide.'); }

    if (!data.ok) {
      if (res.status === 401 || /session/i.test(data.error || '')) {
        clearSession();
      }
      throw new Error(data.error || 'Erreur inconnue.');
    }
    return data;
  }

  return { call, getApiUrl, setApiUrl, getSession, setSession, clearSession };
})();
