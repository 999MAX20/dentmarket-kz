import { Module } from "@nestjs/common";
import { MfaController } from "./mfa.controller";
import { MfaService } from "./mfa.service";
import { AuthSessionsModule } from "./auth-sessions.module";

@Module({ imports: [AuthSessionsModule], controllers: [MfaController], providers: [MfaService] })
export class MfaModule {}
