/* VENDOCINE - Firebase Web SDK (v9 compat) initialisation.
   Load AFTER the three firebase-*-compat.js scripts on every page.
   NOTE: the original snippet had truncated URLs. Values below are rebuilt from
   projectId "vndocinevsc". Verify databaseURL, messagingSenderId and appId
   against Firebase Console > Project settings > Your apps. */
const firebaseConfig = {
  apiKey: "AIzaSyD8szi7sjMY7yk0DUYIAV179t6jG3Pvsa0",
  authDomain: "vndocinevsc.firebaseapp.com",
  databaseURL: "https://vndocinevsc-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "vndocinevsc",
  storageBucket: "vndocinevsc.firebasestorage.app",
  messagingSenderId: "875557641698",
  appId: "1:875557641698:web:bbb95fd4d223d63242adbb",
  measurementId: "G-ER2PM8DXJR"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const database = firebase.database();
