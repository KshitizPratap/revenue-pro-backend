import { Router } from "express";
import {  isAdmin } from "../middlewares/auth.middleware.js";
import adminController from "../controllers/admin.controller.js";

const router = Router();

// Admin user management routes
router.post("/users/upsert",  isAdmin, adminController.upsertUser);
router.get("/users/list/all", isAdmin, adminController.getAllUsers);

export default router; 