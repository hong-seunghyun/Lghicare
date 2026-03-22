import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAYlaUjyu0jBa81GUe8rAa_wYeUkCknb94",
  authDomain: "lghicare-861b3.firebaseapp.com",
  projectId: "lghicare-861b3",
  storageBucket: "lghicare-861b3.firebasestorage.app",
  messagingSenderId: "247098347700",
  appId: "1:247098347700:web:34dfe98803fc6dbf5f07e1",
  measurementId: "G-TMPVWH8YR7",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
