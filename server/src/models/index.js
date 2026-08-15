const { Sequelize } = require('sequelize');
const config = require('../config');

// Initialize Sequelize using DATABASE_URL (works for Postgres). For local dev you can
// set DATABASE_URL=sqlite:./dev.sqlite for SQLite fallback.
const sequelize = new Sequelize(config.databaseUrl || 'sqlite::memory:', {
  logging: false,
});

// Import models
const User = require('./user')(sequelize);
const Company = require('./company')(sequelize);
const Branch = require('./branch')(sequelize);
const Warehouse = require('./warehouse')(sequelize);
const Role = require('./role')(sequelize);
const Permission = require('./permission')(sequelize);
const UserCompanyAccess = require('./userCompanyAccess')(sequelize);
const UserBranchAccess = require('./userBranchAccess')(sequelize);
const UserWarehouseAccess = require('./userWarehouseAccess')(sequelize);
const UserRole = require('./userRole')(sequelize);

// Associations
Company.hasMany(Branch, { foreignKey: 'companyId' });
Branch.belongsTo(Company, { foreignKey: 'companyId' });

Company.hasMany(Warehouse, { foreignKey: 'companyId' });
Warehouse.belongsTo(Company, { foreignKey: 'companyId' });

// Warehouses linked to branches
Branch.hasMany(Warehouse, { foreignKey: 'branchId' });
Warehouse.belongsTo(Branch, { foreignKey: 'branchId' });

// Users and companies (many-to-many with role)
User.belongsToMany(Company, { through: UserCompanyAccess, foreignKey: 'userId', otherKey: 'companyId' });
Company.belongsToMany(User, { through: UserCompanyAccess, foreignKey: 'companyId', otherKey: 'userId' });
UserCompanyAccess.belongsTo(Role, { foreignKey: 'roleId' });
UserCompanyAccess.belongsTo(User, { foreignKey: 'userId' });
UserCompanyAccess.belongsTo(Company, { foreignKey: 'companyId' });

// Users and roles (many-to-many direct)
User.belongsToMany(Role, { through: UserRole, foreignKey: 'userId', otherKey: 'roleId' });
Role.belongsToMany(User, { through: UserRole, foreignKey: 'roleId', otherKey: 'userId' });
UserRole.belongsTo(User, { foreignKey: 'userId', as: 'user' });
UserRole.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });

// Users and branches (many-to-many)
User.belongsToMany(Branch, { through: UserBranchAccess, foreignKey: 'userId', otherKey: 'branchId' });
Branch.belongsToMany(User, { through: UserBranchAccess, foreignKey: 'branchId', otherKey: 'userId' });

UserBranchAccess.belongsTo(User, { foreignKey: 'userId' });
UserBranchAccess.belongsTo(Branch, { foreignKey: 'branchId' });

// Users and warehouses (many-to-many)
User.belongsToMany(Warehouse, { through: UserWarehouseAccess, foreignKey: 'userId', otherKey: 'warehouseId' });
Warehouse.belongsToMany(User, { through: UserWarehouseAccess, foreignKey: 'warehouseId', otherKey: 'userId' });

UserWarehouseAccess.belongsTo(User, { foreignKey: 'userId' });
UserWarehouseAccess.belongsTo(Warehouse, { foreignKey: 'warehouseId' });

// Export
module.exports = {
  sequelize,
  User,
  Company,
  Branch,
  Warehouse,
  Role,
  Permission,
  UserCompanyAccess,
  UserBranchAccess,
  UserWarehouseAccess,
  UserRole,
};
