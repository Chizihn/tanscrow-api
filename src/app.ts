import express from "express";
import cors from "cors";
import { limiter } from "./middleware/limiter.middleware";
import { HttpStatusCode } from "axios";
import requestLogger from "./middleware/logger.middleware";
import errorMiddleware from "./middleware/error.middleware";
import { webhookRoutes } from "./routes/webhook.routes";

const app = express();

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/webhooks", webhookRoutes);

app.use(limiter);
// app.use(requestLogger);
app.use(errorMiddleware);

export default app;
