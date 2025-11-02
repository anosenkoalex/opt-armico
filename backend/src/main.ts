import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: ['http://localhost:5173'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

bootstrap();
