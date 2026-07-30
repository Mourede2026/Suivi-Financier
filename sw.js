/* Service worker désactivé côté index.html (voir la balise <script> en bas
   de index.html qui appelle unregister()). Ce fichier est conservé pour
   référence mais n'est plus enregistré activement pour le moment. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
