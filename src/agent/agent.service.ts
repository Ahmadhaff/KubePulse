import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatAnthropic } from '@langchain/anthropic';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const MAX_ITERATIONS = 5;
// @langchain/anthropic 0.3.x always sends `thinking: {type: "disabled"}`, which the 5.x models reject.
const DEFAULT_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are KubeAgent, a friendly and concise AI assistant.

How to respond:
- Answer directly in the first sentence, then add only the details that help. Keep replies short.
- Reply in the same language the user writes in.
- Use light Markdown only when it helps (short bullet lists, **bold** for key values). No headings for short answers, and never use tables (use a short bullet list per item instead).
- Do not use emojis unless the user does.
- If the conversation has earlier messages, use them for context (e.g. "and tomorrow?" or "what about Rome?").

Tools:
- Use get_weather for any question about the weather in a specific city. If no city is given, ask which city instead of guessing.
- For a comparison, call get_weather once per city.
- The weather tool returns simulated demo data, not live readings. Mention this briefly (one short note at the end) whenever you report weather.
- If a tool returns an error, tell the user plainly and suggest what to try next.
- For anything else, answer from your own knowledge and be honest when you are unsure.`;

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentResult {
  reply: string;
  toolsUsed: string[];
}

const CONDITIONS = ['sunny', 'partly cloudy', 'cloudy', 'light rain', 'windy', 'clear'];

/** Small deterministic hash so the same city always returns the same demo weather. */
function hash(input: string): number {
  let h = 2166136261;
  for (const ch of input.toLowerCase().trim()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const weatherSchema = z.object({
  city: z.string().describe('The name of the city, e.g. "London"'),
  unit: z
    .enum(['celsius', 'fahrenheit'])
    .optional()
    .describe('Temperature unit. Defaults to celsius.'),
});

const getWeatherTool = tool(
  async ({ city, unit }: z.infer<typeof weatherSchema>): Promise<string> => {
    // Dummy data - replace with a real weather API call.
    const h = hash(city);
    const celsius = 8 + (h % 24); // 8..31
    const useF = unit === 'fahrenheit';
    return JSON.stringify({
      city: city.trim(),
      condition: CONDITIONS[(h >>> 3) % CONDITIONS.length],
      temperature: useF ? Math.round(celsius * 1.8 + 32) : celsius,
      unit: useF ? '°F' : '°C',
      humidity_percent: 35 + ((h >>> 5) % 55),
      wind_kmh: 3 + ((h >>> 7) % 28),
      note: 'Simulated demo data, not a live reading.',
    });
  },
  {
    name: 'get_weather',
    description:
      'Get the current weather (condition, temperature, humidity, wind) for a given city. Returns simulated demo data.',
    // Cast avoids "type instantiation is excessively deep" with zod >= 3.25 + LangChain typings.
    schema: weatherSchema as any,
  },
) as ReturnType<typeof tool>;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly model: ChatAnthropic;
  private readonly modelWithTools;
  private readonly toolsByName = { [getWeatherTool.name]: getWeatherTool };

  constructor(private readonly config: ConfigService) {
    this.model = new ChatAnthropic({
      // claude-3-5-sonnet-20241022 has been retired by Anthropic (404 not_found_error).
      model: this.config.get<string>('ANTHROPIC_MODEL') || DEFAULT_MODEL,
      // Not required at boot so the app (and /health) can start without a key;
      // a missing key surfaces as an error on the first /chat request.
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY') || 'missing-api-key',
      temperature: 0.3,
      maxTokens: 1500,
      // @langchain/anthropic 0.3.x sends top_p/top_k = -1 as "unset" placeholders, which current
      // Claude models reject. Overriding them with undefined drops them from the request body.
      invocationKwargs: { top_p: undefined, top_k: undefined },
    });
    this.modelWithTools = this.model.bindTools([getWeatherTool]);
  }

  /** Runs the agent and returns only the final response text. */
  async runAgent(userPrompt: string, history: ChatTurn[] = []): Promise<string> {
    return (await this.runAgentWithMeta(userPrompt, history)).reply;
  }

  /** Runs the agent loop (model -> tool calls -> model ...) and also reports which tools were used. */
  async runAgentWithMeta(userPrompt: string, history: ChatTurn[] = []): Promise<AgentResult> {
    const messages: BaseMessage[] = [
      new SystemMessage(SYSTEM_PROMPT),
      ...history.map((turn) =>
        turn.role === 'user' ? new HumanMessage(turn.content) : new AIMessage(turn.content),
      ),
      new HumanMessage(userPrompt),
    ];
    const toolsUsed = new Set<string>();

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response: AIMessage = await this.modelWithTools.invoke(messages);
      messages.push(response);

      const toolCalls = response.tool_calls ?? [];
      if (toolCalls.length === 0) {
        return { reply: this.extractText(response), toolsUsed: [...toolsUsed] };
      }

      for (const call of toolCalls) {
        this.logger.debug(`Tool call: ${call.name} ${JSON.stringify(call.args)}`);
        const selected = this.toolsByName[call.name as keyof typeof this.toolsByName];

        let result: string;
        if (!selected) {
          result = `Error: unknown tool "${call.name}"`;
        } else {
          toolsUsed.add(call.name);
          try {
            result = String(await selected.invoke(call.args));
          } catch (err) {
            result = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        messages.push(
          new ToolMessage({
            content: result,
            tool_call_id: call.id ?? '',
            name: call.name,
          }),
        );
      }
    }

    throw new Error(`Agent did not finish within ${MAX_ITERATIONS} iterations`);
  }

  private extractText(message: AIMessage): string {
    const { content } = message;
    if (typeof content === 'string') return content;
    return content
      .map((part) => (part.type === 'text' && 'text' in part ? part.text : ''))
      .join('')
      .trim();
  }
}
