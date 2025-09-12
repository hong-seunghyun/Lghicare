// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAYlaUjyu0jBa81GUe8rAa_wYeUkCknb94",
  authDomain: "lghicare-861b3.firebaseapp.com",
  projectId: "lghicare-861b3",
  storageBucket: "lghicare-861b3.firebasestorage.app",
  messagingSenderId: "247098347700",
  appId: "1:247098347700:web:34dfe98803fc6dbf5f07e1",
  measurementId: "G-TMPVWH8YR7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);