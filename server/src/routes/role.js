const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/roleController');
const { authenticateJWT, requireCompanyContext } = require('../middleware/auth');

// Role CRUD
router.get('/company', authenticateJWT, requireCompanyContext, ctrl.listCompanyRoles);
router.get('/permissions', authenticateJWT, requireCompanyContext, ctrl.listPermissionCatalog);
router.post('/', authenticateJWT, requireCompanyContext, ctrl.createRoleValidators, ctrl.createRole);
router.put('/:id', authenticateJWT, requireCompanyContext, ctrl.updateRoleValidators, ctrl.updateRole);
router.delete('/:id', authenticateJWT, requireCompanyContext, ctrl.deleteRole);

// Role-User assignment endpoints
router.get('/:id/users', authenticateJWT, requireCompanyContext, ctrl.getRoleUsers);
router.post('/:id/users', authenticateJWT, requireCompanyContext, ctrl.assignRoleValidators, ctrl.assignRoleToUser);
router.delete('/:id/users/:userId', authenticateJWT, requireCompanyContext, ctrl.unassignRoleValidators, ctrl.unassignRoleFromUser);

module.exports = router;
