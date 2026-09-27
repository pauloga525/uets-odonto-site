import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config';

export async function configureApp(app: NestExpressApplication) {
  const config = app.get(AppConfig);
  // Confía en los proxies de la red interna (Caddy → Nginx en Docker) para obtener la IP real del cliente.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.disable('x-powered-by');
  app.use(
    helmet({
      // La API solo sirve JSON; en desarrollo se relaja para permitir Swagger UI.
      contentSecurityPolicy: config.isProd ? { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } : false,
      hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  // En producción todo va por el mismo origen (Nginx/túnel), así que CORS solo hace falta si se fija WEB_URL.
  if (config.webUrl) app.enableCors({ origin: config.webUrl, credentials: true });
  app.enableShutdownHooks();
  return config;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = await configureApp(app);

  if (!config.isProd) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Sistema de Citas UETS').setVersion('1.0').addCookieAuth('access_token').build(),
    );
    SwaggerModule.setup('api/docs', app, doc);
  }

  await app.listen(config.port);
  Logger.log(`API escuchando en http://localhost:${config.port}/api/v1`, 'Bootstrap');
  if (config.devLoginEnabled) Logger.warn('Login de desarrollo HABILITADO (AUTH_DEV_LOGIN=true)', 'Bootstrap');
  if (!config.google.configured) Logger.warn('Google OAuth no configurado: defina GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET', 'Bootstrap');
}

if (require.main === module) void bootstrap();
