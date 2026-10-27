/* VENDOCINE - Firebase Web SDK (v9 compat) initialisation.
   Load AFTER the three firebase-*-compat.js scripts on every page.
   NOTE: the original snippet had truncated URLs. Values below are rebuilt from
   projectId "vndocinevsc". Verify databaseURL, messagingSenderId and appId
   against Firebase Console > Project settings > Your apps. */
const firebaseConfig = {
  apiKey: "AIzaSyD8szi7sjMY7yk0DUYIAV179t6jG3Pvsa0",
  authDomain: "vndocinevsc.firebaseapp.com",
  databaseURL: "https://vndocinevsc-default-rtdb.firebaseio.com",
  projectId: "vndocinevsc",
  storageBucket: "vndocinevsc.appspot.com",
  messagingSenderId: "103123456789",
  appId: "1:103123456789:web:a1b2c3d4e5f6g7h8"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const database = firebase.database();
