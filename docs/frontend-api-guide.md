# Tanscrow Frontend API Integration Guide

## Introduction

This guide provides comprehensive documentation for frontend developers to integrate with the Tanscrow Backend API. The API is built using GraphQL, providing a flexible and powerful way to interact with the backend services.

## Getting Started

### API Endpoint

The GraphQL API endpoint is accessible at:

```
/graphql
```

### Authentication

All authenticated requests must include a JWT token in the Authorization header:

```javascript
const headers = {
  Authorization: "Bearer YOUR_JWT_TOKEN",
};
```

### GraphQL Client Setup

We recommend using Apollo Client for frontend integration. Here's a basic setup example:

```javascript
import { ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";

// Create the http link
const httpLink = createHttpLink({
  uri: "YOUR_API_ENDPOINT/graphql",
});

// Add the auth token to headers
const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem("token");
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : "",
    },
  };
});

// Create the Apollo Client instance
const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
});
```

## Core Features

### User Authentication

#### Email Sign Up

```javascript
const SIGNUP_MUTATION = gql`
  mutation SignUp($input: SignupWithEmailInput!) {
    signupWithEmail(input: $input) {
      token
      user {
        id
        email
        firstName
        lastName
      }
    }
  }
`;

// Usage example
const [signUp] = useMutation(SIGNUP_MUTATION);

const handleSignUp = async () => {
  try {
    const { data } = await signUp({
      variables: {
        input: {
          email: "user@example.com",
          password: "securepassword",
          firstName: "John",
          lastName: "Doe",
        },
      },
    });

    // Store the token
    localStorage.setItem("token", data.signupWithEmail.token);
  } catch (error) {
    console.error("Sign up error:", error);
  }
};
```

#### Email Sign In

```javascript
const SIGNIN_MUTATION = gql`
  mutation SignIn($input: SigninWithEmailInput!) {
    signinWithEmail(input: $input) {
      token
      user {
        id
        email
      }
    }
  }
`;
```

### User Profile

#### Fetch Current User

```javascript
const CURRENT_USER_QUERY = gql`
  query CurrentUser {
    me {
      id
      email
      firstName
      lastName
      phoneNumber
      profileImageUrl
      accountType
      verified
    }
  }
`;

// Usage example
const { data, loading, error } = useQuery(CURRENT_USER_QUERY);
```

### Transactions

#### Create Transaction

```javascript
const CREATE_TRANSACTION_MUTATION = gql`
  mutation CreateTransaction($input: CreateTransactionInput!) {
    createTransaction(input: $input) {
      id
      status
      escrowStatus
      amount
      paymentCurrency
      deliveryMethod
      buyer {
        id
        email
      }
      seller {
        id
        email
      }
    }
  }
`;

// Usage example
const [createTransaction] = useMutation(CREATE_TRANSACTION_MUTATION);

const handleCreateTransaction = async () => {
  try {
    const { data } = await createTransaction({
      variables: {
        input: {
          amount: 100.0,
          paymentCurrency: "USD",
          deliveryMethod: "PHYSICAL",
          sellerId: "seller-id",
        },
      },
    });
  } catch (error) {
    console.error("Transaction creation error:", error);
  }
};
```

## Error Handling

Implement proper error handling in your frontend application:

```javascript
try {
  const { data } = await mutation();
} catch (error) {
  if (error.graphQLErrors) {
    // Handle GraphQL errors
    error.graphQLErrors.forEach(({ message, extensions }) => {
      console.error(`GraphQL Error: ${message}`);
      // Handle specific error codes
      switch (extensions.code) {
        case "UNAUTHENTICATED":
          // Handle authentication error
          break;
        case "FORBIDDEN":
          // Handle authorization error
          break;
        default:
          // Handle other errors
          break;
      }
    });
  } else if (error.networkError) {
    // Handle network errors
    console.error("Network error:", error.networkError);
  }
}
```

## Best Practices

1. **Token Management**

   - Store the JWT token securely
   - Implement token refresh mechanism
   - Clear token on logout

2. **Data Caching**

   - Utilize Apollo Client's caching capabilities
   - Implement proper cache updates after mutations
   - Use cache policies appropriately

3. **Error Handling**

   - Implement comprehensive error handling
   - Show user-friendly error messages
   - Log errors for debugging

4. **Performance**

   - Only request needed fields in queries
   - Implement pagination for large lists
   - Use proper loading states

5. **Security**
   - Never store sensitive data in local storage
   - Implement proper input validation
   - Use HTTPS for all API calls

## Rate Limiting

The API implements rate limiting per IP address and authenticated user. Handle rate limit errors appropriately in your frontend application:

```javascript
if (error.extensions?.code === "RATE_LIMITED") {
  // Show appropriate message to user
  // Implement exponential backoff for retries
}
```

## TypeScript Support

For TypeScript projects, you can generate TypeScript types from your GraphQL schema:

```bash
npm install --save-dev @graphql-codegen/cli @graphql-codegen/typescript
```

Create a codegen.yml configuration file:

```yaml
overwrite: true
schema: "YOUR_API_ENDPOINT/graphql"
documents: "src/**/*.graphql"
generates:
  src/generated/graphql.ts:
    plugins:
      - "typescript"
      - "typescript-operations"
```

## Testing

Implement proper testing for your API integration:

```javascript
import { MockedProvider } from "@apollo/client/testing";

const mocks = [
  {
    request: {
      query: CURRENT_USER_QUERY,
    },
    result: {
      data: {
        me: {
          id: "1",
          email: "test@example.com",
          // ... other fields
        },
      },
    },
  },
];

// Test component
render(
  <MockedProvider mocks={mocks} addTypename={false}>
    <YourComponent />
  </MockedProvider>
);
```
