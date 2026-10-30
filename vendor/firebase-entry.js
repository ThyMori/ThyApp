import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut
} from 'firebase/auth';
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, deleteDoc, onSnapshot
} from 'firebase/firestore';

// Tout ce dont ThyApp a besoin du SDK Firebase, exposé sous window.ThyFirebase.
window.ThyFirebase = {
  initializeApp,
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut,
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, deleteDoc, onSnapshot
};
