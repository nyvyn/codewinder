// Modified from: https://github.com/hwchase17/langchainjs/blob/main/langchain/src/agents/chat/index.ts

import {
    FINAL_RESPONSE,
    FORMAT_INSTRUCTIONS,
    GUIDANCE,
    MEMORY,
    OBJECTIVE,
    OBSERVATION,
    SYSTEM,
    THOUGHT,
    TOOLING
} from "@/lib/intelligence/react/prompts";
import {ChatCreatePromptArgs} from "langchain/agents";
import {Tool} from "langchain/tools";
import {PromptTemplate} from "langchain/prompts";
import {AgentAction, AgentFinish, AgentStep, ChainValues} from "langchain/schema";
import {LLMChain} from "langchain/chains";
import {CallbackManager} from "langchain/callbacks";
import {ReActAgentActionOutputParser} from "@/lib/intelligence/react/ReActAgentOutputParser";
import {BaseLanguageModel} from "langchain/base_language";
import {ActionEvaluator} from "@/lib/intelligence/react/ActionEvaluator";
import {MemoryCondenser} from "@/lib/intelligence/react/MemoryCondenser";
import {Director} from "@/lib/intelligence/react/Director";
import {AgentContinue} from "@/lib/intelligence/react/ReActExecutor";
import {MemoryStore} from "@/lib/intelligence/memory/MemoryStore";
import {BaseMultiActionAgent} from "@/lib/intelligence/react/BaseMultiActionAgent";
import {BaseOutputParser} from "langchain/schema/output_parser";

export const CONTEXT_INPUT = "context";
export const OBJECTIVE_INPUT = "objective";
export const SCRATCHPAD_INPUT = "scratchpad";
export const TOOLING_INPUT = "tools";

interface ReActChatArgs extends ChatCreatePromptArgs {
    chat: boolean;
}

interface ReActAgentInput {
    creativeChain: LLMChain;
    llmChain: LLMChain;
    maxIterations?: number;
    memory: MemoryStore;
    tools: Tool[];
}

export class ReActAgent extends BaseMultiActionAgent {
    private readonly creativeChain: LLMChain;
    private readonly llmChain: LLMChain;
    private readonly maxIterations: number;
    private readonly memory: MemoryStore;
    private readonly maxTokens: number;
    private readonly outputParser: BaseOutputParser<AgentAction[] | AgentFinish>;
    private readonly tools: Tool[];

    get inputKeys() {
        return [CONTEXT_INPUT, OBJECTIVE_INPUT, SCRATCHPAD_INPUT, TOOLING_INPUT];
    };

    get finalPrefix() {
        return `${FINAL_RESPONSE}:`;
    }

    get llmPrefix() {
        return `${THOUGHT}:`;
    }

    get memoryPrefix() {
        return `${MEMORY}:`;
    }

    get observationPrefix() {
        return `${OBSERVATION}:`;
    }

    get stopPrefixes(): string[] {
        return [`${OBSERVATION}:`, `${FINAL_RESPONSE}:`];
    }

    constructor({creativeChain, llmChain, memory, tools, maxIterations}: ReActAgentInput) {
        super();

        this.creativeChain = creativeChain;
        this.llmChain = llmChain;
        this.maxIterations = maxIterations;
        this.maxTokens = 4096 - 1000; // Rough estimate for GPT-3 with room for prompt - https://platform.openai.com/tokenizer
        this.memory = memory;
        this.outputParser = new ReActAgentActionOutputParser();
        this.tools = tools;
    }

    private async constructMemories(steps: AgentStep[]) {
        const lastStep = steps.length > 0 ? steps[steps.length - 1] : undefined;
        let content = undefined;
        if (lastStep) {
            const memories = await this.memory.retrieveSnippets(
                lastStep.action.toolInput,
                0.75
            );
            // If memories were found, then retrieve the page content of the first one (which is the highest scoring).
            const recent = memories && memories.length > 0 ? memories.pop() : undefined;
            content = recent ? recent.pageContent + " " + JSON.stringify(recent.metadata) : "";
        }
        return `${this.memoryPrefix} \"\"\"${content || "No relevant memories recalled."}\"\"\"`
    }

    public async constructScratchPad(steps: AgentStep[]): Promise<string> {
        return steps.reduce((thoughts, {action, observation}) => {
            return (
                thoughts +
                [
                    this.llmPrefix,
                    action.log,
                    this.observationPrefix,
                    `\"\"\"${observation}\"\"\"`
                ].join("\n")
            );
        }, "");
    }

    public static createPrompt(tools: Tool[], args?: ReActChatArgs) {
        const {prefix = SYSTEM, suffix = GUIDANCE} = args ?? {};

        const system = [
            prefix,
            TOOLING,
            `Allowed tools:\n{${TOOLING_INPUT}}`,
            FORMAT_INSTRUCTIONS,
            suffix
        ].join("\n");
        const human = [
            `${OBJECTIVE}: {${OBJECTIVE_INPUT}}`,
            `{${SCRATCHPAD_INPUT}}`
        ].join("\n");

        return new PromptTemplate({
            template: [system, human].join("\n"),
            inputVariables: [OBJECTIVE_INPUT, SCRATCHPAD_INPUT, TOOLING_INPUT]
        });
    }

    public async evaluateInputs(
        inputs: ChainValues,
        steps: AgentStep[],
        callbackManager?: CallbackManager
    ): Promise<AgentContinue | AgentAction[] | AgentFinish> {
        if (steps.length === 0) {
            const memory = await this.constructMemories(steps);

            const direction = Director.makeChain({model: this.creativeChain.llm, callbacks: callbackManager});
            const completion = await direction.predict({
                context: inputs[CONTEXT_INPUT],
                objective: inputs[OBJECTIVE_INPUT],
                memory: memory,
            });
            if (completion.includes(`${this.finalPrefix}`)) {
                return await this.outputParser.parse(completion);
            } else {
                return {log: completion} as AgentContinue;
            }
        }

        return {log: "Skipped as steps present."} as AgentContinue;
    }

    public async evaluateOutputs(
        actions: AgentAction[],
        steps: AgentStep[],
        inputs: ChainValues,
        callbackManager?: CallbackManager
    ): Promise<AgentAction[] | AgentFinish> {
        const critic = ActionEvaluator.makeChain({model: this.creativeChain.llm, callbacks: callbackManager});
        const scratchpad = await this.constructScratchPad(steps);
        const evaluation = await critic.predict({
            objective: inputs[OBJECTIVE_INPUT],
            response: JSON.stringify(actions),
            scratchpad,
            tools: inputs[TOOLING_INPUT],
        });
        const newActions = await this.outputParser.parse(evaluation);
        // If a new action is provided, then return that. Otherwise, return the original.
        if ("returnValues" in newActions) {
            // No new actions, so continue without using this response.
            return actions;
        } else {
            return newActions;
        }
    }

    /**
     * Create a new agent based on the provided parameters.
     */
    public static makeAgent({
                                model,
                                creative,
                                memory,
                                tools,
                                maxIterations = undefined
                            }: {
        model: BaseLanguageModel,
        creative: BaseLanguageModel,
        memory: MemoryStore,
        tools: Tool[]
        maxIterations?: number
    }): ReActAgent {
        ReActAgent.validateTools(tools);

        const llmChain = new LLMChain({
            prompt: ReActAgent.createPrompt(tools),
            llm: model
        });
        const creativeChain = new LLMChain({
            prompt: ReActAgent.createPrompt(tools),
            llm: creative
        });

        return new ReActAgent({
            llmChain,
            creativeChain,
            memory,
            tools,
            maxIterations
        });
    }

    /**
     *  Decide what to do provided some input.
     *
     *  @param steps - Steps the LLM has taken so far, along with observations from each.
     *  @param inputs - User inputs.
     *  @param callbackManager - Callback manager to use for this call.
     *
     *  @returns Action specifying what tool to use of if the plan is complete.
     */
    public async plan(
        steps: AgentStep[],
        inputs: ChainValues,
        callbackManager?: CallbackManager
    ): Promise<AgentAction[] | AgentFinish> {
        try {
            // Use the base chain for evaluating the right tool to use.
            const output = await this.llmChain.predict(inputs, callbackManager);
            const actions = await this.outputParser.parse(output);

            // If this is a final response, then respond with the creative chain.
            if ("returnValues" in actions) {
                // Ensure we include the output the previous execution for this final response.
                inputs[SCRATCHPAD_INPUT] = [inputs[SCRATCHPAD_INPUT], output].join("\n");
                // Only stop on Observations in case this is a fall through from the base chain.
                inputs.stop = this.stopPrefixes.slice(0, 1);
                // Here we use the creative chain to generate a final response.
                const finalOutput = await this.creativeChain.predict(inputs, callbackManager);
                return this.outputParser.parse(finalOutput);
            } else {
                return actions;
            }
        } catch (e) {
            console.error("Error in LLMChain.predict:", e);
            return this.outputParser.parse("Error in LLMChain.predict: " + e.message);
        }
    }

    public async prepareForOutput(_returnValues: AgentFinish["returnValues"], _steps: AgentStep[]): Promise<AgentFinish["returnValues"]> {
        // If there are no steps, then this is a simple greeting or similar.
        // Or, the response was derived from a previous memory, and we should not store again.
        if (_steps && _steps.length > 0) {
            const condenser = MemoryCondenser.makeChain({model: this.llmChain.llm});

            const actions = _steps.map(step => {
                return `${step.action.tool} - ${step.action.toolInput}`
            }).join("\n");

            const memory = await condenser.predict({
                response: _returnValues.output,
                actions: JSON.stringify(actions),
            });
            await this.memory.storeTexts([memory]);
        }

        return []; // No additional return values, this is just to store the above memory.
    }

    /**
     *  Prepare the inputs for the next step.
     *
     *  @param steps - Steps the LLM has taken so far, along with observations from each.
     *  @param inputs - User inputs.
     */
    public async prepareInputs(inputs: ChainValues, steps: AgentStep[]): Promise<ChainValues> {
        // Define the new inputs, as we'll update/replace some values
        const newInputs: ChainValues = {
            ...inputs
        };

        // Provide the tools and descriptions
        newInputs[TOOLING_INPUT] = this.tools.map((tool) => `${tool.name}: ${tool.description}`).join("\n");

        // Construct the scratchpad and add it to the inputs
        const thoughts = await this.constructScratchPad(steps);
        const memory = await this.constructMemories(steps);
        const nudge = (steps.length + 1 < (this.maxIterations || Number.MAX_SAFE_INTEGER) ? this.llmPrefix : this.finalPrefix)

        newInputs[SCRATCHPAD_INPUT] = [
            memory,
            thoughts,
            nudge
        ].join("\n");

        // Add the appropriate stop phrases for the llm
        if (this.stopPrefixes.length !== 0) {
            newInputs.stop = this.stopPrefixes;
        }

        const tokenCount = await this.llmChain.llm.getNumTokens([thoughts, memory, nudge].join("\n"));
        if (tokenCount > this.maxTokens) {
            if (steps.length > 0) {
                // Remove the first step and try again, recursive call to keep context length below threshold.
                return this.prepareInputs(inputs, steps.slice(1));
            } else {
                // Drop memory if no steps to remove.
                newInputs[SCRATCHPAD_INPUT] = [
                    thoughts,
                    nudge
                ].join("\n");

                return newInputs;
            }
        } else {
            return newInputs;
        }
    }

    public static validateTools(tools: Tool[]) {
        const invalidTool = tools.find((tool) => !tool.description);
        if (invalidTool) {
            const msg = `Got a tool ${invalidTool.name} without a description.` +
                "This agent requires descriptions for all tools.";
            throw new Error(msg);
        }
    }
}