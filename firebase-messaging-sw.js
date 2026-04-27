// Compatibility entrypoint for Firebase Messaging's default service worker path.
// The app's canonical worker is /sw.js; this wrapper prevents default FCM
// registration attempts from producing script 404 errors.
importScripts('/sw.js');
