const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserWarehouseAccess = sequelize.define('UserWarehouseAccess', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    warehouseId: { type: DataTypes.INTEGER, allowNull: false },
    assignedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'user_warehouse_access',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['userId', 'warehouseId'] },
    ],
  });

  return UserWarehouseAccess;
};
