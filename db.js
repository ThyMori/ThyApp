/*
 * Données de ThyApp.
 *
 * Trois « bases » : spectacles, productions, personnes.
 * Elles sont stockées dans le navigateur (localStorage) : rien ne quitte l'appareil,
 * mais les données ne sont PAS partagées entre le téléphone et l'ordinateur.
 *
 * Les liens entre bases passent par des identifiants :
 *   spectacle.productionId -> productions[].id
 *   spectacle.mesId        -> personnes[].id   (mise en scène)
 */
(function (global) {
  'use strict';

  var PREFIX = 'thyapp.';

  function uid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function collection(name) {
    var key = PREFIX + name;

    function read() {
      try {
        var v = JSON.parse(global.localStorage.getItem(key));
        return Array.isArray(v) ? v : [];
      } catch (e) {
        return [];
      }
    }

    function write(list) {
      global.localStorage.setItem(key, JSON.stringify(list));   // peut lever une erreur (stockage plein ou bloqué)
    }

    return {
      all: read,

      get: function (id) {
        var list = read();
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
      },

      add: function (item) {
        var list = read();
        var rec = Object.assign({ id: uid(), createdAt: Date.now() }, item);
        list.push(rec);
        write(list);
        return rec;
      },

      update: function (id, patch) {
        var list = read(), found = null;
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === id) { list[i] = found = Object.assign({}, list[i], patch, { id: id }); break; }
        }
        if (found) write(list);
        return found;
      },

      remove: function (id) {
        var list = read();
        var kept = list.filter(function (r) { return r.id !== id; });
        if (kept.length !== list.length) write(kept);
        return kept.length !== list.length;
      }
    };
  }

  global.ThyDB = {
    spectacles: collection('spectacles'),
    productions: collection('productions'),
    personnes: collection('personnes')
  };

  // Demande au navigateur de ne pas effacer ces données quand il manque de place.
  try {
    if (global.navigator && global.navigator.storage && global.navigator.storage.persist) {
      global.navigator.storage.persist().catch(function () {});
    }
  } catch (e) {}
})(window);
