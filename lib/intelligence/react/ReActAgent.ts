import { FunctionChain } from "@/lib/intelligence/chains/FunctionChain";
import { ChatHistoryPlaceholder } from "@/lib/intelligence/react/ChatHistoryPlaceholder";
import { ReActAgentOutputParser } from "@/lib/intelligence/react/ReActAgentOutputParser";
import { BaseSingleActionAgent } from "langchain/agents";
import { CallbackManager } from "langchain/callbacks";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { Callbacks } from "langchain/dist/callbacks/manager";
import { ChatPromptTemplate, HumanMessagePromptTemplate, MessagesPlaceholder, SystemMessagePromptTemplate } from "langchain/prompts";
import { AgentAction, AgentFinish, AgentStep, AIChatMessage, BaseChatMessage, ChainValues, FunctionChatMessage } from "langchain/schema";
import { StructuredTool } from "langchain/tools";

export const AGENT_SCRATCHPAD = "agent_scratchpad";
export const CONTEXT_INPUT = "context";
export const OBJECTIVE_INPUT = "objective";

export const FINAL_RESPONSE_PREFIX = "Final Response";

export const SYSTEM = `You are a helpful AI Assistant. The current date and time is: ${new Date().toLocaleString()}.`;

export const INSTRUCTIONS = `Instructions:
* Prefer the plan-and-solve function for complex objectives that require multiple steps to resolve.
* Always respond to the user starting with \`${FINAL_RESPONSE_PREFIX}:\`.
* Use Github Flavored Markdown (GFM) to format the response (but never footnotes).
* The response should include sources from functions, but you should never make up a url or link.`;

interface ReActAgentInput {
    llmChain: FunctionChain;
    verbose?: boolean;
    callbacks?: Callbacks;
}

interface ReActAgentCreatePromptArgs {
    prefix?: string;
    suffix?: string;
}

export class ReActAgent extends BaseSingleActionAgent {

    public lc_namespace = ["langchain", "agents", "react"];

    private readonly llmChain: FunctionChain;
    private readonly parser = new ReActAgentOutputParser();

    constructor({llmChain, verbose, callbacks}: ReActAgentInput) {
        super({verbose, callbacks});

        this.llmChain = llmChain;
    }

    public get inputKeys(): string[] {
        return [OBJECTIVE_INPUT, CONTEXT_INPUT];
    }

    public static createPrompt(
        fields?: ReActAgentCreatePromptArgs
    ): ChatPromptTemplate {
        const {prefix = SYSTEM} = fields || {};
        return ChatPromptTemplate.fromPromptMessages([
            SystemMessagePromptTemplate.fromTemplate(prefix),
            new ChatHistoryPlaceholder(CONTEXT_INPUT),
            HumanMessagePromptTemplate.fromTemplate(INSTRUCTIONS),
            HumanMessagePromptTemplate.fromTemplate(`{${OBJECTIVE_INPUT}}`),
            new MessagesPlaceholder(AGENT_SCRATCHPAD),
        ]);
    }

    public static fromLLMAndTools = ({args, predictable, tools, verbose, callbacks}: {
        args?: ReActAgentCreatePromptArgs,
        predictable: ChatOpenAI,
        tools: StructuredTool[],
        verbose?: boolean,
        callbacks?: Callbacks,
    }) => {
        this.validateTools(tools);
        if (predictable._modelType() !== "base_chat_model" || predictable._llmType() !== "openai") {
            throw new Error("OpenAIAgent requires an OpenAI chat model");
        }

        const prompt = this.createPrompt({...args});
        const chain = new FunctionChain({
            prompt,
            llm: predictable,
            callbacks,
            tools
        });

        return new ReActAgent({
            llmChain: chain,
            verbose,
            callbacks
        });
    }

    public static validateTools(_tools: StructuredTool[]): void {
    }

    public _agentType() {
        return "openai-functions" as const;
    }

    public _stop(): string[] {
        return [];
    }

    public async constructScratchPad(
        steps: AgentStep[]
    ): Promise<BaseChatMessage[]> {
        return steps.flatMap(({action, observation}) => [
            new AIChatMessage("", {
                function_call: {
                    name: action.tool,
                    arguments: JSON.stringify(action.toolInput),
                },
            }),
            new FunctionChatMessage(observation, action.tool),
        ]);
    }

    public async plan(steps: Array<AgentStep>, inputs: ChainValues, callbackManager?: CallbackManager): Promise<AgentAction | AgentFinish> {
        const thoughts = await this.constructScratchPad(steps);
        const newInputs = {
            ...inputs,
            [AGENT_SCRATCHPAD]: thoughts,
        }

        if (this._stop().length !== 0) {
            newInputs["stop"] = this._stop();
        }

        const message = await this.llmChain.predict(newInputs, callbackManager);
        return await this.parser.parse(message);
    }
}