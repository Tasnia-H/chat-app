import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors({
    origin: 'https://calabfr.solar-ict.com', // Frontend URL
    credentials: true,
  });
  
  app.useGlobalPipes(new ValidationPipe());
  
  await app.listen(3013);
  console.log('Backend server running on https://calabbk.solar-ict.com');
}
bootstrap();