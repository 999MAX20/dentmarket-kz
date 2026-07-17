import { BadRequestException, Body, Controller, Headers, Param, Post, Req } from "@nestjs/common";
import { completeIntegrationJobSchema, connectorAgentHeartbeatSchema, enrollConnectorAgentSchema, failIntegrationJobSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ConnectorAgentService } from "./connector-agent.service";

@ApiTags("connector-agents")
@Controller("connector-agents")
export class ConnectorAgentController {
  constructor(private readonly agents: ConnectorAgentService) {}

  @Post(":agentId/enroll")
  enroll(@Param("agentId") agentId: string, @Body() body: unknown, @Req() request: Request) {
    const parsed = enrollConnectorAgentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.agents.enroll(agentId, parsed.data, request.ip);
  }

  @Post(":agentId/heartbeat")
  heartbeat(@Param("agentId") agentId: string, @Headers("authorization") authorization: string | undefined, @Body() body: unknown, @Req() request: Request) {
    const parsed = connectorAgentHeartbeatSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.agents.heartbeat(agentId, authorization, parsed.data, request.ip);
  }

  @Post(":agentId/jobs/claim")
  claim(@Param("agentId") agentId: string, @Headers("authorization") authorization: string | undefined) {
    return this.agents.claim(agentId, authorization);
  }

  @Post(":agentId/jobs/:jobId/complete")
  complete(@Param("agentId") agentId: string, @Param("jobId") jobId: string, @Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const parsed = completeIntegrationJobSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.agents.complete(agentId, authorization, jobId, parsed.data);
  }

  @Post(":agentId/jobs/:jobId/fail")
  fail(@Param("agentId") agentId: string, @Param("jobId") jobId: string, @Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const parsed = failIntegrationJobSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.agents.fail(agentId, authorization, jobId, parsed.data);
  }
}
