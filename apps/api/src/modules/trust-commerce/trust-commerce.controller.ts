import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createOrderCommentSchema, createProductGapSchema, createTrustAppealSchema, createVerifiedReviewSchema, decideTrustAppealSchema, moderateVerifiedReviewSchema, recordTrustMetricSchema, respondVerifiedReviewSchema, smartRecommendationSchema, updateDeliveryZoneGeoSchema, updateGeoPointSchema, updateOrderCommentSchema, updateProductGapSchema, updateVerifiedReviewSchema, verifyGeoPointSchema } from "@marketplace/schemas";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { GeoCommerceService } from "./geo-commerce.service";
import { SmartRecommendationService } from "./smart-recommendation.service";
import { TrustCommerceService } from "./trust-commerce.service";

@ApiTags("trust-commerce")
@UseGuards(PermissionsGuard)
@Controller()
export class TrustCommerceController {
  constructor(private readonly trust: TrustCommerceService, private readonly geo: GeoCommerceService, private readonly recommendations: SmartRecommendationService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }
  private parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { flatten(): unknown } } }, body: unknown) { const parsed = schema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return parsed.data; }

  @Get("trust/incidents") @RequirePermissions("trust.incident.view")
  incidents(@Query("status") status: string | undefined, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.listIncidents(this.context(actorId, organizationId), status); }
  @Post("trust/incidents") @RequirePermissions("trust.incident.manage")
  createIncident(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.createIncident(this.parse(createProductGapSchema, body), this.context(actorId, organizationId)); }
  @Patch("trust/incidents/:incidentId") @RequirePermissions("trust.incident.manage")
  updateIncident(@Param("incidentId") incidentId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.updateIncident(incidentId, this.parse(updateProductGapSchema, body), this.context(actorId, organizationId)); }
  @Post("trust/incidents/:incidentId/appeals") @RequirePermissions("trust.incident.appeal")
  appealIncident(@Param("incidentId") incidentId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.appealIncident(incidentId, this.parse(createTrustAppealSchema, body), this.context(actorId, organizationId)); }
  @Post("trust/incident-appeals/:appealId/decision") @RequirePermissions("trust.incident.manage")
  decideIncidentAppeal(@Param("appealId") appealId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.decideIncidentAppeal(appealId, this.parse(decideTrustAppealSchema, body), this.context(actorId, organizationId)); }

  @Get("trust/orders/:orderId/comments") @RequirePermissions("trust.comment.view")
  comments(@Param("orderId") orderId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.orderComments(orderId, this.context(actorId, organizationId)); }
  @Post("trust/orders/:orderId/comments") @RequirePermissions("trust.comment.manage")
  createComment(@Param("orderId") orderId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.createOrderComment(orderId, this.parse(createOrderCommentSchema, body), this.context(actorId, organizationId)); }
  @Patch("trust/comments/:commentId") @RequirePermissions("trust.comment.manage")
  updateComment(@Param("commentId") commentId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.updateOrderComment(commentId, this.parse(updateOrderCommentSchema, body), this.context(actorId, organizationId)); }

  @Post("trust/orders/:orderId/reviews") @RequirePermissions("trust.review.create")
  createReview(@Param("orderId") orderId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.createReview(orderId, this.parse(createVerifiedReviewSchema, body), this.context(actorId, organizationId)); }
  @Get("trust/suppliers/:supplierOrganizationId/reviews") @RequirePermissions("trust.review.view")
  reviews(@Param("supplierOrganizationId") supplierOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.supplierReviews(supplierOrganizationId, this.context(actorId, organizationId)); }
  @Patch("trust/reviews/:reviewId") @RequirePermissions("trust.review.create")
  updateReview(@Param("reviewId") reviewId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.updateReview(reviewId, this.parse(updateVerifiedReviewSchema, body), this.context(actorId, organizationId)); }
  @Post("trust/reviews/:reviewId/response") @RequirePermissions("trust.review.respond")
  respondReview(@Param("reviewId") reviewId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.respondReview(reviewId, this.parse(respondVerifiedReviewSchema, body), this.context(actorId, organizationId)); }
  @Post("trust/reviews/:reviewId/appeals") @RequirePermissions("trust.review.respond")
  appealReview(@Param("reviewId") reviewId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.appealReview(reviewId, this.parse(createTrustAppealSchema, body), this.context(actorId, organizationId)); }
  @Post("trust/reviews/:reviewId/moderation") @RequirePermissions("trust.review.moderate")
  moderateReview(@Param("reviewId") reviewId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.moderateReview(reviewId, this.parse(moderateVerifiedReviewSchema, body), this.context(actorId, organizationId)); }

  @Post("trust/ratings/events") @RequirePermissions("trust.rating.manage")
  recordMetric(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.recordMetric(this.parse(recordTrustMetricSchema, body), this.context(actorId, organizationId)); }
  @Get("trust/ratings/suppliers/:supplierOrganizationId") @RequirePermissions("trust.rating.view")
  rating(@Param("supplierOrganizationId") supplierOrganizationId: string) { return this.trust.rating(supplierOrganizationId); }
  @Post("trust/ratings/suppliers/:supplierOrganizationId/recompute") @RequirePermissions("trust.rating.manage")
  recompute(@Param("supplierOrganizationId") supplierOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.recomputeRating(supplierOrganizationId, this.context(actorId, organizationId)); }
  @Post("trust/ratings/suppliers/:supplierOrganizationId/appeals") @RequirePermissions("trust.rating.appeal")
  appealRating(@Param("supplierOrganizationId") supplierOrganizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.appealRating(supplierOrganizationId, this.parse(createTrustAppealSchema, body), this.context(actorId, organizationId)); }
  @Post("trust/rating-appeals/:appealId/decision") @RequirePermissions("trust.rating.manage")
  decideRatingAppeal(@Param("appealId") appealId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.trust.decideRatingAppeal(appealId, this.parse(decideTrustAppealSchema, body), this.context(actorId, organizationId)); }

  @Get("geo/addresses") @RequirePermissions("geo.view")
  addresses(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.geo.organizationAddresses(this.context(actorId, organizationId)); }
  @Patch("geo/addresses/:addressId") @RequirePermissions("geo.manage")
  updateAddress(@Param("addressId") addressId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.geo.updateAddress(addressId, this.parse(updateGeoPointSchema, body), this.context(actorId, organizationId)); }
  @Post("geo/addresses/:addressId/verification") @RequirePermissions("geo.verify")
  verifyAddress(@Param("addressId") addressId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.geo.verifyAddress(addressId, this.parse(verifyGeoPointSchema, body), this.context(actorId, organizationId)); }
  @Patch("geo/warehouses/:warehouseId") @RequirePermissions("geo.manage")
  updateWarehouse(@Param("warehouseId") warehouseId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = this.parse(updateGeoPointSchema, body); return this.geo.updateWarehouse(warehouseId, parsed, this.context(actorId, organizationId)); }
  @Post("geo/warehouses/:warehouseId/verification") @RequirePermissions("geo.verify")
  verifyWarehouse(@Param("warehouseId") warehouseId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.geo.verifyWarehouse(warehouseId, this.parse(verifyGeoPointSchema, body), this.context(actorId, organizationId)); }
  @Patch("geo/delivery-zones/:zoneId") @RequirePermissions("geo.manage")
  updateZone(@Param("zoneId") zoneId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.geo.updateZone(zoneId, this.parse(updateDeliveryZoneGeoSchema, body), this.context(actorId, organizationId)); }

  @Post("recommendations/smart") @RequirePermissions("recommendation.use")
  recommend(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.recommendations.recommend(this.parse(smartRecommendationSchema, body), this.context(actorId, organizationId)); }
}
