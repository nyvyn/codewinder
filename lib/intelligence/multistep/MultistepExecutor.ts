import { Tool, ToolParams } from "langchain/tools";
import { Editor } from "@/lib/intelligence/multistep/Editor";
import { CONTEXT_INPUT, OBJECTIVE_INPUT } from "@/lib/intelligence/react/ReActAgent";
import { Planner } from "@/lib/intelligence/multistep/Planner";
import { BaseLanguageModel } from "langchain/base_language";
import { ReActExecutor } from "@/lib/intelligence/react/ReActExecutor";
import { MemoryStore } from "@/lib/intelligence/memory/MemoryStore";
import { BaseChain, SerializedLLMChain } from "langchain/chains";
import { ChainValues } from "langchain/schema";
import { CallbackManagerForChainRun } from "langchain/callbacks";
import { Callbacks } from "langchain/dist/callbacks/manager";

export const ACTIONS_INPUT = "actions";
export const OUTPUT_KEY = "output";

interface MultistepExecutorInput extends ToolParams {
    creative: BaseLanguageModel;
    depth: number;
    maxIterations?: number;
    memory: MemoryStore;
    model: BaseLanguageModel;
    tools: Tool[];
}

export class MultistepExecutor extends BaseChain {

    private readonly creative: BaseLanguageModel;
    private readonly depth: number;
    private readonly maxIterations?: number;
    private readonly model: BaseLanguageModel;
    private readonly store: MemoryStore;
    private readonly tools: Tool[];

    constructor({creative, depth, maxIterations, memory, model, tools}: MultistepExecutorInput) {
        super({verbose: true});

        this.creative = creative;
        this.depth = depth;
        this.maxIterations = maxIterations;
        this.store = memory;
        this.model = model;
        this.tools = tools;
    }

    get inputKeys() {
        return [OBJECTIVE_INPUT, ACTIONS_INPUT];
    }

    get outputKeys() {
        return [OUTPUT_KEY];
    }

    async _call(
        inputs: ChainValues,
        runManager?: CallbackManagerForChainRun
    ): Promise<ChainValues> {
        const completion = await MultistepExecutor.runAgent({
            creative: this.creative,
            depth: this.depth,
            inputs: inputs,
            maxIterations: this.maxIterations,
            memory: this.store,
            model: this.model,
            runManager: runManager,
            tools: this.tools
        });
        return {
            [OUTPUT_KEY]: completion
        }
    }

    _chainType() {
        return "multistep_executor" as const;
    }

    static async runAgent({runManager, creative, depth, inputs, model, maxIterations, memory, tools}: {
        creative: BaseLanguageModel,
        depth: number,
        inputs: ChainValues,
        model: BaseLanguageModel,
        maxIterations?: number,
        memory: MemoryStore,
        runManager?: CallbackManagerForChainRun,
        tools: Tool[],
    }): Promise<string> {
        // Create a new executor and increment the depth.
        const executor = ReActExecutor.makeExecutor({
            creative,
            depth: ++depth,
            maxIterations,
            memory,
            model,
            tools
        });

        const planner = Planner.makeChain({model: creative, callbacks: runManager?.getChild()});
        const interim = await planner.predict({
            objective: inputs[OBJECTIVE_INPUT],
            steps: inputs[ACTIONS_INPUT]
        });
        const plan = JSON.parse(interim);
        const objective = plan.objective;

        let results = [];
        for (const step of plan.steps) {
            await runManager?.handleText("Starting: " + step);

            let inputs = {};
            inputs[OBJECTIVE_INPUT] = `${objective}: ${step}`
            if (results.length > 0) inputs[CONTEXT_INPUT] = results[results.length - 1]

            const completion = await executor.predict(inputs);
            results.push(completion);
        }

        const editor = Editor.makeChain({model: creative, callbacks: runManager?.getChild()});
        return await editor.predict({
            context: results.join("\n\n"),
            objective
        });
    }

    async predict(values: ChainValues, callbacks?: Callbacks): Promise<string> {
        const completion = await this.call(values, callbacks);
        return completion[OUTPUT_KEY];
    }

    serialize(): SerializedLLMChain {
        throw new Error("Cannot serialize an MultistepExecutor");
    }
}
