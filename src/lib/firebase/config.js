// Firebase Configuration
// Update these values with your actual Firebase project configuration
// You can find these values in your Firebase Console > Project Settings > General > Your apps

export const firebaseConfig = {
  apiKey: "AIzaSyC274o9esPFktBZdnL_cNQpgimsZGmLuMI", // Replace with your API key
  authDomain: "ah-testimony-library.firebaseapp.com",
  projectId: "ah-testimony-library",
  storageBucket: "ah-testimony-library.appspot.com",
  messagingSenderId: "your-messaging-sender-id", // Replace with your sender ID
  appId: "1:142043937987:web:6012bed533d9098b05b676", // Replace with your app ID
  measurementId: "your-measurement-id" // Optional, replace with your measurement ID
};

// SETUP INSTRUCTIONS:
// 1. Go to the Firebase Console (https://console.firebase.google.com/)
// 2. Select your project (or create a new one)
// 3. Go to Project Settings (gear icon) > General tab
// 4. Scroll down to "Your apps" section
// 5. If you haven't added a web app, click "Add app" and select the web platform (</>)
// 6. Copy the configuration object and replace the placeholder values above
// 7. Make sure to enable Authentication in your Firebase Console:
//    - Go to Authentication > Sign-in method
//    - Enable "Anonymous" authentication
//    - Enable "Email/Password" with "Email link (passwordless sign-in)" option
// 8. Add your domain to the authorized domains list in Authentication > Settings