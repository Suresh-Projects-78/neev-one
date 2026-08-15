const { UserCompanyAccess, Company, Role, Branch } = require('../models');

async function getAccessibleCompanies(userId) {
  // returns array of { company, roleKey, roleLabel }
  const accesses = await UserCompanyAccess.findAll({ where: { userId } });
  const result = [];
  for (const a of accesses) {
    const comp = await Company.findByPk(a.companyId);
    const role = await Role.findByPk(a.roleId);
    if (comp) result.push({ company: comp, roleKey: role?.key || null, roleLabel: role?.label || null });
  }
  return result;
}

async function isCompanyAdmin(userId, companyId) {
  const access = await UserCompanyAccess.findOne({ where: { userId, companyId } });
  if (!access) return false;
  const role = await Role.findByPk(access.roleId);
  return role?.key === 'admin';
}

async function getBranchesForCompany(companyId) {
  const branches = await Branch.findAll({ where: { companyId } });
  return branches;
}

module.exports = { getAccessibleCompanies, isCompanyAdmin, getBranchesForCompany };
