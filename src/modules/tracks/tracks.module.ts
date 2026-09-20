import { Module } from '@nestjs/common';
import { AdminTracksController } from './controllers/admin-tracks.controller';
import { TracksController } from './controllers/tracks.controller';
import { TracksService } from './tracks.service';

@Module({
  controllers: [TracksController, AdminTracksController],
  providers: [TracksService],
  exports: [TracksService],
})
export class TracksModule {}
