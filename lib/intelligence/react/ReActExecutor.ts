// Modified from: https://github.com/hwchase17/langchainjs/blob/main/langchain/src/agents/executor.ts

import { BaseChain, SerializedLLMChain } from "langchain/chains";
import { Tool } from "langchain/tools";
import { StoppingMethod } from "langchain/agents";
import { AgentAction, AgentFinish, AgentStep, ChainValues } from "langchain/schema";
import { CallbackManagerForChainRun } from "langchain/callbacks";
import { ReActAgent } from "@/lib/intelligence/react/ReActAgent";
import { BaseLanguageModel } from "langchain/base_language";
import { MultistepExecutor } from "@/lib/intelligence/multistep/MultistepExecutor";
import { MemoryStore } from "@/lib/intelligence/memory/MemoryStore";
import { Callbacks } from "langchain/dist/callbacks/manager";

const MAX_ITERATIONS = 6; // Minimum should be two, once to try an action, and the second to assert a final response.
const MAX_DEPTH = 1;

export type AgentContinue = {
    log: string;
};

export interface ReActExecutorInput {
    agent: ReActAgent;
    depth?: number;
    creative: BaseLanguageModel;
    earlyStoppingMethod?: StoppingMethod;
    maxIterations?: number;
    memory: MemoryStore;
    model: BaseLanguageModel;
    returnIntermediateSteps?: boolean;
    tools: Tool[];
}

/**
 * A chain managing an agent using tools.
 * @augments BaseChain
 */
export class ReActExecutor extends BaseChain {
    private readonly agent: ReActAgent;
    private readonly depth: number = 0;
    private readonly earlyStoppingMethod: StoppingMethod = "force";
    private readonly maxIterations?: number = MAX_ITERATIONS;
    private readonly multistep: MultistepExecutor;
    private readonly returnIntermediateSteps: boolean = false;
    private readonly tools: Tool[];

    constructor({
        agent,
        creative,
        depth,
        earlyStoppingMethod,
        maxIterations,
        memory,
        model,
        returnIntermediateSteps,
        tools
    }: ReActExecutorInput) {
        super({verbose: true});

        this.agent = agent;
        this.tools = tools;

        this.depth = depth ?? this.depth;
        this.returnIntermediateSteps = returnIntermediateSteps ?? this.returnIntermediateSteps;
        this.maxIterations = maxIterations ?? this.maxIterations;
        this.earlyStoppingMethod = earlyStoppingMethod ?? this.earlyStoppingMethod;

        this.multistep = new MultistepExecutor({
            creative,
            depth: this.depth,
            maxIterations: this.maxIterations,
            model,
            memory,
            tools
        });
    }

    get inputKeys() {
        return this.agent.inputKeys;
    }

    get outputKeys() {
        return this.agent.returnValues;
    }

    async _call(
        inputs: ChainValues,
        runManager?: CallbackManagerForChainRun
    ): Promise<ChainValues> {
        const toolsByName = Object.fromEntries(
            this.tools.map((t) => [t.name.toLowerCase(), t])
        );
        let steps: AgentStep[] = [];
        let iterations = 0;

        const evaluateAction = async (action: AgentAction): Promise<AgentStep> => {
            await runManager?.handleAgentAction(action);

            const tool = toolsByName[action.tool?.toLowerCase()];
            const observation = tool
                ? await tool.call(action.toolInput, runManager?.getChild())
                : `${action.tool} is not a valid tool, try another one.`;

            return {action, observation};
        }

        const getOutput = async (finishStep: AgentFinish): Promise<ChainValues> => {
            const {returnValues} = finishStep;
            const additional = await this.agent.prepareForOutput(returnValues, steps);

            if (this.returnIntermediateSteps) {
                return {...returnValues, intermediateSteps: steps, ...additional};
            }
            await runManager?.handleAgentEnd(finishStep);
            return {...returnValues, ...additional};
        };

        // Loop until the number of iterations are met, or the plan returns with AgentFinish.
        while (this.shouldContinue(iterations)) {
            // Prepare the inputs
            const newInputs = await this.agent.prepareInputs(inputs, steps);

            // Evaluate the inputs to determine if the agent can exit early.
            const evaluation = await this.agent.evaluateInputs(newInputs, steps, runManager?.getChild());

            // Check if the agent has finished
            if ("returnValues" in evaluation) return getOutput(evaluation);

            // Execute the plan with the new inputs
            const plan = await this.agent.plan(
                steps,
                newInputs,
                runManager?.getChild()
            );

            // Check if the agent has finished
            if ("returnValues" in plan) return getOutput(plan);

            // If not, then double-check the work to ensure the plan is sound.
            const revised = await this.agent.evaluateOutputs(plan, steps, newInputs, runManager?.getChild());

            // Check if the agent has finished
            if ("returnValues" in revised) return getOutput(revised);

            // If the output is an array, then we have multiple actions to execute.
            const newActions: AgentAction[] = Array.isArray(revised) ? revised : [revised];

            // If there is more than one step, use the multistep executor.
            let newSteps: AgentStep[];

            if (newActions.length > 1) {
                // Only use the multistep executor if we're not at the maximum depth.
                if (this.depth < MAX_DEPTH) {
                    const completion = await this.multistep.predict({
                        ...newInputs,
                        actions: newActions.map(action => action.toolInput).join(",\n"),
                    }, runManager?.getChild());

                    // Direct return multistep output
                    return getOutput({
                        returnValues: {[this.agent.returnValues[0]]: completion},
                        log: "",
                    });
                } else {
                    newSteps = await Promise.all(
                        newActions.map(async (action) => {
                            await runManager?.handleAgentAction(action);

                            const tool = toolsByName[action.tool?.toLowerCase()];
                            const observation = tool
                                ? await tool.call(action.toolInput, runManager?.getChild())
                                : `${action.tool} is not a valid tool, try another one.`;

                            return {action, observation};
                        })
                    );
                }
            } else {
                // Here, we execute the actions and gather the observations.
                const newStep = await evaluateAction(newActions[0]);
                newSteps = [newStep];
            }

            // This prior action observations are added to the previous steps.
            steps.push(...newSteps);

            const lastStep = steps[steps.length - 1];
            const tool = toolsByName[lastStep.action.tool?.toLowerCase()];

            // If the tool returns directly, we return that observation.
            if (tool?.returnDirect) {
                return getOutput({
                    returnValues: {[this.agent.returnValues[0]]: lastStep.observation},
                    log: "",
                });
            }

            iterations += 1;
        }

        const finish = await this.agent.returnStoppedResponse(
            this.earlyStoppingMethod,
            steps,
            inputs
        );

        return getOutput(finish);
    }

    _chainType() {
        return "agent_executor" as const;
    }

    /** Create from agent and a list of tools. */
    static makeExecutor({
        creative,
        depth,
        earlyStoppingMethod,
        maxIterations,
        memory,
        model,
        returnIntermediateSteps,
        tools
    }: ReActExecutorInput | Omit<ReActExecutorInput, "agent">): ReActExecutor {
        const agent = ReActAgent.makeAgent({
            creative,
            maxIterations: maxIterations ?? MAX_ITERATIONS,
            memory,
            model,
            tools
        });

        return new ReActExecutor({
            agent,
            creative,
            depth,
            earlyStoppingMethod,
            maxIterations,
            memory,
            model,
            returnIntermediateSteps,
            tools
        });
    }

    async predict(values: ChainValues, callbacks?: Callbacks): Promise<string> {
        const completion = await this.call(values, callbacks);
        return completion[this.agent.returnValues[0]];
    }

    serialize(): SerializedLLMChain {
        throw new Error("Cannot serialize an AgentExecutor");
    }

    private shouldContinue(iterations: number): boolean {
        return this.maxIterations === undefined || iterations < this.maxIterations;
    }
}