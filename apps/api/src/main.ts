import "./instrumentation";
import "reflect-metadata";
import { createMarketplaceApp } from "./bootstrap";
import { environment } from "./platform/config/environment";

async function bootstrap() {
  const config = environment();
  const app = await createMarketplaceApp();
  await app.listen(config.PORT ?? config.API_PORT, config.API_HOST);
}

void bootstrap();
