const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserCompanyAccess = sequelize.define('UserCompanyAccess', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    companyId: { type: DataTypes.INTEGER, allowNull: false },
    roleId: { type: DataTypes.INTEGER, allowNull: false },
    profile: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  }, { tableName: 'user_company_access', timestamps: true });
  return UserCompanyAccess;
};
