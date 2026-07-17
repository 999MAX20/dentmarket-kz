import { Global, Module } from "@nestjs/common";
import { FileScannerService } from "./file-scanner.service";
import { SecurityCryptoService } from "./security-crypto.service";
import { FileUploadPolicyService } from "./file-upload-policy.service";
import { StorageModule } from "../storage/storage.module";

@Global()
@Module({ imports: [StorageModule], providers: [FileScannerService, SecurityCryptoService, FileUploadPolicyService], exports: [FileScannerService, SecurityCryptoService, FileUploadPolicyService] })
export class SecurityModule {}
