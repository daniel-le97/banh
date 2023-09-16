import Elysia from "elysia";
import { bux } from "./playground/index.ts";

const app = new Elysia()
.use(bux)