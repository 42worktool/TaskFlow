import express from "express";
import { authRouter } from "./modules/auth";
import { devAuthByEmail } from "./modules/auth/devAuth";
import { usersRouter } from "./modules/users";
import { workspaceRouter } from "./modules/workspace";
import { boardRouter, listRouter, listItemRouter } from "./modules/board";
import { calendarRouter } from "./modules/calendar";
import { inboxRouter } from "./modules/inbox";
import { errorHandler } from "./utils/http";

const app = express();

app.use(express.json());

// DEV-ONLY auth shim. Remove when the auth module ships real JWT middleware.
app.use(devAuthByEmail);

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/workspaces", workspaceRouter);
// List create lives under its workspace; list item ops are top-level by list_id.
app.use("/api/workspaces", listRouter);
app.use("/api/lists", listItemRouter);
app.use("/api/boards", boardRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/inbox", inboxRouter);

app.use(errorHandler);

export default app;
