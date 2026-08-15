const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserBranchAccess = sequelize.define('UserBranchAccess', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    branchId: { type: DataTypes.INTEGER, allowNull: false },
    assignedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'user_branch_access',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['userId', 'branchId'] },
    ],
  });
  return UserBranchAccess;
};
