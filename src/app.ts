import express from "express";
import cors from "cors";
import { limiter } from "./middleware/limiter.middleware";
import requestLogger from "./middleware/logger.middleware";
import errorMiddleware from "./middleware/error.middleware";
import { webhookRoutes } from "./routes/webhook.routes";
import config from "./config/app.config";
import { UploadRoutes } from "./routes/upload.routes";

const app = express();

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ADD CORS MIDDLEWARE FOR ALL ROUTES (including webhooks)
app.use(
  cors({
    origin:
      config.NODE_ENV === "development"
        ? [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:4040",
          ]
        : [config.APP_URL],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use("/webhooks", webhookRoutes);
app.use("/upload", UploadRoutes);

app.use(limiter);
// app.use(requestLogger);
app.use(errorMiddleware);

export default app;
