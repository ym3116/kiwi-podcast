import 'reflect-metadata';
import './env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:8000';
  app.enableCors({
    origin: appOrigin.split(',').map((origin) => origin.trim()),
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  const port = Number(process.env.PORT ?? 8010);
  await app.listen(port);
}

void bootstrap();
