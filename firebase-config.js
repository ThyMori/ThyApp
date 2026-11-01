/*
 * Configuration Firebase de ThyApp.
 *
 * Tant que la valeur ci-dessous est null, l'application fonctionne en mode local :
 * les données restent dans le navigateur de chaque appareil, sans connexion.
 *
 * Pour activer la base en ligne, remplacez null par la configuration de votre projet Firebase :
 *
 * window.THY_FIREBASE = {
 *   apiKey: "…",
 *   authDomain: "mon-projet.firebaseapp.com",
 *   projectId: "mon-projet",
 *   appId: "…"
 * };
 *
 * Ces valeurs ne sont pas secrètes : elles désignent le projet. La protection des données vient
 * des règles de sécurité (firestore.rules) et de la connexion, pas de la discrétion de cette configuration.
 */
window.THY_FIREBASE = {
  apiKey: "AIzaSyAjPc7Jr9u9WfMKAne5t9Z0wsA6BQylyF0",
  authDomain: "thyapp-fcfab.firebaseapp.com",
  projectId: "thyapp-fcfab",
  appId: "1:73802745515:web:ba942ecb30ceb4c71319ee"
};
