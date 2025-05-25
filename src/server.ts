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

const httpServer = http.createServer(app);

const startServer = async () => {
  try {
    await prisma.$connect();
    console.log("📦 Connected to database");

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
              graphRef: "my-graph-id@my-graph-variant",
              footer: false,
            })
          : ApolloServerPluginLandingPageLocalDefault({ footer: false }),
      ],
    });

    // Start Apollo Server
    await apolloServer.start();

    // Apply Apollo middleware to Express
    app.use(
      "/graphql",
      cors<cors.CorsRequest>({
        origin:
          config.NODE_ENV === "development"
            ? "http://localhost:3000"
            : "https://tanscrow.vercel.app",
        credentials: true, // Enable credentials (cookies)
      }),
      express.json(),
      expressMiddleware(apolloServer, {
        context: createContext,
      })
    );

    app.get("/", (req: Request, res: Response) => {
      res.redirect("/graphql");
    });

    app.listen(config.PORT, () => {
      console.log(`🚀 Server running on port ${config.PORT}`);
      console.log(
        `🚀 GraphQL endpoint: http://localhost:${config.PORT}/graphql`
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
