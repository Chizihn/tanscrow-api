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
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { Context as WsContext } from "graphql-ws";
import { createContext } from "./graphql/context";
import { GraphQLContext } from "./graphql/types/context.type";

const startServer = async () => {
  try {
    await prisma.$connect();
    console.log("📦 Connected to database");

    // Create HTTP server
    const httpServer = http.createServer(app);

    // Create GraphQL schema (type-graphql or similar)
    const schema = await createSchema();

    // Create WebSocket server for subscriptions
    const wsServer = new WebSocketServer({
      server: httpServer,
      path: "/graphql",
    });

    // Set up graphql-ws server
    const serverCleanup = useServer(
      {
        schema,
        context: async (ctx: WsContext) => {
          // Create context for WebSocket subscriptions
          // You might need to extract authentication info from ctx.connectionParams
          const mockReq = {
            headers: ctx.connectionParams || {},
          } as any;

          // You may want to implement a separate function for WebSocket context
          // or modify createContext to handle WebSocket connections
          try {
            return await createContext({ req: mockReq });
          } catch (error) {
            // Fallback context for WebSocket connections
            return {
              req: mockReq,
              user: null,
            };
          }
        },
        onConnect: async (ctx) => {
          // Optional: Handle connection authentication
          console.log("WebSocket client connected");
        },
        onDisconnect: (ctx, code, reason) => {
          console.log("WebSocket client disconnected");
        },
      },
      wsServer
    );

    // Create Apollo Server
    const apolloServer = new ApolloServer<GraphQLContext>({
      schema,
      plugins: [
        ApolloServerPluginDrainHttpServer({ httpServer }),
        {
          async serverWillStart() {
            return {
              async drainServer() {
                await serverCleanup.dispose();
              },
            };
          },
        },
        config.NODE_ENV === "production"
          ? ApolloServerPluginLandingPageProductionDefault({
              footer: false,
            })
          : ApolloServerPluginLandingPageLocalDefault({
              footer: false,
              embed: true,
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
        origin:
          config.NODE_ENV === "development"
            ? [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:4040",
              ]
            : [config.APP_URL],
        credentials: true,
      }),
      express.json(),
      expressMiddleware(apolloServer, {
        context: async ({ req }) => createContext({ req }),
      })
    );

    // Start server
    httpServer.listen(config.PORT, () => {
      console.log(`🚀 Server running on port ${config.PORT}`);
      console.log(`🔗 GraphQL endpoint: ${config.GRAPHQL_ENDPOINT}`);
      console.log(`📡 Subscriptions endpoint: ${config.SUBSCRIPTION_ENDPOINT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
