import express from "express";
import { authRouter } from "./modules/auth";
import { usersRouter } from "./modules/users";
import { workspaceRouter } from "./modules/workspace";
import { boardRouter } from "./modules/board";
import { calendarRouter } from "./modules/calendar";
import { inboxRouter } from "./modules/inbox";

const app = express();

app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/workspaces", workspaceRouter);
app.use("/api/boards", boardRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/inbox", inboxRouter);

export default app;
