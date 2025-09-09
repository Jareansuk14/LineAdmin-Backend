const User = require('../models/User');

const seedDefaultAdmin = async () => {
  try {
    // Check if admin already exists
    const existingAdmin = await User.findOne({ user: 'Admin' });
    
    if (!existingAdmin) {
      const defaultAdmin = new User({
        user: 'Admin',
        password: '1234',
        role: 'Admin'
      });

      await defaultAdmin.save();
      console.log('Default admin user created successfully');
      console.log('Username: Admin');
      console.log('Password: 1234');
    } else {
      console.log('Default admin user already exists');
    }
  } catch (error) {
    console.error('Error creating default admin:', error);
  }
};

module.exports = seedDefaultAdmin;
