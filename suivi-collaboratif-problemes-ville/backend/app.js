// backend/app.js
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server: WebSocketServer } = require('ws');
const authRoutes = require('./routes/auth');
const problemRoutes = require('./routes/problems');

const app = express();
const PORT = 3001;

// Middleware CORS pour permettre les appels du frontend (http://localhost:3000 en dev)
app.use(cors());
// Middleware pour parser le JSON du corps des requêtes
app.use(express.json());

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/problems', problemRoutes);

// Route racine (facultative)
app.get('/', (req, res) => {
    res.send('API - Suivi Collaboratif des Problèmes de la Ville');
});

// Création du serveur HTTP puis attachement du WebSocket dessus
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Stocker le serveur WebSocket dans app.locals pour y accéder dans les routes
app.locals.wss = wss;

// Gestion des connexions WebSocket
wss.on('connection', (ws) => {
    console.log('Client WebSocket connecté');
    ws.on('close', () => {
        console.log('Client WebSocket déconnecté');
    });
});

// Démarrer le serveur sur le port spécifié
server.listen(PORT, () => {
    console.log(`Serveur API démarré sur http://localhost:${PORT}`);
});
