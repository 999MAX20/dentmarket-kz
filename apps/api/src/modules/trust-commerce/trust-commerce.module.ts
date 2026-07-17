import { Module } from "@nestjs/common";
import { GeoCommerceService } from "./geo-commerce.service";
import { SmartRecommendationService } from "./smart-recommendation.service";
import { TrustCommerceController } from "./trust-commerce.controller";
import { TrustCommerceService } from "./trust-commerce.service";

@Module({ controllers: [TrustCommerceController], providers: [TrustCommerceService, GeoCommerceService, SmartRecommendationService], exports: [TrustCommerceService, SmartRecommendationService] })
export class TrustCommerceModule {}
