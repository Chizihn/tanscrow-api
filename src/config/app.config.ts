import dotenv from "dotenv";
dotenv.config();

interface SMTP {
  HOST: string;
  PORT: string;
  USER: string;
  PASS: string;
  FROM: string;
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
  LOG_LEVEL: string;
}

const config: Config = {
  DATABASE_URL: process.env.DATABASE_URL as string,
  PORT: process.env.PORT as string,
  JWT_SECRET: process.env.JWT_SECRET || "secret",
  JWT_SECRET_EXPIRES: process.env.JWT_SECRET_EXPIRES as string,
  NODE_ENV: process.env.NODE_ENV as string,
  APP_URL:
    process.env.NODE_ENV === "development"
      ? "localhost:3000"
      : "https://tanscrow.vercel.app",
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
  LOG_LEVEL: process.env.LOG_LEVEL as string,
};

export default config;
