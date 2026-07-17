import { Module } from "@nestjs/common";
import { AuthSessionsController } from "./auth-sessions.controller";
import { AuthSessionsService } from "./auth-sessions.service";
import { OidcVerifierService } from "./oidc-verifier.service";
import { OnboardingModule } from "../onboarding/onboarding.module";

@Module({ imports: [OnboardingModule], controllers: [AuthSessionsController], providers: [AuthSessionsService, OidcVerifierService], exports: [AuthSessionsService] })
export class AuthSessionsModule {}
