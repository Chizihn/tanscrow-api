import express from "express";
import cors from "cors";
import { limiter } from "./middleware/limiter.middleware";
import { HttpStatusCode } from "axios";
import requestLogger from "./middleware/logger.middleware";
import errorMiddleware from "./middleware/error.middleware";
import { webhookRoutes } from "./routes/webhook.routes";
import config from "./config/app.config";

const app = express();

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ADD CORS MIDDLEWARE FOR ALL ROUTES (including webhooks)
app.use(
  cors({
    origin: [config.APP_URL, config.NGROK_SERVER],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use("/webhooks", webhookRoutes);

app.use(limiter);
// app.use(requestLogger);
app.use(errorMiddleware);

export default app;
