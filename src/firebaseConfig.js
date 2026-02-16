// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCknF4e08GbrAX3R7O6MSHrZLARQlsECl4",
    authDomain: "attendance-pwa-dev.firebaseapp.com",
    projectId: "attendance-pwa-dev",
    storageBucket: "attendance-pwa-dev.firebasestorage.app",
    messagingSenderId: "747910832076",
    appId: "1:747910832076:web:835510de0a520c32994769"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
const analytics = getAnalytics(app);
import { getFunctions } from "firebase/functions";
export const functions = getFunctions(app);
