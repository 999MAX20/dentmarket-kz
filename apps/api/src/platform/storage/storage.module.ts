import { Global, Module } from "@nestjs/common";
import { ObjectStorageService } from "./object-storage.service";
import { MediaAccessService } from "./media-access.service";

@Global()
@Module({ providers: [ObjectStorageService, MediaAccessService], exports: [ObjectStorageService, MediaAccessService] })
export class StorageModule {}
