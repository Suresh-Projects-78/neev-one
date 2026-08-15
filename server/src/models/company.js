const { DataTypes } = require('sequelize');

// Generate Org ID like ORG-XXXXXX
function generateOrgId() {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `ORG-${num}`;
}

module.exports = (sequelize) => {
  const Company = sequelize.define('Company', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orgId: { 
      type: DataTypes.STRING, 
      allowNull: false, 
      unique: true,
      defaultValue: generateOrgId,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    profile: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    // Owner account - the account that created this company
    ownerAccountId: { type: DataTypes.STRING, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, { 
    tableName: 'companies', 
    timestamps: true,
    hooks: {
      beforeCreate: (company) => {
        if (!company.orgId) {
          company.orgId = generateOrgId();
        }
      },
    },
  });

  // Helper to regenerate org ID if needed
  Company.generateOrgId = generateOrgId;

  return Company;
};
