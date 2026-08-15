const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/warehouseController');
const { authenticateJWT, requireCompanyContext } = require('../middleware/auth');

// List all warehouses in company
router.get('/company', authenticateJWT, requireCompanyContext, ctrl.listCompanyWarehouses);

// Get single warehouse
router.get('/:id', authenticateJWT, requireCompanyContext, ctrl.getWarehouse);

// Get users assigned to warehouse
router.get('/:id/users', authenticateJWT, requireCompanyContext, ctrl.getWarehouseUsers);

// Create new warehouse
router.post('/', authenticateJWT, requireCompanyContext, ctrl.createWarehouseValidators, ctrl.createWarehouse);

// Update warehouse
router.put('/:id', authenticateJWT, requireCompanyContext, ctrl.updateWarehouseValidators, ctrl.updateWarehouse);

// Delete warehouse
router.delete('/:id', authenticateJWT, requireCompanyContext, ctrl.deleteWarehouse);

module.exports = router;
