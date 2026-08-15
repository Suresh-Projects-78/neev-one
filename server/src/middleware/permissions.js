// Example permission middleware. Use requireCompanyContext first to set req.companyContext and req.companyRole

function requireRoleLabel(requiredLabel) {
  return (req, res, next) => {
    if (!req.companyRole) return res.status(403).json({ error: 'No role assigned' });
    if (req.companyRole !== requiredLabel) return res.status(403).json({ error: 'Forbidden - insufficient role' });
    next();
  };
}

function requireRoleKey(requiredKey) {
  return (req, res, next) => {
    if (!req.companyRoleKey) return res.status(403).json({ error: 'No role assigned' });
    if (req.companyRoleKey !== requiredKey) return res.status(403).json({ error: 'Forbidden - insufficient role' });
    next();
  };
}

function requireAnyRole(keys = []) {
  return (req, res, next) => {
    if (!req.companyRoleKey) return res.status(403).json({ error: 'No role assigned' });
    if (!keys.includes(req.companyRoleKey)) return res.status(403).json({ error: 'Forbidden - insufficient role' });
    next();
  };
}

module.exports = { requireRoleLabel, requireRoleKey, requireAnyRole };
