/*
 * Données et accès de ThyApp.
 *
 * Une seule base pour toute l'application, avec deux modes :
 *   - « cloud » : base Firebase (Firestore) en ligne, connexion Google, accès réglés par partie de
 *     l'application. Activé dès que firebase-config.js contient la configuration du projet.
 *   - « local » : repli sans configuration. Les données restent dans ce navigateur (localStorage),
 *     pas de connexion, tout est accessible.
 *
 * Bases : spectacles, productions, personnes (liées par identifiants), records (Hall of Fame de la course) et users (droits d'accès).
 *   spectacle.productionId -> productions[].id
 *   spectacle.mesId        -> personnes[].id   (mise en scène)
 *   users[].id             -> adresse e-mail    { admin: bool, sections: ['spectacles', …] }
 *
 * Les droits sont réellement appliqués par les règles de sécurité Firestore (firestore.rules),
 * pas seulement par cette interface : voir ce fichier.
 */
(function (global) {
  'use strict';

  // Parties de l'application auxquelles on peut donner accès.
  var SECTIONS = [
    { id: 'jeu-de-la-vie', label: 'Jeu de la vie' },
    { id: 'course', label: 'Course' },
    { id: 'spectacles', label: 'Spectacles' }
  ];
  // Partie qui commande l'accès à chaque base (users : réservé aux administrateurs).
  var SECTION_OF = { spectacles: 'spectacles', productions: 'spectacles', personnes: 'spectacles', records: 'course', users: null };

  var BASE = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/[^\/]*$/, '') : '';

  function uid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // ======================================================================
  // Mode local : localStorage
  // ======================================================================
  function localBackend() {
    var PREFIX = 'thyapp.';
    var subs = {};

    function read(name) {
      try {
        var v = JSON.parse(global.localStorage.getItem(PREFIX + name));
        return Array.isArray(v) ? v : [];
      } catch (e) { return []; }
    }
    function write(name, list) { global.localStorage.setItem(PREFIX + name, JSON.stringify(list)); }
    function notify(name) {
      var list = read(name);
      (subs[name] || []).slice().forEach(function (cb) { cb(list); });
    }
    function mutate(name, fn) {
      try {
        write(name, fn(read(name)));
        notify(name);
        return Promise.resolve();
      } catch (e) {
        notify(name);          // on remet l'affichage d'accord avec ce qui est réellement enregistré
        return Promise.reject(e);
      }
    }

    global.addEventListener('storage', function (e) {          // modification faite dans un autre onglet
      if (e.key && e.key.indexOf(PREFIX) === 0) notify(e.key.slice(PREFIX.length));
    });

    return {
      mode: 'local',
      init: function (emit) {
        emit({ status: 'ready', user: null, profile: { admin: true, sections: SECTIONS.map(function (s) { return s.id; }) } });
      },
      signIn: function () { return Promise.resolve(); },
      signOut: function () { return Promise.resolve(); },
      subscribe: function (name, cb) {
        (subs[name] = subs[name] || []).push(cb);
        cb(read(name));
        return function () { subs[name] = (subs[name] || []).filter(function (f) { return f !== cb; }); };
      },
      add: function (name, rec) {
        return mutate(name, function (l) {
          return l.filter(function (r) { return r.id !== rec.id; }).concat([rec]);
        });
      },
      update: function (name, id, patch) {
        return mutate(name, function (l) {
          return l.map(function (r) { return r.id === id ? Object.assign({}, r, patch, { id: id }) : r; });
        });
      },
      remove: function (name, id) {
        return mutate(name, function (l) { return l.filter(function (r) { return r.id !== id; }); });
      }
    };
  }

  // ======================================================================
  // Mode cloud : Firebase (Firestore + connexion Google)
  // ======================================================================
  function cloudBackend(cfg) {
    var F = null, auth = null, db = null, unsubProfile = null;

    function loadSdk() {
      return new Promise(function (resolve, reject) {
        if (global.ThyFirebase) { resolve(global.ThyFirebase); return; }
        var s = document.createElement('script');
        s.src = BASE + 'vendor/firebase-bundle.js';
        s.onload = function () { global.ThyFirebase ? resolve(global.ThyFirebase) : reject(new Error('SDK Firebase introuvable')); };
        s.onerror = function () { reject(new Error('SDK Firebase non chargé')); };
        document.head.appendChild(s);
      });
    }

    function body(rec) {
      var b = Object.assign({}, rec);
      delete b.id;                       // l'identifiant est le nom du document
      return b;
    }

    return {
      mode: 'cloud',

      init: function (emit) {
        emit({ status: 'loading', user: null, profile: null });
        loadSdk().then(function (sdk) {
          F = sdk;
          var app = F.initializeApp(cfg);
          auth = F.getAuth(app);
          try {
            // cache durable : l'app s'ouvre et s'utilise hors connexion, puis se synchronise
            db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
          } catch (e) {
            db = F.getFirestore(app);
          }
          F.getRedirectResult(auth).catch(function () {});     // termine une connexion lancée par redirection

          F.onAuthStateChanged(auth, function (user) {
            if (unsubProfile) { unsubProfile(); unsubProfile = null; }
            if (!user) { emit({ status: 'signed-out', user: null, profile: null }); return; }

            var email = String(user.email || '').toLowerCase();
            var who = { email: email, name: user.displayName || '' };
            if (!email || !user.emailVerified) { emit({ status: 'denied', user: who, profile: null }); return; }

            emit({ status: 'loading', user: who, profile: null });
            // fiche d'accès : users/<adresse e-mail>, créée par un administrateur
            unsubProfile = F.onSnapshot(F.doc(db, 'users', email), function (snap) {
              if (!snap.exists()) { emit({ status: 'denied', user: who, profile: null }); return; }
              var d = snap.data() || {};
              emit({ status: 'ready', user: who, profile: { admin: d.admin === true, sections: Array.isArray(d.sections) ? d.sections : [] } });
            }, function () {
              emit({ status: 'denied', user: who, profile: null });
            });
          });
        }).catch(function (err) {
          console.error(err);
          emit({ status: 'error', user: null, profile: null });
        });
      },

      signIn: function () {
        var provider = new F.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        return F.signInWithPopup(auth, provider).catch(function (err) {
          var code = err && err.code;
          if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
          if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
            return F.signInWithRedirect(auth, provider);
          }
          throw err;
        });
      },

      signOut: function () { return F.signOut(auth); },

      subscribe: function (name, cb, onError) {
        return F.onSnapshot(F.collection(db, name), function (snap) {
          cb(snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }));
        }, onError);
      },

      // Pas d'attente de l'accusé du serveur : hors connexion, l'écriture est mise en file et partira plus tard.
      add: function (name, rec) { return F.setDoc(F.doc(db, name, rec.id), body(rec)); },
      update: function (name, id, patch) { return F.setDoc(F.doc(db, name, id), body(patch), { merge: true }); },
      remove: function (name, id) { return F.deleteDoc(F.doc(db, name, id)); }
    };
  }

  // ======================================================================
  // Façade commune
  // ======================================================================
  var cfg = global.THY_FIREBASE || null;
  var backend = global.__THY_BACKEND__ || (cfg ? cloudBackend(cfg) : localBackend());   // __THY_BACKEND__ : réservé aux tests

  var state = { status: 'loading', user: null, profile: null };
  var stateSubs = [], errorSubs = [], cols = {};

  function isAdmin() { return state.status === 'ready' && !!state.profile && state.profile.admin === true; }
  function can(section) {
    return state.status === 'ready' && !!state.profile &&
      (state.profile.admin === true || (state.profile.sections || []).indexOf(section) >= 0);
  }
  function canUse(name) { return name === 'users' ? isAdmin() : can(SECTION_OF[name]); }

  function report(err) {
    var code = (err && err.code) || '', msg;
    if (code === 'permission-denied') msg = 'Action refusée : vos droits ne la permettent pas.';
    else if (err && (err.name === 'QuotaExceededError' || err.name === 'SecurityError')) msg = 'Le stockage du navigateur est plein ou indisponible.';
    else msg = "L'enregistrement a échoué" + (err && err.message ? ' (' + err.message + ').' : '.');
    if (global.console) console.error(err);
    errorSubs.slice().forEach(function (cb) { cb(msg, err); });
  }

  function run(fn) {
    try { Promise.resolve(fn()).catch(report); } catch (e) { report(e); }
  }

  function setState(next) {
    state = next;
    Object.keys(cols).forEach(function (n) { cols[n].refresh(); });
    stateSubs.slice().forEach(function (cb) { cb(state); });
  }

  function makeCol(name) {
    var c = { cache: [], loaded: false, subs: [], unsub: null };

    function emit() {
      c.subs.slice().forEach(function (cb) { try { cb(c.cache); } catch (e) { if (global.console) console.error(e); } });
    }
    function start() {
      if (c.unsub || !c.subs.length || !canUse(name)) return;
      var un = backend.subscribe(name, function (list) { c.cache = list; c.loaded = true; emit(); }, report);
      c.unsub = un || function () {};
    }
    function stop() {
      var had = c.loaded || c.cache.length > 0;
      if (c.unsub) { c.unsub(); c.unsub = null; }
      c.cache = []; c.loaded = false;
      if (had) emit();
    }
    function put(rec) {
      c.cache = c.cache.filter(function (r) { return r.id !== rec.id; }).concat([rec]);
      emit();
    }

    c.refresh = function () { if (canUse(name)) start(); else stop(); };

    // Les modifications sont d'abord appliquées à l'affichage (réponse immédiate, même hors connexion),
    // puis envoyées à la base. Si elle les refuse, un message d'erreur est signalé.
    c.api = {
      name: name,
      list: function () { return c.cache; },
      loaded: function () { return c.loaded; },
      get: function (id) {
        for (var i = 0; i < c.cache.length; i++) if (c.cache[i].id === id) return c.cache[i];
        return null;
      },
      subscribe: function (cb) {
        c.subs.push(cb);
        if (c.loaded) cb(c.cache);
        c.refresh();
        return function () { c.subs = c.subs.filter(function (f) { return f !== cb; }); };
      },
      add: function (data) {
        var rec = Object.assign({ id: uid(), createdAt: Date.now() }, data);
        put(rec);
        run(function () { return backend.add(name, rec); });
        return rec;
      },
      update: function (id, patch) {
        var cur = c.api.get(id);
        if (!cur) return null;
        var rec = Object.assign({}, cur, patch, { id: id });
        put(rec);
        run(function () { return backend.update(name, id, patch); });
        return rec;
      },
      remove: function (id) {
        c.cache = c.cache.filter(function (r) { return r.id !== id; });
        emit();
        run(function () { return backend.remove(name, id); });
      },
      // crée ou remplace l'enregistrement dont l'identifiant est donné (adresse e-mail pour users)
      set: function (id, data) {
        var rec = Object.assign({}, data, { id: id });
        put(rec);
        run(function () { return backend.add(name, rec); });
        return rec;
      }
    };
    cols[name] = c;
    return c;
  }

  function col(name) { return (cols[name] || makeCol(name)).api; }

  // ---------- Écran de connexion / refus ----------
  var styled = false;
  function injectStyle() {
    if (styled) return;
    styled = true;
    var s = document.createElement('style');
    s.textContent =
      '[hidden]{display:none!important}' +
      '.thy-gate{width:100%;max-width:640px;margin:6vh auto 0;display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center}' +
      '.thy-gate h2{font-family:var(--serif,Georgia,serif);font-weight:400;font-size:32px;line-height:1.15;color:var(--ink,#ebe8e1)}' +
      '.thy-gate p{max-width:26em;font-family:var(--serif,Georgia,serif);font-style:italic;font-size:17px;line-height:1.55;color:var(--muted,#8b8b93)}' +
      '.thy-gate p.thy-err{color:var(--coral,#ee7f73)}' +
      '.thy-btn{appearance:none;cursor:pointer;height:52px;padding:0 24px 0 calc(24px + .26em);border-radius:2px;font-family:var(--mono,monospace);font-size:12px;letter-spacing:.26em;text-transform:uppercase;color:var(--bg,#0d0e11);font-weight:700;border:0;background:linear-gradient(100deg,var(--lilac,#b7a4ea),var(--amber,#f6b564) 55%,var(--coral,#ee7f73))}' +
      '.thy-btn:focus-visible{outline:2px solid var(--ink,#ebe8e1);outline-offset:3px}' +
      '.thy-btn.ghost{color:var(--ink,#ebe8e1);font-weight:400;background:rgba(13,14,17,.55);border:1px solid rgba(235,232,225,.28)}' +
      '.thy-btn.ghost:hover,.thy-btn.ghost:focus-visible{border-color:var(--amber,#f6b564);color:var(--amber,#f6b564)}' +
      '.thy-toast{position:fixed;left:50%;bottom:max(20px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:50;max-width:min(92vw,520px);padding:14px 18px;border-radius:2px;font-family:var(--serif,Georgia,serif);font-style:italic;font-size:15px;line-height:1.4;color:var(--ink,#ebe8e1);background:#1b1416;border:1px solid var(--coral,#ee7f73);box-shadow:0 14px 40px rgba(0,0,0,.6)}';
    document.head.appendChild(s);
  }

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /*
   * Protège une partie d'une page.
   *   opts.mount     : élément où s'affichent les messages (connexion, refus…)
   *   opts.section   : partie de l'application exigée (facultatif)
   *   opts.admin     : réservé aux administrateurs
   *   opts.cloudOnly : n'a de sens que si la base en ligne est activée
   *   opts.onShow    : appelée quand l'accès est accordé
   * Pendant qu'on n'a pas accès, <body> reçoit la classe « locked » (les pages y cachent leur contenu).
   */
  function gate(opts) {
    injectStyle();
    var box = opts.mount, wasAllowed = false;
    box.classList.add('thy-gate');

    function show(title, text, buttons, isErr) {
      box.textContent = '';
      box.appendChild(node('h2', null, title));
      if (text) box.appendChild(node('p', isErr ? 'thy-err' : null, text));
      (buttons || []).forEach(function (b) { box.appendChild(b); });
    }
    function button(label, ghost, onClick) {
      var b = node('button', 'thy-btn' + (ghost ? ' ghost' : ''), label);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    }

    function render() {
      var s = state, allowed = false, email = s.user && s.user.email;

      if (opts.cloudOnly && backend.mode !== 'cloud') {
        show('Pas encore disponible', "Cette page sert à régler les accès à la base en ligne, qui n'est pas encore activée.");
      } else if (s.status === 'loading') {
        show('Connexion…', '');
      } else if (s.status === 'error') {
        show('Connexion impossible', "Le service en ligne n'a pas pu être chargé. Vérifiez votre connexion internet, puis réessayez.",
          [button('Réessayer', false, function () { global.location.reload(); })]);
      } else if (s.status === 'signed-out') {
        var msg = node('p', 'thy-err'); msg.hidden = true;
        var btn = button('Se connecter avec Google', false, function () {
          btn.disabled = true;
          Promise.resolve(backend.signIn()).catch(function (err) {
            msg.textContent = 'La connexion a échoué' + (err && err.code ? ' (' + err.code + ').' : '.');
            msg.hidden = false;
          }).then(function () { btn.disabled = false; });
        });
        show('Connexion requise', 'Cette partie de l’application est réservée aux personnes autorisées.', [btn, msg]);
      } else if (s.status === 'denied') {
        show('Accès non autorisé', 'Le compte ' + (email || '') + " n'a pas encore d'accès. Demandez à l'administrateur de vous en ouvrir un.",
          [button('Changer de compte', true, function () { backend.signOut(); })]);
      } else if (opts.admin && !isAdmin()) {
        show('Accès réservé', 'Cette page est réservée aux administrateurs.');
      } else if (opts.section && !can(opts.section)) {
        show('Accès refusé', "Votre compte n'a pas accès à cette partie de l'application.");
      } else {
        allowed = true;
      }

      box.hidden = allowed;
      document.body.classList.toggle('locked', !allowed);
      if (allowed && !wasAllowed && opts.onShow) opts.onShow();
      wasAllowed = allowed;
    }

    stateSubs.push(render);
    render();
  }

  // Affiche en bas de page les erreurs d'enregistrement ou d'accès.
  function showErrors() {
    injectStyle();
    var t = node('div', 'thy-toast'), timer;
    t.setAttribute('role', 'alert');
    t.hidden = true;
    document.body.appendChild(t);
    errorSubs.push(function (msg) {
      t.textContent = msg;
      t.hidden = false;
      clearTimeout(timer);
      timer = setTimeout(function () { t.hidden = true; }, 7000);
    });
  }

  global.ThyDB = {
    mode: backend.mode,
    SECTIONS: SECTIONS,
    col: col,
    spectacles: col('spectacles'),
    productions: col('productions'),
    personnes: col('personnes'),
    records: col('records'),
    users: col('users'),
    get state() { return state; },
    can: can,
    isAdmin: isAdmin,
    onState: function (cb) { stateSubs.push(cb); cb(state); return function () { stateSubs = stateSubs.filter(function (f) { return f !== cb; }); }; },
    onError: function (cb) { errorSubs.push(cb); },
    signIn: function () { return Promise.resolve(backend.signIn()); },
    signOut: function () { return Promise.resolve(backend.signOut()); },
    gate: gate,
    showErrors: showErrors
  };

  backend.init(setState);

  // Demande au navigateur de ne pas effacer les données locales quand il manque de place.
  try {
    if (backend.mode === 'local' && global.navigator && global.navigator.storage && global.navigator.storage.persist) {
      global.navigator.storage.persist().catch(function () {});
    }
  } catch (e) {}
})(window);
