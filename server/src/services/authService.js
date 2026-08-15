const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User, Role, UserCompanyAccess } = require('../models');
const config = require('../config');

const SALT_ROUNDS = 12;

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function generateJwt(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function verifyJwt(token) {
  return jwt.verify(token, config.jwtSecret);
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateJwt,
  verifyJwt,
};
