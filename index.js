// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

// Firebase
const { initializeApp } = require('firebase/app');
const {
  getFirestore, collection, addDoc, getDocs, orderBy, query, where, Timestamp
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// POST: salvar entrada com email
app.post('/diario', async (req, res) => {
  const { entrada, email, contexto } = req.body;

const prompt = `
Você é um coach de hábitos e desenvolvimento pessoal. Seu estilo é empático, humano, direto e prático — como um mentor que acompanha o usuário todos os dias.

Aqui está um resumo das conversas recentes com esse usuário:
${contexto || "Nenhum histórico disponível."}

Agora ele escreveu: "${entrada}"

Responda como alguém que já tem familiaridade com esse usuário. Use um tom amigável e natural, com variações de linguagem. Evite repetir estruturas, e mostre que você se importa. Seja breve (até 2 parágrafos curtos) e sempre ofereça uma sugestão prática personalizada.
`;



  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4-1106-preview',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.7
    }, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const reply = response.data.choices[0].message.content;

    await addDoc(collection(db, "entradas"), {
      data: Timestamp.now(),
      entrada,
      resposta: reply,
      email
    });

    res.json({ resposta: reply });
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao processar entrada");
  }
});


// Rota GET - Histórico (filtrado por email)
app.get('/historico', async (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.status(400).send('Email é obrigatório');
  }

  try {
    const q = query(
      collection(db, "entradas"),
      where("email", "==", email),
      orderBy("data", "desc")
    );

    const snapshot = await getDocs(q);

    const historico = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(historico);
  } catch (error) {
    console.error("Erro ao buscar histórico:", error);
    res.status(500).send('Erro ao buscar histórico');
  }
});



// GET: calcular estatísticas por email
app.get('/estatisticas', async (req, res) => {
  const email = req.query.email;
  try {
    const q = query(collection(db, "entradas"), where("email", "==", email));
    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map(doc => doc.data());

    const totalEntradas = docs.length;

    const diasUnicos = new Set(
      docs
        .filter(doc => doc.data && doc.data.seconds)
        .map(doc => new Date(doc.data.seconds * 1000).toISOString().split('T')[0])
    );

    const totalDias = diasUnicos.size;
    const mediaPorDia = totalDias > 0 ? (totalEntradas / totalDias).toFixed(2) : 0;

    res.json({ totalEntradas, totalDias, mediaPorDia });
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao calcular estatísticas");
  }
});

app.listen(3000, () => console.log('Servidor rodando em http://localhost:3000'));
