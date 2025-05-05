# Tanscrow Backend API Documentation

## Overview

Tanscrow Backend is a GraphQL-based API service that provides functionality for managing escrow transactions, user accounts, and payments. The API is built using Apollo Server, Type-GraphQL, PostgresSQL and Prisma.

## Authentication

The API uses JWT (JSON Web Token) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

## GraphQL Schema

### Types

#### User

```graphql
type User {
  id: ID!
  email: String
  firstName: String!
  lastName: String!
  phoneNumber: String
  profileImageUrl: String
  accountType: AccountType!
  verified: Boolean!
  createdAt: DateTime!
  updatedAt: DateTime!
}

enum AccountType {
  BUYER
  SELLER
}
```

#### Transaction

```graphql
type Transaction {
  id: ID!
  status: TransactionStatus!
  escrowStatus: EscrowStatus!
  amount: Float!
  paymentCurrency: String!
  deliveryMethod: DeliveryMethod!
  buyer: User!
  seller: User!
}

enum TransactionStatus {
  PENDING
  COMPLETED
  CANCELLED
  DISPUTED
}

enum EscrowStatus {
  FUNDED
  RELEASED
  REFUNDED
}

enum DeliveryMethod {
  PHYSICAL
  DIGITAL
}
```

### Mutations

#### Authentication

```graphql
type Mutation {
  # Email-based authentication
  signupWithEmail(input: SignupWithEmailInput!): AuthResponse!
  signinWithEmail(input: SigninWithEmailInput!): AuthResponse!

  # Phone-based authentication
  signupWithPhone(input: SignupWithPhoneInput!): AuthResponse!
  signinWithPhone(input: SigninWithPhoneInput!): AuthResponse!
}

type AuthResponse {
  token: String!
  user: User!
}
```

### Queries

#### User Queries

```graphql
type Query {
  # Get current authenticated user
  me: User!

  # Get user by ID (requires authentication)
  user(id: ID!): User

  # Get all users (admin only)
  users: [User!]!
}
```

## Error Handling

The API returns GraphQL errors in the following format:

```json
{
  "errors": [
    {
      "message": "Error message",
      "path": ["field"],
      "extensions": {
        "code": "ERROR_CODE"
      }
    }
  ]
}
```

## Rate Limiting

The API implements rate limiting to prevent abuse. Limits are applied per IP address and authenticated user.

## Best Practices

1. Always include authentication token for protected endpoints
2. Use appropriate error handling in your client applications
3. Implement proper validation before sending mutations
4. Follow the rate limiting guidelines

## Examples

### Authentication Example

```graphql
mutation SignUp {
  signupWithEmail(
    input: {
      email: "user@example.com"
      password: "securepassword"
      firstName: "John"
      lastName: "Doe"
    }
  ) {
    token
    user {
      id
      email
      firstName
      lastName
    }
  }
}
```

### Create Transaction Example

```graphql
mutation CreateTransaction {
  createTransaction(
    input: {
      amount: 100.00
      paymentCurrency: "USD"
      deliveryMethod: PHYSICAL
      sellerId: "seller-id"
    }
  ) {
    id
    status
    escrowStatus
    amount
  }
}
```
