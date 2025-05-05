# Tanscrow Backend

This is the backend for the Tanscrow platform, a community marketplace middleman platform. It uses Express with GraphQL (Apollo Server) for the API and Prisma with PostgreSQL for the database.

## GraphQL Implementation

The project uses a modern GraphQL implementation with the following technologies:

- **Apollo Server**: For creating and managing the GraphQL server
- **Type-GraphQL**: For defining GraphQL schema using TypeScript classes and decorators
- **Prisma**: For database access and type generation

## Authentication Flow

The authentication flow is implemented using JWT tokens:

1. **Registration**: Users can register with email, password, and profile information
2. **Login**: Users can login with email and password to receive a JWT token
3. **Authentication**: JWT tokens are used to authenticate requests

## Project Structure

```
src/
├── graphql/
│   ├── middleware/      # GraphQL-specific middleware (auth)
│   ├── resolvers/       # GraphQL resolvers
│   ├── types/           # GraphQL type definitions
│   ├── context.ts       # GraphQL context creation
│   └── schema.ts        # GraphQL schema builder
├── middleware/          # Express middleware
├── config/              # Application configuration
└── server.ts           # Server entry point
```

## Getting Started

1. Install dependencies:

   ```
   npm install
   ```

2. Set up environment variables in `.env` file:

   ```
   DATABASE_URL="postgresql://username:password@localhost:5432/tanscrow"
   JWT_SECRET="your-secret-key"
   PORT=4000
   ```

3. Generate Prisma client:

   ```
   npm run prisma:generate
   ```

4. Run database migrations:

   ```
   npm run prisma:migrate
   ```

5. Start the development server:

   ```
   npm run dev
   ```

6. Access GraphQL playground at: http://localhost:4000/graphql

## GraphQL API

### Queries

- `me`: Get the current authenticated user
- `user(id: String!)`: Get a user by ID
- `users`: Get all users (admin only)

### Mutations

- `register(input: RegisterInput!)`: Register a new user
- `login(input: LoginInput!)`: Login a user

## Authentication

To authenticate GraphQL requests, include the JWT token in the Authorization header:

```
Authorization: Bearer YOUR_JWT_TOKEN
```
# tanscrow-api
