const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/branchController');
const { authenticateJWT, requireCompanyContext } = require('../middleware/auth');

// List all branches in company
router.get('/company', authenticateJWT, requireCompanyContext, ctrl.listCompanyBranches);

// Get single branch with warehouses
router.get('/:id', authenticateJWT, requireCompanyContext, ctrl.getBranch);

// Get users assigned to branch
router.get('/:id/users', authenticateJWT, requireCompanyContext, ctrl.getBranchUsers);

// Create new branch
router.post('/', authenticateJWT, requireCompanyContext, ctrl.createBranchValidators, ctrl.createBranch);

// Update branch
router.put('/:id', authenticateJWT, requireCompanyContext, ctrl.updateBranchValidators, ctrl.updateBranch);

// Delete branch
router.delete('/:id', authenticateJWT, requireCompanyContext, ctrl.deleteBranch);

module.exports = router;
