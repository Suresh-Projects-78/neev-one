const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');
const { authenticateJWT, requireCompanyContext } = require('../middleware/auth');

// User-Company assignment (legacy)
router.post('/assign-company', authenticateJWT, requireCompanyContext, ctrl.assignUserToCompanyValidators, ctrl.assignUserToCompany);
router.post('/assign-branch', authenticateJWT, requireCompanyContext, ctrl.assignUserToBranchValidators, ctrl.assignUserToBranch);

// List users in company
router.get('/company', authenticateJWT, requireCompanyContext, ctrl.listCompanyUsers);

// Create user and attach to company
router.post('/company-user', authenticateJWT, requireCompanyContext, ctrl.createCompanyUserValidators, ctrl.createCompanyUser);

// Single user CRUD
router.get('/:id', authenticateJWT, requireCompanyContext, ctrl.getUser);
router.put('/:id', authenticateJWT, requireCompanyContext, ctrl.updateUserValidators, ctrl.updateUser);
router.put('/:id/status', authenticateJWT, requireCompanyContext, ctrl.setUserStatusValidators, ctrl.setUserStatus);
router.delete('/:id/company', authenticateJWT, requireCompanyContext, ctrl.removeUserFromCompany);

// User role management (company-level role via UserCompanyAccess)
router.put('/:id/role', authenticateJWT, requireCompanyContext, ctrl.setUserRoleValidators, ctrl.setUserRole);

// Direct role assignments (via UserRole junction table)
router.get('/:id/roles', authenticateJWT, requireCompanyContext, ctrl.getUserDirectRoles);
router.post('/:id/roles', authenticateJWT, requireCompanyContext, ctrl.assignUserDirectRoleValidators, ctrl.assignUserDirectRole);
router.delete('/:id/roles/:roleId', authenticateJWT, requireCompanyContext, ctrl.removeUserDirectRoleValidators, ctrl.removeUserDirectRole);

// Branch & Warehouse assignments
router.put('/:id/branches', authenticateJWT, requireCompanyContext, ctrl.setUserBranchesValidators, ctrl.setUserBranches);
router.put('/:id/warehouses', authenticateJWT, requireCompanyContext, ctrl.setUserWarehousesValidators, ctrl.setUserWarehouses);

module.exports = router;
