const bcrypt = require('bcryptjs');

const pass = 'Admin@123';
const hash = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj3oW8mBvBfm';

bcrypt.compare(pass, hash).then(res => {
  console.log('Match:', res);
  return bcrypt.hash(pass, 12);
}).then(newHash => {
  console.log('New Hash:', newHash);
});
