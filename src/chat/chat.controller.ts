import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  InternalServerErrorException,
  Logger,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { AgentService } from '../agent/agent.service';

const chatBodySchema = z.object({
  message: z.string().trim().min(1, 'message must not be empty').max(4000),
  // Optional previous turns so the agent can remember the conversation.
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(8000),
      }),
    )
    .max(20)
    .optional(),
});

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly agentService: AgentService) {}

  @Post()
  @HttpCode(200)
  async chat(@Body() body: unknown) {
    const parsed = chatBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message));
    }

    try {
      const { reply, toolsUsed } = await this.agentService.runAgentWithMeta(
        parsed.data.message,
        parsed.data.history ?? [],
      );
      return { success: true, reply, toolsUsed };
    } catch (err) {
      this.logger.error('Agent failed', err instanceof Error ? err.stack : String(err));
      throw new InternalServerErrorException({
        success: false,
        message: 'Failed to process the message',
      });
    }
  }
}
