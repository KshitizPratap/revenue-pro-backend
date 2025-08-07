import { Router } from "express";
import { createLead } from "../controllers/createLeadController.js";
import { verifyApiKey } from "../middlewares/apiKey.middleware.js";

const router = Router();
const controller = new createLead();

// Route to create single or bulk leads (protected by static API key)
export default router.post("/", verifyApiKey, controller.createLead);

