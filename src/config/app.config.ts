import dotenv from "dotenv";
dotenv.config();

interface SMTP {
  HOST: string;
  PORT: string;
  USER: string;
  PASS: string;
  FROM: string;
}

interface AWS {
  REGION: string;
  ACCESS_KEY_ID: string;
  SECRET_ACCESS_KEY: string;
  BUCKET_NAME: string;
}

interface Redis {
  HOST: string;
  PORT: string | number;
  PASSWORD: string;
}

interface Config {
  DATABASE_URL: string;
  PORT: string;
  JWT_SECRET: string;
  JWT_SECRET_EXPIRES: string;
  NODE_ENV: string;
  APP_URL: string;
  SMTP: SMTP;
  PAYSTACK: {
    SECRET_KEY: string;
  };
  AWS: AWS;
  LOG_LEVEL: string;
  REDIS: Redis;
  GRAPHQL_ENDPOINT: string;
  SUBSCRIPTION_ENDPOINT: string;
}

const config: Config = {
  DATABASE_URL: process.env.DATABASE_URL as string,
  PORT: process.env.PORT as string,
  JWT_SECRET: process.env.JWT_SECRET || "secret",
  JWT_SECRET_EXPIRES: process.env.JWT_SECRET_EXPIRES as string,
  NODE_ENV: process.env.NODE_ENV as string,
  APP_URL:
    process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : (process.env.APP_URL as string),
  SMTP: {
    HOST: process.env.SMTP_HOST || "",
    PORT: process.env.SMTP_PORT || "",
    USER: process.env.SMTP_USER || "",
    PASS: process.env.SMTP_PASS || "",
    FROM: process.env.EMAIL_FROM || "",
  },
  PAYSTACK: {
    SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || "",
  },
  AWS: {
    REGION: process.env.AWS_REGION || "us-east-1",
    ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "",
    SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "",
    BUCKET_NAME: process.env.AWS_BUCKET_NAME || "",
  },
  LOG_LEVEL: process.env.LOG_LEVEL as string,
  REDIS: {
    HOST: process.env.REDIS_HOST || "localhost",
    PORT: process.env.REDIS_PORT || 6379,
    PASSWORD: process.env.REDIS_PASSWORD || "",
  },
  GRAPHQL_ENDPOINT:
    process.env.NODE_ENV === "development"
      ? `http://localhost:${process.env.PORT}/graphql`
      : `${process.env.API_URL}/graphql`,
  SUBSCRIPTION_ENDPOINT:
    process.env.NODE_ENV === "development"
      ? `ws://localhost:${process.env.PORT}/graphql`
      : `${process.env.API_URL}/graphql`,
};

export default config;
