import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { SuppliersModule } from "../suppliers/suppliers.module";
import { ImportFileParser } from "./import-file.parser";
import { ImportsController } from "./imports.controller";
import { ImportsService } from "./imports.service";

@Module({
  imports: [AccessControlModule, SuppliersModule],
  controllers: [ImportsController],
  providers: [ImportFileParser, ImportsService],
})
export class ImportsModule {}
