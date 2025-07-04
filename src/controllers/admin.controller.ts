import { Request, Response } from "express";
import UserService from "../services/user/service/service.js";
import { UserRole } from "../middlewares/auth.middleware.js";
import { IUser } from "../services/user/domain/user.domain.js";

class AdminController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  public upsertUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, name, role = UserRole.CLIENT, userId } = req.body;

      if (!email || !name) {
        res.status(400).json({
          success: false,
          message: "Email and name are required",
        });
        return;
      }

      // Password is required only for new users
      if (!userId && !password) {
        res.status(400).json({
          success: false,
          message: "Password is required for new users",
        });
        return;
      }

      const user = await this.userService.upsertUser({
        userId,
        email,
        password,
        name,
        role,
        isEmailVerified: false,
      });

      res.status(201).json({
        success: true,
        message: userId ? "User updated successfully" : "User created successfully",
        data: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error upserting user",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  public getAllUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const users = await this.userService.getAllUsers();

      res.status(200).json({
        success: true,
        data: users.map((user: IUser) => ({
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          created_at: user.created_at,
        })),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching users",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}

export default new AdminController(); 