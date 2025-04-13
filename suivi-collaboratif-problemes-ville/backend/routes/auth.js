// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

// Inscription d'un nouvel utilisateur
router.post('/register', (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Veuillez fournir nom, email et mot de passe.' });
    }
    // Vérifier si email déjà existant
    db.query('SELECT id FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ message: 'Erreur serveur.' });
        if (results.length > 0) {
            return res.status(400).json({ message: 'Un compte avec cet email existe déjà.' });
        }
        // Hacher le mot de passe
        const hashedPassword = bcrypt.hashSync(password, 10);
        // Insérer l'utilisateur en base (rôle 'citoyen')
        db.query(
            'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
            [name, email, hashedPassword, 'citoyen'],
            (err, result) => {
                if (err) return res.status(500).json({ message: 'Erreur lors de la création de l’utilisateur.' });
                return res.status(201).json({ message: 'Inscription réussie. Vous pouvez maintenant vous connecter.' });
            }
        );
    });
});

// Connexion d'un utilisateur
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email et mot de passe requis.' });
    }
    // Trouver l'utilisateur par email
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ message: 'Erreur serveur.' });
        if (results.length === 0) {
            return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });
        }
        const user = results[0];
        // Vérifier le mot de passe
        const match = bcrypt.compareSync(password, user.password);
        if (!match) {
            return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });
        }
        // Générer un token JWT qui expire dans 2h
        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
        // Répondre avec le token et des infos utilisateur
        res.json({
            message: 'Connexion réussie',
            token: token,
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });
    });
});

module.exports = router;
