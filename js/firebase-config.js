// ══════════════════════════════════════════════════════
//  COSA NOVA — Firebase Config
//  ⚠️  Reemplaza los valores con tu proyecto de Firebase
//  console.firebase.google.com → Configuración del proyecto
// ══════════════════════════════════════════════════════

import { initializeApp }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore }   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth }        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
  apiKey:            "AIzaSyDrDAbFA744Vr4G3gH-pc5Qnn7WfwhoSXA",
  authDomain:        "cosa-nova---store.firebaseapp.com",
  projectId:         "cosa-nova---store",
  storageBucket:     "cosa-nova---store.firebasestorage.app",
  messagingSenderId: "547612106603",
  appId:             "1:547612106603:web:aea4fd01019768d029f62e"
};

const app = initializeApp(firebaseConfig);

export const db   = getFirestore(app);
export const auth = getAuth(app);
