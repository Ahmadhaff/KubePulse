import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentModule } from './agent/agent.module';
import { ChatModule } from './chat/chat.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AgentModule,
    ChatModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
