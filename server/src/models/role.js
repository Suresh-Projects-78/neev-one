const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Role = sequelize.define('Role', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    key: { type: DataTypes.STRING, allowNull: false, unique: true },
    label: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.STRING, allowNull: true },
    // null => global/system role; set for company-specific custom roles
    companyId: { type: DataTypes.INTEGER, allowNull: true },
    // permission keys (strings), e.g. ['sales.invoices.view','sales.invoices.create'] or ['*'] for full access
    permissions: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    // prevent deletion/edit of built-in roles
    isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    tableName: 'roles',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  });
  return Role;
};
