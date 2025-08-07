import { Request, Response, NextFunction } from "express";

// You should store this securely in a .env file
const STATIC_API_KEY = process.env.STATIC_API_KEY;

export const verifyApiKey = (req: Request, res: Response, next: NextFunction) => {
const apiKey = req.header("x-api-key");

if (!STATIC_API_KEY) {
console.error("STATIC_API_KEY is not defined in environment variables.");
return res.status(500).json({ error: "Internal Server Error" });
}

if (!apiKey || apiKey !== STATIC_API_KEY) {
return res.status(401).json({ error: "Unauthorized: Invalid or missing API key" });
}

next();
};