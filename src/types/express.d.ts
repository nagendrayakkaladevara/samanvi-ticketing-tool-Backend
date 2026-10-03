import "express-serve-static-core";
import type { Logger } from "pino";
import type { AccessTokenPayload } from "../auth/auth.service";
import type { MobileAccessTokenPayload } from "../auth/mobile-auth.service";

declare module "express-serve-static-core" {
  interface Request {
    requestId: string;
    log: Logger;
    user?: AccessTokenPayload;
    mobileDriver?: MobileAccessTokenPayload;
  }
}
