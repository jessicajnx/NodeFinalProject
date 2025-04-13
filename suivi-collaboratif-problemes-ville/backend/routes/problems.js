// backend/routes/problems.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// GET /api/problems - Récupérer tous les problèmes
router.get('/', (req, res) => {
    const sql = `
        SELECT p.id, p.title, p.description, p.latitude, p.longitude, p.status,
               p.votes_count, p.comments_count, p.created_at,
               u.name AS reporter_name, u.id AS reporter_id
        FROM problems p
        JOIN users u ON p.user_id = u.id
        ORDER BY p.created_at DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: 'Erreur lors de la récupération des problèmes.' });
        res.json(results);
    });
});

// GET /api/problems/:id - Récupérer un problème par ID (avec commentaires)
router.get('/:id', (req, res) => {
    const problemId = req.params.id;
    const sqlProblem = `
        SELECT p.id, p.title, p.description, p.latitude, p.longitude, p.status,
               p.votes_count, p.comments_count, p.created_at,
               u.name AS reporter_name, u.id AS reporter_id
        FROM problems p
        JOIN users u ON p.user_id = u.id
        WHERE p.id = ?
    `;
    db.query(sqlProblem, [problemId], (err, results) => {
        if (err) return res.status(500).json({ message: 'Erreur serveur.' });
        if (results.length === 0) {
            return res.status(404).json({ message: 'Problème non trouvé.' });
        }
        const problem = results[0];
        // Récupérer les commentaires du problème
        const sqlComments = `
            SELECT c.id, c.content, c.created_at,
                   u.id AS user_id, u.name AS user_name
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.problem_id = ?
            ORDER BY c.created_at ASC
        `;
        db.query(sqlComments, [problemId], (err, comments) => {
            if (err) return res.status(500).json({ message: 'Erreur lors de la récupération des commentaires.' });
            problem.comments = comments;
            res.json(problem);
        });
    });
});

// POST /api/problems - Créer un nouveau problème (signalement) [auth requis]
router.post('/', authenticateToken, (req, res) => {
    const { title, description, latitude, longitude } = req.body;
    const userId = req.user.id;
    if (!title || !description || latitude == null || longitude == null) {
        return res.status(400).json({ message: 'Titre, description et coordonnées requis.' });
    }
    const sqlInsert = `
        INSERT INTO problems (title, description, latitude, longitude, user_id, status)
        VALUES (?, ?, ?, ?, ?, 'ouvert')
    `;
    db.query(sqlInsert, [title, description, latitude, longitude, userId], (err, result) => {
        if (err) return res.status(500).json({ message: 'Erreur lors de la création du problème.' });
        const newId = result.insertId;
        // Récupérer le nouveau problème inséré
        db.query(`
            SELECT p.id, p.title, p.description, p.latitude, p.longitude, p.status,
                   p.votes_count, p.comments_count, p.created_at,
                   u.name AS reporter_name, u.id AS reporter_id
            FROM problems p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = ?`, [newId], (err, results) => {
                if (err) return res.status(500).json({ message: 'Problème créé, erreur lors de la lecture.' });
                const createdProblem = results[0];
                // Diffuser via WebSocket aux clients connectés
                if (req.app.locals.wss) {
                    const message = JSON.stringify({ type: 'newProblem', data: createdProblem });
                    req.app.locals.wss.clients.forEach(client => {
                        if (client.readyState === 1) { // 1 = WebSocket.OPEN
                            client.send(message);
                        }
                    });
                }
                res.status(201).json(createdProblem);
            });
    });
});

// POST /api/problems/:id/vote - Voter pour un problème [auth requis]
router.post('/:id/vote', authenticateToken, (req, res) => {
    const problemId = req.params.id;
    const userId = req.user.id;
    // Vérifier existence du problème et qu'il n'est pas résolu
    db.query('SELECT * FROM problems WHERE id = ?', [problemId], (err, results) => {
        if (err) return res.status(500).json({ message: 'Erreur serveur.' });
        if (results.length === 0) {
            return res.status(404).json({ message: 'Problème non trouvé.' });
        }
        if (results[0].status === 'résolu') {
            return res.status(400).json({ message: 'Vous ne pouvez pas voter pour un problème résolu.' });
        }
        // Vérifier si vote déjà existant
        db.query('SELECT id FROM votes WHERE user_id = ? AND problem_id = ?', [userId, problemId], (err, voteResults) => {
            if (err) return res.status(500).json({ message: 'Erreur serveur.' });
            if (voteResults.length > 0) {
                return res.status(400).json({ message: 'Vous avez déjà voté pour ce problème.' });
            }
            // Insérer le vote
            db.query('INSERT INTO votes (user_id, problem_id) VALUES (?, ?)', [userId, problemId], (err) => {
                if (err) return res.status(500).json({ message: 'Erreur lors de l\'enregistrement du vote.' });
                // Incrémenter le compteur de votes
                db.query('UPDATE problems SET votes_count = votes_count + 1 WHERE id = ?', [problemId]);
                res.json({ message: 'Vote enregistré.' });
            });
        });
    });
});

// POST /api/problems/:id/comment - Ajouter un commentaire [auth requis]
router.post('/:id/comment', authenticateToken, (req, res) => {
    const problemId = req.params.id;
    const userId = req.user.id;
    const { content } = req.body;
    if (!content || content.trim() === '') {
        return res.status(400).json({ message: 'Le commentaire ne peut pas être vide.' });
    }
    // Vérifier existence du problème et qu'il n'est pas résolu
    db.query('SELECT * FROM problems WHERE id = ?', [problemId], (err, results) => {
        if (err) return res.status(500).json({ message: 'Erreur serveur.' });
        if (results.length === 0) {
            return res.status(404).json({ message: 'Problème non trouvé.' });
        }
        if (results[0].status === 'résolu') {
            return res.status(400).json({ message: 'Ce problème est déjà résolu, impossible de commenter.' });
        }
        // Insérer le commentaire
        db.query('INSERT INTO comments (content, user_id, problem_id) VALUES (?, ?, ?)', [content, userId, problemId], (err, result) => {
            if (err) return res.status(500).json({ message: 'Erreur lors de l\'ajout du commentaire.' });
            // Incrémenter le compteur de commentaires
            db.query('UPDATE problems SET comments_count = comments_count + 1 WHERE id = ?', [problemId]);
            // Récupérer le commentaire inséré pour le renvoyer
            const newCommentId = result.insertId;
            db.query(`
                SELECT c.id, c.content, c.created_at,
                       u.id AS user_id, u.name AS user_name
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE c.id = ?`, [newCommentId], (err, comments) => {
                    if (err) return res.status(500).json({ message: 'Commentaire ajouté, erreur lors de la récupération.' });
                    res.status(201).json(comments[0]);
            });
        });
    });
});

// PATCH /api/problems/:id/resolve - Marquer résolu [auth admin]
router.patch('/:id/resolve', authenticateToken, authorizeRoles('admin'), (req, res) => {
    const problemId = req.params.id;
    db.query('UPDATE problems SET status = "résolu" WHERE id = ?', [problemId], (err, result) => {
        if (err) return res.status(500).json({ message: 'Erreur lors de la mise à jour.' });
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Problème non trouvé.' });
        }
        res.json({ message: 'Problème marqué comme résolu.' });
        // On pourrait notifier via WebSocket ici, par exemple, mais ce n'est pas explicitement demandé.
    });
});

module.exports = router;
