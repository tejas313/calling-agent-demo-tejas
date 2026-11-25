import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Patient } from '../patients/entities/patient.entity';
import { Appointment } from '../appointments/entities/appointment.entity';
import { AiCall } from '../ai-call/entities/ai-call.entity';
import { Clinic } from '../clinics/entities/clinic.entity';
import { Physician } from '../physicians/entities/physician.entity';
import { Referral } from '../referrals/entities/referral.entity';
import { WaitlistEntry } from '../waitlist/entities/waitlist-entry.entity';
import { CommunicationLog } from '../patients/entities/communication-log.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [
          Patient,
          Appointment,
          AiCall,
          Clinic,
          Physician,
          Referral,
          WaitlistEntry,
          CommunicationLog,
        ],
        synchronize: true,
        logging: false,
        ssl:
          configService.get<string>('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
