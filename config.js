// ATTENTION : remplace cette valeur par l'URL de ton Web App Apps Script
// une fois déployée (voir README.md, étape 3).
// Elle ressemble à : https://script.google.com/macros/s/AKfycb.../exec
const API_URL = 'https://script.google.com/macros/s/AKfycbzubGezkNpUHiHaE-1_dwBpRcmTdMcxBDbzdWGF3T5NsqqqSH2Qsk-ct2h6DF8BBKgdiA/exec';

const MOIS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

function formaterMois(moisAAAAMM) {
  if (!moisAAAAMM) return '';
  const [annee, mois] = moisAAAAMM.split('-');
  return MOIS_LABELS[parseInt(mois, 10) - 1] + ' ' + annee;
}

function moisActuel() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
