// backend/config/db.js
const mysql = require('mysql2');

// Créer la connexion MySQL
const db = mysql.createConnection({
    host: 'localhost',      // hôte MySQL
    user: 'root',           // utilisateur MySQL
    password: 'root', // mot de passe MySQL
    database: 'nodejs'
});

db.connect(err => {
    if (err) {
        console.error('Erreur de connexion à MySQL :', err.message);
        process.exit(1); // Arrêter l’application si la connexion échoue
    } else {
        console.log('Connecté à la base MySQL.');
    }
});

module.exports = db;
