// backend/middleware/auth.js
const jwt = require('jsonwebtoken');

// Clé secrète pour signer les tokens JWT (à externaliser dans un vrai projet)
const JWT_SECRET = 'MaSuperCleSecreteJWT';

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];  // on attend "Bearer <token>"
    if (!token) {
        return res.status(401).json({ message: 'Accès refusé : pas de token fourni' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // On attache les infos du token (id, role) à l'objet req pour les prochains middlewares/handlers
        req.user = { id: decoded.id, role: decoded.role };
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Token invalide ou expiré' });
    }
}

// Middleware d'autorisation par rôles
function authorizeRoles(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Non authentifié' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Accès refusé : rôle non autorisé' });
        }
        next();
    };
}

module.exports = { JWT_SECRET, authenticateToken, authorizeRoles };
