# LineAdmin Backend

Admin panel backend built with Node.js, Express, and MongoDB Atlas.

## Features

- User authentication with JWT
- Role-based access control (Admin/User)
- CRUD operations for user management
- MongoDB Atlas integration
- Input validation and error handling
- Default admin account seeding

## Setup Instructions

1. **Install Dependencies**
   ```bash
   cd Backend
   npm install
   ```

2. **Environment Variables**
   Create a `.env` file in the Backend directory with:
   ```
   PORT=5000
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/lineadmin?retryWrites=true&w=majority
   JWT_SECRET=your-super-secret-jwt-key-here-make-it-long-and-complex
   NODE_ENV=development
   CLIENT_URL=http://localhost:3000
   ```

3. **MongoDB Atlas Setup**
   - Create a MongoDB Atlas account
   - Create a new cluster
   - Get your connection string
   - Replace the MONGODB_URI in your .env file
   - Make sure to whitelist your IP address

4. **Run the Server**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

## Default Admin Account

The system automatically creates a default admin account:
- **Username:** Admin
- **Password:** 1234

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login

### Users (Admin only)
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user (password/role only)
- `DELETE /api/users/:id` - Delete user

### Health Check
- `GET /api/health` - Server health check

## User Model

```javascript
{
  user: String (unique, required, 3-50 chars),
  password: String (required, min 4 chars, hashed),
  role: String (Admin/User, default: User),
  createdAt: Date (auto-generated)
}
```

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Role-based authorization
- Input validation
- Protection against deleting last admin
- CORS configuration

## Error Handling

The API returns consistent error responses:
```javascript
{
  success: false,
  message: "Error description",
  errors: [...] // Validation errors if applicable
}
```

Success responses:
```javascript
{
  success: true,
  message: "Success description",
  data: {...} // Response data
}
```
