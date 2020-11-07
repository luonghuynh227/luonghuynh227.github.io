importScripts('https://www.gstatic.com/firebasejs/8.0.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.0.1/firebase-messaging.js');


const firebaseConfig = {
  apiKey: "AIzaSyBP1bN6Gx0CSvxceRPFM-Yxir3PYyXySrM",
  authDomain: "send-message-c4632.firebaseapp.com",
  databaseURL: "https://send-message-c4632.firebaseio.com",
  projectId: "send-message-c4632",
  storageBucket: "send-message-c4632.appspot.com",
  messagingSenderId: "1001457799507",
  appId: "1:1001457799507:web:26e1984bac7e38858011a6",
  measurementId: "G-3LMVM8W7BW"
};

firebase.initializeApp(firebaseConfig);
const messaging=firebase.messaging();

messaging.setBackgroundMessageHandler(function (payload) {
    console.log(payload);
    const notification=JSON.parse(payload);
    const notificationOption={
        body:notification.body,
        icon:notification.icon
    };
    return self.registration.showNotification(payload.notification.title,notificationOption);
});