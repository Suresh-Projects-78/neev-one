const { DataTypes } = require('sequelize');

// Generate Account ID like ACC-XXXXXX
function generateAccountId() {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `ACC-${num}`;
}

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    accountId: { 
      type: DataTypes.STRING, 
      allowNull: false, 
      unique: true,
      defaultValue: generateAccountId,
    },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    mobile: { type: DataTypes.STRING, allowNull: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    name: { type: DataTypes.STRING },
    profile: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    isSystemAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    resetToken: { type: DataTypes.STRING, allowNull: true },
    resetTokenExpiry: { type: DataTypes.DATE, allowNull: true },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    hooks: {
      beforeCreate: (user) => {
        if (!user.accountId) {
          user.accountId = generateAccountId();
        }
      },
    },
  });

  // Helper to regenerate account ID if needed
  User.generateAccountId = generateAccountId;

  return User;
};
