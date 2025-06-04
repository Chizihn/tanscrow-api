import app from "./app";
import "reflect-metadata";
import http from "http";
import config from "./config/app.config";
import cors from "cors";
import express, { Request, Response } from "express";
import { prisma } from "./config/db.config";
import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import {
  ApolloServerPluginLandingPageLocalDefault,
  ApolloServerPluginLandingPageProductionDefault,
} from "@apollo/server/plugin/landingPage/default";
import { expressMiddleware } from "@apollo/server/express4";
import { createSchema } from "./graphql/schema";
import { createContext } from "./graphql/context";

interface MyContext {
  token?: string;
}

const startServer = async () => {
  try {
    await prisma.$connect();
    console.log("📦 Connected to database");

    // Create HTTP server
    const httpServer = http.createServer(app);

    // Create GraphQL schema
    const schema = await createSchema();

    // Create Apollo Server
    const apolloServer = new ApolloServer<MyContext>({
      schema,
      plugins: [
        ApolloServerPluginDrainHttpServer({ httpServer }),
        // Install a landing page plugin based on NODE_ENV
        config.NODE_ENV === "production"
          ? ApolloServerPluginLandingPageProductionDefault({
              footer: false,
            })
          : ApolloServerPluginLandingPageLocalDefault({
              footer: false,
              embed: true, // This helps with the Apollo Studio redirect issue
            }),
      ],
    });

    // Start Apollo Server
    await apolloServer.start();

    // Root redirect route
    app.get("/", (req: Request, res: Response) => {
      res.redirect("/graphql");
    });

    app.use(
      "/graphql",
      cors<cors.CorsRequest>({
        origin: [config.APP_URL, config.NGROK_SERVER],
        credentials: true,
      }),
      express.json(),
      expressMiddleware(apolloServer, {
        context: createContext,
      })
    );

    // Use httpServer.listen instead of app.listen
    httpServer.listen(config.PORT, () => {
      console.log(`🚀 Server running on port ${config.PORT}`);
      console.log(`🚀 GraphQL endpoint: ${config.GRAPHQL_ENDPOINT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
