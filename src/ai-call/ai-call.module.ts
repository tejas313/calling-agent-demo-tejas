import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiCall } from './entities/ai-call.entity';
import { AiCallController } from './ai-call.controller';
import { AiCallService } from './ai-call.service';
import { TwilioModule } from '../twilio/twilio.module';
import { LangchainModule } from '../langchain/langchain.module';

@Module({
  imports: [TypeOrmModule.forFeature([AiCall]), TwilioModule, LangchainModule],
  controllers: [AiCallController],
  providers: [AiCallService],
  exports: [AiCallService],
})
export class AiCallModule {}
