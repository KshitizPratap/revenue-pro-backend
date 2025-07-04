import { IUser } from "../../user/domain/user.domain.js";

export class Context {
  private userId!: string;
  private orgId!: string;
  private currentUser?: IUser;

  public setUserId(userId: string): void {
    this.userId = userId;
  }

  public getUserId(): string {
    return this.userId;
  }

  public setOrgId(orgId: string): void {
    this.orgId = orgId;
  }

  public getOrgId(): string {
    return this.orgId;
  }

  public setUser(user: IUser): void {
    this.currentUser = user;
  }

  public getUser(): IUser | undefined {
    return this.currentUser;
  }
}
