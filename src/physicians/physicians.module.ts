import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Physician } from './entities/physician.entity';
import { PhysiciansService } from './physicians.service';
import { PhysiciansController } from './physicians.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Physician])],
  controllers: [PhysiciansController],
  providers: [PhysiciansService],
  exports: [PhysiciansService],
})
export class PhysiciansModule {}

